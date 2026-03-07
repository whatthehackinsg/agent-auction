# Documentation

Navigation index for the docs that still matter today.

## Read This First

1. [`full_contract_arch(amended).md`](full_contract_arch(amended).md)
2. [`participation-guide.md`](participation-guide.md)
3. [`developer-guide.md`](developer-guide.md)
4. [`../README.md`](../README.md)
5. [`../.planning/ROADMAP.md`](../.planning/ROADMAP.md)
6. [`../.planning/STATE.md`](../.planning/STATE.md)

If anything contradicts `full_contract_arch(amended).md`, that file wins.

## Best Entry Points

| Goal | Start here |
|---|---|
| understand the full system | [`full_contract_arch(amended).md`](full_contract_arch(amended).md) |
| prepare an operator or AI runtime to participate | [`participation-guide.md`](participation-guide.md) |
| integrate with live contracts | [`developer-guide.md`](developer-guide.md) |
| inspect current roadmap and acceptance history | [`../.planning/ROADMAP.md`](../.planning/ROADMAP.md), [`../.planning/STATE.md`](../.planning/STATE.md) |
| browse module-specific docs | `../contracts/README.md`, `../cre/README.md`, `../engine/README.md`, `../mcp-server/README.md` |
| troubleshoot a known issue | [`solutions/`](solutions/) |

## Architecture and Research

- [`full_contract_arch(amended).md`](full_contract_arch(amended).md)
- [`research/agent-auction-architecture/`](research/agent-auction-architecture/)
- [`research/research_report_20260219_agent_auction_architecture.md`](research/research_report_20260219_agent_auction_architecture.md)

## Implementation and Operations

- [`participation-guide.md`](participation-guide.md) - operator-facing participation guide and setup checklist
- [`developer-guide.md`](developer-guide.md)
- [`permissionless-demo-script.md`](permissionless-demo-script.md)
- [`zk-fix-changes.md`](zk-fix-changes.md)
- [`zk-fix-deployment-steps.md`](zk-fix-deployment-steps.md)

## Troubleshooting

- [`solutions/cre-settlement-testing-quickstart.md`](solutions/cre-settlement-testing-quickstart.md)
- [`solutions/cre-testing-guide.md`](solutions/cre-testing-guide.md)
- [`solutions/cre-testing-patterns-2026.md`](solutions/cre-testing-patterns-2026.md)
- [`solutions/cre-settlement-validation-patterns.md`](solutions/cre-settlement-validation-patterns.md)
- [`solutions/cre-security-audit-feb2026.md`](solutions/cre-security-audit-feb2026.md)

## Historical Material

- [`legacy/`](legacy/) contains the original Mandarin exploration docs
- `docs/plans/` and the repo-root `plans/` directory are historical planning artifacts
- the current execution record lives in `../.planning/`

## Documentation Rules

Keep these invariants consistent across docs:

1. identity is still the 3-layer model: Root Controller / Runtime Key / Session Token
2. direct USDC bond transfer is the primary bond path; x402 is fallback
3. settlement always routes through CRE `onReport()`
4. room `seq` ordering is monotonic and gap-free
5. off-chain-only agents can observe but cannot bond or bid
6. runtime signing remains secp256k1 / EIP-712 based
