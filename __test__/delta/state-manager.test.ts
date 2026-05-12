import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DeltaStateManager,
  NullDeltaManager
} from '../../src/delta/state-manager.js';
import { FileCacheStore } from '../../src/caching/cache-store.js';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';

describe('DeltaStateManager', () => {
  let tmpDir: string;
  let cacheDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tmpDir = join(__dirname, 'tmp-delta-test');
    cacheDir = join(tmpDir, 'cache');
    outputDir = join(tmpDir, 'output');
    await mkdir(cacheDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('loads empty state when no cache exists', async () => {
    const cache = new FileCacheStore(cacheDir);
    const manager = new DeltaStateManager(cache, outputDir);
    await manager.load();

    expect(manager.isReleaseProcessed('org/repo', 'v1', 'hash1')).toBe(false);
  });

  it('marks and checks release as processed', async () => {
    const cache = new FileCacheStore(cacheDir);
    const manager = new DeltaStateManager(cache, outputDir);
    await manager.load();

    manager.markReleaseProcessed('org/repo', 'v1', 'hash1', ['file.html']);

    expect(manager.isReleaseProcessed('org/repo', 'v1', 'hash1')).toBe(true);
    expect(manager.getReleaseFiles('org/repo', 'v1')).toEqual(['file.html']);
  });

  it('does not match with different hash', async () => {
    const cache = new FileCacheStore(cacheDir);
    const manager = new DeltaStateManager(cache, outputDir);
    await manager.load();

    manager.markReleaseProcessed('org/repo', 'v1', 'hash1', ['file.html']);

    expect(manager.isReleaseProcessed('org/repo', 'v1', 'hash2')).toBe(false);
  });

  it('returns false for null content hash', async () => {
    const cache = new FileCacheStore(cacheDir);
    const manager = new DeltaStateManager(cache, outputDir);
    await manager.load();

    expect(manager.isReleaseProcessed('org/repo', 'v1', null)).toBe(false);
  });

  it('persists state via cache', async () => {
    const cache1 = new FileCacheStore(cacheDir);
    const manager1 = new DeltaStateManager(cache1, outputDir);
    await manager1.load();
    manager1.markReleaseProcessed('org/repo', 'v1', 'hash1', ['file.html']);
    await manager1.save();

    const cache2 = new FileCacheStore(cacheDir);
    const manager2 = new DeltaStateManager(cache2, outputDir);
    await manager2.load();

    expect(manager2.isReleaseProcessed('org/repo', 'v1', 'hash1')).toBe(true);
  });

  it('stores and retrieves etag', async () => {
    const cache = new FileCacheStore(cacheDir);
    const manager = new DeltaStateManager(cache, outputDir);
    await manager.load();

    manager.setEtag('org/repo', '"etag-val"');
    expect(manager.getEtag('org/repo')).toBe('"etag-val"');
  });

  it('cleans up stale files', async () => {
    const cache = new FileCacheStore(cacheDir);
    const manager = new DeltaStateManager(cache, outputDir);
    await manager.load();

    // Create a file that should be cleaned up
    const staleFile = join(outputDir, 'stale.html');
    await writeFile(staleFile, 'old content');

    manager.markReleaseProcessed('org/repo', 'old-tag', 'hash1', [
      'stale.html'
    ]);
    manager.markReleaseProcessed('org/repo', 'new-tag', 'hash2', ['new.html']);

    const removed = await manager.cleanupStaleFiles('org/repo', ['new-tag']);

    expect(removed).toBe(1);
    // Verify stale file was deleted
    await expect(readFile(staleFile)).rejects.toThrow();
  });

  it('returns 0 when no stale files to clean', async () => {
    const cache = new FileCacheStore(cacheDir);
    const manager = new DeltaStateManager(cache, outputDir);
    await manager.load();

    const removed = await manager.cleanupStaleFiles('org/repo', ['v1']);
    expect(removed).toBe(0);
  });
});

describe('NullDeltaManager', () => {
  it('load and save are no-ops', async () => {
    const manager = new NullDeltaManager();
    await manager.load();
    await manager.save();
  });

  it('isReleaseProcessed always returns false', () => {
    const manager = new NullDeltaManager();
    expect(manager.isReleaseProcessed('o/r', 'v1', 'hash')).toBe(false);
  });

  it('cleanupStaleFiles returns 0', async () => {
    const manager = new NullDeltaManager();
    expect(await manager.cleanupStaleFiles('o/r', [])).toBe(0);
  });
});
