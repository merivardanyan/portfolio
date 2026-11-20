import { existsSync } from 'node:fs';
import { openDb } from './src/db.js';
import { createHttpServer } from './src/app.js';
import { seedDemoData } from './src/seed.js';

if (existsSync(new URL('./.env', import.meta.url))) process.loadEnvFile(new URL('./.env', import.meta.url));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DB_FILE = process.env.DB_FILE || './data/hue-hunt.sqlite';

const db = openDb(DB_FILE);
if (process.env.SEED !== '0') {
  const n = seedDemoData(db);
  if (n) console.log(`Seeded ${n} demo submissions`);
}

const server = createHttpServer({
  db,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  trustProxy: process.env.TRUST_PROXY === '1',
  submitLimit: Number(process.env.SUBMIT_LIMIT_PER_MIN || 20),
});

server.listen(PORT, HOST, () => console.log(`Hue Hunt API on http://${HOST}:${PORT}`));

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
