import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { PROBLEMS_DIR } from '../common/paths.js';
import type { Meta, ProblemDetail, ProblemSummary } from './meta.types.js';

@Injectable()
export class ProblemsService implements OnModuleInit {
  private readonly logger = new Logger(ProblemsService.name);
  private listCache: ProblemSummary[] | null = null;
  private detailCache = new Map<string, ProblemDetail>();

  onModuleInit() {
    this.populateCache();
  }

  private populateCache() {
    const ids = this.readIds();
    this.listCache = ids.map(id => {
      const meta = this.readMetaFromDisk(id);
      return { id, title: meta.title };
    });

    for (const id of ids) {
      this.detailCache.set(id, this.readDetailFromDisk(id));
    }

    this.logger.log(`Cached ${ids.length} problems`);
  }

  private readIds(): string[] {
    return fs
      .readdirSync(PROBLEMS_DIR)
      .filter(name => !name.startsWith('_') && !name.startsWith('.'))
      .filter(name => fs.existsSync(path.join(PROBLEMS_DIR, name, 'meta.json')))
      .sort();
  }

  private readMetaFromDisk(id: string): Meta {
    const metaPath = path.join(PROBLEMS_DIR, id, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      throw new NotFoundException(`Problem ${id} not found`);
    }
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Meta;
  }

  private readDetailFromDisk(id: string): ProblemDetail {
    const problemDir = path.join(PROBLEMS_DIR, id);
    if (!fs.existsSync(problemDir)) {
      throw new NotFoundException(`Problem ${id} not found`);
    }
    const meta = this.readMetaFromDisk(id);
    const markdown = fs.readFileSync(path.join(problemDir, 'problem.md'), 'utf8');

    const files: Record<string, string> = {};
    for (const filename of meta.editableFiles) {
      files[filename] = fs.readFileSync(path.join(problemDir, filename), 'utf8');
    }

    const readOnlyFiles_content: Record<string, string> = {};
    for (const filename of meta.readOnlyFiles ?? []) {
      readOnlyFiles_content[filename] = fs.readFileSync(
        path.join(problemDir, filename),
        'utf8',
      );
    }

    return { id, ...meta, markdown, files, readOnlyFiles_content };
  }

  listIds(): string[] {
    return (this.listCache ?? this.readIds().map(id => ({ id, title: '' }))).map(p => p.id);
  }

  readMeta(id: string): Meta {
    return this.readMetaFromDisk(id);
  }

  list(): ProblemSummary[] {
    if (this.listCache) return this.listCache;
    return this.readIds().map(id => {
      const meta = this.readMetaFromDisk(id);
      return { id, title: meta.title };
    });
  }

  detail(id: string): ProblemDetail {
    const cached = this.detailCache.get(id);
    if (cached) return cached;
    return this.readDetailFromDisk(id);
  }
}
