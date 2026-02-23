# docs/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This directory contains architecture specs, developer guides, plans, and solution docs.

## Local Rules

- Preserve source-of-truth precedence:
  1. `docs/full_contract_arch(amended).md`
  2. `docs/research/agent-auction-architecture/`
  3. `docs/legacy/` (historical only)
- Keep protocol identifiers in English (`ERC-8004`, `EIP-4337`, `x402`, `CRE`, `MCP`).
- Avoid contradicting architecture invariants defined in root `AGENTS.md`.
- When documenting fixes, prefer concise, reproducible steps and verification evidence.

## Documentation Structure

- `docs/README.md`: index and navigation entry point
- `docs/plans/`: workstream and execution plans
- `docs/solutions/`: troubleshooting write-ups and known fixes
- `docs/research/`: deep architecture specs and reports

## Quality Checks

- Validate internal links when editing navigation/index docs.
- Keep examples aligned with current deployed addresses and commands.

## Pointers

- Primary index: `docs/README.md`
- Developer onboarding: `docs/developer-guide.md`
- Solutions archive: `docs/solutions/`
