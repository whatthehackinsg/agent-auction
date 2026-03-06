export const DEFAULT_BACKFILL_LOG_WINDOW = 10n

export type BlockRange = {
  fromBlock: bigint
  toBlock: bigint
}

export function buildBlockRanges(
  fromBlock: bigint,
  toBlock: bigint,
  maxBlocksPerRange = DEFAULT_BACKFILL_LOG_WINDOW,
): BlockRange[] {
  if (maxBlocksPerRange <= 0n) {
    throw new Error('maxBlocksPerRange must be greater than zero')
  }

  if (toBlock < fromBlock) {
    return []
  }

  const ranges: BlockRange[] = []
  for (let start = fromBlock; start <= toBlock; start += maxBlocksPerRange) {
    const end = start + maxBlocksPerRange - 1n
    ranges.push({
      fromBlock: start,
      toBlock: end > toBlock ? toBlock : end,
    })
  }

  return ranges
}
