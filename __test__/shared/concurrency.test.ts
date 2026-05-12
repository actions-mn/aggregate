import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '../../src/shared/concurrency.js';

describe('mapWithConcurrency', () => {
  it('processes all items', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 2, async (n) => n * 2);

    const values = results
      .filter(
        (r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled'
      )
      .map((r) => r.value);
    expect(values).toEqual([2, 4, 6, 8, 10]);
  });

  it('preserves input order', async () => {
    const items = [5, 3, 1, 4, 2];
    const results = await mapWithConcurrency(items, 2, async (n) => n);

    const values = results
      .filter(
        (r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled'
      )
      .map((r) => r.value);
    expect(values).toEqual([5, 3, 1, 4, 2]);
  });

  it('handles rejections without failing others', async () => {
    const items = [1, 2, 3];
    const results = await mapWithConcurrency(items, 2, async (n) => {
      if (n === 2) throw new Error('fail');
      return n;
    });

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
  });

  it('handles empty input', async () => {
    const results = await mapWithConcurrency([], 4, async (n: number) => n);
    expect(results).toHaveLength(0);
  });

  it('handles concurrency of 1 (sequential)', async () => {
    const order: number[] = [];
    const items = [1, 2, 3];
    await mapWithConcurrency(items, 1, async (n) => {
      order.push(n);
      return n;
    });

    expect(order).toEqual([1, 2, 3]);
  });

  it('passes index to callback', async () => {
    const items = ['a', 'b', 'c'];
    const indices: number[] = [];
    await mapWithConcurrency(items, 2, async (_item, idx) => {
      indices.push(idx);
    });

    expect(indices).toEqual([0, 1, 2]);
  });
});
