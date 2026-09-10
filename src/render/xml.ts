export type Attributes = Readonly<Record<string, string | number | undefined>>;

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Formats a coordinate with at most two decimals and never as `-0`, so output is byte-for-byte
 * stable across runs and platforms.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`cannot write ${value} into SVG`);
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Serialises one element. Attributes set to `undefined` are left out. */
export function element(
  name: string,
  attributes: Attributes,
  children: string | readonly string[] = [],
): string {
  const attrs = Object.entries(attributes)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => {
      const text = typeof value === 'number' ? formatNumber(value) : escapeXml(value);
      return ` ${key}="${text}"`;
    })
    .join('');
  const content = typeof children === 'string' ? children : children.join('');
  return content === '' ? `<${name}${attrs}/>` : `<${name}${attrs}>${content}</${name}>`;
}
