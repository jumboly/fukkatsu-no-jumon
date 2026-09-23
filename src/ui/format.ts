export function hex(n: number, digits: number): string {
  return '$' + n.toString(16).toUpperCase().padStart(digits, '0');
}

export function bin(n: number, width: number): string {
  return n.toString(2).padStart(width, '0');
}

/** bit 列を MSB → LSB（左 → 右）の index 配列で返す。表示順の約束を一箇所にまとめるため */
export function msbFirst(width: number): number[] {
  return Array.from({ length: width }, (_, i) => width - 1 - i);
}
