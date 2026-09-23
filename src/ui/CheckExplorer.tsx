import { useEffect, useState } from 'react';
import { CRC_POLY } from '../core/checkcode';
import type { PipelineSnapshot } from '../core/pipeline';
import { CopyLinkButton } from './CopyLinkButton';
import { bin, hex } from './format';

/** DQ1 の 6502 ルーチン（S1 の逆アセンブル）。各行が step のどの段に当たるかを phase で持つ */
const ASM: { code: string; note: string; phase: Phase | null }[] = [
  { code: 'lda $3d', note: 'A ← register 上位', phase: 'cond' },
  { code: 'eor $3e', note: 'A ← A XOR 入力 byte', phase: 'cond' },
  { code: 'asl $3c', note: 'register 下位を左シフト', phase: 'shift' },
  { code: 'rol $3d', note: 'register 上位へ繰り上げ', phase: 'shift' },
  { code: 'asl $3e', note: '入力 byte を左シフト（次の bit を bit7 へ）', phase: 'shift' },
  { code: 'asl a', note: 'A の bit7 → carry', phase: 'cond' },
  { code: 'bcc +', note: 'carry=0 なら XOR しない', phase: 'cond' },
  { code: 'eor #$21 → $3c', note: 'register ^= $1021', phase: 'xor' },
  { code: 'eor #$10 → $3d', note: '', phase: 'xor' },
  { code: 'dey / bne -', note: '8 bit 繰り返し', phase: null },
];
type Phase = 'cond' | 'shift' | 'xor';

function RegBits(props: { value: number; highlight?: number; className?: string; label: string }) {
  return (
    <div className={`reg ${props.className ?? ''}`}>
      <span className="reg-label">{props.label}</span>
      <span className="reg-bits mono">
        {Array.from({ length: 16 }, (_, i) => 15 - i).map((b) => (
          <span key={b} className={`rb v${(props.value >> b) & 1} ${b === props.highlight ? 'hl' : ''} ${b === 7 ? 'gap' : ''} ${b < 8 ? 'lo' : ''}`}>
            {(props.value >> b) & 1}
          </span>
        ))}
      </span>
      <span className="reg-hex mono">{hex(props.value, 4)}</span>
    </div>
  );
}

export function CheckExplorer(props: { snapshot: PipelineSnapshot; onBack: () => void }) {
  const steps = props.snapshot.check.steps;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = steps[i]!;
  const last = steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    const h = setInterval(() => setI((x) => {
      if (x >= last) { setPlaying(false); return x; }
      return x + 1;
    }), 180);
    return () => clearInterval(h);
  }, [playing, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight') setI((x) => Math.min(last, x + 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(last);
      else if (e.key === 'Escape') props.onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, props]);

  const bytes = props.snapshot.bytes;
  const done = i === last;
  const c = props.snapshot.check;

  return (
    <div className="explorer">
      <header className="explorer-head">
        <button type="button" className="button" onClick={props.onBack}>← メインビューに戻る</button>
        <CopyLinkButton label="この画面の URL をコピー" />
        <h2 className="panel-title">CHECK CODE EXPLORER</h2>
        <span className="muted small">DQ1 が実際に行う手順（初期値 $0000・byte1→14・各 byte は MSB から・多項式 $1021・下位 8bit を採用）</span>
      </header>

      <section className="panel">
        <h3 className="sub-title">入力 byte（byte1〜14。byte0 は結果の格納先なので含まない）</h3>
        <div className="exp-bytes mono">
          {bytes.map((b, bi) => (
            <div key={bi} className={`exp-byte ${bi === 0 ? 'excluded' : ''} ${bi === step.byteIndex ? 'current' : bi < step.byteIndex ? 'done' : ''}`}>
              <div className="exp-byte-label">byte{bi}</div>
              <div>
                {Array.from({ length: 8 }, (_, k) => 7 - k).map((bit) => (
                  <span
                    key={bit}
                    className={`eb v${(b >> bit) & 1} ${bi === step.byteIndex && bit === step.bitIndex ? 'hl' : ''} ${bi === step.byteIndex && bit > step.bitIndex ? 'used' : ''}`}
                  >
                    {(b >> bit) & 1}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="explorer-controls" role="group" aria-label="ステップ操作">
        <button type="button" className="button" onClick={() => setI(0)} aria-label="最初">⏮ 最初</button>
        <button type="button" className="button" onClick={() => setI(Math.max(0, i - 1))} aria-label="前へ">←</button>
        <button type="button" className="button" onClick={() => setI(Math.min(last, i + 1))} aria-label="次へ">→</button>
        <button type="button" className="button" onClick={() => { if (i >= last) setI(0); setPlaying(!playing); }}>
          {playing ? '⏸ 停止' : '▶ 再生'}
        </button>
        <button type="button" className="button" onClick={() => setI(last)} aria-label="最後">最後 ⏭</button>
        <input
          type="range"
          min={0}
          max={last}
          value={i}
          aria-label="ステップ"
          onChange={(e) => setI(Number(e.target.value))}
        />
        <span className="mono">Step {i + 1} / {steps.length}</span>
      </div>

      <div className="explorer-body">
        <section className="panel step-panel">
          <h3 className="sub-title">byte{step.byteIndex} の bit{step.bitIndex}</h3>
          <dl className="step-dl">
            <dt>input bit</dt><dd className="mono">{step.inputBit}</dd>
            <dt>register before</dt><dd><RegBits value={step.registerBefore} highlight={15} label="$3D:$3C" /></dd>
            <dt>分岐条件</dt>
            <dd className="mono">register bit15 ({step.registerTopBit}) XOR input bit ({step.inputBit}) = <b>{step.feedback}</b></dd>
            <dt>左シフト後</dt><dd><RegBits value={step.afterShift} label="<<1" /></dd>
            <dt>XOR</dt>
            <dd>{step.xorApplied ? <RegBits value={step.xorMask} label={`^ ${hex(CRC_POLY, 4)}`} className="mask" /> : <span className="muted">しない（条件 0）</span>}</dd>
            <dt>register after</dt><dd><RegBits value={step.registerAfter} label="=" className="after" /></dd>
          </dl>
          {done && (
            <div className={`final ${c.valid ? 'ok' : 'ng'}`}>
              最終 register {hex(c.crc16, 4)} → 下位 8bit <b className="mono">{bin(c.computed, 8)} ({hex(c.computed, 2)})</b> が byte0 に入る。
              呪文内の byte0 は {hex(c.stored, 2)}：{c.valid ? '一致（有効）' : '不一致（この呪文は拒否される）'}
            </div>
          )}
        </section>

        <section className="panel asm-panel">
          <h3 className="sub-title">6502 ルーチン（1 bit 分）</h3>
          <ol className="asm mono">
            {ASM.map((l, k) => (
              <li
                key={k}
                className={`${l.phase === 'xor' && !step.xorApplied ? 'skipped' : ''} ${l.phase ? `ph-${l.phase}` : ''}`}
              >
                <span className="asm-code">{l.code}</span> <span className="muted">; {l.note}</span>
              </li>
            ))}
          </ol>
          <p className="muted small">
            教科書的な CRC-16/XMODEM（register ^= byte&lt;&lt;8 してから 8 回シフト）と数学的には同じ結果になるが、
            DQ1 は 1 bit ごとに「上位 byte XOR 入力 byte」の bit7 で分岐する形で書かれている。
            register は 16bit だが、呪文に入れるのは下位 8bit（$3C）だけ。
          </p>
        </section>
      </div>

      <section className="panel">
        <h3 className="sub-title">全ステップ</h3>
        <div className="step-table-wrap">
          <table className="step-table mono">
            <thead>
              <tr><th>#</th><th>byte.bit</th><th>in</th><th>before</th><th>cond</th><th>XOR</th><th>after</th></tr>
            </thead>
            <tbody>
              {steps.map((st) => (
                <tr key={st.index} className={st.index === i ? 'current' : ''} onClick={() => setI(st.index)}>
                  <td>{st.index + 1}</td>
                  <td>{st.byteIndex}.{st.bitIndex}</td>
                  <td>{st.inputBit}</td>
                  <td>{hex(st.registerBefore, 4)}</td>
                  <td>{st.feedback}</td>
                  <td>{st.xorApplied ? hex(st.xorMask, 4) : '—'}</td>
                  <td>{hex(st.registerAfter, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
