// Copies the customer-facing booking app's build output (dist-client/, built for
// Capacitor with vite.client.config.ts) into dist/booking/, so a single Vercel
// deployment serves both the admin app (dist/) and the public booking app
// (dist/booking) from the same domain, sharing the same api/* functions and env vars.
import { cp, existsSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cpAsync = promisify(cp);
const projectRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const source = path.join(projectRoot, 'dist-client');
const destination = path.join(projectRoot, 'dist', 'booking');

if (!existsSync(source)) {
  console.error(`copy-client-build: source not found at ${source}. Run "npm run build:client" first.`);
  process.exit(1);
}

await cpAsync(source, destination, { recursive: true });
console.log(`copy-client-build: copied ${source} -> ${destination}`);
