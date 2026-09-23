import type { FieldId } from './layout';
import { fieldDef } from './layout';
import { NAME_LENGTH, NAME_SPACE_CODE } from './tables';

/**
 * 復活の呪文に実際に記録されるゲーム状態。
 * レベル・HP 等は保存されないので含めない（growth.ts で導出する）。
 * decode 結果を壊さないよう、ゲームが拒否する値（やくそう 7 等）もそのまま保持できる。
 */
export interface GameState {
  /** 名前の 6bit コード ×4（文字列にすると 0x3C/0x3D の独立性や数字などの raw 値が失われるため） */
  name: number[];
  exp: number;
  gold: number;
  weapon: number;
  armor: number;
  shield: number;
  /** 道具 ID ×8 */
  items: number[];
  herbs: number;
  keys: number;
  dragonScale: boolean;
  warriorRing: boolean;
  deathNecklace: boolean;
  golem: boolean;
  dragon: boolean;
  /** 乱数由来の 3bit (0..7)。同じ状態でも 8 通りの呪文になる理由 */
  pattern: number;
}

export type StateFieldId = Exclude<FieldId, 'check'>;
export type FieldValues = Record<FieldId, number>;

export function initialGameState(): GameState {
  return {
    name: new Array(NAME_LENGTH).fill(NAME_SPACE_CODE),
    exp: 0, gold: 0, weapon: 0, armor: 0, shield: 0,
    items: new Array(8).fill(0),
    herbs: 0, keys: 0,
    dragonScale: false, warriorRing: false, deathNecklace: false, golem: false, dragon: false,
    pattern: 0,
  };
}

const FLAG_FIELDS = ['dragonScale', 'warriorRing', 'deathNecklace', 'golem', 'dragon'] as const;
type FlagField = (typeof FLAG_FIELDS)[number];

function isFlag(id: FieldId): id is FlagField {
  return (FLAG_FIELDS as readonly string[]).includes(id);
}

export function getFieldValue(s: GameState, id: StateFieldId): number {
  if (id.startsWith('name')) return s.name[Number(id.slice(4))]!;
  if (id.startsWith('item')) return s.items[Number(id.slice(4))]!;
  if (isFlag(id)) return s[id] ? 1 : 0;
  return s[id as 'exp' | 'gold' | 'weapon' | 'armor' | 'shield' | 'herbs' | 'keys' | 'pattern'];
}

/** 不変更新。値がフィールドの bit 幅に収まらなければ RangeError（UI の入力ミスを黙って丸めないため） */
export function setFieldValue(s: GameState, id: StateFieldId, value: number): GameState {
  const width = fieldDef(id).bits.length;
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) {
    throw new RangeError(`${id} must be 0..${2 ** width - 1}: ${value}`);
  }
  if (id.startsWith('name')) {
    const name = [...s.name];
    name[Number(id.slice(4))] = value;
    return { ...s, name };
  }
  if (id.startsWith('item')) {
    const items = [...s.items];
    items[Number(id.slice(4))] = value;
    return { ...s, items };
  }
  if (isFlag(id)) return { ...s, [id]: value === 1 };
  return { ...s, [id]: value };
}

export const STATE_FIELD_IDS: readonly StateFieldId[] = [
  'name0', 'name1', 'name2', 'name3', 'exp', 'gold', 'weapon', 'armor', 'shield',
  'item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'item7',
  'herbs', 'keys', 'dragonScale', 'warriorRing', 'deathNecklace', 'golem', 'dragon', 'pattern',
];

export function stateFromFieldValues(v: FieldValues): GameState {
  let s = initialGameState();
  for (const id of STATE_FIELD_IDS) s = setFieldValue(s, id, v[id]);
  return s;
}

export function statesEqual(a: GameState, b: GameState): boolean {
  return STATE_FIELD_IDS.every((id) => getFieldValue(a, id) === getFieldValue(b, id));
}
