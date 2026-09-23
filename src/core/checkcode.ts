// DQ1 のチェックコード計算。根拠: docs/research.md §5
// 汎用 CRC ライブラリではなく、6502 ルーチンの手順（hi XOR data の bit7 で分岐）をそのまま再現する。
// 結果は CRC-16/XMODEM と同値だが、Explorer で実機の手順を見せるためにこの形を保つ。

import { BYTE_COUNT } from './layout';

export const CRC_POLY = 0x1021;
export const CRC_INIT = 0x0000;
/** チェック対象は byte1..byte14。byte0 は結果の格納先なので含めない */
export const CHECK_INPUT_FIRST = 1;
export const CHECK_INPUT_LAST = BYTE_COUNT - 1;

export interface CrcStep {
  /** 0-based の通し番号 (0..111) */
  index: number;
  byteIndex: number;
  /** 入力 byte の何 bit 目を処理しているか (7 → 0) */
  bitIndex: number;
  inputBit: number;
  registerBefore: number;
  /** register の bit15（= $3D の bit7） */
  registerTopBit: number;
  /** 分岐条件 = register bit15 XOR 入力 bit（実機では (hi XOR data) の bit7） */
  feedback: number;
  afterShift: number;
  xorApplied: boolean;
  xorMask: number;
  registerAfter: number;
}

export interface CheckCodeResult {
  crc16: number;
  /** 下位 8bit。これが byte0 に格納される */
  code: number;
  steps: CrcStep[];
}

export function computeCheckCode(bytes: readonly number[]): CheckCodeResult {
  if (bytes.length !== BYTE_COUNT) throw new RangeError('bytes must be 15 long');
  let crc = CRC_INIT;
  const steps: CrcStep[] = [];
  for (let i = CHECK_INPUT_FIRST; i <= CHECK_INPUT_LAST; i++) {
    let data = bytes[i]! & 0xff;
    for (let n = 0; n < 8; n++) {
      const before = crc;
      // 6502: lda $3d / eor $3e → A の bit7 が分岐条件
      const a = ((crc >> 8) ^ data) & 0xff;
      const feedback = (a >> 7) & 1;
      // asl $3c / rol $3d
      const afterShift = (crc << 1) & 0xffff;
      // asl $3e（次の入力 bit を bit7 へ）
      const inputBit = (data >> 7) & 1;
      data = (data << 1) & 0xff;
      crc = feedback ? afterShift ^ CRC_POLY : afterShift;
      steps.push({
        index: steps.length,
        byteIndex: i,
        bitIndex: 7 - n,
        inputBit,
        registerBefore: before,
        registerTopBit: (before >> 15) & 1,
        feedback,
        afterShift,
        xorApplied: feedback === 1,
        xorMask: feedback ? CRC_POLY : 0,
        registerAfter: crc,
      });
    }
  }
  return { crc16: crc, code: crc & 0xff, steps };
}
