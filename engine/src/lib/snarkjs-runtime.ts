type Groth16Verify = typeof import('snarkjs').groth16.verify

export type SnarkjsRuntime = {
  groth16: {
    verify: Groth16Verify
  }
}

type Bn128Metadata = {
  pq: number
  pr: number
  pG1gen: number
  pG1zero: number
  pG1b: number
  pG2gen: number
  pG2zero: number
  pG2b: number
  pOneT: number
  prePSize: number
  preQSize: number
  n8q: number
  n8r: number
  q: string
  r: string
}

type RuntimeDeps = {
  Scalar: any
  utils: { unstringifyBigInts: (value: unknown) => any }
  WasmField1: any
  WasmField2: any
  WasmField3: any
  WasmCurve: any
  buildPairing: (curve: Record<string, any>) => void
  buildMultiExp: (curve: Record<string, any>, groupName: 'G1' | 'G2') => void
}

type TaskParam = { var: number; offset?: number } | { val: number }
type TaskStep =
  | { cmd: 'ALLOCSET'; var: number; buff: Uint8Array }
  | { cmd: 'ALLOC'; var: number; len: number }
  | { cmd: 'SET'; var: number; buff: Uint8Array }
  | { cmd: 'CALL'; fnName: string; params: TaskParam[] }
  | { cmd: 'GET'; out: number; var: number; len: number }

type ThreadManagerLike = {
  concurrency: number
  instance: WebAssembly.Instance
  startSyncOp(): void
  endSyncOp(): void
  alloc(length: number): number
  allocBuff(buff: Uint8Array): number
  getBuff(pointer: number, length: number): Uint8Array
  setBuff(pointer: number, buffer: Uint8Array): void
  queueAction(task: TaskStep[]): Promise<Uint8Array[]>
}

type InstantiatedWasm = {
  instance: WebAssembly.Instance
}

// @ts-expect-error wasmcurves does not ship type declarations for generated metadata.
import bn128MetadataImport from '../../node_modules/wasmcurves/build/bn128_wasm.js'

const MEM_SIZE = 25
const MAXMEM = 32767

let depsPromise: Promise<RuntimeDeps> | null = null
let curvePromise: Promise<Record<string, any>> | null = null
let runtimePromise: Promise<SnarkjsRuntime> | null = null
let bn128WasmPromise: Promise<WebAssembly.Module | Uint8Array> | null = null

function needsCompiledWasmModule(): boolean {
  return typeof WebSocketPair === 'function'
}

function asUint8Array(buffer: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (buffer instanceof Uint8Array) {
    return buffer
  }

  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer)
  }

  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

class SingleThreadManager implements ThreadManagerLike {
  concurrency = 1
  instance: WebAssembly.Instance
  private memory: WebAssembly.Memory
  private u8: Uint8Array
  private u32: Uint32Array
  private initialPFree: number
  private oldPFree = 0

  constructor(instance: WebAssembly.Instance, memory: WebAssembly.Memory) {
    this.instance = instance
    this.memory = memory
    this.u8 = new Uint8Array(memory.buffer)
    this.u32 = new Uint32Array(memory.buffer)
    this.initialPFree = this.u32[0]
  }

  startSyncOp(): void {
    if (this.oldPFree !== 0) {
      throw new Error('Sync operation in progress')
    }
    this.oldPFree = this.u32[0]
  }

  endSyncOp(): void {
    if (this.oldPFree === 0) {
      throw new Error('No sync operation in progress')
    }
    this.u32[0] = this.oldPFree
    this.oldPFree = 0
  }

  alloc(length: number): number {
    this.refreshViews()
    while (this.u32[0] & 3) {
      this.u32[0]++
    }

    const pointer = this.u32[0]
    this.u32[0] += length
    this.ensureCapacity(this.u32[0] + length)
    return pointer
  }

  allocBuff(buff: Uint8Array): number {
    const pointer = this.alloc(buff.byteLength)
    this.setBuff(pointer, buff)
    return pointer
  }

  getBuff(pointer: number, length: number): Uint8Array {
    this.refreshViews()
    return this.u8.slice(pointer, pointer + length)
  }

  setBuff(pointer: number, buffer: Uint8Array): void {
    this.refreshViews()
    this.u8.set(asUint8Array(buffer), pointer)
  }

  async queueAction(task: TaskStep[]): Promise<Uint8Array[]> {
    this.refreshViews()
    const oldAlloc = this.u32[0]
    const ctx: { vars: number[]; out: Uint8Array[] } = {
      vars: [],
      out: [],
    }

    for (const step of task) {
      switch (step.cmd) {
        case 'ALLOCSET':
          ctx.vars[step.var] = this.allocBuff(step.buff)
          break
        case 'ALLOC':
          ctx.vars[step.var] = this.alloc(step.len)
          break
        case 'SET':
          this.setBuff(ctx.vars[step.var], step.buff)
          break
        case 'CALL': {
          const params = step.params.map((param) =>
            'var' in param ? ctx.vars[param.var] + (param.offset ?? 0) : param.val
          )
          ;(this.instance.exports[step.fnName] as (...args: number[]) => unknown)(...params)
          break
        }
        case 'GET':
          ctx.out[step.out] = this.getBuff(ctx.vars[step.var], step.len)
          break
      }
    }

    this.u32[0] = oldAlloc
    return ctx.out
  }

  resetMemory(): void {
    this.u32[0] = this.initialPFree
  }

  private refreshViews(): void {
    if (this.u8.buffer !== this.memory.buffer) {
      this.u8 = new Uint8Array(this.memory.buffer)
      this.u32 = new Uint32Array(this.memory.buffer)
    }
  }

  private ensureCapacity(requiredBytes: number): void {
    this.refreshViews()
    if (requiredBytes <= this.memory.buffer.byteLength) {
      return
    }

    const currentPages = this.memory.buffer.byteLength / 0x10000
    let requiredPages = Math.floor(requiredBytes / 0x10000) + 1
    if (requiredPages > MAXMEM) {
      requiredPages = MAXMEM
    }

    if (requiredPages > currentPages) {
      this.memory.grow(requiredPages - currentPages)
      this.refreshViews()
    }
  }
}

async function loadRuntimeDeps(): Promise<RuntimeDeps> {
  if (!depsPromise) {
    depsPromise = Promise.all([
      // @ts-expect-error ffjavascript internal modules are untyped.
      import('../../node_modules/ffjavascript/src/scalar.js'),
      // @ts-expect-error ffjavascript internal modules are untyped.
      import('../../node_modules/ffjavascript/src/utils.js'),
      // @ts-expect-error ffjavascript internal modules are untyped.
      import('../../node_modules/ffjavascript/src/wasm_field1.js'),
      // @ts-expect-error ffjavascript internal modules are untyped.
      import('../../node_modules/ffjavascript/src/wasm_field2.js'),
      // @ts-expect-error ffjavascript internal modules are untyped.
      import('../../node_modules/ffjavascript/src/wasm_field3.js'),
      // @ts-expect-error ffjavascript internal modules are untyped.
      import('../../node_modules/ffjavascript/src/wasm_curve.js'),
      // @ts-expect-error ffjavascript internal modules are untyped.
      import('../../node_modules/ffjavascript/src/engine_pairing.js'),
      // @ts-expect-error ffjavascript internal modules are untyped.
      import('../../node_modules/ffjavascript/src/engine_multiexp.js'),
    ]).then(
      ([
        Scalar,
        utilsModule,
        WasmField1Module,
        WasmField2Module,
        WasmField3Module,
        WasmCurveModule,
        buildPairingModule,
        buildMultiExpModule,
      ]) => ({
        Scalar,
        utils: utilsModule as RuntimeDeps['utils'],
        WasmField1: WasmField1Module.default,
        WasmField2: WasmField2Module.default,
        WasmField3: WasmField3Module.default,
        WasmCurve: WasmCurveModule.default,
        buildPairing: buildPairingModule.default,
        buildMultiExp: buildMultiExpModule.default,
      }),
    )
  }

  return depsPromise
}

async function loadBn128Wasm(): Promise<WebAssembly.Module | Uint8Array> {
  if (!bn128WasmPromise) {
    bn128WasmPromise = needsCompiledWasmModule()
      ? (
          // @ts-expect-error Wrangler/Miniflare resolve compiled wasm modules at bundle time.
          import('../../node_modules/wasmcurves/build/bn128.wasm')
        ).then(
          (module) => module.default as WebAssembly.Module,
        )
      : import('node:fs/promises').then(async ({ readFile }) => {
          const bytes = await readFile(
            new URL('../../node_modules/wasmcurves/build/bn128.wasm', import.meta.url),
          )
          return new Uint8Array(bytes)
        })
  }

  return bn128WasmPromise
}

async function createThreadManager(): Promise<SingleThreadManager> {
  const bn128WasmModule = await loadBn128Wasm()
  const memory = new WebAssembly.Memory({ initial: MEM_SIZE, maximum: MAXMEM })
  const instantiated = await WebAssembly.instantiate(bn128WasmModule, {
    env: {
      memory,
    },
  })
  const instance =
    instantiated instanceof WebAssembly.Instance
      ? instantiated
      : (instantiated as InstantiatedWasm).instance

  return new SingleThreadManager(instance, memory)
}

async function buildBn128Curve(): Promise<Record<string, any>> {
  const deps = await loadRuntimeDeps()
  const metadata = bn128MetadataImport as Bn128Metadata
  const tm = await createThreadManager()

  const curve: Record<string, any> = {
    q: deps.Scalar.e(metadata.q),
    r: deps.Scalar.e(metadata.r),
    name: 'bn128',
    tm,
    prePSize: metadata.prePSize,
    preQSize: metadata.preQSize,
  }

  curve.Fr = new deps.WasmField1(tm, 'frm', metadata.n8r, deps.Scalar.e(metadata.r))
  curve.F1 = new deps.WasmField1(tm, 'f1m', metadata.n8q, deps.Scalar.e(metadata.q))
  curve.F2 = new deps.WasmField2(tm, 'f2m', curve.F1)
  curve.G1 = new deps.WasmCurve(tm, 'g1m', curve.F1, metadata.pG1gen, metadata.pG1b)
  curve.G2 = new deps.WasmCurve(tm, 'g2m', curve.F2, metadata.pG2gen, metadata.pG2b)
  curve.F6 = new deps.WasmField3(tm, 'f6m', curve.F2)
  curve.F12 = new deps.WasmField2(tm, 'ftm', curve.F6)
  curve.Gt = curve.F12

  deps.buildMultiExp(curve, 'G1')
  deps.buildMultiExp(curve, 'G2')
  deps.buildPairing(curve)

  curve.terminate = async () => {}
  return curve
}

async function getCurveFromName(name: string): Promise<Record<string, any>> {
  const normalized = name.toUpperCase().match(/[A-Z0-9]+/g)?.join('') ?? name.toUpperCase()
  if (!['BN128', 'BN254', 'ALTBN128'].includes(normalized)) {
    throw new Error(`Curve not supported by Worker runtime shim: ${name}`)
  }

  if (!curvePromise) {
    curvePromise = buildBn128Curve()
  }

  return curvePromise
}

function checkValueBelongsToField(Scalar: RuntimeDeps['Scalar'], curve: Record<string, any>, value: bigint) {
  return Scalar.geq(value, 0) && Scalar.lt(value, curve.r)
}

function publicInputsAreValid(
  Scalar: RuntimeDeps['Scalar'],
  curve: Record<string, any>,
  publicInputs: bigint[],
): boolean {
  return publicInputs.every((value) => checkValueBelongsToField(Scalar, curve, value))
}

function isWellConstructed(curve: Record<string, any>, proof: Record<string, Uint8Array>): boolean {
  return (
    curve.G1.isValid(proof.pi_a)
    && curve.G2.isValid(proof.pi_b)
    && curve.G1.isValid(proof.pi_c)
  )
}

export const verifyGroth16: Groth16Verify = async (
  _vkVerifier: object,
  _publicSignals: string[],
  _proof: object,
  logger?: { error?: (message: string) => void; info?: (message: string) => void },
) => {
  const deps = await loadRuntimeDeps()
  const vkVerifier = deps.utils.unstringifyBigInts(_vkVerifier)
  const proof = deps.utils.unstringifyBigInts(_proof)
  const publicSignals = deps.utils.unstringifyBigInts(_publicSignals) as bigint[]
  const curve = await getCurveFromName(vkVerifier.curve)

  if (!publicInputsAreValid(deps.Scalar, curve, publicSignals)) {
    logger?.error?.('Public inputs are not valid.')
    return false
  }

  const ic0 = curve.G1.fromObject(vkVerifier.IC[0])
  const icBuffer = new Uint8Array(curve.G1.F.n8 * 2 * publicSignals.length)
  const witnessBuffer = new Uint8Array(curve.Fr.n8 * publicSignals.length)

  for (let index = 0; index < publicSignals.length; index++) {
    const point = curve.G1.fromObject(vkVerifier.IC[index + 1])
    icBuffer.set(point, index * curve.G1.F.n8 * 2)
    deps.Scalar.toRprLE(witnessBuffer, curve.Fr.n8 * index, publicSignals[index], curve.Fr.n8)
  }

  let cpub = await curve.G1.multiExpAffine(icBuffer, witnessBuffer)
  cpub = curve.G1.add(cpub, ic0)

  const piA = curve.G1.fromObject(proof.pi_a)
  const piB = curve.G2.fromObject(proof.pi_b)
  const piC = curve.G1.fromObject(proof.pi_c)

  if (!isWellConstructed(curve, { pi_a: piA, pi_b: piB, pi_c: piC })) {
    logger?.error?.('Proof commitments are not valid.')
    return false
  }

  const vkGamma2 = curve.G2.fromObject(vkVerifier.vk_gamma_2)
  const vkDelta2 = curve.G2.fromObject(vkVerifier.vk_delta_2)
  const vkAlpha1 = curve.G1.fromObject(vkVerifier.vk_alpha_1)
  const vkBeta2 = curve.G2.fromObject(vkVerifier.vk_beta_2)

  const verified = await curve.pairingEq(
    curve.G1.neg(piA),
    piB,
    cpub,
    vkGamma2,
    piC,
    vkDelta2,
    vkAlpha1,
    vkBeta2,
  )

  if (!verified) {
    logger?.error?.('Invalid proof')
    return false
  }

  logger?.info?.('OK!')
  return true
}

export default async function loadSnarkjs(): Promise<SnarkjsRuntime> {
  if (!runtimePromise) {
    runtimePromise = Promise.resolve({
      groth16: {
        verify: verifyGroth16,
      },
    })
  }

  return runtimePromise
}
