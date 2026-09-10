declare const yearMonthBrand: unique symbol;

/**
 * A calendar month as a single ordinal number (`year * 12 + monthIndex`), so months compare with
 * plain `<`.
 */
export type YearMonth = number & { readonly [yearMonthBrand]: true };

/** The months a config date covers: a bare year covers all twelve, `"2019-03"` just one. */
export interface DatePeriod {
  readonly first: YearMonth;
  readonly last: YearMonth;
}

/** Matches `2019` and `2019-03`. */
export const DATE_PATTERN = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/;

/** Parses a config date (a YAML integer year or a `"YYYY-MM"` string). */
export function parseDate(input: number | string): DatePeriod | undefined {
  const match = DATE_PATTERN.exec(String(input));
  if (!match) return undefined;
  const [, year, month] = match;
  const january = Number(year) * 12;
  if (month === undefined) {
    return { first: january as YearMonth, last: (january + 11) as YearMonth };
  }
  const value = (january + Number(month) - 1) as YearMonth;
  return { first: value, last: value };
}
