import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class InFlightRegistry implements OnApplicationShutdown {
  private readonly logger = new Logger(InFlightRegistry.name);
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

  get size(): number {
    return this.active.size;
  }

  onApplicationShutdown(signal?: string): void {
    if (this.active.size > 0) {
      this.logger.warn(
        `Shutting down with ${this.active.size} in-flight execution(s)${signal ? ` (signal: ${signal})` : ''}`,
      );
    }
    this.active.clear();
  }
}
