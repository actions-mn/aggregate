import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { ICacheStore } from '../domain/types.js';

export class FileCacheStore implements ICacheStore {
  private cache: Map<string, string> | null = null;

  constructor(private readonly cacheDir: string) {}

  async get(key: string): Promise<string | null> {
    const data = await this.load();
    return data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const data = await this.load();
    data.set(key, value);
    await this.persist(data);
  }

  async delete(key: string): Promise<void> {
    const data = await this.load();
    data.delete(key);
    await this.persist(data);
  }

  private async load(): Promise<Map<string, string>> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath(), 'utf-8');
      this.cache = new Map(Object.entries(JSON.parse(raw)));
    } catch {
      this.cache = new Map();
    }
    return this.cache;
  }

  private async persist(data: Map<string, string>): Promise<void> {
    await mkdir(dirname(this.filePath()), { recursive: true });
    const obj: Record<string, string> = {};
    for (const [k, v] of data) {
      obj[k] = v;
    }
    await writeFile(this.filePath(), JSON.stringify(obj));
  }

  private filePath(): string {
    return join(this.cacheDir, 'cache.json');
  }
}

export class NullCacheStore implements ICacheStore {
  async get(): Promise<null> {
    return null;
  }

  async set(): Promise<void> {}

  async delete(): Promise<void> {}
}
