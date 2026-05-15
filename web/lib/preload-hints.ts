import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Identify lazy chunks (Monaco, Supabase, etc.) that aren't in the page's
 * initial chunk graph, so we can preload them in the page <head> and
 * let the browser fetch them in parallel with hydration. By the time
 * EditorPanel's `dynamic()` loader fires, the Monaco chunk is already
 * sitting in the HTTP cache.
 *
 * Build-manifest.json lists the chunks for first paint. We classify
 * everything else in static/chunks by:
 *   1) Size — anything >= HEAVY_BYTES is preloaded unconditionally.
 *      Right now that's just Monaco (~2.7MB).
 *   2) Token — chunks containing a marker substring are preloaded only
 *      if the corresponding feature is enabled at build time. Currently
 *      that's the Supabase SDK chunk (~215KB), gated on the
 *      NEXT_PUBLIC_SUPABASE_* env vars. Without those env vars the
 *      Supabase code path can never run (storage.ts gates every Supabase
 *      call behind `if (supabaseEnabled)`), so preloading it would just
 *      be a 215KB-per-pageview waste.
 *
 * Skipped in dev (no production manifest); falls back to an empty list
 * on any I/O error so a missing manifest never breaks the page render.
 */

const HEAVY_BYTES = 500_000;

interface FeatureGatedChunk {
  /** Substring grep'd against chunk source to identify it. */
  token: string;
  /** Returns true if the feature is enabled at build time. */
  enabled: () => boolean;
}

const FEATURE_GATED_CHUNKS: FeatureGatedChunk[] = [
  {
    token: '@supabase',
    enabled: () =>
      !!(process.env.NEXT_PUBLIC_SUPABASE_URL
        && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  },
];

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

    // Pull stats for every non-initial JS chunk first; we re-use them.
    const lazyChunks = await Promise.all(
      files
        .filter(name => name.endsWith('.js') && !initialBasenames.has(name))
        .map(async name => {
          const full = path.join(chunksDir, name);
          const stat = await fs.stat(full);
          return { name, size: stat.size, full };
        }),
    );

    const heavyHrefs = lazyChunks
      .filter(c => c.size >= HEAVY_BYTES)
      .sort((a, b) => b.size - a.size)
      .map(c => `/_next/static/chunks/${c.name}`);

    // For each feature-gated token, find the matching chunk (if any) and
    // emit a preload only when the feature is actually enabled.
    const enabledGates = FEATURE_GATED_CHUNKS.filter(g => g.enabled());
    const gatedHrefs: string[] = [];
    if (enabledGates.length > 0) {
      await Promise.all(
        lazyChunks.map(async c => {
          // Skip chunks we're already preloading via the size threshold.
          if (c.size >= HEAVY_BYTES) return;
          const body = await fs.readFile(c.full, 'utf8').catch(() => null);
          if (!body) return;
          for (const gate of enabledGates) {
            if (body.includes(gate.token)) {
              gatedHrefs.push(`/_next/static/chunks/${c.name}`);
              return;
            }
          }
        }),
      );
    }

    const hrefs = [...heavyHrefs, ...gatedHrefs];
    cached = hrefs;
    return hrefs;
  } catch {
    return [];
  }
}
