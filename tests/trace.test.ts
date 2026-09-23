import { initialGameState } from '../src/core/gameState';
import { encode, decode } from '../src/core/pipeline';
import { TRACE_GRAPH, diffSnapshots, nodeId, relate } from '../src/core/trace';

describe('TraceGraph', () => {
  it('logical bit → packed bit の辺はちょうど 120 本、各 packed bit に 1 本ずつ入る', () => {
    const e = TRACE_GRAPH.edges.filter((x) => x.from.startsWith('lbit:') && x.to.startsWith('pbit:'));
    expect(e).toHaveLength(120);
    expect(new Set(e.map((x) => x.to)).size).toBe(120);
  });

  it('ゴーレム撃破 → byte5 bit1 → raw6[6] bit5 → enc6[6] → 7 文字目', () => {
    const r = relate(nodeId.field('golem'));
    for (const n of [
      nodeId.lbit('golem', 0), nodeId.pbit(41), nodeId.byte(5), nodeId.rbit(6, 5), nodeId.raw(6), nodeId.enc(6), nodeId.char(6),
    ]) expect(r.nodes.has(n), n).toBe(true);
    // 他のフィールドや他の文字は直接の経路に含まれない
    expect(r.nodes.has(nodeId.field('exp'))).toBe(false);
    expect(r.nodes.has(nodeId.char(7))).toBe(false);
    // スクランブル連鎖とチェックコード経由の影響は間接扱い
    expect(r.indirectNodes.has(nodeId.char(7))).toBe(true);
    expect(r.indirectNodes.has(nodeId.field('check'))).toBe(true);
    expect(r.indirectNodes.has(nodeId.char(0))).toBe(true);
  });

  it('呪文の 1 文字から逆方向に元の packed bit とゲーム状態へ戻れる', () => {
    // 1 文字目 = raw6[0] = byte0 bit0-5 = チェックコード下位 6bit
    const r = relate(nodeId.char(0));
    expect(r.nodes.has(nodeId.enc(0))).toBe(true);
    expect(r.nodes.has(nodeId.raw(0))).toBe(true);
    for (let k = 0; k < 6; k++) expect(r.nodes.has(nodeId.pbit(k))).toBe(true);
    expect(r.nodes.has(nodeId.pbit(6))).toBe(false);
    expect(r.nodes.has(nodeId.field('check'))).toBe(true);
    // 2 文字目 = byte0 bit6-7 + byte1 bit0-3（EXP 下位）
    const r2 = relate(nodeId.char(1));
    expect(r2.nodes.has(nodeId.field('check'))).toBe(true);
    expect(r2.nodes.has(nodeId.field('exp'))).toBe(true);
    // 上流の間接要因は 1 ホップ: 直前の encoded と check の入力 byte までで、他フィールドまでは広げない
    expect(r2.indirectNodes.has(nodeId.enc(0))).toBe(true);
    expect(r2.indirectNodes.has(nodeId.byte(8))).toBe(true);
    expect(r2.indirectNodes.has(nodeId.field('weapon'))).toBe(false);
  });

  it('EXP は離れた 2 byte（byte1, byte12）に届く', () => {
    const r = relate(nodeId.field('exp'));
    expect(r.nodes.has(nodeId.byte(1))).toBe(true);
    expect(r.nodes.has(nodeId.byte(12))).toBe(true);
    expect(r.nodes.has(nodeId.byte(2))).toBe(false);
    expect(r.nodes.has(nodeId.derived('level'))).toBe(true);
  });

  it('byte を指すと中の全フィールド（上流）と、中の bit が入る 6bit グループ（下流）が関連', () => {
    const r = relate(nodeId.byte(8));
    for (const f of ['weapon', 'armor', 'shield'] as const) expect(r.nodes.has(nodeId.field(f))).toBe(true);
    // byte8 = stream bit 64..71 → raw6[10] (60..65), raw6[11] (66..71)
    expect(r.nodes.has(nodeId.raw(10))).toBe(true);
    expect(r.nodes.has(nodeId.raw(11))).toBe(true);
    expect(r.nodes.has(nodeId.raw(12))).toBe(false);
  });

  it('カテゴリ（凡例）を指すと、そのカテゴリの bit だけが関連になる', () => {
    const r = relate(nodeId.cat('equip'));
    // 装備 = byte8 の 8bit（stream bit 64..71）
    const bits = [...r.nodes].filter((n) => n.startsWith('pbit:')).map((n) => Number(n.slice(5))).sort((a, b) => a - b);
    expect(bits).toEqual([64, 65, 66, 67, 68, 69, 70, 71]);
    for (const f of ['weapon', 'armor', 'shield'] as const) expect(r.nodes.has(nodeId.field(f))).toBe(true);
    expect(r.nodes.has(nodeId.field('exp'))).toBe(false);
    // direct と indirect は重ならない
    for (const n of r.nodes) expect(r.indirectNodes.has(n), n).toBe(false);
  });

  it('離れた位置にあるカテゴリ（名前）も全 bit が関連になる', () => {
    const r = relate(nodeId.cat('name'));
    expect([...r.nodes].filter((n) => n.startsWith('pbit:'))).toHaveLength(24);
    expect(r.nodes.has(nodeId.derived('growth'))).toBe(true);
  });
});

describe('diff', () => {
  it('ゴーレム撃破 OFF→ON: フラグ bit、byte5、check、該当 raw、以降の enc/char が変わる', () => {
    const a = encode(initialGameState());
    const b = encode({ ...initialGameState(), golem: true });
    const d = diffSnapshots(a, b);
    expect(d.nodes.has(nodeId.field('golem'))).toBe(true);
    expect(d.nodes.has(nodeId.pbit(41))).toBe(true);
    expect(d.nodes.has(nodeId.byte(5))).toBe(true);
    expect(d.nodes.has(nodeId.field('exp'))).toBe(false);
    expect(d.nodes.has(nodeId.raw(6))).toBe(true);
    expect(d.edges.has(`${nodeId.lbit('golem', 0)}>${nodeId.pbit(41)}`)).toBe(true);
    // 変わっていない bit への辺は変更経路に含めない
    expect(d.edges.has(`${nodeId.lbit('exp', 0)}>${nodeId.pbit(8)}`)).toBe(false);
    const changedBits = [...d.nodes].filter((n) => n.startsWith('pbit:')).map((n) => Number(n.slice(5)));
    // フラグ 1bit + チェックコード内で変わった bit のみ
    expect(changedBits.filter((k) => k >= 8)).toEqual([41]);
  });

  it('呪文 1 文字変更でも差分が取れる', () => {
    const a = decode('ふるいけやかわずとびこむみずのおとばしや');
    const b = decode('ふるいけやかわずとびこむみずのおとばしゆ');
    const d = diffSnapshots(a, b);
    expect(d.nodes.has(nodeId.char(19))).toBe(true);
    expect(d.nodes.has(nodeId.char(18))).toBe(false);
    expect(d.nodes.has(nodeId.raw(19))).toBe(true);
  });
});
