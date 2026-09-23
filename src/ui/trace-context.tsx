import { createContext, useContext, type KeyboardEvent, type ReactNode } from 'react';
import type { Diff, Relation } from '../core/trace';

export interface TraceUi {
  /** hover 中（なければ選択中）のノード */
  focus: string | null;
  selected: string | null;
  relation: Relation | null;
  diff: Diff;
  showDiff: boolean;
  /** 差分フラッシュを再生し直すためのカウンタ（偶奇で keyframes 名を切り替える） */
  diffVersion: number;
  setHover: (id: string | null) => void;
  toggleSelect: (id: string) => void;
}

export const TraceContext = createContext<TraceUi | null>(null);

export function useTrace(): TraceUi {
  const t = useContext(TraceContext);
  if (!t) throw new Error('TraceContext missing');
  return t;
}

/** ノードの表示状態。hovered/selected と related と changed を別々のクラスにする */
export function nodeClass(t: TraceUi, id: string): string {
  const c: string[] = ['node'];
  if (t.focus === id) c.push('is-focus');
  if (t.selected === id) c.push('is-selected');
  if (t.relation) {
    if (t.relation.nodes.has(id)) c.push('is-related');
    else if (t.relation.indirectNodes.has(id)) c.push('is-indirect');
    else c.push('is-dim');
  }
  if (t.showDiff && t.diff.nodes.has(id)) c.push('is-changed', t.diffVersion % 2 ? 'flash-a' : 'flash-b');
  return c.join(' ');
}

export function edgeClass(t: TraceUi, id: string, kind: string): string {
  const c: string[] = ['wire', `wire-${kind}`];
  if (t.relation) {
    if (t.relation.edges.has(id)) c.push('is-related');
    else if (t.relation.indirectEdges.has(id)) c.push('is-indirect');
    else c.push('is-dim');
  }
  if (t.showDiff && t.diff.edges.has(id)) c.push('is-changed', t.diffVersion % 2 ? 'flash-a' : 'flash-b');
  return c.join(' ');
}

/** 追跡対象になる要素の共通 props（mouse / touch / keyboard で同じ操作ができるように） */
export function traceProps(t: TraceUi, id: string, extraClass = '', tabbable = true) {
  return {
    'data-node': id,
    className: `${nodeClass(t, id)} ${extraClass}`,
    onMouseEnter: () => t.setHover(id),
    onMouseLeave: () => t.setHover(null),
    onFocus: () => t.setHover(id),
    onBlur: () => t.setHover(null),
    onClick: () => t.toggleSelect(id),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.toggleSelect(id); }
    },
    // bit セルは数百個あるので Tab 移動の対象から外し、フィールド・byte・6bit 値・文字だけを巡回させる
    tabIndex: tabbable ? 0 : -1,
    role: 'button',
    'aria-pressed': t.selected === id,
  };
}

export function TraceNode(props: { id: string; className?: string; title?: string; children?: ReactNode; tabbable?: boolean }) {
  const t = useTrace();
  return (
    <span {...traceProps(t, props.id, props.className, props.tabbable ?? true)} title={props.title}>
      {props.children}
    </span>
  );
}
