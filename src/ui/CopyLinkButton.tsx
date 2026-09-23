import { useEffect, useState } from 'react';

/** 現在の URL（hash に呪文と画面を含む）をコピーする。結果はボタン自身の表示で知らせ、別の通知 UI を増やさない */
export function CopyLinkButton(props: { label: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'ng'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const h = setTimeout(() => setState('idle'), 1800);
    return () => clearTimeout(h);
  }, [state]);
  return (
    <button
      type="button"
      className="button"
      onClick={() => {
        // clipboard API は非 https や権限拒否で失敗しうる。そのときはアドレスバーから取ってもらう
        if (!navigator.clipboard) { setState('ng'); return; }
        navigator.clipboard.writeText(window.location.href).then(() => setState('ok'), () => setState('ng'));
      }}
    >
      <span aria-live="polite">
        {state === 'ok' ? 'コピーしました' : state === 'ng' ? 'コピーできません（アドレスバーの URL を使ってください）' : props.label}
      </span>
    </button>
  );
}
