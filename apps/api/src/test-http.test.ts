import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { startTestServer } from './test-http.js';

describe('test HTTP listener', () => {
  it('removes startup listeners after a synchronous listen failure', async () => {
    const server = createServer();
    const listening = server.listenerCount('listening');
    const errors = server.listenerCount('error');
    const failure = new Error('listen failed');
    await expect(startTestServer(server, () => { throw failure; })).rejects.toBe(failure);
    expect(server.listenerCount('listening')).toBe(listening);
    expect(server.listenerCount('error')).toBe(errors);
    expect(server.listening).toBe(false);
  });

  it('removes startup listeners after an asynchronous listen failure', async () => {
    const server = createServer();
    const listening = server.listenerCount('listening');
    const errors = server.listenerCount('error');
    const failure = new Error('listen failed');
    await expect(startTestServer(server, (target) => { queueMicrotask(() => target.emit('error', failure)); })).rejects.toBe(failure);
    expect(server.listenerCount('listening')).toBe(listening);
    expect(server.listenerCount('error')).toBe(errors);
    expect(server.listening).toBe(false);
  });
});
