/** Catalogue des TP. Étapes 0 à 2 : M5. Étapes 3 et 4 : M6. Étape 5 (bilan) : M7. */
import { STAGE0 } from './stage0';
import { STAGE1 } from './stage1';
import { STAGE2 } from './stage2';
import { STAGE3 } from './stage3';
import { STAGE4 } from './stage4';
import type { Tp } from './types';

export const CATALOG: Tp[] = [...STAGE0, ...STAGE1, ...STAGE2, ...STAGE3, ...STAGE4];
export const tpById = (id: string): Tp | undefined => CATALOG.find(t => t.id === id);
