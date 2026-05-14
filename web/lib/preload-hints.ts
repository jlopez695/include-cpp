import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Identify large lazy chunks (Monaco etc.) that aren't in the page's
 * initial chunk graph, so we can preload them in the page <head> and
 * let the browser fetch them in parallel with hydration. By the time
 * EditorPanel's `dynamic()` loader fires, the Monaco chunk is already
 * sitting in the HTTP cache.
 *
 * Build-manifest.json lists the chunks for first paint. We pick out
 * everything in static/chunks bigger than the threshold that ISN'T in
 * that initial set — that's almost always just the Monaco bundle.
 *
 * Skipped in dev (no production manifest); falls back to an empty list
 * on any I/O error so a missing manifest never breaks the page render.
 */

const HEAVY_BYTES = 500_000;

let cached: string[] | null = null;

export async function findHeavyLazyChunks(): Promise<string[]> {
  if (cached) return cached;
  if (process.env.NODE_ENV !== 'production') return [];

  try {
    const nextDir = path.join(process.cwd(), '.next');
    const chunksDir = path.join(nextDir, 'static/chunks');
    const manifestPath = path.join(nextDir, 'build-manifest.json');

    const [files, manifestRaw] = await Promise.all([
      fs.readdir(chunksDir),
      fs.readFile(manifestPath, 'utf8'),
    ]);

    const manifest = JSON.parse(manifestRaw) as {
      rootMainFiles?: string[];
      polyfillFiles?: string[];
    };
    const initialBasenames = new Set(
      [...(manifest.rootMainFiles ?? []), ...(manifest.polyfillFiles ?? [])]
        .map(f => path.basename(f)),
    );

    const candidates = await Promise.all(
      files
        .filter(name => name.endsWith('.js') && !initialBasenames.has(name))
        .map(async name => {
          const stat = await fs.stat(path.join(chunksDir, name));
          return { name, size: stat.size };
        }),
    );

    const hrefs = candidates
      .filter(c => c.size >= HEAVY_BYTES)
      .sort((a, b) => b.size - a.size)
      .map(c => `/_next/static/chunks/${c.name}`);

    cached = hrefs;
    return hrefs;
  } catch {
    return [];
  }
}
