import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildDocs } from './docs';

for (const [path, text] of Object.entries(buildDocs())) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); console.log(`écrit : ${path}`); }
