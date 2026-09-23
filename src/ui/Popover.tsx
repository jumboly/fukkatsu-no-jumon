import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** anchor 要素の直下に出すポップオーバー。Escape と外側クリックで閉じる */
export function Popover(props: { anchor: HTMLElement; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const a = props.anchor.getBoundingClientRect();
    const el = ref.current!;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // 画面外にはみ出さないよう、下に入らなければ上に、横は画面内に収める
    const margin = 8;
    let top = a.bottom + 6;
    if (top + h > window.innerHeight - margin) top = Math.max(margin, a.top - h - 6);
    const left = Math.min(Math.max(margin, a.left + a.width / 2 - w / 2), window.innerWidth - w - margin);
    setPos({ left, top });
  }, [props.anchor]);

  // onClose は親の再レンダーごとに作り直されるので ref 経由で最新を呼び、effect は開閉時だけ走らせる
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  useEffect(() => {
    const anchor = props.anchor;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onCloseRef.current(); anchor.focus(); } };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    // 開いたら最初の選択肢（現在値があればそれ）にフォーカスし、キーボードだけで操作できるようにする
    const first = ref.current?.querySelector<HTMLElement>('[aria-current="true"]') ?? ref.current?.querySelector<HTMLElement>('button');
    first?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [props.anchor]);

  return createPortal(
    <div ref={ref} className="popover" role="dialog" aria-label={props.label} style={{ left: pos.left, top: pos.top }}>
      {props.children}
    </div>,
    document.body,
  );
}

/** グリッド内の button を矢印キーで移動する（roving focus） */
export function gridKeyNav(e: React.KeyboardEvent<HTMLElement>, cols: number) {
  const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
  const d = keys[e.key];
  if (d === undefined) return;
  const cells = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-cell]'));
  const i = cells.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  cells[Math.min(cells.length - 1, Math.max(0, i + d))]?.focus();
}
