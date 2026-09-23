import { useState } from 'react';
import type { GameState, StateFieldId } from '../core/gameState';
import { getFieldValue, setFieldValue } from '../core/gameState';
import {
  BIT_OWNERS, BYTE_COUNT, FIELD_GROUPS, GROUP_COUNT, fieldDef, type FieldId,
} from '../core/layout';
import type { PipelineSnapshot } from '../core/pipeline';
import { SCRAMBLE_ADD } from '../core/pipeline';
import {
  ARMOR_NAMES, HERB_MAX, ITEM_ID_MAX, ITEM_NAMES, KEY_MAX, SHIELD_NAMES, WEAPON_NAMES, nameCodeToChar,
} from '../core/tables';
import { nodeId } from '../core/trace';
import { bin, hex, msbFirst } from './format';
import { NamePalette } from './Palettes';
import { Popover } from './Popover';
import { TraceNode, traceProps, useTrace } from './trace-context';
import { Wires } from './Wires';

export interface PipelineProps {
  snapshot: PipelineSnapshot;
  onStateChange: (s: GameState) => void;
  onOpenExplorer: () => void;
}

const COLUMN_HEADS = [
  { title: 'GAME STATE', sub: 'ゲーム上の値' },
  { title: 'LOGICAL BITS', sub: '人から見た bit 列（左 MSB）' },
  { title: 'PACKED 15 BYTES', sub: '実格納。byte 内は b7…b0' },
  { title: 'RAW 6BIT ×20', sub: 'stream bit を 6 個ずつ' },
  { title: 'ENCODED', sub: `前の値 + raw + ${SCRAMBLE_ADD}` },
  { title: 'PASSWORD', sub: '64 文字表' },
];

export function Pipeline(props: PipelineProps) {
  // 子の layout effect は親の ref 設定より先に走るため、ref ではなく state で要素を渡す
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const s = props.snapshot;
  return (
    <div className="pipeline-scroll" aria-label="生成パイプライン">
      <div className="pipeline" ref={setContainer}>
        <Wires container={container} />
        {COLUMN_HEADS.map((h, i) => (
          <div key={h.title} className={`col-head col-head-${i}`}>
            <div className="col-title">{h.title}</div>
            <div className="col-sub">{h.sub}</div>
          </div>
        ))}
        <FieldsColumn {...props} />
        <PackColumn snapshot={s} />
        <RawColumn snapshot={s} />
        <EncColumn snapshot={s} />
        <CharColumn snapshot={s} />
      </div>
    </div>
  );
}

// ---------------- 列 1+2: ゲーム状態と論理 bit（同じ行に揃える） ----------------

function FieldsColumn(props: PipelineProps) {
  return (
    <div className="col col-fields">
      {FIELD_GROUPS.map((g) => (
        <section key={g.id} className={`field-group cat-${g.category}`} aria-label={g.label}>
          <h3 className="group-label">{g.label}</h3>
          {g.fields.map((f) => <FieldRow key={f} field={f} {...props} />)}
        </section>
      ))}
    </div>
  );
}

function FieldRow(props: PipelineProps & { field: FieldId }) {
  const t = useTrace();
  const def = fieldDef(props.field);
  const s = props.snapshot;
  const value = s.fieldValues[props.field];
  const id = nodeId.field(props.field);
  const width = def.bits.length;
  const issue = s.issues.find((i) => i.field === props.field);
  return (
    <div className="field-row">
      <div
        className="state-cell"
        onMouseEnter={() => t.setHover(id)}
        onMouseLeave={() => t.setHover(null)}
      >
        {/* hover は行全体で拾うので、ラベル自身の mouseenter/leave は無効にする（行内移動で hover が消えないように） */}
        <span {...traceProps(t, id, 'field-label')} onMouseEnter={undefined} onMouseLeave={undefined} title="クリックで経路を固定">
          {def.label}
        </span>
        <div className="field-editor">
          {props.field === 'check'
            ? <CheckCell snapshot={s} onOpen={props.onOpenExplorer} />
            : <FieldEditor {...props} field={props.field as StateFieldId} />}
        </div>
        {issue && <div className="field-issue" role="note">⚠ {issue.message}</div>}
      </div>
      <div className="lbits" aria-label={`${def.label} の論理 bit`}>
        {msbFirst(width).map((j) => (
          <span key={j} className={width === 16 && j === 7 ? 'lbit-gap' : undefined}>
            <TraceNode
              id={nodeId.lbit(props.field, j)}
              tabbable={false}
              className={`bit cat-${def.category} v${(value >> j) & 1}`}
              title={`${def.label} bit${j} → byte${def.bits[j]! >> 3} bit${def.bits[j]! & 7}`}
            >
              {(value >> j) & 1}
            </TraceNode>
          </span>
        ))}
        <span className="lbit-value">{width >= 8 ? hex(value, Math.ceil(width / 4)) : value}</span>
      </div>
    </div>
  );
}

function optionsFor(field: StateFieldId): { value: number; label: string; unused?: boolean }[] | null {
  const range = (n: number, label: (i: number) => string, max?: number) =>
    Array.from({ length: n }, (_, i) => ({ value: i, label: label(i), unused: max !== undefined && i > max }));
  if (field === 'weapon') return range(8, (i) => `${i} ${WEAPON_NAMES[i]}`);
  if (field === 'armor') return range(8, (i) => `${i} ${ARMOR_NAMES[i]}`);
  if (field === 'shield') return range(4, (i) => `${i} ${SHIELD_NAMES[i]}`);
  if (field.startsWith('item')) return range(16, (i) => `${i} ${ITEM_NAMES[i] ?? '（未使用値・拒否）'}`, ITEM_ID_MAX);
  if (field === 'herbs' || field === 'keys') {
    const max = field === 'herbs' ? HERB_MAX : KEY_MAX;
    return range(16, (i) => (i > max ? `${i}（未使用値・拒否）` : `${i}`), max);
  }
  if (field === 'pattern') return range(8, (i) => `${i}（${bin(i, 3)}）`);
  return null;
}

function FieldEditor(props: PipelineProps & { field: StateFieldId }) {
  const state = props.snapshot.state;
  const value = getFieldValue(state, props.field);
  const set = (v: number) => props.onStateChange(setFieldValue(state, props.field, v));
  const def = fieldDef(props.field);

  if (props.field.startsWith('name')) return <NameSlot value={value} onPick={set} label={def.label} />;

  if (def.category === 'flags') {
    return (
      <button type="button" className={`toggle ${value ? 'on' : 'off'}`} aria-pressed={value === 1} onClick={() => set(value ? 0 : 1)}>
        {value ? 'ON' : 'OFF'}
      </button>
    );
  }

  if (props.field === 'exp' || props.field === 'gold') {
    return (
      <input
        className="num-input"
        type="number"
        min={0}
        max={65535}
        value={value}
        aria-label={def.label}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value));
          // 16bit を超える入力は黙って別の値に丸めず、範囲の端に止める
          if (Number.isFinite(v)) set(Math.min(65535, Math.max(0, v)));
        }}
      />
    );
  }

  const opts = optionsFor(props.field)!;
  return (
    <select className="select" value={value} aria-label={def.label} onChange={(e) => set(Number(e.target.value))}>
      {opts.map((o) => (
        <option key={o.value} value={o.value} className={o.unused ? 'unused' : undefined}>{o.label}</option>
      ))}
    </select>
  );
}

function NameSlot(props: { value: number; onPick: (v: number) => void; label: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const c = nameCodeToChar(props.value);
  return (
    <>
      <button
        type="button"
        className="name-slot"
        aria-haspopup="dialog"
        aria-label={`${props.label}: ${c.char}（クリックで文字パレット）`}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <span className="name-char">{c.char === '　' ? '␣' : c.char}</span>
        <span className="muted">{hex(props.value, 2)}</span>
      </button>
      {c.inputability === 'password-only' && <span className="tag warn" title="名前入力画面では選べない値">通常入力では選択不可</span>}
      {anchor && (
        <Popover anchor={anchor} label="名前の文字パレット" onClose={() => setAnchor(null)}>
          <NamePalette value={props.value} onPick={(v) => { props.onPick(v); setAnchor(null); anchor.focus(); }} />
        </Popover>
      )}
    </>
  );
}

function CheckCell(props: { snapshot: PipelineSnapshot; onOpen: () => void }) {
  const c = props.snapshot.check;
  return (
    <div className={`check-cell ${c.valid ? 'ok' : 'ng'}`}>
      <div className="check-code">
        <span className="mono">{bin(c.stored, 8)}</span> <span className="muted">{hex(c.stored, 2)}</span>
      </div>
      {!c.valid && (
        <div className="check-mismatch">再計算: <span className="mono">{bin(c.computed, 8)}</span> {hex(c.computed, 2)}</div>
      )}
      <button type="button" className="link-button" onClick={props.onOpen}>詳しく見る →</button>
    </div>
  );
}

// ---------------- 列 3: 15byte ----------------

function PackColumn({ snapshot: s }: { snapshot: PipelineSnapshot }) {
  const t = useTrace();
  return (
    <div className="col col-pack">
      {Array.from({ length: BYTE_COUNT }, (_, i) => {
        const bits = msbFirst(8).map((b) => i * 8 + b);
        // 同じフィールドが続く範囲を 1 セグメントにまとめ、byte 内に何が詰まっているかを示す
        const segs: { field: FieldId; n: number }[] = [];
        for (const k of bits) {
          const f = BIT_OWNERS[k]!.field;
          const last = segs.at(-1);
          if (last && last.field === f) last.n++;
          else segs.push({ field: f, n: 1 });
        }
        return (
          <div key={i} className="byte-row">
            <span {...traceProps(t, nodeId.byte(i), 'byte-label')} title={`byte${i} = ${hex(s.bytes[i]!, 2)}`}>
              byte{i}
            </span>
            <div className="byte-body">
              <div className="byte-bits">
                {bits.map((k, idx) => {
                  const o = BIT_OWNERS[k]!;
                  const f = fieldDef(o.field);
                  const boundary = idx > 0 && BIT_OWNERS[bits[idx - 1]!]!.field !== o.field;
                  return (
                    <TraceNode
                      key={k}
                      id={nodeId.pbit(k)}
              tabbable={false}
                      className={`bit cat-${f.category} v${s.streamBits[k]} ${boundary ? 'seg-start' : ''}`}
                      title={`byte${i} bit${k & 7}（stream bit ${k}）= ${f.label} の bit${o.logicalBit}`}
                    >
                      {s.streamBits[k]}
                    </TraceNode>
                  );
                })}
              </div>
              <div className="byte-segs" aria-hidden>
                {segs.map((g, j) => (
                  <span key={j} className={`seg cat-${fieldDef(g.field).category}`} style={{ flexGrow: g.n }}>
                    {shortLabel(g.field)}
                  </span>
                ))}
              </div>
            </div>
            <span className="byte-value mono">{hex(s.bytes[i]!, 2)}</span>
          </div>
        );
      })}
    </div>
  );
}

function shortLabel(f: FieldId): string {
  const m: Partial<Record<FieldId, string>> = {
    name0: '名1', name1: '名2', name2: '名3', name3: '名4', exp: 'EXP', gold: 'G', weapon: 'ぶき', armor: 'よろい', shield: 'たて',
    herbs: 'やくそう', keys: 'かぎ', dragonScale: 'う', warriorRing: 'ゆ', deathNecklace: 'し', golem: 'ゴ', dragon: 'ド',
    pattern: 'P', check: 'CHECK',
  };
  if (f.startsWith('item')) return `道${Number(f.slice(4)) + 1}`;
  return m[f] ?? f;
}

// ---------------- 列 4: raw 6bit ----------------

function RawColumn({ snapshot: s }: { snapshot: PipelineSnapshot }) {
  return (
    <div className="col col-raw">
      {Array.from({ length: GROUP_COUNT }, (_, n) => (
        <div key={n} className={`raw-row ${lineBreakClass(n)}`}>
          <span className="row-index">{n + 1}</span>
          <div className="raw-bits">
            {msbFirst(6).map((j) => {
              const k = 6 * n + j;
              const f = fieldDef(BIT_OWNERS[k]!.field);
              return (
                <TraceNode
                  key={j}
                  id={nodeId.rbit(n, j)}
              tabbable={false}
                  className={`bit cat-${f.category} v${(s.raw6[n]! >> j) & 1}`}
                  title={`raw6[${n}] bit${j} ← byte${k >> 3} bit${k & 7}（${f.label}）`}
                >
                  {(s.raw6[n]! >> j) & 1}
                </TraceNode>
              );
            })}
          </div>
          <TraceNode id={nodeId.raw(n)} className="value-chip mono" title={`raw6[${n}] = ${s.raw6[n]}`}>
            {String(s.raw6[n]).padStart(2, '0')}
          </TraceNode>
        </div>
      ))}
    </div>
  );
}

/** 呪文の表示行 5/7/5/3 の区切り（見た目だけ） */
function lineBreakClass(n: number): string {
  return n === 5 || n === 12 || n === 17 ? 'line-start' : '';
}

// ---------------- 列 5: encoded ----------------

function EncColumn({ snapshot: s }: { snapshot: PipelineSnapshot }) {
  return (
    <div className="col col-enc">
      {Array.from({ length: GROUP_COUNT }, (_, n) => {
        const prev = n === 0 ? 0 : s.enc6[n - 1]!;
        return (
          <div key={n} className={`enc-row ${lineBreakClass(n)}`}>
            <TraceNode
              id={nodeId.enc(n)}
              className="value-chip mono enc-chip"
              title={`(${prev} + ${s.raw6[n]} + ${SCRAMBLE_ADD}) & 63 = ${s.enc6[n]}`}
            >
              {String(s.enc6[n]).padStart(2, '0')}
            </TraceNode>
            <span className="enc-formula mono muted">{prev}+{s.raw6[n]}+4</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- 列 6: 呪文 ----------------

function CharColumn({ snapshot: s }: { snapshot: PipelineSnapshot }) {
  return (
    <div className="col col-char">
      {s.chars.map((c, n) => (
        <div key={n} className={`char-row ${lineBreakClass(n)}`}>
          <TraceNode id={nodeId.char(n)} className="pw-char" title={`${n + 1} 文字目: 表[${s.enc6[n]}] = ${c}`}>
            {c}
          </TraceNode>
        </div>
      ))}
    </div>
  );
}
