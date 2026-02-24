import { SectionShell } from "../SectionShell";
import { PixelPanel } from "../PixelPanel";

const contracts = [
  { name: "MockUSDC", address: "0xfEE786495d165b16dc8e68B6F8281193e041737d" },
  { name: "MockIdentityRegistry", address: "0x68E06c33D4957102362ACffC2BFF9E6b38199318" },
  { name: "AgentAccountFactory", address: "0x076d3C6c50b72D78be0C5190c392e6e5Ac7FD8aD" },
  { name: "AgentPaymaster", address: "0xd71a4b73737d4E1a9A73662Cf93690AB5A4fE32d" },
  { name: "AuctionRegistry (v2)", address: "0xFEc7a05707AF85C6b248314E20FF8EfF590c3639" },
  { name: "AuctionEscrow (v2)", address: "0x20944f46AB83F7eA40923D7543AF742Da829743c" },
  { name: "KeystoneForwarder", address: "0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5" },
];

export function DeployedSection() {
  return (
    <SectionShell id="deployed" tag="[ :: DEPLOYED :: ]" className="pb-10">
      <h2 className="mb-8 font-mono text-2xl font-bold text-[#EEEEF5] md:text-[28px]">
        $ cast call --rpc-url base-sepolia {"//"} live on Base Sepolia
      </h2>

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
                href={`https://sepolia.basescan.org/address/${contract.address}`}
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
