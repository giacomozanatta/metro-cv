import { describe, expect, it } from 'vitest';
import { generate } from '../src/generate.ts';
import { exampleNames, readExample } from './helpers.ts';

// The rendered examples double as golden files and as the README gallery.
// After an intended visual change, refresh them with `npm run examples` and review the diff.
describe.each(exampleNames)('example %s', (name) => {
  it('matches its committed rendering', async () => {
    const result = generate(readExample(name));
    if (!result.ok) throw new Error(result.error.map((issue) => issue.message).join('\n'));
    await expect(result.value.light).toMatchFileSnapshot(`../examples/${name}.light.svg`);
    await expect(result.value.dark).toMatchFileSnapshot(`../examples/${name}.dark.svg`);
  });
});
