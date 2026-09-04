// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

declare const process: { cwd(): string };

function backendSources(directory = `${process.cwd()}/backend`): string {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry: {
    isDirectory(): boolean;
    name: string;
  }) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return backendSources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [readFileSync(path, 'utf8')]
      : [];
  }).join('\n');
}

function routeKeys(source: string) {
  const pattern = /(['"`])((?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)\s+\/api\/[^'"`\r\n]+)\1\s*:/g;
  return Array.from(source.matchAll(pattern), (match) => match[2]);
}

function assertNoDuplicateLineRoute(source: string) {
  const registeredRoutes = routeKeys(source);
  expect(registeredRoutes).not.toContain('POST /api/auth/line/logout');
  expect(registeredRoutes.some((key) => key.endsWith(' /api/auth/line/logout'))).toBe(false);
  expect(registeredRoutes).toEqual(expect.arrayContaining([
    'GET /api/_healthcheck',
    'POST /api/member-online/start',
    'POST /api/member-online/end',
  ]));
}

describe('LINE logout ownership contracts', () => {
  it('does not register a duplicate AppDeploy LINE logout route', () => {
    assertNoDuplicateLineRoute(backendSources());
  });

  it('rejects a renamed inline AppDeploy LINE logout route', () => {
    const renamedInlineRoute = `${backendSources()}\nconst renamedRoutes = { 'POST /api/auth/line/logout': [] };`;

    expect(() => assertNoDuplicateLineRoute(renamedInlineRoute)).toThrow();
  });

  it('does not load LINE credentials in the AppDeploy backend', () => {
    const backendIndex = readFileSync(new URL('../../../backend/index.ts', import.meta.url), 'utf8');

    expect(backendIndex).not.toContain('loadLineLoginConfig');
    expect(backendIndex).not.toContain('LINE_CHANNEL_ID');
    expect(backendIndex).not.toContain('LINE_CHANNEL_SECRET');
  });
});
