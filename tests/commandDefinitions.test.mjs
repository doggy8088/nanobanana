import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

async function readCommand(name) {
  return readFile(path.join(repoRoot, 'commands', `${name}.toml`), 'utf8');
}

test('/generate documents resolution and parallel as valid options', async () => {
  const generateCommand = await readCommand('generate');

  assert.match(
    generateCommand,
    /- --resolution=512\|1K\|2K\|4K \(default: 1K/,
  );
  assert.match(
    generateCommand,
    /- --parallel=N \(1-8, default: 2\)/,
  );
  assert.match(generateCommand, /Ignore any unrecognized options instead of returning an error/);
  assert.match(generateCommand, /Never reject the command just because it contains unknown or unsupported options/);
  assert.match(generateCommand, /Only return an error when a recognized option has an invalid value/);
});

test('/generate keeps the advanced options block aligned with README', async () => {
  const [generateCommand, readme] = await Promise.all([
    readCommand('generate'),
    readFile(path.join(repoRoot, 'README.md'), 'utf8'),
  ]);

  for (const option of ['--resolution=512|1K|2K|4K', '--parallel=N (1-8, default: 2)']) {
    assert.ok(
      generateCommand.includes(option),
      `commands/generate.toml is missing ${option}`,
    );
  }

  for (const readmeSnippet of [
    '**`--resolution=512|1K|2K|4K`**',
    '**`--parallel=N`**',
  ]) {
    assert.ok(readme.includes(readmeSnippet), `README.md is missing ${readmeSnippet}`);
  }
});
