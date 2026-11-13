import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDocs } from '../../scripts/docs';

describe('documents générés', () => {
  for (const [path, expected] of Object.entries(buildDocs())) {
    it(`${path} est à jour (lancer « npm run docs » sinon)`, () => { expect(readFileSync(path, 'utf8')).toBe(expected); });
  }
});
