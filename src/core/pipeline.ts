// encode / decode の全工程。根拠: docs/research.md §1, §9
// 正本は 15byte。encode も decode も一度 bytes にしてから同じ buildSnapshot を通すので、
// 不正な呪文でも途中段をすべて観察できる。

import { computeCheckCode, type CrcStep } from './checkcode';
import {
  type FieldValues, type GameState, STATE_FIELD_IDS, getFieldValue, stateFromFieldValues,
} from './gameState';
import {
  BIT_COUNT, BYTE_COUNT, CHECK_BYTE, FIELD_LAYOUT, GROUP_COUNT, type FieldId,
} from './layout';
import { HERB_MAX, ITEM_ID_MAX, KEY_MAX, PASSWORD_CHAR_TABLE, passwordCharToCode } from './tables';

/** スクランブルで毎回加える定数（S1: adc #$4） */
export const SCRAMBLE_ADD = 4;

// ---- 各工程（単体テストしやすいよう個別に公開する） ----

/** 論理値 → 15byte。check byte は 0 のまま返す */
export function packFields(values: Omit<FieldValues, 'check'> & Partial<Pick<FieldValues, 'check'>>): number[] {
  const bits = new Array<number>(BIT_COUNT).fill(0);
  for (const f of FIELD_LAYOUT) {
    const v = (values as FieldValues)[f.id] ?? 0;
    if (v < 0 || v >= 2 ** f.bits.length) throw new RangeError(`${f.id} out of range: ${v}`);
    f.bits.forEach((k, j) => { bits[k] = (v >> j) & 1; });
  }
  return bitsToBytes(bits);
}

export function unpackFields(bytes: readonly number[]): FieldValues {
  const bits = bytesToBits(bytes);
  const out = {} as FieldValues;
  for (const f of FIELD_LAYOUT) out[f.id] = f.bits.reduce((v, k, j) => v | (bits[k]! << j), 0);
  return out;
}

export function bytesToBits(bytes: readonly number[]): number[] {
  if (bytes.length !== BYTE_COUNT) throw new RangeError('bytes must be 15 long');
  return Array.from({ length: BIT_COUNT }, (_, k) => (bytes[k >> 3]! >> (k & 7)) & 1);
}

export function bitsToBytes(bits: readonly number[]): number[] {
  const bytes = new Array<number>(BYTE_COUNT).fill(0);
  bits.forEach((b, k) => { bytes[k >> 3]! |= (b & 1) << (k & 7); });
  return bytes;
}

/** 120bit を stream bit の小さい方から 6bit ずつ（実機の ror による右シフトと同じ順） */
export function bytesToRaw6(bytes: readonly number[]): number[] {
  const bits = bytesToBits(bytes);
  return Array.from({ length: GROUP_COUNT }, (_, n) => {
    let v = 0;
    for (let j = 0; j < 6; j++) v |= bits[6 * n + j]! << j;
    return v;
  });
}

export function raw6ToBytes(raw6: readonly number[]): number[] {
  if (raw6.length !== GROUP_COUNT) throw new RangeError('raw6 must be 20 long');
  const bits: number[] = [];
  for (const v of raw6) for (let j = 0; j < 6; j++) bits.push((v >> j) & 1);
  return bitsToBytes(bits);
}

/** enc[n] = (enc[n-1] + raw[n] + 4) & 63, enc[-1] = 0 */
export function scramble(raw6: readonly number[]): number[] {
  let prev = 0;
  return raw6.map((r) => (prev = (prev + r + SCRAMBLE_ADD) & 0x3f));
}

export function descramble(enc6: readonly number[]): number[] {
  return enc6.map((e, n) => (e - (n === 0 ? 0 : enc6[n - 1]!) - SCRAMBLE_ADD) & 0x3f);
}

export function enc6ToChars(enc6: readonly number[]): string[] {
  return enc6.map((e) => PASSWORD_CHAR_TABLE[e]!);
}

// ---- 検証 ----

export type IssueKind = 'check-mismatch' | 'herbs' | 'keys' | 'item';

export interface ValidationIssue {
  kind: IssueKind;
  field: FieldId;
  message: string;
}

/** 実機の decode が拒否する条件（S1: やくそう/かぎ ≥ 7、道具 ID 15、check 不一致） */
export function validateFields(v: FieldValues, computedCheck: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (v.check !== computedCheck) {
    issues.push({
      kind: 'check-mismatch', field: 'check',
      message: `チェックコード不一致（呪文内 ${hex2(v.check)} / 再計算 ${hex2(computedCheck)}）`,
    });
  }
  if (v.herbs > HERB_MAX) issues.push({ kind: 'herbs', field: 'herbs', message: `やくそう ${v.herbs} 個（${HERB_MAX} を超えると拒否）` });
  if (v.keys > KEY_MAX) issues.push({ kind: 'keys', field: 'keys', message: `かぎ ${v.keys} 本（${KEY_MAX} を超えると拒否）` });
  for (let i = 0; i < 8; i++) {
    const id = `item${i}` as FieldId;
    if (v[id] > ITEM_ID_MAX) issues.push({ kind: 'item', field: id, message: `道具${i + 1} の ID ${v[id]}（15 は拒否）` });
  }
  return issues;
}

function hex2(n: number): string {
  return '$' + n.toString(16).toUpperCase().padStart(2, '0');
}

// ---- スナップショット ----

export interface PipelineSnapshot {
  origin: 'encode' | 'decode';
  bytes: number[];
  streamBits: number[];
  /** check は「呪文（bytes）に入っている値」 */
  fieldValues: FieldValues;
  state: GameState;
  check: { stored: number; computed: number; crc16: number; valid: boolean; steps: CrcStep[] };
  raw6: number[];
  enc6: number[];
  chars: string[];
  issues: ValidationIssue[];
  /** 実機の decode が受理するか */
  accepted: boolean;
}

export function buildSnapshot(bytes: readonly number[], origin: 'encode' | 'decode'): PipelineSnapshot {
  const b = bytes.map((x) => x & 0xff);
  const fieldValues = unpackFields(b);
  const crc = computeCheckCode(b);
  const raw6 = bytesToRaw6(b);
  const enc6 = scramble(raw6);
  const issues = validateFields(fieldValues, crc.code);
  return {
    origin,
    bytes: b,
    streamBits: bytesToBits(b),
    fieldValues,
    state: stateFromFieldValues(fieldValues),
    check: { stored: b[CHECK_BYTE]!, computed: crc.code, crc16: crc.crc16, valid: b[CHECK_BYTE] === crc.code, steps: crc.steps },
    raw6,
    enc6,
    chars: enc6ToChars(enc6),
    issues,
    accepted: issues.length === 0,
  };
}

// ---- 公開 API ----

export function stateToFieldValues(s: GameState): Omit<FieldValues, 'check'> {
  const out = {} as Omit<FieldValues, 'check'>;
  for (const id of STATE_FIELD_IDS) out[id] = getFieldValue(s, id);
  return out;
}

export function encode(state: GameState): PipelineSnapshot {
  const bytes = packFields(stateToFieldValues(state));
  bytes[CHECK_BYTE] = computeCheckCode(bytes).code;
  return buildSnapshot(bytes, 'encode');
}

export function encodeToString(state: GameState): string {
  return encode(state).chars.join('');
}

/** enc6（呪文の文字インデックス ×20）から decode する。check が合わなくても最後まで展開する */
export function decodeCodes(enc6: readonly number[]): PipelineSnapshot {
  if (enc6.length !== GROUP_COUNT) throw new RangeError('password must be 20 codes');
  if (enc6.some((e) => !Number.isInteger(e) || e < 0 || e > 0x3f)) throw new RangeError('code out of range');
  const bytes = raw6ToBytes(descramble(enc6));
  return buildSnapshot(bytes, 'decode');
}

export type ParseResult =
  | { ok: true; codes: number[] }
  | { ok: false; error: string };

/** 空白（全角・半角・改行）は区切りとして無視する */
export function parsePassword(text: string): ParseResult {
  const chars = Array.from(text).filter((c) => !/\s/u.test(c));
  if (chars.length !== GROUP_COUNT) return { ok: false, error: `復活の呪文は 20 文字（現在 ${chars.length} 文字）` };
  const codes: number[] = [];
  for (const c of chars) {
    const code = passwordCharToCode(c);
    if (code === undefined) return { ok: false, error: `復活の呪文に使えない文字: 「${c}」` };
    codes.push(code);
  }
  return { ok: true, codes };
}

export function decode(text: string): PipelineSnapshot {
  const r = parsePassword(text);
  if (!r.ok) throw new Error(r.error);
  return decodeCodes(r.codes);
}

/** 同じ GameState に対する 8 通りの呪文 */
export function allPatterns(state: GameState): string[] {
  return Array.from({ length: 8 }, (_, p) => encodeToString({ ...state, pattern: p }));
}
