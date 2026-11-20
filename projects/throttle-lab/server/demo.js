import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MemoryStore, SqliteStore } from '../lib/index.js';
import { createHttpServer } from './src/app.js';

const envFile = new URL('./.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT || 8789);
const HOST = process.env.HOST || '127.0.0.1';
const flag = process.argv.indexOf('--store');
const STORE = (flag > 0 ? process.argv[flag + 1] : process.env.STORE) || 'memory';
if (!['memory', 'sqlite'].includes(STORE)) throw new Error('STORE must be memory or sqlite');

let store, db;
if (STORE === 'sqlite') {
  const file = process.env.DB_FILE || './data/throttle-lab.sqlite';
  mkdirSync(dirname(resolve(file)), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000;');
  store = new SqliteStore(db);
  setInterval(() => store.prune(), 60_000).unref();
} else {
  store = new MemoryStore();
  setInterval(() => store.prune(), 60_000).unref();
}

const server = createHttpServer({
  store,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  trustProxy: process.env.TRUST_PROXY === '1',
  allowConfig: process.env.NODE_ENV !== 'production' || process.env.ALLOW_CONFIG === '1',
});

server.listen(PORT, HOST, () => console.log(`Throttle Lab demo on http://${HOST}:${PORT} (store: ${STORE})`));

const shutdown = () => server.close(() => { db?.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
