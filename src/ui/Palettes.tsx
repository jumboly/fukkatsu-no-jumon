// 名前用と復活の呪文用のパレット。文字集合が異なるので、コンポーネントもテーブルも分けておく。

import { gridKeyNav } from './Popover';
import { NAME_PALETTE_ROWS, PASSWORD_CHAR_TABLE, nameCharToCode, nameCodeToChar } from '../core/tables';
import { hex } from './format';

export function NamePalette(props: { value: number; onPick: (code: number) => void }) {
  const cols = NAME_PALETTE_ROWS[0]!.length;
  const current = nameCodeToChar(props.value);
  return (
    <div className="palette name-palette">
      <div className="palette-head">
        名前の文字（6bit コード） <span className="muted">現在: 「{current.char}」 {hex(props.value, 2)}</span>
      </div>
      <div className="palette-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} onKeyDown={(e) => gridKeyNav(e, cols)}>
        {NAME_PALETTE_ROWS.flat().map((ch, i) => {
          if (ch === null) return <span key={i} className="palette-empty" />;
          const code = nameCharToCode(ch)!;
          const info = nameCodeToChar(code);
          const note = info.inputability === 'password-only' ? '通常入力では選択不可（復活の呪文経由のみ）'
            : info.inputability === 'padding' ? '空白：4文字未満のときの埋め文字' : '';
          return (
            <button
              key={i}
              type="button"
              data-cell
              className={`palette-cell ${info.inputability}`}
              aria-current={code === props.value}
              title={`${ch === '　' ? '空白' : ch}  code ${hex(code, 2)}${note ? `\n${note}` : ''}`}
              onClick={() => props.onPick(code)}
            >
              <span className="palette-char">{ch === '　' ? '␣' : ch}</span>
              <span className="palette-code">{hex(code, 2)}</span>
            </button>
          );
        })}
      </div>
      <p className="palette-note">
        濁点・半濁点はそれ自体が 1 文字（「が」＝「か」＋「゛」）。灰色の数字は通常の名前入力では選べず、復活の呪文を decode したときだけ現れる値。
        配置は五十音順の参考配置（実機画面の並びは未確認）。
      </p>
    </div>
  );
}

/** 呪文表は 5 文字ずつの行（あ行・か行…）で並べると実機の入力画面に近く、探しやすい */
const PASSWORD_ROWS: number[][] = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [25, 26, 27, 28, 29], [30, 31, 32, 33, 34], [35, 36, 37, -1, -1], [38, 39, 40, 41, 42], [43, -1, -1, -1, -1],
  [44, 45, 46, 47, 48], [49, 50, 51, 52, 53], [54, 55, 56, 57, 58], [59, 60, 61, 62, 63],
];

export function PasswordPalette(props: { value: number; onPick: (code: number) => void }) {
  // 2 ブロック（清音 / 濁音）を横に並べて縦長になりすぎないようにする
  const left = PASSWORD_ROWS.slice(0, 10);
  const right = PASSWORD_ROWS.slice(10);
  const renderBlock = (rows: number[][]) => (
    <div className="palette-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }} onKeyDown={(e) => gridKeyNav(e, 5)}>
      {rows.flat().map((code, i) =>
        code < 0 ? <span key={i} className="palette-empty" /> : (
          <button
            key={i}
            type="button"
            data-cell
            className="palette-cell"
            aria-current={code === props.value}
            title={`${PASSWORD_CHAR_TABLE[code]}  = ${code}（${code.toString(2).padStart(6, '0')}）`}
            onClick={() => props.onPick(code)}
          >
            <span className="palette-char">{PASSWORD_CHAR_TABLE[code]}</span>
            <span className="palette-code">{code}</span>
          </button>
        ),
      )}
    </div>
  );
  return (
    <div className="palette password-palette">
      <div className="palette-head">
        復活の呪文の文字（64 種 = 6bit） <span className="muted">現在: 「{PASSWORD_CHAR_TABLE[props.value]}」 = {props.value}</span>
      </div>
      <div className="palette-blocks">
        {renderBlock(left)}
        {renderBlock(right)}
      </div>
      <p className="palette-note">を・ん・小さい文字・ぱ行は無い。濁音は 1 文字。数字は encoded 6bit 値。</p>
    </div>
  );
}
