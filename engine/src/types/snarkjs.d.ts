declare module 'snarkjs' {
  export namespace groth16 {
    function verify(
      vkey: object,
      publicSignals: string[],
      proof: object,
    ): Promise<boolean>
  }
}
