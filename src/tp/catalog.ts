/** Catalogue des TP. Étapes 0 à 2 : M5. Étapes 3 à 5 : M6 et M7. */
import { STAGE0 } from './stage0';
import { STAGE1 } from './stage1';
import { STAGE2 } from './stage2';
import type { Tp } from './types';

export const CATALOG: Tp[] = [...STAGE0, ...STAGE1, ...STAGE2];
export const tpById = (id: string): Tp | undefined => CATALOG.find(t => t.id === id);
