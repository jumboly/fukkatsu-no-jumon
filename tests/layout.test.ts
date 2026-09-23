import { BIT_COUNT, BIT_OWNERS, FIELD_LAYOUT, fieldDef, streamBit, type FieldId } from '../src/core/layout';
import { packFields, unpackFields, bytesToRaw6, raw6ToBytes, bytesToBits, bitsToBytes } from '../src/core/pipeline';

type Loc = [byte: number, bit: number];

/** docs/research.md §3 の表を、実装とは独立に (byte, bit) で書き下したもの */
const EXPECTED: Record<FieldId, Loc[]> = {
  name0: [[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7]],
  name1: [[13, 1], [13, 2], [13, 3], [13, 4], [13, 5], [13, 6]],
  name2: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5]],
  name3: [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  exp: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [12, 0], [12, 1], [12, 2], [12, 3], [12, 4], [12, 5], [12, 6], [12, 7]],
  gold: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [9, 0], [9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [9, 6], [9, 7]],
  weapon: [[8, 5], [8, 6], [8, 7]],
  armor: [[8, 2], [8, 3], [8, 4]],
  shield: [[8, 0], [8, 1]],
  item0: [[14, 0], [14, 1], [14, 2], [14, 3]],
  item1: [[14, 4], [14, 5], [14, 6], [14, 7]],
  item2: [[3, 0], [3, 1], [3, 2], [3, 3]],
  item3: [[3, 4], [3, 5], [3, 6], [3, 7]],
  item4: [[11, 0], [11, 1], [11, 2], [11, 3]],
  item5: [[11, 4], [11, 5], [11, 6], [11, 7]],
  item6: [[6, 0], [6, 1], [6, 2], [6, 3]],
  item7: [[6, 4], [6, 5], [6, 6], [6, 7]],
  herbs: [[10, 0], [10, 1], [10, 2], [10, 3]],
  keys: [[10, 4], [10, 5], [10, 6], [10, 7]],
  dragonScale: [[13, 7]],
  warriorRing: [[13, 0]],
  deathNecklace: [[2, 6]],
  golem: [[5, 1]],
  dragon: [[7, 6]],
  pattern: [[5, 0], [2, 7], [7, 7]],
  check: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]],
};

function zeroValues() {
  return Object.fromEntries(FIELD_LAYOUT.map((f) => [f.id, 0])) as Record<FieldId, number>;
}

describe('bit layout', () => {
  it('120 個すべての bit 位置がちょうど 1 回ずつ割り当てられている', () => {
    expect(BIT_OWNERS).toHaveLength(BIT_COUNT);
    const total = FIELD_LAYOUT.reduce((n, f) => n + f.bits.length, 0);
    expect(total).toBe(120);
    expect(new Set(FIELD_LAYOUT.flatMap((f) => f.bits)).size).toBe(120);
  });

  it.each(Object.entries(EXPECTED))('%s の bit 幅と位置', (id, locs) => {
    const f = fieldDef(id as FieldId);
    expect(f.bits).toEqual(locs.map(([b, i]) => streamBit(b, i)));
  });

  it.each(Object.entries(EXPECTED))('%s の各 bit を単独で立てると期待した byte/bit だけが 1 になる', (id, locs) => {
    locs.forEach(([byte, bit], j) => {
      const v = zeroValues();
      v[id as FieldId] = 1 << j;
      const bytes = packFields(v);
      const expected = new Array(15).fill(0);
      expected[byte] = 1 << bit;
      expect(bytes).toEqual(expected);
      expect(unpackFields(bytes)[id as FieldId]).toBe(1 << j);
    });
  });

  it('byte 境界を跨がず離れて置かれる EXP/GOLD の上位下位', () => {
    const v = zeroValues();
    v.exp = 0x04b0; // 1200
    v.gold = 0xabcd;
    const bytes = packFields(v);
    expect(bytes[1]).toBe(0xb0);
    expect(bytes[12]).toBe(0x04);
    expect(bytes[4]).toBe(0xcd);
    expect(bytes[9]).toBe(0xab);
  });

  it('装備 byte は 武器<<5 | 鎧<<2 | 盾', () => {
    const v = zeroValues();
    Object.assign(v, { weapon: 5, armor: 3, shield: 2 });
    expect(packFields(v)[8]).toBe((5 << 5) | (3 << 2) | 2);
  });

  it('bit 幅を超える値は拒否する', () => {
    const v = zeroValues();
    v.shield = 4;
    expect(() => packFields(v)).toThrow(RangeError);
  });
});

describe('15×8bit ⇄ 20×6bit', () => {
  it('raw6[0] は byte0 の bit0-5、raw6[1] は byte0 bit6-7 + byte1 bit0-3', () => {
    const bytes = new Array(15).fill(0);
    bytes[0] = 0b11_000001;
    bytes[1] = 0b0000_1010;
    const raw = bytesToRaw6(bytes);
    expect(raw[0]).toBe(0b000001);
    expect(raw[1]).toBe(0b1010_11);
    expect(raw[2]).toBe(0);
  });

  it('3byte = 4 グループ単位で揃う（raw6[3] は byte2 の bit2-7）', () => {
    const bytes = new Array(15).fill(0);
    bytes[2] = 0b101101_00;
    expect(bytesToRaw6(bytes)[3]).toBe(0b101101);
  });

  it('round trip', () => {
    for (let t = 0; t < 200; t++) {
      const bytes = Array.from({ length: 15 }, () => Math.floor(Math.random() * 256));
      expect(raw6ToBytes(bytesToRaw6(bytes))).toEqual(bytes);
      expect(bitsToBytes(bytesToBits(bytes))).toEqual(bytes);
    }
  });
});
