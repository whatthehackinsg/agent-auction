import assert from 'node:assert/strict'
import test from 'node:test'

import { computeReplayEventHash } from './replay'

test('computeReplayEventHash matches engine replay hash chain for live room data', () => {
  const seq1 = computeReplayEventHash(
    1,
    ('0x' + '00'.repeat(32)) as `0x${string}`,
    '0xbb1a1cbcc2e7ef1090a9ec4f4f505b528cafca85200d65daf49897e5dd88cf35',
  )

  assert.equal(
    seq1,
    '0x04d757cf9d39e8a809fb420c42ab5a256206543a88ab759cd3ba62a822c402ee',
  )

  const seq2 = computeReplayEventHash(
    2,
    '0x04d757cf9d39e8a809fb420c42ab5a256206543a88ab759cd3ba62a822c402ee',
    '0xe672adb327b88146dc6f5fce1bf78468963cc0dafdfadae01e604379176b3486',
  )

  assert.equal(
    seq2,
    '0x15bd6cbcad0ccabfd4c47353c858e9ca3270ea162d96609c42452280a25b9391',
  )
})
