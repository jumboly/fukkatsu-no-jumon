import { useState, type ReactNode } from 'react';
import { deriveStats } from '../core/growth';
import { BIT_COUNT, BIT_OWNERS, CATEGORY_LABELS, fieldDef, type Category, type FieldId } from '../core/layout';
import { allPatterns, SCRAMBLE_ADD, type PipelineSnapshot } from '../core/pipeline';
import { HERB_MAX, ITEM_ID_MAX, PASSWORD_LINE_LENGTHS, nameCodeToChar } from '../core/tables';
import { kindOf, nodeId } from '../core/trace';
import { bin, hex } from './format';
import { PasswordPalette } from './Palettes';
import { Popover } from './Popover';
import { TraceNode, nodeClass, useTrace } from './trace-context';

// ---------------- 呪文エディタ（5/7/5/3） ----------------

export function PasswordPanel(props: {
  snapshot: PipelineSnapshot;
  onChar: (n: number, code: number) => void;
  onText: (text: string) => string | null;
}) {
  const t = useTrace();
  const s = props.snapshot;
  const [edit, setEdit] = useState<{ n: number; anchor: HTMLElement } | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  let n0 = 0;
  const lines = PASSWORD_LINE_LENGTHS.map((len) => {
    const idx = Array.from({ length: len }, (_, i) => n0 + i);
    n0 += len;
    return idx;
  });
  return (
    <section className="panel dq-window password-panel" aria-label="復活の呪文">
      <h2 className="panel-title">ふっかつのじゅもん</h2>
      <div className="pw-lines">
        {lines.map((line, li) => (
          <div key={li} className="pw-line">
            {line.map((n) => (
              <button
                key={n}
                type="button"
                data-node={nodeId.char(n)}
                className={`${nodeClass(t, nodeId.char(n))} pw-cell`}
                aria-haspopup="dialog"
                aria-label={`${n + 1} 文字目「${s.chars[n]}」 raw ${s.raw6[n]} / encoded ${s.enc6[n]}（クリックで変更）`}
                onMouseEnter={() => t.setHover(nodeId.char(n))}
                onMouseLeave={() => t.setHover(null)}
                onClick={(e) => setEdit(edit?.n === n ? null : { n, anchor: e.currentTarget })}
              >
                {s.chars[n]}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className={`pw-status ${s.accepted ? 'ok' : 'ng'}`} role="status">
        {s.accepted ? '✓ 有効な呪文' : s.check.valid ? '✗ チェックは一致するが実機は拒否' : '✗ チェックコード不一致'}
        <span className="muted"> ・ {s.origin === 'encode' ? 'GameState から encode' : '呪文から decode'}</span>
      </div>
      {s.issues.length > 0 && (
        <ul className="issues">
          {s.issues.map((i) => <li key={i.kind + i.field}>{i.message}</li>)}
        </ul>
      )}
      <form
        className="pw-form"
        onSubmit={(e) => {
          e.preventDefault();
          const err = props.onText(text);
          setError(err);
          if (!err) setText('');
        }}
      >
        <input
          className="text-input"
          value={text}
          placeholder="呪文を貼り付け（空白は無視）"
          aria-label="復活の呪文をテキストで入力"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="button">読み込む</button>
      </form>
      {error && <div className="form-error" role="alert">{error}</div>}
      {edit && (
        <Popover anchor={edit.anchor} label="復活の呪文の文字パレット" onClose={() => setEdit(null)}>
          <div className="char-detail mono">
            {edit.n + 1} 文字目: raw {bin(s.raw6[edit.n]!, 6)} ({s.raw6[edit.n]}) → encoded {bin(s.enc6[edit.n]!, 6)} ({s.enc6[edit.n]})
          </div>
          <PasswordPalette
            value={s.enc6[edit.n]!}
            onPick={(code) => { props.onChar(edit.n, code); edit.anchor.focus(); setEdit(null); }}
          />
        </Popover>
      )}
    </section>
  );
}

// ---------------- 120bit Overview ----------------

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export function Overview({ snapshot: s }: { snapshot: PipelineSnapshot }) {
  const counts = new Map<Category, number>();
  for (const o of BIT_OWNERS) {
    const c = fieldDef(o.field).category;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const assigned = BIT_OWNERS.length;
  return (
    <section className="panel overview" aria-label="120bit Overview">
      <div className="overview-head">
        <h2 className="panel-title">120 BIT OVERVIEW</h2>
        <span className="stat"><b>{assigned} / {BIT_COUNT}</b> bit positions assigned</span>
        <span className="stat">Padding bits: <b>{BIT_COUNT - assigned}</b></span>
        <span className="muted small">
          Unused values（bit は使うが値として無効）: やくそう・かぎ {HERB_MAX + 1}〜15 / 道具 ID {ITEM_ID_MAX + 1}
        </span>
      </div>
      <div className="overview-strip" role="list">
        {Array.from({ length: BIT_COUNT }, (_, k) => {
          const o = BIT_OWNERS[k]!;
          const f = fieldDef(o.field);
          const edges = `${k % 8 === 0 ? 'byte-start' : ''} ${k % 6 === 0 ? 'group-start' : ''}`;
          return (
            <TraceNode
              key={k}
              id={nodeId.pbit(k)}
              tabbable={false}
              className={`ov-cell cat-${f.category} v${s.streamBits[k]} ${edges}`}
              title={`stream bit ${k} = byte${k >> 3} bit${k & 7} → raw6[${Math.floor(k / 6)}] bit${k % 6}\n${f.label} bit${o.logicalBit}`}
            />
          );
        })}
      </div>
      <div className="overview-axis muted small">
        stream bit 0（byte0 bit0）→ 119。上の目盛り = byte 境界（8bit）、下の目盛り = 呪文 1 文字分（6bit）。
      </div>
      <div className="legend">
        {CATEGORIES.map((c) => (
          <span key={c} className={`legend-item cat-${c}`}>
            <span className="swatch" /> {CATEGORY_LABELS[c]} <span className="muted">{counts.get(c) ?? 0}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

// ---------------- 導出ステータス（名前と EXP から。呪文には無い） ----------------

export function DerivedPanel({ snapshot: s }: { snapshot: PipelineSnapshot }) {
  const d = deriveStats(s.state.name, s.state.exp);
  const g = d.growth;
  const mark = (full: boolean) => (full ? <span className="tag ok">基準値</span> : <span className="tag">×0.9 + A</span>);
  return (
    <section className="panel dq-window derived" aria-label="導出ステータス">
      <h2 className="panel-title">つよさ <span className="muted small">（保存されず EXP と名前から導出）</span></h2>
      <div className="derived-grid">
        <TraceNode id={nodeId.derived('level')} className="derived-item" title="EXP から経験値表で決まる">
          <span className="k">レベル</span> <span className="v">{d.level}</span>
        </TraceNode>
        <TraceNode id={nodeId.derived('growth')} className="derived-item" title="名前 4 文字の値（RAM タイル mod 16）の合計">
          <span className="k">成長タイプ</span> <span className="v">{g.type}</span>
          <span className="calc mono small">
            {s.state.name.map((c, i) => `${nameCodeToChar(c).char === '　' ? '␣' : nameCodeToChar(c).char}(${g.charValues[i]})`).join('+')}
            ={g.sum} → A={g.A} B={g.B} C={g.C}
          </span>
        </TraceNode>
        <TraceNode id={nodeId.derived('stats')} className="derived-item stats" title="⌊基準値×0.9⌋+A（参考値）">
          <span className="k">ちから</span><span className="v">{d.strength}</span>{mark(g.full.strength)}
          <span className="k">すばやさ</span><span className="v">{d.agility}</span>{mark(g.full.agility)}
          <span className="k">最大HP</span><span className="v">{d.maxHp}</span>{mark(g.full.hp)}
          <span className="k">最大MP</span><span className="v">{d.maxMp}</span>{mark(g.full.mp)}
        </TraceNode>
      </div>
      <p className="muted small">
        C=1 ならちから、C=0 なら MP が基準値のまま（もう一方が 0.9 倍）。B で すばやさ／HP が同様に決まる。
        端数処理は資料間で差があり参考値（docs/research.md §7）。HP/MP は呪文で再開すると常に満タン。
      </p>
    </section>
  );
}

// ---------------- 同じ状態の 8 パターン ----------------

export function PatternsPanel(props: { snapshot: PipelineSnapshot; onPattern: (p: number) => void }) {
  const pws = allPatterns(props.snapshot.state);
  return (
    <details className="panel patterns">
      <summary>同じ GameState に対応する 8 通りの呪文（pattern 000〜111）</summary>
      <ol className="pattern-list">
        {pws.map((pw, p) => (
          <li key={p}>
            <button
              type="button"
              className={`pattern-item ${props.snapshot.state.pattern === p ? 'current' : ''}`}
              onClick={() => props.onPattern(p)}
            >
              <span className="mono muted">{bin(p, 3)}</span> {pw.slice(0, 5)} {pw.slice(5, 12)} {pw.slice(12, 17)} {pw.slice(17)}
            </button>
          </li>
        ))}
      </ol>
      <p className="muted small">pattern は王様が話すたびに乱数から選ぶ 3bit。どれを入力しても同じ状態で再開する。</p>
    </details>
  );
}

// ---------------- インスペクタ（選択中ノードの説明） ----------------

function locate(k: number) {
  return `byte${k >> 3} bit${k & 7}`;
}

function fieldValueText(s: PipelineSnapshot, id: FieldId): string {
  const v = s.fieldValues[id];
  if (id.startsWith('name')) {
    const c = nameCodeToChar(v);
    return `「${c.char === '　' ? '空白' : c.char}」 code ${hex(v, 2)}${c.inputability === 'password-only' ? '（通常入力では選択不可）' : ''}`;
  }
  return `${v}（${bin(v, fieldDef(id).bits.length)}）`;
}

export function Inspector({ snapshot: s }: { snapshot: PipelineSnapshot }) {
  const t = useTrace();
  const id = t.focus;
  let body: ReactNode = <span className="muted">項目にカーソルを合わせる／クリックで固定すると、関係する経路だけが光ります。もう一度クリックで解除。</span>;
  if (id) {
    const parts = id.split(':');
    switch (kindOf(id)) {
      case 'field': {
        const f = fieldDef(parts[1] as FieldId);
        if (f.id === 'check') {
          body = <>CHECK CODE: 呪文内 {hex(s.check.stored, 2)} / 再計算 {hex(s.check.computed, 2)}（CRC16 {hex(s.check.crc16, 4)} の下位 8bit）。byte1〜14 の全 bit に依存 → 格納先 byte0。</>;
        } else {
          body = <><b>{f.label}</b> = {fieldValueText(s, f.id)}。{f.bits.length} bit → {f.bits.map((k, j) => `b${j}@${locate(k)}`).join(', ')}</>;
        }
        break;
      }
      case 'lbit': {
        const f = fieldDef(parts[1] as FieldId);
        const j = Number(parts[2]);
        const k = f.bits[j]!;
        body = <>{f.label} の bit{j} = {s.fieldValues[f.id] >> j & 1} → {locate(k)}（stream bit {k}）→ raw6[{Math.floor(k / 6)}] の bit{k % 6} → {Math.floor(k / 6) + 1} 文字目</>;
        break;
      }
      case 'pbit': {
        const k = Number(parts[1]);
        const o = BIT_OWNERS[k]!;
        body = <>{locate(k)}（stream bit {k}）= {s.streamBits[k]}。持ち主: {fieldDef(o.field).label} の bit{o.logicalBit}。→ raw6[{Math.floor(k / 6)}] bit{k % 6}</>;
        break;
      }
      case 'byte': {
        const i = Number(parts[1]);
        const owners = [...new Set(Array.from({ length: 8 }, (_, b) => fieldDef(BIT_OWNERS[i * 8 + 7 - b]!.field).label))];
        body = <>byte{i} = {hex(s.bytes[i]!, 2)} = {bin(s.bytes[i]!, 8)}（b7…b0）。中身: {owners.join(' | ')}{i === 0 ? '（チェックコードの格納先）' : '（チェックコードの入力）'}</>;
        break;
      }
      case 'rbit':
      case 'raw': {
        const n = Number(parts[1]);
        const src = Array.from({ length: 6 }, (_, j) => 6 * n + 5 - j).map((k) => `${locate(k)}`);
        body = <>raw6[{n}] = {s.raw6[n]}（{bin(s.raw6[n]!, 6)}）← b5…b0 = {src.join(', ')}</>;
        break;
      }
      case 'enc': {
        const n = Number(parts[1]);
        const prev = n === 0 ? 0 : s.enc6[n - 1]!;
        body = <>encoded[{n}] = ({n === 0 ? '初期値 0' : `encoded[${n - 1}] ${prev}`} + raw {s.raw6[n]} + {SCRAMBLE_ADD}) mod 64 = {s.enc6[n]} → 「{s.chars[n]}」。この値は次の文字にも足し込まれる（連鎖）。</>;
        break;
      }
      case 'char': {
        const n = Number(parts[1]);
        body = <>{n + 1} 文字目「{s.chars[n]}」 ← encoded {s.enc6[n]}（{bin(s.enc6[n]!, 6)}） ← raw {s.raw6[n]}（{bin(s.raw6[n]!, 6)}）。raw の出所: stream bit {6 * n}〜{6 * n + 5}</>;
        break;
      }
      case 'derived':
        body = parts[1] === 'level' ? <>レベルは EXP {s.state.exp} から経験値表で決まる（呪文には無い）</>
          : parts[1] === 'growth' ? <>成長タイプは名前 4 文字から決まる（呪文には無い）</>
            : <>能力値 = Lv ごとの基準値に成長タイプの補正</>;
        break;
    }
  }
  return (
    <div className="inspector" role="status" aria-live="polite">
      {t.selected && <span className="tag sel">固定中</span>}
      <span className="inspector-body">{body}</span>
      <span className="inspector-legend small">
        <span className="lg lg-related">関連</span>
        <span className="lg lg-indirect">間接（check・連鎖）</span>
        <span className="lg lg-changed">変更</span>
      </span>
    </div>
  );
}
