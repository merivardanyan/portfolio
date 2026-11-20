import { existsSync } from 'node:fs';
import { openDb } from './src/db.js';
import { createHttpServer } from './src/app.js';
import { seedSample, SAMPLE_BILL_ID } from './src/seed.js';

const envFile = new URL('./.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '127.0.0.1';
const db = openDb(process.env.DB_FILE || './data/fair-share.sqlite');

if (process.env.SEED !== '0') {
  const seeded = seedSample(db);
  if (seeded) {
    console.log(`Seeded sample bill ${SAMPLE_BILL_ID}. Tokens are shown once (only hashes are stored):`);
    console.log(`  host:  ${seeded.hostToken}`);
    for (const [pid, t] of Object.entries(seeded.participantTokens)) console.log(`  ${pid.padEnd(5)}  ${t}`);
  }
}

const server = createHttpServer({
  db,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  trustProxy: Number(process.env.TRUST_PROXY || 0), // number of trusted reverse proxies
});

server.listen(PORT, HOST, () => console.log(`Fair Share API on http://${HOST}:${PORT} (WebSocket at ws://${HOST}:${PORT}/ws)`));

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
