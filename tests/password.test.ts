import { readFileSync } from 'node:fs';
import { type GameState, initialGameState, statesEqual } from '../src/core/gameState';
import {
  allPatterns, decode, decodeCodes, descramble, encode, encodeToString, parsePassword, scramble,
} from '../src/core/pipeline';
import { nameFromString, PASSWORD_CHAR_TABLE, passwordCharToCode } from '../src/core/tables';

interface Fixture {
  encode: { state: GameState; password: string }[];
  decode: { password: string; result: 'ok' | 'crc-mismatch' | 'invalid-state'; state?: GameState }[];
}
const fixture: Fixture = JSON.parse(readFileSync(new URL('./fixtures/oracle-vectors.json', import.meta.url), 'utf8'));

function state(p: Partial<GameState>): GameState {
  return { ...initialGameState(), ...p };
}

/** docs/research.md §8: 攻略サイト掲載の呪文と、その内容（サイト記載と照合済み） */
const KNOWN: [string, GameState][] = [
  ['ふるいけやかわずとびこむみずのおとばしや', state({
    name: nameFromString('4ひえた'), exp: 2898, gold: 15143, weapon: 2, armor: 3, shield: 0, herbs: 4, keys: 1,
    items: [0, 5, 7, 9, 2, 10, 12, 5], dragonScale: true, warriorRing: true, golem: true, pattern: 4,
  })],
  ['くわたやまくらしのずかなかはたはらくろま', state({
    name: nameFromString('ねょ2ふ'), exp: 18696, gold: 11705, weapon: 1, armor: 3, herbs: 4, keys: 2,
    items: [1, 12, 7, 7, 11, 1, 9, 12], dragonScale: true, warriorRing: true, deathNecklace: true, dragon: true, pattern: 5,
  })],
  ['おけすちなのへむゆるがごぜづびあおけすち', state({ name: nameFromString('0000') })],
  ['してらぐじださのへへわげずぢばぼえみれぎ', state({ name: nameFromString('あれく'), pattern: 5 })],
  ['ほりいゆうじえにつくすどらごくえすとだよ', state({
    name: nameFromString('おっ゜て'), exp: 50529, gold: 43227, weapon: 5, armor: 2, herbs: 1, keys: 3,
    items: [13, 10, 10, 1, 1, 14, 8, 11], dragonScale: true, deathNecklace: true,
  })],
  ['まるかつはやつはりせかいいちだつたのだよ', state({
    name: nameFromString('4きね8'), exp: 31377, gold: 64673, weapon: 7, armor: 0, shield: 3, herbs: 2, keys: 2,
    items: [13, 10, 4, 8, 14, 5, 10, 8], dragonScale: true, warriorRing: true, golem: true, dragon: true,
  })],
];

describe('既知の復活の呪文', () => {
  it.each(KNOWN)('%s を decode すると既知の GameState', (pw, expected) => {
    const s = decode(pw);
    expect(s.accepted).toBe(true);
    expect(s.check.valid).toBe(true);
    expect(s.state).toEqual(expected);
  });

  it.each(KNOWN)('既知の GameState を encode すると %s', (pw, st) => {
    expect(encodeToString(st)).toBe(pw);
  });

  it('check は正しいが道具 ID 15 を含む呪文は拒否（値は壊さずに復元）', () => {
    const s = decode('どくのばうぼぞそこけばがきもびはめつごび');
    expect(s.check.valid).toBe(true);
    expect(s.accepted).toBe(false);
    expect(s.state.items[7]).toBe(15);
    expect(s.issues.map((i) => i.kind)).toEqual(['item']);
  });
});

describe('オラクル（taotao54321/dq1-password）との比較', () => {
  it(`encode ${fixture.encode.length} 件が一致`, () => {
    for (const v of fixture.encode) expect(encodeToString(v.state), JSON.stringify(v.state)).toBe(v.password);
  });

  it(`decode ${fixture.decode.length} 件の判定と内容が一致`, () => {
    for (const v of fixture.decode) {
      const s = decode(v.password);
      if (v.result === 'ok') {
        expect(s.accepted, v.password).toBe(true);
        expect(statesEqual(s.state, v.state!), v.password).toBe(true);
      } else if (v.result === 'crc-mismatch') {
        expect(s.check.valid, v.password).toBe(false);
      } else {
        expect(s.check.valid, v.password).toBe(true);
        expect(s.accepted, v.password).toBe(false);
      }
    }
  });
});

describe('round trip', () => {
  it('encode → decode で元の GameState に戻る', () => {
    for (const { state: st } of fixture.encode) {
      const d = decode(encodeToString(st));
      expect(d.accepted).toBe(true);
      expect(d.state).toEqual(st);
    }
  });

  it('decode → encode で同じ呪文（受理される呪文は状態＋pattern で一意）', () => {
    for (const v of fixture.decode.filter((x) => x.result === 'ok')) {
      expect(encodeToString(decode(v.password).state)).toBe(v.password);
    }
  });

  it('不正な呪文でも bytes は保持され、decode → 再 scramble で同じ文字列', () => {
    for (const v of fixture.decode) expect(decode(v.password).chars.join('')).toBe(v.password);
  });
});

describe('pattern', () => {
  const base = KNOWN[0]![1];
  it('pattern 0..7 はすべて異なる有効な呪文になり、decode で pattern も復元される', () => {
    const pws = allPatterns(base);
    expect(new Set(pws).size).toBe(8);
    pws.forEach((pw, p) => {
      const d = decode(pw);
      expect(d.accepted).toBe(true);
      expect(d.state).toEqual({ ...base, pattern: p });
    });
  });
});

describe('check による検出', () => {
  it('有効な呪文の 1 文字を変えると大半が invalid になる', () => {
    const pw = Array.from(KNOWN[0]![0]);
    let invalid = 0;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      for (const c of PASSWORD_CHAR_TABLE) {
        if (c === pw[i]) continue;
        const m = [...pw];
        m[i] = c;
        total++;
        if (!decode(m.join('')).check.valid) invalid++;
      }
    }
    // 8bit のチェックなので素通りはおおむね 1/256 程度。原則 invalid であることだけ確認する
    expect(invalid / total).toBeGreaterThan(0.98);
  });

  it('最後の文字だけ変えた呪文は check 不一致', () => {
    expect(decode('ほりいゆうじえにつくすどらごくえすとだが').check.valid).toBe(false);
  });
});

describe('scramble', () => {
  it('enc[n] = enc[n-1] + raw[n] + 4 (mod 64)、初期値 0', () => {
    expect(scramble([0, 0, 0])).toEqual([4, 8, 12]);
    expect(scramble([60, 63])).toEqual([0, 3]);
  });
  it('descramble は逆変換', () => {
    const raw = Array.from({ length: 20 }, (_, i) => (i * 37) & 63);
    expect(descramble(scramble(raw))).toEqual(raw);
  });
  it('raw を 1 つ変えると、その位置以降の enc がすべて同じ差分だけずれる', () => {
    const raw = new Array(20).fill(0);
    const a = scramble(raw);
    raw[5] = 3;
    const b = scramble(raw);
    expect(b.slice(0, 5)).toEqual(a.slice(0, 5));
    for (let i = 5; i < 20; i++) expect((b[i]! - a[i]! + 64) & 63).toBe(3);
  });
});

describe('入力パース', () => {
  it('5/7/5/3 の区切り空白は無視', () => {
    expect(parsePassword('ふるいけや かわずとびこむ　みずのおと ばしや').ok).toBe(true);
  });
  it('長さ違い・テーブル外の文字はエラー', () => {
    expect(parsePassword('ふるいけや').ok).toBe(false);
    expect(parsePassword('ぱるいけやかわずとびこむみずのおとばしや').ok).toBe(false);
    expect(parsePassword('をるいけやかわずとびこむみずのおとばしや').ok).toBe(false);
  });
  it('decodeCodes は範囲外コードを拒否', () => {
    expect(() => decodeCodes(new Array(20).fill(64))).toThrow();
    expect(() => decodeCodes(new Array(19).fill(0))).toThrow();
  });
});

describe('境界値', () => {
  const cases: [string, Partial<GameState>][] = [
    ['EXP 最小', { exp: 0 }], ['EXP 最大', { exp: 65535 }],
    ['GOLD 最小', { gold: 0 }], ['GOLD 最大', { gold: 65535 }],
    ['武器 最大', { weapon: 7 }], ['鎧 最大', { armor: 7 }], ['盾 最大', { shield: 3 }],
    ['やくそう 6', { herbs: 6 }], ['かぎ 6', { keys: 6 }],
    ['道具 14', { items: [14, 0, 0, 0, 0, 0, 0, 14] }],
    ['全フラグ', { dragonScale: true, warriorRing: true, deathNecklace: true, golem: true, dragon: true }],
    ['pattern 7', { pattern: 7 }],
  ];
  it.each(cases)('%s は受理され round trip する', (_, p) => {
    const st = state(p);
    const d = decode(encodeToString(st));
    expect(d.accepted).toBe(true);
    expect(d.state).toEqual(st);
  });

  it.each([
    ['やくそう 7', { herbs: 7 }, 'herbs'], ['やくそう 15', { herbs: 15 }, 'herbs'],
    ['かぎ 7', { keys: 7 }, 'keys'], ['道具 15', { items: [0, 0, 0, 15, 0, 0, 0, 0] }, 'item'],
  ] as [string, Partial<GameState>, string][])('%s は encode できるが実機 decode では拒否される Unused value', (_, p, kind) => {
    const e = encode(state(p));
    expect(e.check.valid).toBe(true);
    expect(e.accepted).toBe(false);
    expect(e.issues.map((i) => i.kind)).toEqual([kind]);
    expect(decode(e.chars.join('')).state).toEqual(state(p));
  });

  it('1bit フラグ（ゴーレム撃破）の切り替えは packed bit を 1 つだけ変える', () => {
    const a = encode(state({}));
    const b = encode(state({ golem: true }));
    const diff = a.streamBits.map((x, k) => (x !== b.streamBits[k] ? k : -1)).filter((k) => k >= 0 && k >= 8);
    expect(diff).toEqual([5 * 8 + 1]);
  });
});

describe('文字テーブル', () => {
  it('復活の呪文 64 文字は重複なく、round trip する', () => {
    expect(PASSWORD_CHAR_TABLE).toHaveLength(64);
    expect(new Set(PASSWORD_CHAR_TABLE).size).toBe(64);
    PASSWORD_CHAR_TABLE.forEach((c, i) => expect(passwordCharToCode(c)).toBe(i));
  });
});
