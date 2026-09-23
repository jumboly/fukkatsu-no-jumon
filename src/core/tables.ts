// 根拠: docs/research.md §4, §6

/**
 * 復活の呪文の 64 文字。インデックス = スクランブル後の 6bit 値 (enc6)。
 * 名前用テーブルとは別物（濁音が 1 文字、を・ん・小書きが無い）なので絶対に共通化しない。
 */
export const PASSWORD_CHAR_TABLE: readonly string[] = [
  'あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ',
  'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と',
  'な', 'に', 'ぬ', 'ね', 'の', 'は', 'ひ', 'ふ', 'へ', 'ほ',
  'ま', 'み', 'む', 'め', 'も', 'や', 'ゆ', 'よ',
  'ら', 'り', 'る', 'れ', 'ろ', 'わ',
  'が', 'ぎ', 'ぐ', 'げ', 'ご', 'ざ', 'じ', 'ず', 'ぜ', 'ぞ',
  'だ', 'ぢ', 'づ', 'で', 'ど', 'ば', 'び', 'ぶ', 'べ', 'ぼ',
];

const PASSWORD_CHAR_INDEX: ReadonlyMap<string, number> = new Map(
  PASSWORD_CHAR_TABLE.map((c, i) => [c, i]),
);

/** 呪文の 1 文字 → 6bit 値。テーブル外の文字は undefined。 */
export function passwordCharToCode(c: string): number | undefined {
  return PASSWORD_CHAR_INDEX.get(c);
}

/** 呪文の表示行 (5/7/5/3)。ゲーム内部の処理には関与しない見た目だけの区切り。 */
export const PASSWORD_LINE_LENGTHS: readonly number[] = [5, 7, 5, 3];

export type NameInputability =
  /** 実機の名前入力画面で選べる */
  | 'selectable'
  /** 名前入力では選べない。復活の呪文経由でのみ出現する */
  | 'password-only'
  /** 4 文字未満のときの埋め文字。途中に置けるかは未確認 */
  | 'padding';

export interface NameChar {
  /** 復活の呪文に格納される 6bit コード */
  code: number;
  /** 表示用の文字 */
  char: string;
  /** ゲーム RAM ($B5-$B8) 上のタイルコード。成長タイプの計算はこちらを使う */
  tile: number;
  inputability: NameInputability;
}

const NAME_CHARS_IN_CODE_ORDER =
  '0123456789' +
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' +
  'っゃゅょ';

/** 0x3C-0x3F はタイル番号がコードと一致しない（S1 の $F0C6 / $704 変換ルーチン） */
const SPECIAL_NAME_CHARS: readonly NameChar[] = [
  { code: 0x3c, char: '゛', tile: 0x53, inputability: 'selectable' },
  { code: 0x3d, char: '゜', tile: 0x54, inputability: 'selectable' },
  { code: 0x3e, char: 'ー', tile: 0x4e, inputability: 'selectable' },
  { code: 0x3f, char: '　', tile: 0x5f, inputability: 'padding' },
];

/** 名前用 64 文字。インデックス = 6bit コード。 */
export const NAME_CHAR_TABLE: readonly NameChar[] = [
  ...Array.from(NAME_CHARS_IN_CODE_ORDER, (char, code) => ({
    code,
    char,
    tile: code,
    inputability: (code <= 9 ? 'password-only' : 'selectable') as NameInputability,
  })),
  ...SPECIAL_NAME_CHARS,
];

export const NAME_SPACE_CODE = 0x3f;
export const NAME_LENGTH = 4;

/**
 * 名前入力パレットの表示配列（五十音順）。
 * 実機画面の正確な配置は未確認（docs/research.md §4.2）なので「参考配置」として扱う。
 * null は空きマス。
 */
export const NAME_PALETTE_ROWS: readonly (readonly (string | null)[])[] = [
  ['あ', 'い', 'う', 'え', 'お', 'は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['か', 'き', 'く', 'け', 'こ', 'ま', 'み', 'む', 'め', 'も'],
  ['さ', 'し', 'す', 'せ', 'そ', 'や', null, 'ゆ', null, 'よ'],
  ['た', 'ち', 'つ', 'て', 'と', 'ら', 'り', 'る', 'れ', 'ろ'],
  ['な', 'に', 'ぬ', 'ね', 'の', 'わ', 'を', 'ん', null, null],
  ['っ', 'ゃ', 'ゅ', 'ょ', '゛', '゜', 'ー', '　', null, null],
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
];

const NAME_CHAR_INDEX: ReadonlyMap<string, number> = new Map(
  NAME_CHAR_TABLE.map((c) => [c.char, c.code]),
);

export function nameCharToCode(c: string): number | undefined {
  return NAME_CHAR_INDEX.get(c);
}

export function nameCodeToChar(code: number): NameChar {
  const c = NAME_CHAR_TABLE[code & 0x3f];
  if (!c) throw new RangeError(`name code out of range: ${code}`);
  return c;
}

/** 名前入力フォームで使う表記（濁音を「か」+「゛」に分解）から 6bit コード列を作る */
const DAKUTEN_DECOMPOSE: Readonly<Record<string, string>> = {
  が: 'か゛', ぎ: 'き゛', ぐ: 'く゛', げ: 'け゛', ご: 'こ゛',
  ざ: 'さ゛', じ: 'し゛', ず: 'す゛', ぜ: 'せ゛', ぞ: 'そ゛',
  だ: 'た゛', ぢ: 'ち゛', づ: 'つ゛', で: 'て゛', ど: 'と゛',
  ば: 'は゛', び: 'ひ゛', ぶ: 'ふ゛', べ: 'へ゛', ぼ: 'ほ゛',
  ぱ: 'は゜', ぴ: 'ひ゜', ぷ: 'ふ゜', ぺ: 'へ゜', ぽ: 'ほ゜',
  ' ': '　', '-': 'ー',
};

/**
 * テスト・サンプル用に、人が読む名前文字列を 6bit コード ×4 に変換する。
 * UI の名前入力はパレット経由でコードを直接扱うため、これは使わない。
 */
export function nameFromString(s: string): number[] {
  const chars = Array.from(s)
    .flatMap((c) => Array.from(DAKUTEN_DECOMPOSE[c] ?? c));
  if (chars.length > NAME_LENGTH) throw new RangeError(`name too long: ${s}`);
  const codes = chars.map((c) => {
    const code = nameCharToCode(c);
    if (code === undefined) throw new RangeError(`invalid name char: ${c}`);
    return code;
  });
  while (codes.length < NAME_LENGTH) codes.push(NAME_SPACE_CODE);
  return codes;
}

export function nameToString(codes: readonly number[]): string {
  return codes.map((c) => nameCodeToChar(c).char).join('');
}

export const WEAPON_NAMES: readonly string[] = [
  'なし', 'たけざお', 'こんぼう', 'どうのつるぎ', 'てつのおの', 'はがねのつるぎ', 'ほのおのつるぎ', 'ロトのつるぎ',
];
export const ARMOR_NAMES: readonly string[] = [
  'なし', 'ぬののふく', 'かわのふく', 'くさりかたびら', 'てつのよろい', 'はがねのよろい', 'まほうのよろい', 'ロトのよろい',
];
export const SHIELD_NAMES: readonly string[] = ['なし', 'かわのたて', 'てつのたて', 'みかがみのたて'];

/** 道具 ID 0-14。15 は 4bit で表現できるが decode で拒否される Unused value。 */
export const ITEM_NAMES: readonly string[] = [
  'なし', 'たいまつ', 'せいすい', 'キメラのつばさ', 'りゅうのうろこ', 'ようせいのふえ', 'せんしのゆびわ',
  'ロトのしるし', 'おうじょのあい', 'のろいのベルト', 'ぎんのたてごと', 'しのくびかざり', 'たいようのいし',
  'あまぐものつえ', 'にじのしずく',
];
export const ITEM_ID_MAX = 14;
export const HERB_MAX = 6;
export const KEY_MAX = 6;
