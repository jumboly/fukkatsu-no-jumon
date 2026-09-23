import { deriveStats, growthType, levelFromExp } from '../src/core/growth';
import {
  NAME_CHAR_TABLE, NAME_PALETTE_ROWS, PASSWORD_CHAR_TABLE, nameCodeToChar, nameFromString, nameToString,
} from '../src/core/tables';

describe('名前文字表', () => {
  it('64 エントリ、code = index、文字は重複なし', () => {
    expect(NAME_CHAR_TABLE).toHaveLength(64);
    NAME_CHAR_TABLE.forEach((c, i) => expect(c.code).toBe(i));
    expect(new Set(NAME_CHAR_TABLE.map((c) => c.char)).size).toBe(64);
  });

  it('代表的なコード（S1/S2/S3 で一致した値）', () => {
    expect(nameCodeToChar(0x00).char).toBe('0');
    expect(nameCodeToChar(0x0a).char).toBe('あ');
    expect(nameCodeToChar(0x35).char).toBe('わ');
    expect(nameCodeToChar(0x37).char).toBe('ん');
    expect(nameCodeToChar(0x3b).char).toBe('ょ');
    expect(nameCodeToChar(0x3c).char).toBe('゛');
    expect(nameCodeToChar(0x3f).char).toBe('　');
  });

  it('0x3C-0x3F だけ RAM タイルが異なる（S1 の変換ルーチン）', () => {
    expect(NAME_CHAR_TABLE.slice(0x3c).map((c) => c.tile)).toEqual([0x53, 0x54, 0x4e, 0x5f]);
    NAME_CHAR_TABLE.slice(0, 0x3c).forEach((c) => expect(c.tile).toBe(c.code));
  });

  it('数字は名前入力では選べない', () => {
    NAME_CHAR_TABLE.slice(0, 10).forEach((c) => expect(c.inputability).toBe('password-only'));
    NAME_CHAR_TABLE.slice(10, 0x3f).forEach((c) => expect(c.inputability).toBe('selectable'));
  });

  it('濁音は「清音 + ゛」の 2 文字、4 文字未満は空白で埋める', () => {
    expect(nameFromString('が')).toEqual([0x0f, 0x3c, 0x3f, 0x3f]);
    expect(nameToString(nameFromString('ぱ'))).toBe('は゜　　');
    expect(() => nameFromString('がぎぐ')).toThrow();
  });

  it('パレットは名前表の全 64 文字をちょうど 1 回ずつ含む', () => {
    const chars = NAME_PALETTE_ROWS.flat().filter((c): c is string => c !== null);
    expect(chars.sort()).toEqual(NAME_CHAR_TABLE.map((c) => c.char).sort());
  });

  it('名前表と呪文表は別物（例: 呪文の「が」は名前表に無い、名前の「を」は呪文表に無い）', () => {
    const nameChars = new Set(NAME_CHAR_TABLE.map((c) => c.char));
    expect(nameChars.has('が')).toBe(false);
    expect(PASSWORD_CHAR_TABLE.includes('を')).toBe(false);
  });
});

describe('導出ステータス', () => {
  it('経験値表の境界', () => {
    expect(levelFromExp(0)).toBe(1);
    expect(levelFromExp(6)).toBe(1);
    expect(levelFromExp(7)).toBe(2);
    expect(levelFromExp(2898)).toBe(10);
    expect(levelFromExp(18696)).toBe(17);
    expect(levelFromExp(65534)).toBe(29);
    expect(levelFromExp(65535)).toBe(30);
  });

  it('成長タイプの合計値は資料の例と一致（へ゜しえ=28, あれく=29, くみちょ=31）', () => {
    expect(growthType(nameFromString('へ゜しえ')).sum).toBe(28);
    expect(growthType(nameFromString('あれく')).sum).toBe(29);
    expect(growthType(nameFromString('くみちょ')).sum).toBe(31);
  });

  it('くみちょ: A=3, B=1, C=1（S3 の例）', () => {
    expect(growthType(nameFromString('くみちょ'))).toMatchObject({ A: 3, B: 1, C: 1, type: 15 });
  });

  it('Lv30 の最終値が S3 の表と一致（余り 12/13/14/15）', () => {
    const expected: Record<number, [number, number, number, number]> = {
      12: [129, 120, 210, 200], 13: [140, 120, 210, 183], 14: [129, 130, 192, 200], 15: [140, 130, 192, 183],
      0: [126, 117, 210, 200], 1: [140, 117, 210, 180], 2: [126, 130, 189, 200], 3: [140, 130, 189, 180],
    };
    for (const [rem, [str, agi, hp, mp]] of Object.entries(expected)) {
      // 合計が rem になる名前: 「0」(値0) を 3 つと、値 rem の数字/かな 1 つ（数字は 0-9、あ=10 以降）
      const code = Number(rem); // code 0..15 は tile も同値で mod16 = code
      const s = deriveStats([code, 0, 0, 0], 65535);
      expect(s.growth.type).toBe(Number(rem));
      expect([s.strength, s.agility, s.maxHp, s.maxMp]).toEqual([str, agi, hp, mp]);
    }
  });

  it('Lv1-2 の MP 基準値 0 には A を加えない', () => {
    const s = deriveStats(nameFromString('くみちょ'), 0);
    expect(s.maxMp).toBe(0);
  });
});
