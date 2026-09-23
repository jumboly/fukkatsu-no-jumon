// 呪文には保存されず、EXP と名前から導出されるステータス。根拠: docs/research.md §7
// 端数処理と「基準値 0 のときの A 加算」は資料間で差異があり実機未確認なので、UI では参考値として扱う。

import { nameCodeToChar } from './tables';

/** [必要EXP, ちから, すばやさ, 最大HP, 最大MP]。index = Lv - 1 */
export const LEVEL_TABLE: readonly (readonly [number, number, number, number, number])[] = [
  [0, 4, 4, 15, 0], [7, 5, 4, 22, 0], [23, 7, 6, 24, 5], [47, 7, 8, 31, 16], [110, 12, 10, 35, 20],
  [220, 16, 10, 38, 24], [450, 18, 17, 40, 26], [800, 22, 20, 46, 29], [1300, 30, 22, 50, 36], [2000, 35, 31, 54, 40],
  [2900, 40, 35, 62, 50], [4000, 48, 40, 63, 58], [5500, 52, 48, 70, 64], [7500, 60, 55, 78, 70], [10000, 68, 64, 86, 72],
  [13000, 72, 70, 92, 95], [17000, 72, 78, 100, 100], [21000, 85, 84, 115, 108], [25000, 87, 86, 130, 115], [29000, 92, 88, 138, 128],
  [33000, 95, 90, 149, 135], [37000, 97, 90, 158, 146], [41000, 99, 94, 165, 153], [45000, 103, 98, 170, 161], [49000, 113, 100, 174, 161],
  [53000, 117, 105, 180, 168], [57000, 125, 107, 189, 175], [61000, 130, 115, 195, 180], [65000, 135, 120, 200, 190], [65535, 140, 130, 210, 200],
];

export function levelFromExp(exp: number): number {
  let lv = 1;
  for (let i = 0; i < LEVEL_TABLE.length; i++) if (exp >= LEVEL_TABLE[i]![0]) lv = i + 1;
  return lv;
}

export interface GrowthType {
  /** 各文字の値（RAM タイルコード mod 16） */
  charValues: number[];
  sum: number;
  /** sum % 16 */
  type: number;
  A: number;
  B: number;
  C: number;
  /** その能力が基準値そのまま (true) か ⌊×0.9⌋+A (false) か */
  full: { strength: boolean; agility: boolean; hp: boolean; mp: boolean };
}

export function growthType(nameCodes: readonly number[]): GrowthType {
  const charValues = nameCodes.map((c) => nameCodeToChar(c).tile & 0x0f);
  const sum = charValues.reduce((a, b) => a + b, 0);
  const A = (sum >> 2) & 3;
  const B = (sum >> 1) & 1;
  const C = sum & 1;
  return {
    charValues, sum, type: sum % 16, A, B, C,
    full: { strength: C === 1, mp: C === 0, agility: B === 1, hp: B === 0 },
  };
}

export interface DerivedStats {
  level: number;
  growth: GrowthType;
  strength: number;
  agility: number;
  maxHp: number;
  maxMp: number;
}

function adjust(base: number, full: boolean, A: number): number {
  if (full) return base;
  // 基準値 0（Lv1-2 の MP）には A を加えない（S4 の記述を採用）
  if (base === 0) return 0;
  return Math.floor((base * 9) / 10) + A;
}

export function deriveStats(nameCodes: readonly number[], exp: number): DerivedStats {
  const level = levelFromExp(exp);
  const g = growthType(nameCodes);
  const [, str, agi, hp, mp] = LEVEL_TABLE[level - 1]!;
  return {
    level,
    growth: g,
    strength: adjust(str, g.full.strength, g.A),
    agility: adjust(agi, g.full.agility, g.A),
    maxHp: adjust(hp, g.full.hp, g.A),
    maxMp: adjust(mp, g.full.mp, g.A),
  };
}
