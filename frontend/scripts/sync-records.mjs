import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
const root = new URL('../', import.meta.url);
for (const id of [1301, 84532, 5318007]) {
  const source = new URL(`../contracts/deployments/${id}.json`, root);
  await writeFile(
    new URL(`lib/records/${id}.json`, root),
    await format(await readFile(source, 'utf8'), { parser: 'json', printWidth: 100 }),
  );
}
for (const name of ['architecture', 'deployment']) {
  await writeFile(
    new URL(`reference/${name}.md`, root),
    await format(await readFile(new URL(`../docs/${name.toUpperCase()}.md`, root), 'utf8'), {
      parser: 'markdown',
      printWidth: 100,
      singleQuote: true,
      trailingComma: 'all',
    }),
  );
}
