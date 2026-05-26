import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = join(process.cwd(), 'src');

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      files.push(...listTsFiles(path));
    } else if (name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

describe('Implementation requirements: project structure', () => {
  it('backend source is TypeScript only (.ts)', () => {
    function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return walk(path);
        return [path];
      });
    }
    const files = walk(srcRoot);
    const allowed = files.every(
      (f) => f.endsWith('.ts') || f.endsWith('.sql'),
    );
    expect(allowed).toBe(true);
    expect(files.some((f) => f.endsWith('.ts'))).toBe(true);
  });

  it('domain layer does not import infrastructure', () => {
    const domainFiles = listTsFiles(join(srcRoot, 'domain'));
    for (const file of domainFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/from ['"].*infrastructure/);
      expect(content).not.toMatch(/from ['"].*\/api\//);
    }
  });

  it('has domain, application, infrastructure, api folders', () => {
    const dirs = readdirSync(srcRoot).filter((d) =>
      statSync(join(srcRoot, d)).isDirectory(),
    );
    expect(dirs).toEqual(
      expect.arrayContaining(['domain', 'application', 'infrastructure', 'api']),
    );
  });
});
