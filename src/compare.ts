/**
 * Three-way numeric comparison for sorting. Unlike `a - b`, it is correct for ±Infinity, which
 * the layout uses for ongoing lines (`Infinity - Infinity` is `NaN`).
 */
export function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
