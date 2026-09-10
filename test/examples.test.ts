import { describe, expect, it } from 'vitest';
import { generate } from '../src/generate.ts';
import { exampleNames, readExample } from './helpers.ts';

// The SVGs next to each example are the images the README shows. This test fails when the code
// would draw an example differently; after an intended visual change, refresh them with
// `npm run examples` and review the diff before committing.
describe.each(exampleNames)('example %s', (name) => {
  it('renders as committed', async () => {
    const result = generate(readExample(name));
    if (!result.ok) throw new Error(result.error.map((issue) => issue.message).join('\n'));
    await expect(result.value.light).toMatchFileSnapshot(`../examples/${name}.light.svg`);
    await expect(result.value.dark).toMatchFileSnapshot(`../examples/${name}.dark.svg`);
  });
});
