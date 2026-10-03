#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const files = (await readdir(directory)).filter((file) => /^\d+_.*\.sql$/u.test(file)).sort();
const sql = (await Promise.all(files.map((file) => readFile(join(directory, file), 'utf8')))).join('\n');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required to apply database migrations.');
  process.exitCode = 1;
} else {
  const child = spawn('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-X', '-q'], { stdio: ['pipe', 'inherit', 'inherit'] });
  child.stdin.end(`begin;\nselect pg_advisory_xact_lock(hashtext('shopping-navigation-migrations'));\n${sql}\ncommit;\n`);
  child.on('error', (error) => {
    console.error(`Unable to start psql: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}
