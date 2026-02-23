import { encodePacked, keccak256, toBytes, recoverMessageAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { InclusionReceipt } from '../types/engine'
import { ActionType } from '../types/engine'

export function buildInclusionReceiptDigest(
  auctionId: `0x${string}`,
  seq: number,
  eventHash: `0x${string}`,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ['bytes32', 'uint64', 'bytes32'],
      [auctionId, BigInt(seq), eventHash],
    ),
  )
}

export async function signInclusionReceipt(
  fields: {
    auctionId: `0x${string}`
    seq: number
    eventHash: `0x${string}`
    prevHash: `0x${string}`
    actionType: ActionType
    receivedAt: number
  },
  sequencerPrivateKey: `0x${string}`,
): Promise<InclusionReceipt> {
  const digest = buildInclusionReceiptDigest(fields.auctionId, fields.seq, fields.eventHash)
  const account = privateKeyToAccount(sequencerPrivateKey)
  const sequencerSig = await account.signMessage({ message: { raw: toBytes(digest) } })

  return {
    auctionId: fields.auctionId,
    seq: fields.seq,
    eventHash: fields.eventHash,
    prevHash: fields.prevHash,
    actionType: fields.actionType,
    receivedAt: fields.receivedAt,
    sequencerSig,
  }
}

export async function verifyInclusionReceipt(
  receipt: InclusionReceipt,
  sequencerAddress: `0x${string}`,
): Promise<boolean> {
  const digest = buildInclusionReceiptDigest(receipt.auctionId as `0x${string}`, receipt.seq, receipt.eventHash as `0x${string}`)
  const recovered = await recoverMessageAddress({
    message: { raw: toBytes(digest) },
    signature: receipt.sequencerSig as `0x${string}`,
  })
  return recovered.toLowerCase() === sequencerAddress.toLowerCase()
}
