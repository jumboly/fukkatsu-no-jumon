// 15byte 内の bit 配置の唯一の定義。根拠: docs/research.md §3
// pack/unpack・TraceGraph・Overview・テストはすべてここから導くことで、表示と計算の食い違いを防ぐ。

export const BYTE_COUNT = 15;
export const BIT_COUNT = BYTE_COUNT * 8; // 120
export const GROUP_COUNT = BIT_COUNT / 6; // 20
export const CHECK_BYTE = 0;

export type Category =
  | 'name' | 'exp' | 'gold' | 'equip' | 'items' | 'herbkey' | 'flags' | 'pattern' | 'check';

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  name: '名前', exp: 'EXP', gold: 'GOLD', equip: '装備', items: '道具',
  herbkey: 'やくそう・かぎ', flags: 'フラグ', pattern: 'PATTERN', check: 'CHECK',
};

export type FieldId =
  | 'name0' | 'name1' | 'name2' | 'name3'
  | 'exp' | 'gold'
  | 'weapon' | 'armor' | 'shield'
  | 'item0' | 'item1' | 'item2' | 'item3' | 'item4' | 'item5' | 'item6' | 'item7'
  | 'herbs' | 'keys'
  | 'dragonScale' | 'warriorRing' | 'deathNecklace' | 'golem' | 'dragon'
  | 'pattern'
  | 'check';

/** stream bit 番号 k = 8 * byte + bit（bit0 = LSB）。6bit 化は k の小さい順。 */
export function streamBit(byte: number, bit: number): number {
  return byte * 8 + bit;
}

export interface FieldDef {
  id: FieldId;
  label: string;
  category: Category;
  /** bits[j] = 論理値の bit j（j=0 が LSB）が格納される stream bit 番号 */
  bits: readonly number[];
}

/** byte の bit `from` から連続 `width` bit を LSB から順に割り当てる */
function span(byte: number, from: number, width: number): number[] {
  return Array.from({ length: width }, (_, j) => streamBit(byte, from + j));
}

export const FIELD_LAYOUT: readonly FieldDef[] = [
  { id: 'name0', label: '名前1文字目', category: 'name', bits: span(5, 2, 6) },
  { id: 'name1', label: '名前2文字目', category: 'name', bits: span(13, 1, 6) },
  { id: 'name2', label: '名前3文字目', category: 'name', bits: span(2, 0, 6) },
  { id: 'name3', label: '名前4文字目', category: 'name', bits: span(7, 0, 6) },
  // 16bit 値は下位 byte と上位 byte が離れた位置に置かれる
  { id: 'exp', label: 'EXP', category: 'exp', bits: [...span(1, 0, 8), ...span(12, 0, 8)] },
  { id: 'gold', label: 'GOLD', category: 'gold', bits: [...span(4, 0, 8), ...span(9, 0, 8)] },
  { id: 'weapon', label: 'ぶき', category: 'equip', bits: span(8, 5, 3) },
  { id: 'armor', label: 'よろい', category: 'equip', bits: span(8, 2, 3) },
  { id: 'shield', label: 'たて', category: 'equip', bits: span(8, 0, 2) },
  { id: 'item0', label: '道具1', category: 'items', bits: span(14, 0, 4) },
  { id: 'item1', label: '道具2', category: 'items', bits: span(14, 4, 4) },
  { id: 'item2', label: '道具3', category: 'items', bits: span(3, 0, 4) },
  { id: 'item3', label: '道具4', category: 'items', bits: span(3, 4, 4) },
  { id: 'item4', label: '道具5', category: 'items', bits: span(11, 0, 4) },
  { id: 'item5', label: '道具6', category: 'items', bits: span(11, 4, 4) },
  { id: 'item6', label: '道具7', category: 'items', bits: span(6, 0, 4) },
  { id: 'item7', label: '道具8', category: 'items', bits: span(6, 4, 4) },
  { id: 'herbs', label: 'やくそう', category: 'herbkey', bits: span(10, 0, 4) },
  { id: 'keys', label: 'かぎ', category: 'herbkey', bits: span(10, 4, 4) },
  { id: 'dragonScale', label: 'りゅうのうろこ装備', category: 'flags', bits: [streamBit(13, 7)] },
  { id: 'warriorRing', label: 'せんしのゆびわ装備', category: 'flags', bits: [streamBit(13, 0)] },
  { id: 'deathNecklace', label: 'しのくびかざり取得', category: 'flags', bits: [streamBit(2, 6)] },
  { id: 'golem', label: 'ゴーレム撃破', category: 'flags', bits: [streamBit(5, 1)] },
  { id: 'dragon', label: 'ドラゴン撃破', category: 'flags', bits: [streamBit(7, 6)] },
  // p0/p1/p2 の番号付けはゲームには無い約束（オラクル S2 の salt に合わせた）
  { id: 'pattern', label: 'PATTERN', category: 'pattern', bits: [streamBit(5, 0), streamBit(2, 7), streamBit(7, 7)] },
  { id: 'check', label: 'CHECK CODE', category: 'check', bits: span(CHECK_BYTE, 0, 8) },
];

export const FIELD_BY_ID: ReadonlyMap<FieldId, FieldDef> = new Map(FIELD_LAYOUT.map((f) => [f.id, f]));

export function fieldDef(id: FieldId): FieldDef {
  const f = FIELD_BY_ID.get(id);
  if (!f) throw new Error(`unknown field ${id}`);
  return f;
}

export interface BitOwner {
  field: FieldId;
  /** 論理値の中での bit 番号 (LSB=0) */
  logicalBit: number;
}

/** stream bit → それを使うフィールド。全 120 bit が埋まることはテストで保証する。 */
export const BIT_OWNERS: readonly BitOwner[] = (() => {
  const owners: (BitOwner | undefined)[] = new Array(BIT_COUNT).fill(undefined);
  for (const f of FIELD_LAYOUT) {
    f.bits.forEach((k, j) => {
      if (owners[k]) throw new Error(`stream bit ${k} assigned twice (${owners[k]!.field}, ${f.id})`);
      owners[k] = { field: f.id, logicalBit: j };
    });
  }
  return owners.map((o, k) => {
    if (!o) throw new Error(`stream bit ${k} unassigned`);
    return o;
  });
})();

/** 画面の縦方向（ゲーム上の意味）でまとめる単位 */
export interface FieldGroup {
  id: string;
  label: string;
  category: Category;
  fields: readonly FieldId[];
}

export const FIELD_GROUPS: readonly FieldGroup[] = [
  { id: 'name', label: '名前', category: 'name', fields: ['name0', 'name1', 'name2', 'name3'] },
  { id: 'exp', label: 'EXP', category: 'exp', fields: ['exp'] },
  { id: 'gold', label: 'GOLD', category: 'gold', fields: ['gold'] },
  { id: 'equip', label: '装備', category: 'equip', fields: ['weapon', 'armor', 'shield'] },
  { id: 'items', label: '道具', category: 'items', fields: ['item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'item7'] },
  { id: 'herbkey', label: 'やくそう・かぎ', category: 'herbkey', fields: ['herbs', 'keys'] },
  { id: 'flags', label: '進行フラグ', category: 'flags', fields: ['dragonScale', 'warriorRing', 'deathNecklace', 'golem', 'dragon'] },
  { id: 'pattern', label: 'PATTERN', category: 'pattern', fields: ['pattern'] },
  { id: 'check', label: 'CHECK CODE', category: 'check', fields: ['check'] },
];
