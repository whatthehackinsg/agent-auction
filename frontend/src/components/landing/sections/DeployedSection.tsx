import { SectionShell } from "../SectionShell";
import { PixelPanel } from "../PixelPanel";

const explorerBaseUrl = "https://sepolia.basescan.org";

const deployment = {
  chainId: 84532,
  network: "Base Sepolia",
  deployedAt: "2026-03-08",
  deployer: "0x633ec0e633AA4d8BbCCEa280331A935747416737",
} as const;

const contracts = [
  { name: "AuctionRegistry (v3)", address: "0xB2FB10e98B2707A4C27434665E3C864ecaea0b7F" },
  { name: "AuctionEscrow (v3)", address: "0xb23D3bca2728e407A3b8c8ab63C8Ed6538c4bca2" },
  { name: "NftEscrow (v3)", address: "0x110fA3cc158621a85BfCcCA7F7B093356FCea020" },
  { name: "RealKeystoneForwarder", address: "0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5" },
  { name: "AgentPaymaster", address: "0xd71a4b73737d4E1a9A73662Cf93690AB5A4fE32d" },
  { name: "AgentAccountFactory", address: "0x076d3C6c50b72D78be0C5190c392e6e5Ac7FD8aD" },
  { name: "AgentPrivacyRegistry", address: "0x5b4f09A5D5188dCe1b1ba0caeDBcEb52CaCD1902" },
  { name: "IdentityRegistry (ERC-8004)", address: "0x8004A818BFB912233c491871b3d84c89A494BD9e" },
  { name: "MockUSDC", address: "0xfEE786495d165b16dc8e68B6F8281193e041737d" },
  { name: "MockKeystoneForwarder (dev)", address: "0x846ae85403D1BBd3B343F1b214D297969b39Ce23" },
];

export function DeployedSection() {
  return (
    <SectionShell id="deployed" tag="[ :: DEPLOYED :: ]" className="pb-10">
      <h2 className="mb-8 font-mono text-2xl font-bold text-[#EEEEF5] md:text-[28px]">
        $ cast call --rpc-url base-sepolia {"//"} deployed {deployment.deployedAt} on {deployment.network}
      </h2>

      <PixelPanel accent="mint" headerLabel="// deployments/base-sepolia.json" className="mb-6" noBodyPadding>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-3">
          <div className="flex flex-col">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#6EE7B7]/80">
              chainId
            </span>
            <span className="mt-1 font-mono text-sm text-[#EEEEF5]">{deployment.chainId}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#6EE7B7]/80">
              deployedAt
            </span>
            <span className="mt-1 font-mono text-sm text-[#EEEEF5]">{deployment.deployedAt}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#6EE7B7]/80">
              deployer
            </span>
            <a
              href={`${explorerBaseUrl}/address/${deployment.deployer}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 font-mono text-sm text-[#EEEEF5] underline decoration-[#6EE7B7]/40 underline-offset-4 hover:decoration-[#6EE7B7]"
            >
              {deployment.deployer.slice(0, 6)}...{deployment.deployer.slice(-4)}
            </a>
          </div>
        </div>
      </PixelPanel>

      <div className="grid gap-4 md:grid-cols-2">
        {contracts.map((contract) => (
          <PixelPanel key={contract.name} accent="violet" noBodyPadding>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col">
                <span className="font-mono text-sm font-bold text-[#A78BFA]">
                  {contract.name}
                </span>
                <span className="font-mono text-xs text-[#9B9BB8] mt-1">
                  {contract.address.slice(0, 6)}...{contract.address.slice(-4)}
                </span>
              </div>
              <a
                href={`${explorerBaseUrl}/address/${contract.address}`}
                target="_blank"
                rel="noreferrer noopener"
                className="flex h-8 w-8 items-center justify-center border border-[#56407f] bg-[#17132d] text-[#A78BFA] transition-colors hover:bg-[#A78BFA] hover:text-[#17132d]"
                aria-label={`View ${contract.name} on Basescan`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>External Link</title>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </PixelPanel>
        ))}
      </div>
    </SectionShell>
  );
}
