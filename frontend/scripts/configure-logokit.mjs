import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

// Docker supplies a build argument; local npm builds can read the root .env.
let token = process.env.LOGOKIT_PUBLISHABLE_TOKEN;
if (token === undefined) {
  try {
    const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
    const value = env.match(/^\s*LOGOKIT_PUBLISHABLE_TOKEN\s*=\s*(.*?)\s*$/m)?.[1] ?? '';
    token = value.replace(/^(['"])(.*)\1$/, '$2');
  } catch { token = ''; }
}
if (!/^pk_[A-Za-z0-9_-]+$/.test(token) || token.includes('REPLACE_WITH')) token = '';
const directory = new URL('../src/environments/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('logokit.generated.ts', directory),
  `// Generated at build time. Do not commit.\nexport const logoKitToken = ${JSON.stringify(token)};\n`);
