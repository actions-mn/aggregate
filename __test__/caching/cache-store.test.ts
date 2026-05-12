import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FileCacheStore,
  NullCacheStore
} from '../../src/caching/cache-store.js';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';

describe('FileCacheStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(__dirname, 'tmp-cache-test');
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('returns null for missing key', async () => {
    const store = new FileCacheStore(tmpDir);
    expect(await store.get('missing')).toBeNull();
  });

  it('stores and retrieves values', async () => {
    const store = new FileCacheStore(tmpDir);
    await store.set('etag:org/repo', '"abc123"');
    expect(await store.get('etag:org/repo')).toBe('"abc123"');
  });

  it('overwrites existing values', async () => {
    const store = new FileCacheStore(tmpDir);
    await store.set('key', 'v1');
    await store.set('key', 'v2');
    expect(await store.get('key')).toBe('v2');
  });

  it('deletes keys', async () => {
    const store = new FileCacheStore(tmpDir);
    await store.set('key', 'value');
    await store.delete('key');
    expect(await store.get('key')).toBeNull();
  });

  it('persists across instances', async () => {
    const store1 = new FileCacheStore(tmpDir);
    await store1.set('shared-key', 'shared-value');

    const store2 = new FileCacheStore(tmpDir);
    expect(await store2.get('shared-key')).toBe('shared-value');
  });
});

describe('NullCacheStore', () => {
  it('always returns null', async () => {
    const store = new NullCacheStore();
    expect(await store.get('anything')).toBeNull();
  });

  it('set and delete are no-ops', async () => {
    const store = new NullCacheStore();
    await store.set('key', 'value');
    await store.delete('key');
    expect(await store.get('key')).toBeNull();
  });
});
