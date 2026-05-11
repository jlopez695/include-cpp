import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROBLEMS_DIR = path.resolve(
  process.env.PROBLEMS_DIR ?? path.resolve(__dirname, '../../../problems'),
);

export const CCACHE_DIR = path.resolve(
  process.env.CCACHE_DIR ?? path.join(PROBLEMS_DIR, '..', '.ccache'),
);

export const BUILD_ROOT = path.resolve(
  process.env.BUILD_ROOT ?? path.join(PROBLEMS_DIR, '..', '.builds'),
);

export const SHARED_INCLUDE_DIR = path.join(PROBLEMS_DIR, '_shared');
