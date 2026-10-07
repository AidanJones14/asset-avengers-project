// Runs the SQL files in ./migrations against the auth DB.
// Usage: npm run migrate:up | npm run migrate:down   (down undoes one migration)
// Plain JavaScript on purpose: it runs with `node`, no build step needed.
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

const direction = process.argv[2] ?? 'up';
if (!['up', 'down'].includes(direction)) {
  console.error(`Unknown direction "${direction}", expected "up" or "down"`);
  process.exit(1);
}

const env = process.env;
const missing = ['AUTH_DB_NAME', 'AUTH_DB_USER', 'AUTH_DB_PASSWORD'].filter((key) => !env[key]);
if (missing.length) {
  console.error(`Set ${missing.join(', ')} in ../.env`);
  process.exit(1);
}

await runner({
  databaseUrl: {
    host: env.AUTH_DB_HOST ?? 'localhost',
    port: Number(env.AUTH_DB_HOST_PORT ?? 5433),
    database: env.AUTH_DB_NAME,
    user: env.AUTH_DB_USER,
    password: env.AUTH_DB_PASSWORD,
  },
  dir: fileURLToPath(new URL('../migrations', import.meta.url)),
  migrationsTable: 'pgmigrations',
  direction,
  count: direction === 'down' ? 1 : Infinity,
});
