import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Returns the current Next.js build ID. The service worker fetches this
 * to namespace its HTML cache by deploy — a new build → new ID → new cache
 * key → old caches dropped on activate.
 *
 * In dev (no .next/BUILD_ID yet) we return a per-process token so SW behavior
 * stays identifiable; the SW doesn't register in dev anyway.
 *
 * Cached in-memory after the first read; .next/BUILD_ID is written once at
 * build time and doesn't change for the lifetime of the server process.
 */

let cachedBuildId: string | null = null;
const fallback = `dev-${Date.now()}`;

async function readBuildId(): Promise<string> {
  if (cachedBuildId) return cachedBuildId;
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), '.next', 'BUILD_ID'),
      'utf8',
    );
    cachedBuildId = raw.trim();
  } catch {
    cachedBuildId = fallback;
  }
  return cachedBuildId;
}

export async function GET() {
  const buildId = await readBuildId();
  return Response.json(
    { buildId },
    {
      // Must be no-store: this is the freshness probe. Caching it would
      // defeat its only purpose.
      headers: { 'cache-control': 'no-store, must-revalidate' },
    },
  );
}
