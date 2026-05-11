import { Injectable } from '@nestjs/common';

/**
 * In-flight registry: rejects duplicate concurrent runs for the same key.
 * Key is `<userId>:<problemId>:<mode>` so different users / modes don't collide.
 */
@Injectable()
export class InFlightRegistry {
  private readonly active = new Set<string>();

  acquire(key: string): boolean {
    if (this.active.has(key)) return false;
    this.active.add(key);
    return true;
  }

  release(key: string): void {
    this.active.delete(key);
  }

  has(key: string): boolean {
    return this.active.has(key);
  }
}
