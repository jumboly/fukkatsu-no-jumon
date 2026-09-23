import { computeCheckCode } from '../src/core/checkcode';

function msg(data14: number[]): number[] {
  return [0, ...data14];
}

/** NESdev スレッドの Pokun メモにある "Magic numbers used by the check code"（S1b） */
const MAGIC = `88 c4 62 31 08 84 42 21 98 cc e6 73 a9 c4 62 31 5a ad c6 63 a1 c0 60 30 38 9c 4e a7 c3 f1 68 b4
d0 68 b4 5a 2d 06 83 51 20 10 08 84 42 a1 40 a0 f9 ec f6 7b ad c6 e3 61 81 d0 68 b4 da 6d a6 d3
b2 d9 fc fe ff ef 67 23 34 1a 0d 96 4b 35 8a 45 aa d5 7a 3d 8e 47 b3 49 a1 40 a0 50 a8 d4 ea 75
a0 d0 68 b4 5a ad c6 63 7e bf cf f7 6b a5 c2 61`.split(/\s+/).map((h) => parseInt(h, 16));

describe('check code', () => {
  it('全 0 なら 0（初期値 0、最終 XOR なし）', () => {
    expect(computeCheckCode(msg(new Array(14).fill(0))).crc16).toBe(0);
  });

  it('CRC-16/XMODEM の検査値と同じ振る舞い（"123456789" → 0x31C3）', () => {
    // 15byte 固定なので、先頭に 0 を 5 個置く（初期値 0 の CRC は先頭の 0 byte に影響されない）
    const data = [0, 0, 0, 0, 0, ...Array.from('123456789', (c) => c.charCodeAt(0))];
    expect(computeCheckCode(msg(data)).crc16).toBe(0x31c3);
  });

  it('byte0 は計算対象に含まれない', () => {
    const a = computeCheckCode([0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const b = computeCheckCode([0xff, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(a.crc16).toBe(b.crc16);
  });

  it('各データ bit の寄与が NESdev の magic numbers 112 個と一致する（byte14→1, bit7→0 順）', () => {
    const got: number[] = [];
    for (let byte = 14; byte >= 1; byte--) {
      for (let bit = 7; bit >= 0; bit--) {
        const m = new Array(15).fill(0);
        m[byte] = 1 << bit;
        got.push(computeCheckCode(m).code);
      }
    }
    expect(MAGIC).toHaveLength(112);
    expect(got).toEqual(MAGIC);
  });

  it('ステップ記録: 112 ステップ、byte1 bit7 から始まり、各ステップが前後で連続する', () => {
    const bytes = [0, 0x80, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44, 0x55];
    const r = computeCheckCode(bytes);
    expect(r.steps).toHaveLength(112);
    expect(r.steps[0]).toMatchObject({ byteIndex: 1, bitIndex: 7, inputBit: 1, registerBefore: 0, feedback: 1, xorApplied: true, registerAfter: 0x1021 });
    for (let i = 1; i < r.steps.length; i++) expect(r.steps[i]!.registerBefore).toBe(r.steps[i - 1]!.registerAfter);
    for (const s of r.steps) {
      expect(s.feedback).toBe(s.registerTopBit ^ s.inputBit);
      expect(s.registerAfter).toBe(s.afterShift ^ s.xorMask);
    }
    expect(r.steps.at(-1)!.registerAfter).toBe(r.crc16);
    expect(r.code).toBe(r.crc16 & 0xff);
  });
});
