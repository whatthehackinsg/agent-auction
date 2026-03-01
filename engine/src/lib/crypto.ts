/**
 * Crypto primitives for the auction engine (CF Workers compatible).
 *
 * Uses keccak256 (via viem) for event hash chaining and nullifier derivation.
 * This differs from @agent-auction/crypto which uses Poseidon for ZK-verifiability.
 * The engine's hash chain is purely an integrity commitment — ZK verification
 * happens in the CRE workflow, not in the engine.
 *
 * EIP-712 signature verification uses viem.verifyTypedData (pure JS, CF Workers compatible).
 * ZK membership proof verification uses snarkjs.groth16.verify with inlined vkeys.
 */
import {
  keccak256,
  encodeAbiParameters,
  toBytes,
  toHex,
  verifyTypedData,
} from 'viem'
import { EIP712_DOMAIN } from './addresses'

// snarkjs is lazy-imported to avoid ffjavascript's URL.createObjectURL() at
// module init time — that API doesn't exist in Cloudflare Workers.
let _snarkjs: typeof import('snarkjs') | null = null
async function getSnarkjs() {
  if (!_snarkjs) {
    _snarkjs = await import('snarkjs')
  }
  return _snarkjs
}

// ---- Hash Chain (keccak256-based, CF Workers compatible) ----

/**
 * Compute the payload hash for an auction event.
 * payloadHash = keccak256(abi.encode(uint8 actionType, uint256 agentId, address wallet, uint256 amount))
 *
 * Uses identical encoding to @agent-auction/crypto — both use ABI encoding + keccak256.
 */
export function computePayloadHash(
  actionType: number,
  agentId: bigint,
  wallet: string,
  amount: bigint,
): Uint8Array {
  const encoded = encodeAbiParameters(
    [
      { name: 'actionType', type: 'uint8' },
      { name: 'agentId', type: 'uint256' },
      { name: 'wallet', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    [actionType, agentId, wallet as `0x${string}`, amount],
  )
  return toBytes(keccak256(encoded))
}

/**
 * Compute the chained event hash.
 * eventHash = keccak256(abi.encode(uint256 seq, bytes32 prevHash, bytes32 payloadHash))
 *
 * Note: @agent-auction/crypto uses Poseidon for this step. The engine uses keccak256
 * because Poseidon (via circomlibjs/ffjavascript) is incompatible with CF Workers.
 * This is safe because the finalLogHash is a commitment, not ZK-verified in the engine.
 */
export async function computeEventHash(
  seq: bigint,
  prevHash: Uint8Array,
  payloadHash: Uint8Array,
): Promise<Uint8Array> {
  const encoded = encodeAbiParameters(
    [
      { name: 'seq', type: 'uint256' },
      { name: 'prevHash', type: 'bytes32' },
      { name: 'payloadHash', type: 'bytes32' },
    ],
    [seq, toHex(prevHash, { size: 32 }) as `0x${string}`, toHex(payloadHash, { size: 32 }) as `0x${string}`],
  )
  return toBytes(keccak256(encoded))
}

// ---- Nullifier Derivation (keccak256-based) ----

/**
 * Derive nullifier for an agent's action in a specific auction.
 * nullifier = keccak256(abi.encode(uint256 agentSecret, uint256 auctionId, uint256 actionType))
 *
 * Note: @agent-auction/crypto uses Poseidon for nullifiers (matching ZK circuits).
 * The engine uses keccak256 as a unique deterministic identifier for double-join detection.
 */
export async function deriveNullifier(
  agentSecret: bigint | Uint8Array,
  auctionId: bigint | Uint8Array,
  actionType: number,
): Promise<Uint8Array> {
  const secret = typeof agentSecret === 'bigint' ? agentSecret : bytesToBigInt(agentSecret)
  const auction = typeof auctionId === 'bigint' ? auctionId : bytesToBigInt(auctionId)
  const encoded = encodeAbiParameters(
    [
      { name: 'secret', type: 'uint256' },
      { name: 'auction', type: 'uint256' },
      { name: 'actionType', type: 'uint256' },
    ],
    [secret, auction, BigInt(actionType)],
  )
  return toBytes(keccak256(encoded))
}

/** Convert big-endian Uint8Array to bigint */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let val = 0n
  for (const b of bytes) {
    val = (val << 8n) | BigInt(b)
  }
  return val
}

// ---- EIP-712 Typed Data (matching packages/crypto/src/eip712-typed-data.ts) ----

export const AUCTION_EIP712_TYPES = {
  Join: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'nullifier', type: 'uint256' },
    { name: 'depositAmount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Bid: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  Deliver: [
    { name: 'auctionId', type: 'uint256' },
    { name: 'milestoneId', type: 'uint256' },
    { name: 'deliveryHash', type: 'bytes32' },
    { name: 'executionLogHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export type AuctionSpeechActType = keyof typeof AUCTION_EIP712_TYPES

// ---- Insecure stub gate (test-only) ----

function allowInsecureStubs(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  return env?.ENGINE_ALLOW_INSECURE_STUBS === 'true'
}

// ---- EIP-712 Signature Verification (real implementation) ----

export async function verifyActionSignature(params: {
  address: `0x${string}`
  primaryType: AuctionSpeechActType
  message: Record<string, unknown>
  signature: `0x${string}`
}): Promise<boolean> {
  if (allowInsecureStubs()) {
    return true
  }
  try {
    return await verifyTypedData({
      address: params.address,
      domain: EIP712_DOMAIN,
      types: { [params.primaryType]: AUCTION_EIP712_TYPES[params.primaryType] },
      primaryType: params.primaryType,
      message: params.message,
      signature: params.signature,
    })
  } catch {
    return false
  }
}

// ---- ZK Membership Proof (real snarkjs.groth16.verify, inlined vkey) ----

/**
 * RegistryMembership verification key (from circuits/keys/registry_member_vkey.json).
 * Public data — safe to inline. nPublic=3: [registryRoot, capabilityCommitment, nullifier].
 */
const MEMBERSHIP_VKEY = {
  protocol: 'groth16',
  curve: 'bn128',
  nPublic: 3,
  vk_alpha_1: [
    '20491192805390485299153009773594534940189261866228447918068658471970481763042',
    '9383485363053290200918347156157836566562967994039712273449902621266178545958',
    '1',
  ],
  vk_beta_2: [
    ['6375614351688725206403948262868962793625744043794305715222011528459656738731', '4252822878758300859123897981450591353533073413197771768651442665752259397132'],
    ['10505242626370262277552901082094356697409835680220590971873171140371331206856', '21847035105528745403288232691147584728191162732299865338377159692350059136679'],
    ['1', '0'],
  ],
  vk_gamma_2: [
    ['10857046999023057135944570762232829481370756359578518086990519993285655852781', '11559732032986387107991004021392285783925812861821192530917403151452391805634'],
    ['8495653923123431417604973247489272438418190587263600148770280649306958101930', '4082367875863433681332203403145435568316851327593401208105741076214120093531'],
    ['1', '0'],
  ],
  vk_delta_2: [
    ['4873077655179922814386022418093915698473133817514706538465187134270026429275', '13834561421804639494570403021268547220250206550314912993882360147198809358319'],
    ['20166582740355655590263096928180816400640120298459746515079046002179447890032', '3189662947647455350040910030739539782049896835014617585795465432818780313719'],
    ['1', '0'],
  ],
  vk_alphabeta_12: [
    [
      ['2029413683389138792403550203267699914886160938906632433982220835551125967885', '21072700047562757817161031222997517981543347628379360635925549008442030252106'],
      ['5940354580057074848093997050200682056184807770593307860589430076672439820312', '12156638873931618554171829126792193045421052652279363021382169897324752428276'],
      ['7898200236362823042373859371574133993780991612861777490112507062703164551277', '7074218545237549455313236346927434013100842096812539264420499035217050630853'],
    ],
    [
      ['7077479683546002997211712695946002074877511277312570035766170199895071832130', '10093483419865920389913245021038182291233451549023025229112148274109565435465'],
      ['4595479056700221319381530156280926371456704509942304414423590385166031118820', '19831328484489333784475432780421641293929726139240675179672856274388269393268'],
      ['11934129596455521040620786944827826205713621633706285934057045369193958244500', '8037395052364110730298837004334506829870972346962140206007064471173334027475'],
    ],
  ],
  IC: [
    ['19085419291701469405182955509570150195794022393010462087879974137386841657385', '8033595224744804711454917404371938494497457189444041151204959136679111787893', '1'],
    ['5691013396746993010032392643572147061190188626199212715467155626635411946418', '8714227263971204609111104741818148673613271333532279604899289362903764060235', '1'],
    ['328277989054081097395806865745153595327735374383455730290926124344192863415', '4183333157399579432528356706885459601091142432664978108508953381623708792764', '1'],
    ['1392661875452278877807533942368833833682537092381750077984721770520453617563', '12793353032721400684405323305764281109233565301521979629668207326320684452996', '1'],
  ],
} as const

export interface MembershipProofPayload {
  proof: {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
    protocol: string
    curve: string
  }
  publicSignals: string[]
}

function isMembershipProofPayload(v: unknown): v is MembershipProofPayload {
  if (!v || typeof v !== 'object') return false
  const obj = v as Record<string, unknown>
  return (
    obj.proof != null &&
    typeof obj.proof === 'object' &&
    Array.isArray(obj.publicSignals) &&
    obj.publicSignals.length === 3
  )
}

/**
 * Verify a RegistryMembership Groth16 proof.
 *
 * - If no proof is provided, returns valid (proofs are optional — P1 feature).
 * - If a structured proof payload is provided, runs real snarkjs.groth16.verify().
 *
 * Public signals order: [registryRoot, capabilityCommitment, nullifier]
 */
export async function verifyMembershipProof(
  proofPayload: unknown,
  _signals?: unknown,
): Promise<{ valid: boolean; registryRoot: string; nullifier: string }> {
  // No proof provided — accept (backward compatible, proofs are optional)
  if (proofPayload == null) {
    return { valid: true, registryRoot: '0x00', nullifier: '0x00' }
  }

  if (!isMembershipProofPayload(proofPayload)) {
    return { valid: false, registryRoot: '0x00', nullifier: '0x00' }
  }

  try {
    const snarkjs = await getSnarkjs()
    const valid = await snarkjs.groth16.verify(
      MEMBERSHIP_VKEY as Parameters<typeof snarkjs.groth16.verify>[0],
      proofPayload.publicSignals,
      proofPayload.proof as Parameters<typeof snarkjs.groth16.verify>[2],
    )
    return {
      valid,
      registryRoot: proofPayload.publicSignals[0],
      nullifier: proofPayload.publicSignals[2],
    }
  } catch {
    return { valid: false, registryRoot: '0x00', nullifier: '0x00' }
  }
}

/** Zero hash constant for chain initialization */
export const ZERO_HASH = new Uint8Array(32)
