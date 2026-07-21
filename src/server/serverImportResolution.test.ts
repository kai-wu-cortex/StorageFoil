import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const SOURCE_ROOTS = ['api', 'src/server', 'src/shared'];

function collectTypeScriptFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }

    if (path.endsWith('.ts')) {
      files.push(path);
    }
  }

  return files;
}

test('server runtime imports use explicit TypeScript extensions', () => {
  const missingExtensions: string[] = [];
  const importPattern = /(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

  for (const root of SOURCE_ROOTS) {
    for (const file of collectTypeScriptFiles(root)) {
      const contents = readFileSync(file, 'utf8');

      for (const match of contents.matchAll(importPattern)) {
        const specifier = match[1];

        if (!/\.[a-zA-Z0-9]+$/.test(specifier)) {
          missingExtensions.push(`${file}: ${specifier}`);
        }
      }
    }
  }

  assert.deepEqual(missingExtensions, []);
});

test('server runtime TypeScript avoids syntax unsupported by Node strip-only loading', () => {
  const unsupportedSyntax: string[] = [];
  const parameterPropertyPattern = /constructor\s*\([^)]*\b(?:public|private|protected|readonly)\s+\w+/gs;

  for (const root of SOURCE_ROOTS) {
    for (const file of collectTypeScriptFiles(root)) {
      const contents = readFileSync(file, 'utf8');

      if (parameterPropertyPattern.test(contents)) {
        unsupportedSyntax.push(`${file}: constructor parameter property`);
      }
    }
  }

  assert.deepEqual(unsupportedSyntax, []);
});
