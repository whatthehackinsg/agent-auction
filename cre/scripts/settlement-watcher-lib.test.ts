import { describe, expect, test } from 'bun:test'

import {
  buildBlockRanges,
  DEFAULT_BACKFILL_LOG_WINDOW,
} from './settlement-watcher-lib'

describe('settlement watcher backfill chunking', () => {
  test('splits inclusive block ranges into fixed-size chunks', () => {
    expect(buildBlockRanges(100n, 125n, 10n)).toEqual([
      { fromBlock: 100n, toBlock: 109n },
      { fromBlock: 110n, toBlock: 119n },
      { fromBlock: 120n, toBlock: 125n },
    ])
  })

  test('uses a provider-safe default window size', () => {
    expect(buildBlockRanges(42n, 51n)).toEqual([
      { fromBlock: 42n, toBlock: 51n },
    ])
    expect(DEFAULT_BACKFILL_LOG_WINDOW).toBe(10n)
  })

  test('returns no ranges when the start is after the end', () => {
    expect(buildBlockRanges(20n, 19n, 10n)).toEqual([])
  })

  test('rejects non-positive chunk sizes', () => {
    expect(() => buildBlockRanges(0n, 10n, 0n)).toThrow(
      'maxBlocksPerRange must be greater than zero',
    )
  })
})
