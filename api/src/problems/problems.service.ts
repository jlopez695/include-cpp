import { Injectable, NotFoundException } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { PROBLEMS_DIR } from '../common/paths.js';
import type { Meta, ProblemDetail, ProblemSummary } from './meta.types.js';

@Injectable()
export class ProblemsService {
  listIds(): string[] {
    return fs
      .readdirSync(PROBLEMS_DIR)
      .filter(name => !name.startsWith('_') && !name.startsWith('.'))
      .filter(name => fs.existsSync(path.join(PROBLEMS_DIR, name, 'meta.json')))
      .sort();
  }

  readMeta(id: string): Meta {
    const metaPath = path.join(PROBLEMS_DIR, id, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      throw new NotFoundException(`Problem ${id} not found`);
    }
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Meta;
  }

  list(): ProblemSummary[] {
    return this.listIds().map(id => {
      const meta = this.readMeta(id);
      return { id, title: meta.title };
    });
  }

  detail(id: string): ProblemDetail {
    const problemDir = path.join(PROBLEMS_DIR, id);
    if (!fs.existsSync(problemDir)) {
      throw new NotFoundException(`Problem ${id} not found`);
    }
    const meta = this.readMeta(id);
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

    return {
      id,
      ...meta,
      markdown,
      files,
      readOnlyFiles_content,
    };
  }
}
