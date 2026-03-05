declare module "snarkjs" {
  export const groth16: {
    verify(
      vkey: unknown,
      publicSignals: readonly string[] | string[],
      proof: unknown,
    ): Promise<boolean>;
    fullProve(
      input: unknown,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
  };
}
