import { Readable } from 'node:stream';
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { ApiRequestHandler } from './index.js';

export interface TestServerHandle {
  readonly origin: string;
  close(): Promise<void>;
}

async function closeTestServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function startTestServer(server: Server, listen: (server: Server) => void = (target) => { target.listen(0, '127.0.0.1'); }): Promise<TestServerHandle> {
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        server.off('listening', onListening);
        server.off('error', onError);
      };
      const onListening = (): void => { cleanup(); resolve(); };
      const onError = (error: Error): void => { cleanup(); reject(error); };
      server.once('listening', onListening);
      server.once('error', onError);
      try { listen(server); } catch (error) { cleanup(); reject(error); }
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port');
    return { origin: `http://127.0.0.1:${address.port}`, close: () => closeTestServer(server) };
  } catch (error) {
    await closeTestServer(server);
    throw error;
  }
}

export function createTestFetch(handler: ApiRequestHandler): typeof fetch {
  return async (input, init = {}) => {
    const target = new URL(String(input), 'http://test.local');
    const headers = new Headers(init.headers);
    const requestHeaders: IncomingHttpHeaders = {};
    headers.forEach((value, key) => { requestHeaders[key] = value; });
    const body = typeof init.body === 'string' ? init.body : init.body instanceof Uint8Array ? Buffer.from(init.body) : undefined;
    const request = Readable.from(body === undefined ? [] : [body]) as IncomingMessage;
    Object.assign(request, {
      method: init.method ?? 'GET',
      url: `${target.pathname}${target.search}`,
      headers: requestHeaders,
    });

    return new Promise<Response>((resolve, reject) => {
      let status = 200;
      const responseHeaders = new Headers();
      const response = {
        setHeader(name: string, value: string | number | readonly string[]): void {
          responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
        },
        writeHead(code: number, responseHeaderValues?: Record<string, string | number | readonly string[]>): void {
          status = code;
          for (const [key, value] of Object.entries(responseHeaderValues ?? {})) {
            responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
          }
        },
        end(value?: string | Buffer): void {
          resolve(new Response(value === undefined ? null : typeof value === 'string' ? value : new Uint8Array(value), { status, headers: responseHeaders }));
        },
      } as unknown as ServerResponse<IncomingMessage>;
      try {
        handler(request, response);
      } catch (error) {
        reject(error);
      }
    });
  };
}
