// HTML の上に重ねる SVG の配線。位置は getBoundingClientRect で実測し、ResizeObserver で再計算する。
// どの辺を引くかは TRACE_GRAPH に従う（UI で依存関係を作らない）。

import { memo, useLayoutEffect, useState } from 'react';
import { TRACE_GRAPH, type EdgeKind, kindOf } from '../core/trace';
import { edgeClass, useTrace } from './trace-context';

interface WirePath {
  id: string;
  kind: EdgeKind;
  d: string;
}

/** 隣接していて線を引く意味がない辺（field→lbit, rbit→raw, pbit→byte）は除く */
function isDrawn(from: string, to: string, kind: EdgeKind): boolean {
  const a = kindOf(from);
  const b = kindOf(to);
  if (kind === 'check' || kind === 'chain') return true;
  return (a === 'lbit' && b === 'pbit') || (a === 'pbit' && b === 'rbit') || (a === 'raw' && b === 'enc') || (a === 'enc' && b === 'char');
}

const DRAWN_EDGES = TRACE_GRAPH.edges.filter((e) => isDrawn(e.from, e.to, e.kind));

function computePaths(container: HTMLElement): { paths: WirePath[]; w: number; h: number } {
  const base = container.getBoundingClientRect();
  const rects = new Map<string, DOMRect>();
  container.querySelectorAll<HTMLElement>('[data-node]').forEach((el) => rects.set(el.dataset.node!, el.getBoundingClientRect()));
  const paths: WirePath[] = [];
  for (const e of DRAWN_EDGES) {
    const a = rects.get(e.from);
    const b = rects.get(e.to);
    if (!a || !b) continue;
    const ay = a.top + a.height / 2 - base.top;
    const by = b.top + b.height / 2 - base.top;
    let d: string;
    if (e.kind === 'chain') {
      // 同じ列の上下をつなぐ連鎖は右側に小さな弧で描く
      const x = a.right - base.left;
      d = `M${x},${ay} C${x + 16},${ay} ${x + 16},${by} ${x},${by}`;
    } else if (b.left >= a.right) {
      const x1 = a.right - base.left;
      const x2 = b.left - base.left;
      const dx = (x2 - x1) / 2;
      d = `M${x1},${ay} C${x1 + dx},${ay} ${x2 - dx},${by} ${x2},${by}`;
    } else {
      // byte → CHECK CODE のように左向きに戻る辺
      const x1 = a.left - base.left;
      const x2 = b.right - base.left;
      const dx = Math.max(40, (x1 - x2) / 2);
      d = `M${x1},${ay} C${x1 - dx},${ay} ${x2 + dx},${by} ${x2},${by}`;
    }
    paths.push({ id: e.id, kind: e.kind, d });
  }
  return { paths, w: container.scrollWidth, h: container.scrollHeight };
}

export function Wires(props: { container: HTMLElement | null }) {
  const [geo, setGeo] = useState<{ paths: WirePath[]; w: number; h: number }>({ paths: [], w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = props.container;
    if (!el) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setGeo(computePaths(el)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.querySelectorAll('.col').forEach((c) => ro.observe(c));
    // Web フォントの読み込み完了で文字幅が変わるため、そのときも測り直す
    document.fonts?.ready.then(update);
    return () => { ro.disconnect(); cancelAnimationFrame(frame); };
  }, [props.container]);

  return <WireLayer {...geo} />;
}

const WireLayer = memo(function WireLayer(props: { paths: WirePath[]; w: number; h: number }) {
  const t = useTrace();
  return (
    <svg className="wires" width={props.w} height={props.h} aria-hidden>
      {props.paths.map((p) => <path key={p.id} d={p.d} className={edgeClass(t, p.id, p.kind)} />)}
    </svg>
  );
});
