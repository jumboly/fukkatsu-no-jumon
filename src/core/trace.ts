// 可視化用の依存グラフ。hover / click / 逆追跡 / 変更伝播のすべてがこれを使う。
// UI 側で「どれとどれが繋がるか」を推測させないため、FIELD_LAYOUT と各工程の定義からここで機械的に作る。

import { deriveStats } from './growth';
import { BIT_OWNERS, BYTE_COUNT, CHECK_BYTE, FIELD_LAYOUT, FIELD_GROUPS, GROUP_COUNT, type FieldId } from './layout';
import { CHECK_INPUT_FIRST, CHECK_INPUT_LAST } from './checkcode';
import type { PipelineSnapshot } from './pipeline';

export type NodeKind = 'field' | 'lbit' | 'pbit' | 'byte' | 'rbit' | 'raw' | 'enc' | 'char' | 'derived';

/**
 * - data:    値そのものがそのまま流れる（bit の移動、6bit のまとまり、文字化）
 * - member:  bit → それを含む byte（byte を指したときに中の bit 経由で下流を辿るため区別する）
 * - check:   byte1..14 → チェックコード（全データに依存するので「間接的な影響」として扱う）
 * - chain:   enc[n-1] → enc[n] のスクランブル連鎖（これも間接的な影響）
 * - derived: 保存されない導出ステータスへの依存
 */
export type EdgeKind = 'data' | 'member' | 'check' | 'chain' | 'derived';

export interface TraceEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface TraceGraph {
  nodes: ReadonlySet<string>;
  edges: readonly TraceEdge[];
  out: ReadonlyMap<string, readonly TraceEdge[]>;
  in: ReadonlyMap<string, readonly TraceEdge[]>;
}

export const nodeId = {
  field: (f: FieldId) => `field:${f}`,
  lbit: (f: FieldId, j: number) => `lbit:${f}:${j}`,
  pbit: (k: number) => `pbit:${k}`,
  byte: (i: number) => `byte:${i}`,
  rbit: (n: number, j: number) => `rbit:${n}:${j}`,
  raw: (n: number) => `raw:${n}`,
  enc: (n: number) => `enc:${n}`,
  char: (n: number) => `char:${n}`,
  derived: (d: 'level' | 'growth' | 'stats') => `derived:${d}`,
};

export function kindOf(id: string): NodeKind {
  return id.slice(0, id.indexOf(':')) as NodeKind;
}

/** 表示列。変更伝播アニメーションの遅延や「左→右」の順序付けに使う */
export function columnOf(id: string): number {
  switch (kindOf(id)) {
    case 'field': case 'derived': return 0;
    case 'lbit': return 1;
    case 'pbit': case 'byte': return 2;
    case 'rbit': case 'raw': return 3;
    case 'enc': return 4;
    case 'char': return 5;
  }
}

function build(): TraceGraph {
  const nodes = new Set<string>();
  const edges: TraceEdge[] = [];
  const add = (from: string, to: string, kind: EdgeKind) => {
    nodes.add(from);
    nodes.add(to);
    edges.push({ id: `${from}>${to}`, from, to, kind });
  };

  for (const f of FIELD_LAYOUT) {
    f.bits.forEach((k, j) => {
      add(nodeId.field(f.id), nodeId.lbit(f.id, j), 'data');
      add(nodeId.lbit(f.id, j), nodeId.pbit(k), 'data');
    });
  }
  for (let k = 0; k < BYTE_COUNT * 8; k++) {
    add(nodeId.pbit(k), nodeId.byte(k >> 3), 'member');
    add(nodeId.pbit(k), nodeId.rbit(Math.floor(k / 6), k % 6), 'data');
  }
  for (let i = CHECK_INPUT_FIRST; i <= CHECK_INPUT_LAST; i++) add(nodeId.byte(i), nodeId.field('check'), 'check');
  for (let n = 0; n < GROUP_COUNT; n++) {
    for (let j = 0; j < 6; j++) add(nodeId.rbit(n, j), nodeId.raw(n), 'data');
    add(nodeId.raw(n), nodeId.enc(n), 'data');
    if (n > 0) add(nodeId.enc(n - 1), nodeId.enc(n), 'chain');
    add(nodeId.enc(n), nodeId.char(n), 'data');
  }
  for (const f of FIELD_GROUPS.find((g) => g.id === 'name')!.fields) add(nodeId.field(f), nodeId.derived('growth'), 'derived');
  add(nodeId.field('exp'), nodeId.derived('level'), 'derived');
  add(nodeId.derived('growth'), nodeId.derived('stats'), 'derived');
  add(nodeId.derived('level'), nodeId.derived('stats'), 'derived');

  const out = new Map<string, TraceEdge[]>();
  const inn = new Map<string, TraceEdge[]>();
  for (const e of edges) {
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e);
    (inn.get(e.to) ?? inn.set(e.to, []).get(e.to)!).push(e);
  }
  return { nodes, edges, out, in: inn };
}

export const TRACE_GRAPH: TraceGraph = build();

const DIRECT_KINDS: ReadonlySet<EdgeKind> = new Set(['data', 'member', 'derived']);

function walk(g: TraceGraph, seeds: Iterable<string>, dir: 'down' | 'up', kinds: ReadonlySet<EdgeKind> | null) {
  const seen = new Set<string>(seeds);
  const edges = new Set<string>();
  const stack = [...seen];
  while (stack.length) {
    const n = stack.pop()!;
    for (const e of (dir === 'down' ? g.out : g.in).get(n) ?? []) {
      if (kinds && !kinds.has(e.kind)) continue;
      edges.add(e.id);
      const next = dir === 'down' ? e.to : e.from;
      if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return { nodes: seen, edges };
}

export interface Relation {
  /** 直接の経路（値がそのまま流れる） */
  nodes: Set<string>;
  edges: Set<string>;
  /** check / スクランブル連鎖を介した間接的な影響（direct は含まない） */
  indirectNodes: Set<string>;
  indirectEdges: Set<string>;
}

/** 選択ノードの上流・下流をまとめて返す。byte / raw のような集合ノードは中の bit の下流も含める */
export function relate(id: string, g: TraceGraph = TRACE_GRAPH): Relation {
  const members = (g.in.get(id) ?? []).filter((e) => e.kind === 'member').map((e) => e.from);
  const seeds = [id, ...members];
  const up = walk(g, [id], 'up', DIRECT_KINDS);
  const down = walk(g, seeds, 'down', DIRECT_KINDS);
  const nodes = new Set([...up.nodes, ...down.nodes]);
  const edges = new Set([...up.edges, ...down.edges]);
  // 上流側で辿った bit も、それを含む byte を関連として光らせる（逆方向の追跡で byte が見えるように）
  for (const n of [...nodes]) {
    for (const e of g.out.get(n) ?? []) {
      if (e.kind === 'member') { nodes.add(e.to); edges.add(e.id); }
    }
  }
  // 下流の間接影響は最後まで辿る（check やスクランブル連鎖で実際に後ろの文字が全部変わるため）
  const allDown = walk(g, seeds, 'down', null);
  const indirectNodes = new Set([...allDown.nodes].filter((n) => !nodes.has(n)));
  const indirectEdges = new Set([...allDown.edges].filter((e) => !edges.has(e)));
  // 上流の間接要因は 1 ホップだけにする。check は全データに依存するので、辿り切ると全フィールドが光って経路が読めなくなる
  for (const n of [...nodes]) {
    for (const e of g.in.get(n) ?? []) {
      if ((e.kind === 'check' || e.kind === 'chain') && !nodes.has(e.from)) {
        indirectNodes.add(e.from);
        indirectEdges.add(e.id);
      }
    }
  }
  return { nodes, edges, indirectNodes, indirectEdges };
}

// ---- 値と差分 ----

export type NodeValue = number | string;

/** スナップショット上の各ノードの値。差分検出に使う */
export function nodeValues(s: PipelineSnapshot): Map<string, NodeValue> {
  const v = new Map<string, NodeValue>();
  for (const f of FIELD_LAYOUT) {
    const value = s.fieldValues[f.id];
    v.set(nodeId.field(f.id), value);
    f.bits.forEach((_, j) => v.set(nodeId.lbit(f.id, j), (value >> j) & 1));
  }
  // 呪文に入っている check と再計算した check は別物なので、両方を field:check の値に含めて差分を拾う
  v.set(nodeId.field('check'), `${s.check.stored}/${s.check.computed}`);
  s.streamBits.forEach((b, k) => v.set(nodeId.pbit(k), b));
  s.bytes.forEach((b, i) => v.set(nodeId.byte(i), b));
  s.raw6.forEach((r, n) => {
    v.set(nodeId.raw(n), r);
    for (let j = 0; j < 6; j++) v.set(nodeId.rbit(n, j), (r >> j) & 1);
  });
  s.enc6.forEach((e, n) => v.set(nodeId.enc(n), e));
  s.chars.forEach((c, n) => v.set(nodeId.char(n), c));
  const d = deriveStats(s.state.name, s.state.exp);
  v.set(nodeId.derived('level'), d.level);
  v.set(nodeId.derived('growth'), d.growth.type);
  v.set(nodeId.derived('stats'), `${d.strength}/${d.agility}/${d.maxHp}/${d.maxMp}`);
  return v;
}

export interface Diff {
  nodes: Set<string>;
  edges: Set<string>;
}

export function diffSnapshots(prev: PipelineSnapshot | null, cur: PipelineSnapshot, g: TraceGraph = TRACE_GRAPH): Diff {
  if (!prev) return { nodes: new Set(), edges: new Set() };
  const a = nodeValues(prev);
  const b = nodeValues(cur);
  const nodes = new Set<string>();
  for (const [id, val] of b) if (a.get(id) !== val) nodes.add(id);
  // 両端とも値が変わった辺だけを「変更経路」とする（関連しているだけの辺と区別するため）
  const edges = new Set(g.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)).map((e) => e.id));
  return { nodes, edges };
}

/** stream bit k の持ち主（Overview のツールチップ等で使う） */
export function ownerOfBit(k: number) {
  return BIT_OWNERS[k]!;
}

export const CHECK_NODE = nodeId.field('check');
export const CHECK_BYTE_NODE = nodeId.byte(CHECK_BYTE);
