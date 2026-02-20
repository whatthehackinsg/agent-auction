# Agent Onboarding for AI Agent Platforms — Research Report

> **28 platforms/protocols** researched across 11 field categories (42 fields each)
>
> Generated from structured JSON research data. Fields marked [uncertain] are excluded.

## Table of Contents


### On-Chain

1. [Autonolas (Olas) Registry](#autonolas-olas-registry) — `Production` · full-setup · ⏱ hours to days
2. [ENS + DID for Agents (with ERC-8004)](#ens-did-for-agents-with-erc-8004) — `Production` · full-setup · ⏱ minutes
3. [ERC-8004 (Trustless Agents Standard)](#erc-8004-trustless-agents-standard) — `Draft` · full-setup · ⏱ minutes
4. [Fetch.ai Almanac](#fetchai-almanac) — `Production` · approve-only · ⏱ minutes
5. [Lit Protocol Agent Wallet (PKPs + Vincent)](#lit-protocol-agent-wallet-pkps-vincent) — `Production` · approve-only · ⏱ minutes
6. [Morpheus (Decentralized AI Network)](#morpheus-decentralized-ai-network) — `Production` · full-setup · ⏱ minutes to hours
7. [NEAR AI Agent Registry](#near-ai-agent-registry) — `Production` · full-setup · ⏱ minutes
8. [Virtuals Agent Commerce Protocol (ACP)](#virtuals-agent-commerce-protocol-acp) — `Production` · full-setup for initial Virtuals agent creation · ⏱ minutes
9. [Virtuals Protocol](#virtuals-protocol) — `Production` · full-setup · ⏱ minutes to hours
10. [Wayfinder (Agent Navigation)](#wayfinder-agent-navigation) — `Beta` · full-setup · ⏱ minutes
11. [cheqd Trust Registry / Trust Graph](#cheqd-trust-registry-trust-graph) — `Production` · approve-only · ⏱ minutes

### Hybrid

12. [Coinbase AgentKit / Agentic Wallets](#coinbase-agentkit-agentic-wallets) — `Production` · full-setup · ⏱ minutes
13. [ElizaOS (ai16z)](#elizaos-ai16z) — `Production` · full-setup · ⏱ minutes
14. [Phala Network (TEE Agent Compute)](#phala-network-tee-agent-compute) — `Production` · full-setup · ⏱ minutes
15. [x402 Payment Protocol](#x402-payment-protocol) — `Production` · approve-only · ⏱ seconds

### Off-Chain

16. [Agent Network Protocol (ANP)](#agent-network-protocol-anp) — `Spec-only` · full-setup · ⏱ minutes to hours
17. [Agent2Agent Protocol (A2A)](#agent2agent-protocol-a2a) — `Production` · full-setup · ⏱ minutes to hours
18. [Amazon Bedrock AgentCore Identity + Policy](#amazon-bedrock-agentcore-identity-policy) — `Production` · full-setup · ⏱ minutes
19. [Google Agent Payments Protocol (AP2)](#google-agent-payments-protocol-ap2) — `Production` · approve-only · ⏱ minutes
20. [Microsoft Entra Agent ID](#microsoft-entra-agent-id) — `Beta` · full-setup · ⏱ minutes
21. [Model Context Protocol (MCP)](#model-context-protocol-mcp) — `Production` · full-setup · ⏱ seconds
22. [Moltbook (by Molten / Matt Schlicht)](#moltbook-by-molten-matt-schlicht) — `Production` · approve-only · ⏱ minutes
23. [OpenClaw (formerly Clawdbot, Moltbot)](#openclaw-formerly-clawdbot-moltbot) — `Production` · full-setup · ⏱ minutes
24. [OpenRouter](#openrouter) — `Production` · full-setup · ⏱ minutes
25. [SPIFFE / SPIRE](#spiffe-spire) — `Production` · full-setup · ⏱ seconds

### Standards / Specs

26. [NIST NCCoE Agent Identity Project](#nist-nccoe-agent-identity-project) — `Spec-only` · full-setup · ⏱ hours to days
27. [OAuth 2.0 On-Behalf-Of for AI Agents (IETF Draft)](#oauth-20-on-behalf-of-for-ai-agents-ietf-draft) — `Spec-only` · approve-only · ⏱ seconds to minutes
28. [OpenID Connect for Agents (OIDC-A) 1.0](#openid-connect-for-agents-oidc-a-10) — `Spec-only` · approve-only · ⏱ minutes

---

## Autonolas (Olas) Registry

**Type**: `on-chain` · **Status**: `Production` · **Ecosystem**: Ethereum

### Basic Info

**Type**: on-chain

**Status**: Production (mainnet deployed since 2023; Olas Staking live August 2024; Pearl agent launcher; 1,700+ autonomous services registered; Olas Protocol v2 live)

**Ecosystem**: Ethereum (mainnet, primary for registries), Gnosis Chain (primary for service operations and staking), Polygon, Arbitrum, Optimism, Base, Celo, Solana (cross-chain bridging via Olas governance). Multi-chain service deployment supported.

**Launch Date**: 2023 (Autonolas protocol mainnet launch on Ethereum); OLAS token launched in 2023; Olas Staking launched August 2024; originally developed by Valory AG (founded 2021) as the Open Autonomy framework

### Onboarding Flow

**Registration Steps**:
> 1) Component Registration: A developer deploys agent component code (off-chain, typically Python packages via IPFS/GitHub).
> 2) On-chain Registration: Call the ComponentRegistry or AgentRegistry smart contract's create() function, providing: owner address, component/agent metadata URI, code hash (IPFS CID of the package), and array of dependency component IDs.
> 3) The registry mints an ERC-721 NFT representing the component/agent, assigning a unique unitId (tokenId). The code hash is stored on-chain for integrity verification.
> 4) Service Creation: A service owner calls the ServiceRegistry's create() function, specifying: the agent IDs composing the service, number of agent instances per agent type, configuration hash, threshold for multisig (agent consensus), and bond amounts per agent slot.
> 5) Service Activation: The service owner activates the service by depositing the required bond. Agent operators register their agent instances by providing operator addresses and posting operator bonds.
> 6) Service Deployment: Once all agent slots are filled, the service is deployed. A multisig (Gnosis Safe) is created for the service, controlled by the registered agent instances using threshold signatures.
> 7) For staking: Service owners optionally stake their service NFT into a staking contract to earn OLAS rewards, subject to meeting activity thresholds (e.g., minimum transactions per epoch).
> 8) Versioning: Owners can append new code hashes to existing components/agents via updateHash(), creating an on-chain version history without breaking existing references.

**Human Involvement**: full-setup (human developer must write and deploy agent code, register components on-chain, create and configure service, post bonds, and manage operator registration; staking requires human transaction approval; Pearl launcher simplifies some steps with a GUI but still requires human initiation)

**Agent Autonomy**:
> After initial human registration and service deployment, agents operate fully autonomously within their service. The deployed agents collectively control a Gnosis Safe multisig wallet, enabling autonomous on-chain transactions via threshold consensus. Agents cannot self-register -- a human developer or operator must register components, create services, and post bonds. However, once deployed, agents operate without human intervention: they reach consensus via the ABCI (Application Blockchain Interface) framework, execute transactions via their shared multisig, and earn rewards if staked. The Open Autonomy framework (FSM-based) orchestrates agent behavior deterministically.

**Time To First Action**:
> hours to days (agent code development and testing takes days; on-chain registration transactions take minutes on Gnosis Chain or seconds on L2s; service activation requires all operator slots to be filled which may take variable time; bond deposits require capital preparation; using Pearl launcher for pre-built agents reduces this to hours)

### Identity Model

**Identity Type**:
> NFT (ERC-721). Three-level registry hierarchy: (
> 1) ComponentRegistry -- individual software components as NFTs, (
> 2) AgentRegistry -- agents composed of components as NFTs, (
> 3) ServiceRegistry -- multi-agent services as NFTs. Each level uses ERC-721 with unique unitId/serviceId. Additionally, each deployed service has a Gnosis Safe multisig address as its operational identity.

**Key Management**:
> Multi-layered key management: (
> 1) Owner wallet: holds the ERC-721 NFT for the component/agent/service, has administrative control (update metadata, manage operators). (
> 2) Operator wallets: registered per agent slot in a service, operators manage the runtime agent instances. (
> 3) Agent instance keys: each running agent instance has its own cryptographic key used for consensus participation and multisig signing. (
> 4) Service multisig (Gnosis Safe): collectively controlled by agent instances using threshold signatures (e.g., 2-of-3, 3-of-5). The threshold is set at service creation. Key rotation for agent instances requires re-registration through the service lifecycle (unbond, re-register with new operator/instance keys, re-deploy). Owner keys follow standard Ethereum wallet management patterns.

**Multi Instance Support**:
> Yes, natively supported and core to the architecture. A single service can have multiple agent instances (slots), each running the same or different agent types. For example, a service might deploy 4 instances of AgentType-A. Each instance has its own operator and key but shares the service identity (multisig). Multiple services can reference the same registered agent type (ERC-721), enabling reuse across different service deployments.

**Recovery Mechanism**:
> Wallet-based recovery for ownership (standard Ethereum wallet recovery, multisig, smart contract wallets). For services: the service lifecycle includes explicit states (Pre-Registration, Active-Registration, Finished-Registration, Deployed, Terminated-Bonded). If a service needs recovery, the owner can terminate the service (returning bonds), update agent instances/operators, and re-deploy. The Gnosis Safe multisig has built-in recovery features (owner management, threshold changes). If an operator loses keys, the service can be terminated and re-activated with new operators. Code hashes on-chain ensure the correct agent code can always be re-fetched from IPFS.

**Versioning Support**:
> Yes, native on-chain versioning. Components and agents support hash appending via updateHash() -- new code hashes (IPFS CIDs) are appended to the on-chain record, creating an immutable version history. Each version is linked to the same unitId (NFT), maintaining identity continuity. The dependency graph is versioned: agents reference specific component IDs, and services reference specific agent IDs. Services have a configHash that can be updated across lifecycle transitions. This is one of Olas's distinctive features -- full on-chain provenance of every code version.

### Security

**Authentication Method**:
> Wallet signature (Ethereum secp256k1 signatures for all on-chain operations). Agent instances authenticate within the consensus protocol using their registered keys. Service-level authentication uses the Gnosis Safe multisig threshold signatures. Operator registration requires on-chain proof of address ownership. For off-chain agent-to-agent communication, the ABCI consensus mechanism provides Byzantine fault tolerant authentication among agent instances.

**Revocation Speed**:
> minutes (on Ethereum mainnet) / seconds (on Gnosis Chain or L2s). Service termination can be initiated immediately by the owner, which freezes the service multisig. Operator unbonding follows the service lifecycle state machine. There is no instant 'kill switch' for a running agent instance beyond terminating the service on-chain and shutting down the off-chain process.

**Anti Sybil**:
> Staking and bonding requirements. (
> 1) Service creation requires the owner to post a bond in ETH/OLAS. (
> 2) Each operator slot requires an operator bond. (
> 3) Staking contracts require minimum OLAS token stakes. (
> 4) Gas fees for registration. (
> 5) Activity thresholds for staking rewards prevent idle/fake services from earning. (
> 6) The economic cost of bonds and stakes creates a significant financial barrier to mass registration. (
> 7) However, the component and agent registries themselves do not require staking -- only service deployment and staking do.

**Data Exposure Risk**:
> Moderate. On-chain data is public: owner addresses, operator addresses, code hashes, dependency graphs, service configurations, bond amounts, staking status, and multisig addresses are all visible. Agent code is hosted on IPFS and referenced by hash, making it publicly accessible. Service multisig transaction history is transparent. No PII should be stored on-chain. Sensitive operational data (API keys, private configs) should be managed off-chain by the agent runtime, not in the registry.

**Skill Plugin Vetting**:
> Partial. Components are registered with code hashes, enabling verification that the correct code is being run. The dependency graph is explicitly declared on-chain (each agent lists its component dependencies). However, there is no automated sandboxing, security scanning, or formal vetting process in the registries themselves. The Open Autonomy framework enforces that agents follow the FSM specification, providing structural constraints. Community governance and audits provide some vetting, but it is not systematic or mandatory.

### Off-chain / On-chain Linking

**Linking Support**:
> yes (native and bidirectional). The registry is fundamentally designed to link on-chain identity (ERC-721 NFT with unitId/serviceId) to off-chain agent code (IPFS-hosted packages referenced by hash). The metadata URI points to off-chain descriptions. The service multisig links on-chain wallet to the off-chain agent collective.

**Linking Mechanism**:
> Smart contract registration with IPFS hash binding. The create() function stores the IPFS content hash (CID) of the agent/component package on-chain, creating a cryptographic link between on-chain identity and off-chain code. Metadata URIs (IPFS or HTTPS) link to off-chain descriptions. Operator registration links operator wallet addresses to specific agent slots. The service deployment creates a Gnosis Safe multisig whose address is recorded on-chain, linking the on-chain service identity to the operational wallet. updateHash() appends new code versions maintaining the linking across updates.

### Delegation & Authorization

**Delegation Model**:
> Multi-level delegation through the service architecture: (
> 1) Service Owner delegates operational control to registered Operators by approving their registration into agent slots. (
> 2) Operators manage individual agent instances. (
> 3) Agent instances collectively control the service multisig via threshold signatures (Gnosis Safe). (
> 4) The multisig can execute arbitrary on-chain transactions, effectively delegating the service's on-chain authority to the agent consensus. (
> 5) ERC-721 standard approve/setApprovalForAll enables owner-level delegation for registry management. This creates a human-owner -> operator -> agent-instance -> multisig delegation chain.

**Authorization Granularity**:
> Coarse (role-based). Three primary roles: Owner (full administrative control), Operator (manages specific agent slots), Agent Instance (participates in consensus and multisig). The Gnosis Safe multisig provides threshold-based authorization (m-of-n). No fine-grained ABAC or intent-aware authorization within the protocol itself. Staking contracts add an additional authorization layer: only staked services can earn rewards, creating economic authorization tiers.

### Discovery & Interoperability

**Discovery Mechanism**:
> On-chain registry lookup. The ComponentRegistry, AgentRegistry, and ServiceRegistry are public smart contracts that can be queried for: all registered units, their owners, code hashes, dependency graphs, and metadata URIs. Subgraph indexing (The Graph) provides efficient off-chain querying. The Olas Protocol website (olas.network) provides a web-based explorer for browsing registered agents and services. Staking dashboards show active services. No DNS, .well-known, or Agent Card based discovery.

**Cross Platform Portability**:
> Partially portable. The ERC-721 identity is portable within Ethereum and EVM-compatible chains. Olas has deployed registries on multiple chains (Ethereum, Gnosis, Polygon, Arbitrum, etc.) with cross-chain bridging for governance. However, agent code and the Open Autonomy framework create significant platform coupling -- agents are built specifically for the Olas stack (Tendermint ABCI, FSM framework). The code hashes and IPFS hosting are platform-agnostic. Service multisig (Gnosis Safe) is portable across EVM chains.

**Standards Compliance**:
> ERC-721 (identity tokens for components, agents, services), ERC-20 (OLAS token), Gnosis Safe (service multisig), IPFS (code and metadata hosting), Tendermint ABCI (agent consensus). No explicit W3C DID, W3C VC, OIDC, SPIFFE, ERC-8004, or A2A/MCP compliance. The protocol predates many of these agent-specific standards.

**Protocol Composability**:
> Moderate. The Olas protocol composes well within the Ethereum/EVM ecosystem: services can interact with any on-chain protocol via their Gnosis Safe multisig. The component dependency system enables composability of agent capabilities. Integration with DeFi protocols, DAOs, and other smart contracts is native. However, cross-ecosystem composability (with non-EVM chains, off-chain AI protocols like A2A/MCP) requires custom component development. The protocol does not natively integrate with newer agent standards (ERC-8004, A2A, MCP), though components could be built to bridge these. Olas governance enables cross-chain operations via bridging.

### Push/Pull Communication

**Push Support**:
> Smart contract events (Ethereum/Gnosis Chain event logs). The registries emit events on registration, updates, transfers, and lifecycle transitions. Staking contracts emit events on stake/unstake/reward distribution. These can be consumed via WebSocket subscriptions to blockchain nodes. No native webhook, SSE, or dedicated push notification system.

**Subscription Model**:
> Smart contract events (standard Ethereum event subscription via WebSocket or The Graph subgraph indexing). Applications can subscribe to specific registry events: unit creation, hash updates, service state transitions, staking events. No built-in channel-based, webhook, or token-based subscription mechanism beyond blockchain event monitoring.

### Trust & Reputation

**Trust Model**:
> Decentralized with economic security. Trust is established through: (
> 1) On-chain code hash verification (anyone can verify agent code matches the registered hash), (
> 2) Economic staking (services must stake OLAS to earn rewards, creating economic accountability), (
> 3) Transparent dependency graphs (visible which components compose each agent/service), (
> 4) Gnosis Safe multisig consensus (agent actions require threshold agreement), (
> 5) Bond requirements (operators post bonds that can be slashed). No centralized trust authority, but Olas DAO governance provides a semi-centralized coordination layer.

### Payment & Economics

**Payment Integration**:
> Native token (OLAS for staking and governance); ETH and chain-native tokens for bonds and gas; service multisigs can hold and transact any ERC-20 token. No integration with AP2, ACP, x402, or other agent payment protocols. Services interact with DeFi protocols directly via their multisig wallets for payment operations.

**Economic Model**:
> Staking + bonding + gas fees. (
> 1) Registration: gas fees only (relatively low on Gnosis Chain). (
> 2) Service creation: owner bond required (amount set per service). (
> 3) Operator registration: operator bond per agent slot. (
> 4) Staking: services can be staked into staking contracts to earn OLAS rewards, subject to meeting activity thresholds (e.g., minimum transactions per epoch). (
> 5) OLAS tokenomics: inflationary supply with rewards distributed to component/agent developers (via donations mechanism), service owners (via staking), and the Olas DAO treasury. (
> 6) Bonding mechanism: OLAS bonding allows users to purchase OLAS at a discount by providing liquidity. Total OLAS supply has a maximum annual inflation rate capped at 2%.

### Governance & Compliance

**Audit Trail Capability**:
> Blockchain anchoring. All registrations, code hash updates, service lifecycle transitions, operator registrations, bond deposits/withdrawals, staking operations, and multisig transactions are recorded immutably on Ethereum/Gnosis Chain. The IPFS-stored code hashes provide cryptographic proof of agent code integrity at each version. The dependency graph is fully auditable on-chain. Service multisig (Gnosis Safe) transactions are fully traceable. Staking contracts maintain complete records of rewards and activity verification.

**Lifecycle Management**:
> Comprehensive service lifecycle via state machine: Pre-Registration (service created, awaiting activation) -> Active-Registration (owner bond posted, operators registering) -> Finished-Registration (all slots filled) -> Deployed (service running, multisig created) -> Terminated-Bonded (service stopped, bonds pending return). Services can be terminated and re-deployed. Components and agents can be updated with new code hashes (versioning). No explicit 'suspension' state, but termination effectively pauses the service. Decommissioning is achieved by terminating the service and not re-deploying. The NFT representing the unit persists permanently on-chain.

### Uncertain Fields (8)

- known_vulnerabilities
- bot_to_bot_attack_surface
- attestation_mechanism
- transfer_behavior
- capability_declaration
- pull_support
- reputation_system
- regulatory_alignment

---

## ENS + DID for Agents (with ERC-8004)

**Type**: `on-chain / standard` · **Status**: `Production` · **Ecosystem**: Ethereum

### Basic Info

**Type**: on-chain / standard

**Status**: Production (ENS live since 2017; ERC-8004 mainnet since Jan 29, 2026; ENSv2 registry upgrade in progress; W3C DID v1.0 ratified 2022)

**Ecosystem**: Ethereum (mainnet), expanding to Base L2; ENSv2 will remain on Ethereum L1 after Namechain was dropped due to lower gas costs post-Fusaka upgrade

**Launch Date**: ENS: May 4, 2017; W3C DID v1.0: July 2022; ERC-8004: created August 13, 2025, mainnet January 29, 2026

### Onboarding Flow

**Registration Steps**:
> 1) Obtain an Ethereum wallet (EOA or smart-contract wallet).
> 2) Optionally register an ENS name (.eth domain) as the human-readable agent handle.
> 3) Deploy or call the ERC-8004 Identity Registry to mint an ERC-721 agent identity token (agentId).
> 4) Publish an agent registration file (JSON) to IPFS, HTTPS, or as a base64 data URI, describing endpoints (A2A, MCP), wallets, ENS names, DIDs, and supported trust models.
> 5) Set the agentURI on-chain to point to the registration file.
> 6) Optionally call setAgentWallet() to prove control of a receiving wallet via EIP-712 (EOA) or ERC-1271 (smart contract wallet) signature.
> 7) Optionally publish a .well-known/agent-registration.json at the agent's HTTPS endpoint domain for domain-level verification.
> 8) Optionally wrap the ENS name as a DID using the did:ens method (format: did:ens:<name>) or use did:ethr for Ethereum address-based DID.
> 9) Begin collecting reputation via the Reputation Registry (giveFeedback()) and/or request validation via the Validation Registry.

**Human Involvement**: full-setup (initial wallet creation, ENS name registration, and ERC-8004 identity minting require human transaction signing; ongoing operation can be autonomous)

**Agent Autonomy**:
> After initial setup by a human, the agent can autonomously update its registration file, collect reputation feedback, request validation, and interact with other agents. The agent cannot self-register without a human first provisioning a wallet and funding it for gas. ENS name registration requires human purchase. ERC-8004 identity minting requires a wallet transaction.

**Time To First Action**: minutes (minting an ERC-721 identity token is a single on-chain transaction; publishing a registration file to IPFS/HTTPS is near-instant; ENS name registration adds 2-step commit/reveal process taking ~1 minute minimum)

### Identity Model

**Identity Type**: ERC-721 NFT (ERC-8004 Identity Registry) + ENS name (.eth human-readable handle) + W3C DID (did:ens or did:ethr method) + wallet address (EOA or smart contract wallet)

**Key Management**:
> Keys are standard Ethereum key pairs (secp256k1). The agent owner holds the private key for the wallet that owns the ERC-721 identity token. A separate agentWallet can be designated via setAgentWallet() with EIP-712/ERC-1271 proof of control. Key rotation is supported: the agent owner can call setAgentWallet() with a new wallet address and a fresh cryptographic proof. When the ERC-721 identity token is transferred to a new owner, the agentWallet is automatically cleared (reset to zero address), requiring the new owner to re-verify wallet control. unsetAgentWallet() can explicitly clear the wallet. W3C DID key management allows agents to update cryptographic bindings of their DIDs to public keys without involving any issuer (e.g., certificate authority). Rotation frequency is not prescribed by the standard.

**Multi Instance Support**: Yes - the agent registration file can list multiple service endpoints (A2A, MCP, HTTPS, etc.) allowing multiple runtime instances to operate under a single on-chain identity. The ENS name and DID both resolve to the same identity token but can reference multiple endpoints.

**Recovery Mechanism**:
> Recovery relies on the underlying Ethereum wallet recovery mechanisms. If the wallet owning the ERC-721 identity token is a smart contract wallet, social recovery or multi-sig recovery is possible. If it is an EOA, standard seed phrase recovery applies. The ERC-721 token can be transferred to a new wallet. On transfer, agentWallet is automatically cleared for security, requiring re-verification. ENS names have their own recovery via the ENS registrar (name can be transferred). DID key rotation allows recovery without losing the identifier.

**Versioning Support**:
> The agentURI can be updated to point to a new registration file version (e.g., new IPFS hash). On-chain, the identity token itself is immutable but the URI pointer can be changed by the owner. Off-chain metadata (registration file) can be versioned via IPFS content addressing. The Reputation and Validation registries create an append-only on-chain history. ENS records can be updated. No formal on-chain code/model version tracking is specified by ERC-8004 itself.

### Security

**Authentication Method**: wallet signature (EIP-712 typed data signatures for EOAs, ERC-1271 for smart contract wallets); .well-known/agent-registration.json endpoint verification for domain control; W3C DID authentication via DID Document verification; challenge-response implicit in wallet signature flow

**Known Vulnerabilities**:
> 1) Sybil attacks: possible to inflate reputation of fake agents via colluding feedback; mitigated by feedbackAuth pre-authorization but not fully solved.
> 2) AcceptFeedback access control: if AcceptFeedback(AgentClientID, AgentServerID) lacks proper access control, any address can emit spurious AuthFeedback events, polluting logs and enabling oracle manipulation.
> 3) Storage exhaustion: unbounded validation requests storing pending request tuples indefinitely.
> 4) Reentrancy and access control misconfigurations in contract-based registries.
> 5) Off-chain registration file tampering if hosted on mutable HTTPS (mitigated by using IPFS with content hashing).
> 6) The agentURI cannot cryptographically guarantee that advertised capabilities are functional and non-malicious.
> 7) Validation Registry is still under active revision with TEE community.
> 8) Smart contract upgrade logic vulnerabilities if upgradeable proxy patterns are used.

**Anti Sybil**:
> fee (gas fees for minting ERC-721 identity tokens and posting feedback provide economic cost barriers); feedbackAuth pre-authorization mechanism (agents must authorize specific clients before they can post feedback); ENS name registration fees ($5+/year for .eth names) add additional cost; community-suggested mitigations include minimum bonds or token burns, refundable after probation period; reputation aggregators that assign trust scores to reviewers; ZK proofs to limit one identity per economic actor

**Data Exposure Risk**:
> Wallet addresses are publicly visible on-chain. The agent registration file (JSON) is publicly accessible and contains endpoint URLs, wallet addresses, ENS names, and service descriptions. Model configurations and internal agent logic are not required to be exposed. No PII is required by the standard. API keys should not be included in registration files.

**Bot To Bot Attack Surface**:
> ERC-8004 addresses agent-to-agent trust via the Reputation and Validation registries. Agents can check reputation scores before interacting. The Validation Registry supports multiple trust models (reputation-based, stake-secured re-execution, zkML proofs, TEE attestation) to verify agent behavior. However, the standard does not directly address prompt injection or social engineering between agents. Off-chain communication channels (A2A, MCP) must implement their own protections.

**Attestation Mechanism**:
> ERC-8004 Validation Registry supports multiple attestation mechanisms: TEE remote attestation (under active development with TEE community), zero-knowledge machine learning (zkML) proofs, stake-secured re-execution, and reputation-based trust. EIP-712/ERC-1271 signatures prove wallet control. .well-known endpoint verification proves domain control. W3C Verifiable Credentials can complement the on-chain attestation.

### Off-chain / On-chain Linking

**Linking Support**: yes

**Linking Mechanism**:
> EIP-712 typed data signature binding (setAgentWallet) links on-chain identity to wallet; .well-known/agent-registration.json links on-chain identity to HTTPS domain; agentURI links on-chain token to off-chain registration file (IPFS/HTTPS); did:ens method wraps ENS names as W3C DIDs, bridging on-chain ENS to off-chain DID ecosystem; did:ethr method links Ethereum addresses to DID Documents; the registration file itself can list both on-chain (wallet, ENS) and off-chain (A2A, MCP endpoints) identifiers

**Transfer Behavior**:
> When the ERC-721 identity token is transferred, agentWallet is automatically cleared (reset to zero address). The new owner must re-verify wallet control via setAgentWallet(). ENS name ownership transfers independently. The agentURI and reputation history remain associated with the token (not cleared on transfer).

### Delegation & Authorization

**Delegation Model**:
> ERC-8004 does not prescribe a specific delegation model but supports composability with existing delegation frameworks. The ERC-721 owner can delegate agent management via standard NFT approval mechanisms (approve/setApprovalForAll). W3C Verifiable Credentials enable delegation chains from verified humans to authorized agents. The registration file can reference multiple wallets and endpoints for different authorization levels. Composable with AP2 mandates and OAuth 2.0 flows. Smart contract-based delegation possible via the wallet owner pattern.

**Authorization Granularity**:
> coarse (role/scope) - ERC-8004 itself provides binary owner/non-owner authorization. The feedbackAuth mechanism provides per-agent-pair authorization for reputation. Finer-grained authorization can be layered via VCs, AP2 mandates, or application-specific smart contracts. The standard is designed to be extended rather than prescribing fine-grained ABAC.

### Discovery & Interoperability

**Discovery Mechanism**:
> on-chain query (Identity Registry lookup by agentId); ENS name resolution (human-readable .eth names resolve to agent data); .well-known/agent-registration.json (HTTPS endpoint discovery); agent registration file lists all endpoints and services; over 24,549 agents registered on mainnet as of early February 2026

**Capability Declaration**: Agent registration file (JSON) with structured fields including 'services' array listing endpoint types (A2A, MCP, OASF, ENS, email), capabilities, and URLs; follows a standardized schema with type, name, description, image, and services fields; compatible with Google A2A Agent Cards

**Cross Platform Portability**:
> portable via DID/VC - The ENS name is portable across any Ethereum-compatible platform. The DID (did:ens, did:ethr) is portable across any W3C DID-compliant system. The ERC-721 identity token is transferable. The registration file format is open and can be read by any compatible client. Not locked into any single platform.

**Standards Compliance**: W3C DID v1.0, W3C VC (via integration), ERC-721 (identity token), ERC-8004 (Trustless Agents), EIP-712 (typed data signing), ERC-1271 (smart contract signature verification), ENS (EIP-137/EIP-181), Google A2A protocol (extension), MCP (endpoint support), compatible with AP2 and x402

**Protocol Composability**:
> High composability - ERC-8004 explicitly extends Google A2A protocol with on-chain trust layer; supports MCP endpoints in registration file; compatible with ENS names and W3C DIDs; reputation signals exposed to any smart contract for on-chain composability; designed to work with AP2 for agent-to-merchant transactions; x402 payment protocol compatible; registration file supports arbitrary endpoint types allowing future protocol integration

### Push/Pull Communication

**Pull Support**: on-chain reads (Identity/Reputation/Validation Registry queries via standard Ethereum RPC); HTTPS (agent registration file fetching); ENS resolution; IPFS content retrieval

**Subscription Model**: smart contract events (ERC-8004 emits on-chain events for registration, feedback, and validation actions that can be monitored via standard Ethereum event subscriptions); off-chain subscription depends on the agent's endpoint implementation

### Trust & Reputation

**Trust Model**:
> decentralized (peer reputation via on-chain Reputation Registry + configurable Validation Registry); federated elements via validator smart contracts that can implement their own trust models; supports multiple trust levels: reputation-based social trust, stake-secured validation, zkML cryptographic trust, and TEE-based hardware trust

**Reputation System**:
> on-chain registry (ERC-8004 Reputation Registry) - authorized clients post feedback (score, tags, optional URI + hash) stored on-chain as composable signals; full data can remain off-chain; feedbackAuth mechanism controls who can post feedback for whom; reputation entries support revocation and appendable responses for dispute resolution; over 24K agents building reputation history on mainnet; reputation signals are readable by any smart contract enabling on-chain composability

### Payment & Economics

**Payment Integration**: native token (ETH for gas fees); compatible with x402 payment protocol; compatible with AP2 for agent-to-merchant payments; no native payment mechanism in ERC-8004 itself but the wallet infrastructure supports any ERC-20 token or ETH payment; registration file can declare payment endpoints

**Economic Model**:
> gas fees (Ethereum mainnet gas for minting identity tokens, posting feedback, and validation requests; designed to be gas-efficient with off-chain data storage reducing costs by 95%+); ENS name registration costs $5+/year for .eth domains; no staking required by ERC-8004 standard itself though validator implementations may require staking; free to read reputation data

### Governance & Compliance

**Audit Trail Capability**:
> blockchain anchoring (all identity registrations, reputation feedback, and validation results are recorded on Ethereum mainnet with full immutability; on-chain pointers and hashes cannot be deleted; reputation entries support appendable responses for dispute narratives; events emitted for all state changes enabling comprehensive audit trails; off-chain data integrity verified via content hashes stored on-chain)

**Lifecycle Management**:
> registration (mint ERC-721 identity token) / activation (set agentURI and agentWallet) / suspension (unsetAgentWallet or update agentURI) / migration (transfer ERC-721 token with automatic wallet reset) / upgrade (update agentURI to new registration file) / decommissioning (burn ERC-721 token or let ENS name expire; reputation history remains on-chain permanently)

### Uncertain Fields (4)

- push_support
- regulatory_alignment
- skill_plugin_vetting
- revocation_speed

---

## ERC-8004 (Trustless Agents Standard)

**Type**: `on-chain standard` · **Status**: `Draft` · **Ecosystem**: Ethereum

### Basic Info

**Type**: on-chain standard

**Status**: Draft (EIP status); Production (mainnet deployed January 29, 2026)

**Ecosystem**: Ethereum (mainnet deployed Jan 29, 2026); Layer 2s including Base, Optimism, Arbitrum. Supports any EVM-compatible chain as per-chain singletons. Aligns with CAIP-10 for cross-chain agent references.

**Launch Date**: August 13, 2025 (EIP created); August 14, 2025 (public discussion on Ethereum Magicians); January 29, 2026 (mainnet deployment)

### Onboarding Flow

**Registration Steps**:
> 1. Agent owner (EOA or smart contract wallet) calls register(tokenURI) on the Identity Registry smart contract.
> 2. The contract mints a new ERC-721 token representing the agent, assigning a unique agentId (tokenId).
> 3. The tokenURI (called agentURI) is stored on-chain, pointing to the off-chain agent registration file (JSON). This URI can use ipfs://, https://, or base64-encoded data: URI for fully on-chain metadata.
> 4. The registration file MUST contain: type, name, description, image, and services (array of endpoints with protocol names like 'A2A', 'MCP', 'web').
> 5. Owner optionally calls setMetadata(agentId, key, value) to add on-chain key/value metadata for quick filtering (e.g., agentWallet address as bytes).
> 6. Owner calls setAgentWallet(agentId, walletAddress, signature) to link an operational wallet, proving control via EIP-712 signature (for EOA) or ERC-1271 (for smart contract wallets).
> 7. Owner may delegate management to operators using ERC-721 approve/setApprovalForAll mechanisms.
> 8. For reputation: clients must be pre-authorized via feedbackAuth() before submitting feedback to the Reputation Registry.
> 9. For validation: validators register via the Validation Registry to provide cryptographic or economic verification of agent work.

**Human Involvement**: full-setup (human or human-controlled wallet initiates registration transaction, pays gas, signs wallet verification; can delegate ongoing management to operators post-setup)

**Agent Autonomy**:
> Agent can operate autonomously after initial human-driven registration. The agent itself cannot self-register without a wallet and gas. Post-registration, the agent can update its agentURI, interact with other agents via A2A/MCP, and participate in the reputation system. Operator delegation allows automated systems to manage agents on behalf of owners.

**Time To First Action**: minutes (on L2s like Base/Optimism, transaction confirmation is seconds; on Ethereum mainnet, minutes. Initial setup including wallet preparation and registration file hosting may take longer for first-time users.)

### Identity Model

**Identity Type**: NFT (ERC-721). Each agent receives a unique on-chain identity token (agentId = tokenId) in the Identity Registry. The agentURI (tokenURI) resolves to an off-chain registration file. An associated agentWallet (EOA or smart contract wallet) is verified via EIP-712/ERC-1271 signatures.

**Key Management**:
> Wallet-based key management. The owner wallet holds the ERC-721 identity token and has full control. Operator delegation via ERC-721 approve() allows third parties to manage agent metadata/URI updates. The agentWallet can be updated via setAgentWallet() requiring a new EIP-712 or ERC-1271 signature proof of control. On token transfer, the agentWallet is automatically cleared, requiring the new owner to re-verify a wallet. Key rotation is achieved by changing the agentWallet through the setAgentWallet function with new signature proof. For TEE-based agents (e.g., Phala Network integration), private keys can be generated and stored entirely within hardware enclaves.

**Recovery Mechanism**:
> Wallet-based recovery. If the owner wallet has recovery (social recovery, multisig, smart contract wallet with guardians), the agent identity is recoverable. The ERC-721 token can be transferred to a new wallet. On transfer, agentWallet is cleared and must be re-verified. No agent-specific recovery mechanism beyond standard wallet recovery patterns. Smart contract wallets (ERC-4337, Safe) provide additional recovery options.

### Security

**Authentication Method**:
> Wallet signature (EIP-712 for EOA wallets, ERC-1271 for smart contract wallets). On-chain identity is verified through blockchain consensus and ERC-721 ownership. The agentWallet linkage requires cryptographic proof of control. For TEE-based agents, remote attestation provides additional verification. Reputation feedback requires pre-authorization via feedbackAuth().

**Known Vulnerabilities**:
> Design-level concerns (not breaches): (
> 1) Sybil attacks: malicious actors can create multiple agent identities by minting multiple ERC-721 tokens from different wallets. Pre-authorization (feedbackAuth) only partially mitigates reputation spam. (
> 2) Metadata integrity: agentURI points to off-chain content (IPFS/HTTPS) that may be altered, removed, or incorrectly configured after registration. On-chain identity does not validate truth of off-chain content. (
> 3) Reputation gaming: feedback system can be manipulated by colluding agents or through Sybil identities. (
> 4) Validation Registry is still under active development and revision with the TEE community. (
> 5) Standard is still in 'Draft' status - specification may change. (
> 6) No built-in removal rules; applications must implement fraud/abuse handling via external governance.

**Revocation Speed**:
> seconds to minutes (on L2) / minutes (on mainnet). Agent wallet can be changed instantly via setAgentWallet(). ERC-721 token can be transferred or burned. Operator permissions can be revoked via approve(address(0)) or setApprovalForAll(operator, false). All operations take effect at transaction confirmation speed.

**Anti Sybil**:
> Moderate. Mechanisms include: (
> 1) Gas fee for registration creates economic cost barrier. (
> 2) Registration bonds and stake requirements can be implemented by specific registry deployments as policy. (
> 3) feedbackAuth() pre-authorization limits who can submit reputation feedback. (
> 4) Reputation aggregation with reviewer trust scoring. (
> 5) Validation request limits and tiered trust models. (
> 6) However, fundamentally anyone with a wallet and gas can mint an agent identity. Additional application-level anti-Sybil measures (staking, identity verification) are left to implementers.

**Data Exposure Risk**:
> Low to moderate. On-chain data is public by design (agent registration, reputation feedback, wallet addresses). The agentURI and registration file are intentionally public for discovery. Sensitive data should not be stored on-chain or in the registration file. The agentWallet address is public. Private operational data (API keys, model configs) should be kept off-chain and not referenced in the registration file. TEE-based agents can keep private data encrypted even from cloud providers.

**Bot To Bot Attack Surface**:
> Not directly applicable at the protocol level. ERC-8004 is a registry/identity standard, not a communication protocol. Agent-to-agent interactions happen via A2A, MCP, or other off-chain protocols. The Reputation Registry provides feedback mechanisms that could be used to flag malicious agents. The Validation Registry enables cryptographic verification of agent work, reducing trust in unverified agents. Application-level protections against prompt injection and social engineering are outside the standard's scope.

**Skill Plugin Vetting**:
> Not directly addressed by the standard. ERC-8004 defines identity, reputation, and validation registries. The registration file's services array lists endpoints and protocols but does not vet or sandbox them. The Validation Registry provides a framework for verifying agent outputs (via stake-secured re-execution, zkML, or TEE attestation), which indirectly validates agent capabilities. Skill/plugin vetting is left to application layers.

**Attestation Mechanism**:
> TEE remote attestation (supported via Validation Registry extensions). Phala Network has implemented an ERC-8004-compliant TEE Agent with a TEE Registry Extension. The Validation Registry supports: (
> 1) Trusted Execution Environment (TEE) attestations providing cryptographic proof of correct execution in secure hardware enclaves, (
> 2) Zero-knowledge machine learning (zkML) proofs, (
> 3) Stake-secured re-execution by validators, (
> 4) Cryptographic attestation that code ran correctly on correct inputs without tampering. The Validation Registry section is still being revised and expanded.

### Off-chain / On-chain Linking

**Linking Support**: yes (native and bidirectional). The standard is fundamentally designed to link on-chain identity (ERC-721) with off-chain agent capabilities (agentURI -> registration file -> service endpoints). The agentWallet links on-chain wallet to agent identity with cryptographic proof.

**Linking Mechanism**:
> EIP-712 signature (for EOA wallets) or ERC-1271 signature verification (for smart contract wallets) to prove control of agentWallet. The agentURI (tokenURI) resolves to an off-chain registration file containing service endpoints (A2A, MCP, web URLs). On-chain metadata key/value pairs can store additional linking data. Smart contract registration function register(tokenURI) creates the binding between on-chain token and off-chain metadata.

**Transfer Behavior**:
> On ERC-721 token transfer, the agentWallet is automatically cleared. The new owner must re-verify a new wallet via setAgentWallet() with fresh EIP-712/ERC-1271 signature. The agentURI (registration file pointer) is preserved on transfer. Reputation history (in the Reputation Registry) is preserved and follows the agentId, not the owner. The new owner inherits the agent's reputation but must establish new wallet control.

### Delegation & Authorization

**Delegation Model**:
> ERC-721 operator delegation. The token owner can: (
> 1) approve(operator, agentId) - delegate management of a specific agent to an operator address, (
> 2) setApprovalForAll(operator, true) - delegate management of all owned agents to an operator. Operators can update agentURI, set metadata, and manage agent configuration on behalf of the owner. This is standard ERC-721 delegation, not a custom authorization framework. For agent-to-agent delegation, the standard does not define a specific protocol - it relies on off-chain protocols like A2A for inter-agent communication and authorization.

**Authorization Granularity**:
> Coarse (role-based). ERC-721 delegation is binary: an operator either has full management rights or none. There is no fine-grained permission model within the standard itself. feedbackAuth() provides authorization control for reputation feedback submission. Application-level authorization granularity (ABAC, intent-aware) is left to implementers. The registration file can declare capabilities, but enforcement is off-chain.

### Discovery & Interoperability

**Discovery Mechanism**:
> On-chain registry lookup. Agents are discovered by: (
> 1) Querying the Identity Registry smart contract (enumerate all registered agents, filter by on-chain metadata), (
> 2) Reading the agentURI to fetch the registration file with service endpoints, (
> 3) The registration file contains structured service declarations (name, endpoint, protocol type), (
> 4) On-chain metadata key/value pairs enable filtering and indexing, (
> 5) Subgraph/indexer services can provide efficient off-chain querying of on-chain registry data.

**Capability Declaration**:
> Registration file (JSON). The agent registration file MUST contain: type (schema reference), name, description (natural language including what agent does, how it works, pricing, interaction methods), image, and services array (each with name like 'A2A'/'MCP'/'web' and endpoint URL). This is effectively an Agent Card. The format is standardized by the ERC-8004 specification. On-chain metadata provides additional queryable attributes.

**Cross Platform Portability**:
> Portable. ERC-721-based identity is inherently portable across any platform that can read Ethereum state. CAIP-10 alignment enables cross-chain references. The agentURI and registration file are accessible via standard HTTP/IPFS. The standard is designed for cross-organizational and cross-platform agent discovery. Any system that implements ERC-8004 can discover and verify agents registered on any supported chain.

**Standards Compliance**:
> ERC-721 (identity token), ERC-721URIStorage (metadata resolution), EIP-712 (typed data signing for wallet verification), ERC-1271 (smart contract wallet signature verification), CAIP-10 (cross-chain account references). Extends Google's A2A (Agent-to-Agent) protocol with on-chain trust layer. Compatible with Anthropic's MCP (Model Context Protocol). Integrates with x402 payment protocol (Coinbase/Cloudflare). The standard itself is an EIP (Ethereum Improvement Proposal) in Draft status.

**Protocol Composability**:
> High. Designed to compose with: (
> 1) A2A (Google's Agent-to-Agent protocol, donated to Linux Foundation) for inter-agent communication, (
> 2) MCP (Anthropic's Model Context Protocol) for AI model interaction, (
> 3) x402 (Coinbase/Cloudflare) for HTTP-based stablecoin micropayments, (
> 4) ERC-4337/ERC-7702 for account abstraction and gas sponsorship, (
> 5) TEE frameworks (Phala Network, ROFL) for secure execution, (
> 6) zkML for zero-knowledge proof verification, (
> 7) The three registries are designed as lightweight primitives that other protocols build on top of.

### Push/Pull Communication

**Push Support**:
> Smart contract events (Ethereum event logs). The Identity Registry emits Transfer events (ERC-721 standard) on registration/transfer. The Reputation Registry emits events on feedback submission. The Validation Registry emits events on validation requests/results. These can be consumed via WebSocket subscriptions to Ethereum nodes or indexing services.

**Pull Support**:
> On-chain reads (direct smart contract queries via eth_call). Agents and clients can query registry state at any time: check agent ownership, read agentURI, fetch metadata, query reputation feedback, check validation results. Off-chain, the agentURI resolves to a registration file accessible via HTTP/IPFS GET requests.

**Subscription Model**:
> Smart contract events. Applications can subscribe to registry events via Ethereum node WebSocket connections or use indexing services (The Graph subgraphs) for efficient event processing. Event types include: agent registration, transfer, metadata updates, reputation feedback, validation results. No built-in webhook or channel-based subscription in the standard itself.

### Trust & Reputation

**Trust Model**:
> Decentralized (peer reputation) + cryptographic/economic validation. Trust is established through: (
> 1) On-chain identity with transparent ownership and history, (
> 2) Peer-to-peer reputation feedback via the Reputation Registry (authorized clients submit signed ratings), (
> 3) Cryptographic validation via TEE attestation, zkML proofs, (
> 4) Economic validation via stake-secured re-execution with slashing for incorrect validation, (
> 5) No centralized platform-verified trust; trust signals are composable and interpretable by each participant independently.

**Reputation System**:
> On-chain registry (ERC-8004 Reputation Registry). Feedback from authorized clients consists of: signed fixed-point value (int
> 1
> 2
> 8) with decimals (uint8, 0-18), optional tag1 and tag2 for categorization, endpoint URI, off-chain file URI with KECCAK-256 hash for integrity verification. Aggregation and scoring occur both on-chain (for composability) and off-chain (for sophisticated algorithms). Specialized services for agent scoring, auditor networks, and insurance pools can build on top. feedbackAuth() controls who can submit feedback.

### Payment & Economics

**Payment Integration**:
> x402 (Coinbase/Cloudflare HTTP-based stablecoin micropayments). ERC-8004 deliberately excludes built-in payment mechanisms but is designed to integrate with x402, which revives HTTP 402 'Payment Required' for instant, automatic stablecoin payments. Agents can include cryptographic payment proofs in reputation feedback, creating economically-backed trust signals. Also compatible with native ETH/token payments for gas and staking.

**Economic Model**:
> Gas fees for registration and on-chain operations. On L2s (Base, Optimism) typically under $1. EIP-7702 gas sponsorship can eliminate gas costs for end users. Optional: registration bonds or stake requirements can be implemented by specific deployments as anti-Sybil policy. Validators stake capital that can be slashed for incorrect validation. No subscription model. The standard itself is free and open.

### Governance & Compliance

**Audit Trail Capability**:
> Blockchain anchoring. All registration events, metadata updates, ownership transfers, reputation feedback, and validation results are recorded immutably on-chain via Ethereum event logs and state changes. Reputation feedback includes KECCAK-256 file hashes for off-chain data integrity verification. The ERC-721 ownership history is fully traceable. This provides a native, immutable audit trail linking agent identities to their on-chain actions.

### Uncertain Fields (4)

- multi_instance_support
- versioning_support
- regulatory_alignment
- lifecycle_management

---

## Fetch.ai Almanac

**Type**: `on-chain` · **Status**: `Production` · **Ecosystem**: Cosmos

### Basic Info

**Type**: on-chain

**Status**: Production (Almanac contract live on Fetch.ai mainnet; integrated into uAgents framework; part of Artificial Superintelligence Alliance (ASI) since mid-2024 merger of Fetch.ai, SingularityNET, and Ocean Protocol)

**Ecosystem**: Cosmos (Fetch.ai is a Cosmos SDK-based blockchain using Tendermint/CometBFT consensus; part of IBC-connected Cosmos ecosystem; now part of ASI Alliance; FET token merged into ASI token)

**Launch Date**: 2023 (Almanac contract deployed as part of the uAgents framework release; Fetch.ai mainnet launched February 2023; uAgents Python framework released mid-2023; Almanac contract has been operational since the uAgents launch)

### Onboarding Flow

**Registration Steps**:
> 1) Install the uAgents Python framework (pip install uagents).
> 2) Create a new agent in code: instantiate an Agent object with a name, seed phrase (for deterministic key generation), and optional endpoint URL.
> 3) The framework automatically generates the agent's cryptographic identity (address) from the seed phrase.
> 4) Fund the agent's wallet with FET tokens (now ASI tokens) to cover registration fees and staking. The agent needs a minimum balance to register.
> 5) The agent calls the register() method which submits a transaction to the Almanac smart contract on the Fetch.ai blockchain. This transaction includes: the agent's address, service endpoints (HTTP/REST URLs where the agent can be reached), supported protocols (protocol digests identifying what message types the agent handles), and metadata.
> 6) The agent must stake a minimum amount of FET tokens in the Almanac contract as part of registration (anti-spam mechanism).
> 7) Registration is confirmed on-chain and the agent becomes discoverable.
> 8) CRITICAL: The registration expires after approximately 1 hour (the uAgents framework handles automatic re-registration in the background; the often-cited 48-hour expiry was an earlier design, later shortened).
> 9) The agent must remain running to maintain its registration and respond to incoming messages.
> 1
> 0) For remote agents (agents accessible via HTTP endpoints), the endpoint URL is stored in the Almanac for discovery by other agents.

**Human Involvement**: approve-only (human writes the initial agent code and provides the seed phrase/configuration; once started, the agent autonomously handles registration, re-registration, and operation; human intervention only needed for initial setup, funding, and code changes)

**Agent Autonomy**:
> High autonomy after initial setup. The uAgents framework handles: automatic Almanac registration and periodic re-registration (background task), key generation from seed phrase, endpoint advertisement, protocol handler registration, and message routing. The agent self-registers and maintains its presence without human intervention. The agent can autonomously discover other agents, send/receive messages, and transact using its wallet. Human only needs to write the code and start the process.

**Time To First Action**: minutes (installing uAgents framework takes seconds; agent instantiation is instant; on-chain registration requires a blockchain transaction which confirms in ~5-6 seconds on Fetch.ai; funding the wallet may take additional time if tokens need to be acquired)

### Identity Model

**Identity Type**: Ed25519 key (agent address derived from Ed25519 public key; address format is 'agent1...' prefixed bech32 encoding; deterministically generated from a seed phrase provided at agent creation). The agent address serves as the unique identifier in the Almanac contract and for inter-agent communication.

**Key Management**:
> Keys are generated deterministically from a seed phrase (string) provided when creating the Agent object. The seed phrase maps to an Ed25519 key pair. The private key is held in memory during runtime and used to sign transactions and messages. Storage: the seed phrase can be stored in environment variables, config files, or secret managers. No built-in HSM/KMS integration in the base framework. Rotation: changing the seed phrase generates a new identity (new address), effectively creating a new agent rather than rotating keys for the same identity. The framework does not support key rotation while preserving identity. For the underlying Fetch.ai wallet, standard Cosmos SDK key management applies.

**Recovery Mechanism**:
> Seed phrase recovery: the agent's identity can be fully recovered by providing the same seed phrase to a new agent instance (deterministic key derivation). If the seed phrase is lost, the identity cannot be recovered. No social recovery, backup key, or multi-key recovery mechanism built into the framework. The wallet's FET/ASI tokens can be recovered through standard Cosmos SDK wallet recovery if the mnemonic is available.

### Security

**Authentication Method**:
> Wallet signature (Ed25519 signatures for on-chain transactions to the Almanac contract; agent-to-agent messages are signed with the sender's Ed25519 private key and verified by the recipient using the sender's public key/address; message envelopes include sender address, target address, and signature for authentication)

**Anti Sybil**:
> staking (minimum FET/ASI token stake required for Almanac registration serves as economic anti-Sybil barrier); fee (transaction gas fees on Fetch.ai blockchain for each registration/re-registration); the combination of staking + periodic gas costs makes mass registration economically costly over time

**Data Exposure Risk**:
> Agent addresses, service endpoints (HTTP URLs including IP/domain and port), supported protocol digests, and staking amounts are all publicly visible on-chain in the Almanac contract. This exposes the agent's network location and capabilities to anyone querying the blockchain. No PII is required for registration. Private keys and seed phrases should not be exposed but are at risk if improperly stored.

### Off-chain / On-chain Linking

**Linking Support**: yes (native and bidirectional - the Almanac contract is specifically designed to link on-chain agent identity with off-chain service endpoints)

**Linking Mechanism**:
> Smart contract registration: the agent's on-chain identity (address derived from Ed25519 key) is linked to off-chain HTTP endpoints via the Almanac contract's register() function. The agent signs the registration transaction with its private key, cryptographically proving it controls both the on-chain identity and the off-chain service. Endpoint URLs stored on-chain point directly to the agent's off-chain HTTP server. Protocol digests on-chain map to off-chain message handling capabilities.

### Delegation & Authorization

**Delegation Model**:
> No built-in delegation model. The uAgents framework does not provide human-to-agent delegation, agent-to-agent delegation, or OAuth-style authorization chains. Each agent operates with its own independent identity and keys. Multi-agent coordination is implemented through custom message-passing protocols defined by developers. Developers can build delegation logic within their agent code but there is no framework-level support.

**Authorization Granularity**:
> None at the framework level. Authorization is implicit: any agent that knows another agent's address can send it messages. There is no access control list, role-based access, or permission system built into the uAgents framework or Almanac contract. Developers must implement their own authorization logic within message handlers.

### Discovery & Interoperability

**Discovery Mechanism**:
> On-chain query (Almanac contract query: look up agents by address, or search by protocol digest to find all agents supporting a specific protocol); the uAgents framework provides built-in utility functions for Almanac lookups; agents can discover peers by protocol compatibility (matching protocol digests); the Agentverse platform (Fetch.ai's hosted agent service) provides additional web-based discovery UI.

**Capability Declaration**:
> Protocol digests registered in the Almanac contract. Each protocol is defined by its message models (request/response schemas); the digest is a hash of these schemas. By querying the Almanac for agents with a specific protocol digest, callers can find agents with matching capabilities. Additional metadata (name, description) can be stored but the primary discovery mechanism is protocol-digest-based matching.

**Cross Platform Portability**:
> Locked-in. Agent identity is specific to the Fetch.ai/ASI ecosystem. The agent address format, Almanac contract, and uAgents framework are Fetch.ai-specific. Cross-chain communication would require IBC (Inter-Blockchain Communication) bridges to other Cosmos chains, but the agent identity itself does not port. No W3C DID, ERC-721, or universal identity standard support. The ASI Alliance merger may bring future interoperability with SingularityNET and Ocean Protocol ecosystems.

**Standards Compliance**:
> Cosmos SDK (blockchain framework); Tendermint/CometBFT consensus; IBC (Inter-Blockchain Communication) for cross-chain within Cosmos ecosystem; Ed25519 cryptography; bech32 address encoding. No compliance with W3C DID, W3C VC, OIDC, SPIFFE, OAuth 2.0, ERC-721, or ERC-
> 8
> 0
> 0
> 4. Uses custom protocol digest system for capability matching rather than standard schemas.

**Protocol Composability**:
> Low to moderate. Within the Fetch.ai ecosystem: composes with DeltaV (AI-powered service discovery), Agentverse (hosted agent platform), ASI token economics, and IBC-connected Cosmos chains. Outside the ecosystem: no native composability with A2A, MCP, ERC-8004, AP2, or x
> 4
> 0
> 2. The protocol system is proprietary to the uAgents framework. Third-party integrations would require custom adapter agents.

### Push/Pull Communication

**Pull Support**: On-chain reads (Almanac contract queries via Fetch.ai RPC to discover agents and their endpoints); REST API (agents expose HTTP endpoints that can be queried); the uAgents framework supports request-response message patterns where an agent queries another agent and awaits a response.

### Trust & Reputation

**Trust Model**:
> Decentralized (staking-based). Trust is established through: (
> 1) On-chain identity via Almanac registration, (
> 2) FET/ASI token staking as economic commitment, (
> 3) Protocol digest matching ensures capability verification, (
> 4) No built-in peer reputation or trust scoring system. Trust between agents is implicit based on staking and must be built through custom logic or external systems.

### Payment & Economics

**Payment Integration**:
> Native token (FET, now ASI token, for staking and gas fees); the uAgents framework supports native token transfers between agents; integration with Fetch.ai DeFi ecosystem; no direct integration with AP2, ACP, x402, or fiat payment protocols. Agents can hold and transfer tokens autonomously using their wallet.

**Economic Model**:
> Staking required (minimum FET/ASI stake for Almanac registration, amount has varied but is designed to be accessible); gas fees (Cosmos SDK transaction fees for each registration and re-registration, relatively low on Fetch.ai chain); periodic re-registration costs (gas for re-registration every ~1 hour adds up over time); the economic burden of continuous re-registration serves as both anti-spam and a participation cost. No subscription model. Agent operation is free beyond staking and gas.

### Governance & Compliance

**Regulatory Alignment**: unknown - no explicit regulatory framework compliance documented. Fetch.ai Foundation is incorporated in Singapore. The ASI Alliance (formed 2024) has not published specific regulatory alignment for the agent framework. No explicit EU AI Act, NIST AI RMF, or ISO 42001 compliance stated.

**Audit Trail Capability**:
> Blockchain anchoring (all Almanac registration transactions are recorded on the Fetch.ai blockchain; agent addresses, endpoints, protocol digests, and staking events are immutably recorded; transaction history is queryable through Fetch.ai block explorers and RPC; however, agent-to-agent message content is not recorded on-chain, only the registration metadata).

**Lifecycle Management**:
> Registration (agent registers in Almanac via on-chain transaction) / activation (agent is discoverable once registered and endpoint is live) / suspension (natural expiry after ~1 hour if re-registration stops; no explicit suspend function) / upgrade (agent can re-register with updated endpoints or protocols; changing protocol digests updates capabilities; code upgrades require restarting the agent) / decommissioning (stop the agent process; registration expires naturally; staked tokens can be withdrawn). No formal migration mechanism between agent identities.

### Uncertain Fields (11)

- multi_instance_support
- versioning_support
- known_vulnerabilities
- revocation_speed
- bot_to_bot_attack_surface
- skill_plugin_vetting
- attestation_mechanism
- transfer_behavior
- push_support
- subscription_model
- reputation_system

---

## Lit Protocol Agent Wallet (PKPs + Vincent)

**Type**: `on-chain` · **Status**: `Production` · **Ecosystem**: Multi-chain: Ethereum

### Basic Info

**Type**: on-chain

**Status**: Production (V1 Naga network live; V0 Datil and Datil-test deprecated; Vincent Agent Wallets in production with 7,000+ wallets deployed; Rust SDK released alongside JS/TS SDKs)

**Ecosystem**:
> Multi-chain: Ethereum (primary), Polygon, Arbitrum, Avalanche, Cosmos, Solana, Bitcoin (via threshold ECDSA). Lit operates its own EVM-compatible rollup (Chronicle Yellowstone, then Naga) for PKP minting and Lit Action registration. Supports signing for any chain using ECDSA (secp256k1) or Ed25519 key schemes.

### Onboarding Flow

**Registration Steps**:
> 1) Install the Lit SDK (JavaScript/TypeScript or Rust).
> 2) Connect to the Lit network (Naga for production, Datil-test for development) by instantiating a LitNodeClient.
> 3) Authenticate: obtain an AuthSig (wallet signature) or SessionSigs (session-based authentication via Auth Methods such as Ethereum wallet, Google OAuth, Discord, WebAuthn, etc.).
> 4) Mint a PKP (Programmable Key Pair) by calling the PKP minting contract on the Lit Chronicle chain. This generates a distributed key pair across the Lit node network using Distributed Key Generation (DKG). The public key is recorded on-chain; private key shares are distributed across nodes.
> 5) Optionally, assign Auth Methods to the PKP to control who/what can use it (e.g., specific wallet addresses, OAuth providers, custom Lit Actions).
> 6) Write a Lit Action (JavaScript code that runs inside a Trusted Execution Environment across Lit nodes) to define the signing logic, conditions, and constraints for the PKP.
> 7) For Vincent Agent Wallets: use the Vincent SDK to create agent-specific wallets with built-in policy controls, spending limits, and user-delegated permissions. The human owner approves an app/agent policy, and the agent operates within those constraints.
> 8) The agent can now sign transactions on any supported chain using the PKP via Lit Actions.

**Human Involvement**:
> approve-only (human initially mints or delegates the PKP, sets up Auth Methods, and defines Lit Action policies/constraints; after setup, the agent operates autonomously within defined parameters. Vincent Agent Wallets further streamline this: the human approves a policy once, and the agent executes within bounds without further human intervention)

**Agent Autonomy**:
> High autonomy after initial setup. The agent can autonomously sign transactions, interact with smart contracts, and perform on-chain actions as long as the Lit Action conditions are met. The agent cannot modify its own Auth Methods or Lit Action logic without authorization from the PKP owner. Vincent Agent Wallets provide a self-contained agent identity that can transact autonomously within human-defined policies. Agents cannot self-register a PKP without an initial funded wallet to pay minting gas fees on Chronicle.

**Time To First Action**: minutes (PKP minting is a single on-chain transaction on the Lit Chronicle chain, typically completing in seconds; connecting to the Lit network and obtaining session signatures takes seconds; writing and deploying a Lit Action is near-instant)

### Identity Model

**Identity Type**:
> PKP (Programmable Key Pair) - a distributed ECDSA or Ed25519 key pair generated via DKG across Lit network nodes. Each PKP has an associated Ethereum address, a token ID (ERC-721 NFT on Chronicle chain), and a public key. The PKP NFT represents ownership/control. Vincent Agent Wallets wrap PKPs with additional policy and delegation layers for agent-specific use cases.

**Key Management**:
> Keys are generated via Distributed Key Generation (DKG) using a threshold cryptography scheme (threshold BLS/ECDSA). The private key is never assembled in full; instead, key shares are distributed across Lit network nodes (currently 30+ nodes in Naga). Signing requires a threshold (2/3) of nodes to participate via threshold signing (TSS). Key shares are stored in Trusted Execution Environments (TEEs) on each Lit node, ensuring no single node can reconstruct the full private key. Key rotation: PKP key shares can be refreshed (proactive secret sharing) without changing the public key or address. Revocation: Auth Methods can be removed or changed by the PKP NFT owner, effectively revoking access to use the key. The PKP NFT itself can be burned to permanently disable the key. No single entity (including the Lit Protocol team) can access or reconstruct the full private key.

**Multi Instance Support**:
> Yes - multiple Auth Methods can be assigned to a single PKP, allowing multiple agents or services to use the same key pair concurrently. Different Lit Actions can be associated with the same PKP for different signing contexts. A single PKP can sign transactions on multiple chains simultaneously (multi-chain by design). Vincent Agent Wallets support multiple agents operating under the same human owner's delegation framework.

**Recovery Mechanism**:
> Recovery is tied to the PKP NFT ownership and Auth Methods. If Auth Method credentials are lost (e.g., OAuth tokens), the PKP NFT owner can add new Auth Methods or remove compromised ones via on-chain transactions. If the PKP NFT owner wallet is lost, standard Ethereum wallet recovery applies (seed phrase, social recovery if using a smart contract wallet). The underlying key shares are maintained by the Lit network nodes, so the distributed key persists as long as the network operates. There is no traditional 'seed phrase' for the PKP itself since the private key is never assembled. Worst case: if the PKP NFT is burned or the owner wallet is irrecoverable, access to the PKP is permanently lost.

**Versioning Support**:
> Lit Actions (the JavaScript code defining signing logic) can be versioned via IPFS content hashes. Each Lit Action is identified by its IPFS CID, enabling immutable versioning. The PKP itself does not change, but the associated Lit Action code can be updated by deploying a new version with a new CID. On-chain, the PKP NFT metadata does not natively track code/model versions, but the Lit Action IPFS hash effectively serves as a code version identifier. Vincent Agent Wallets support policy versioning through their app policy framework.

### Security

**Authentication Method**:
> Multi-method authentication: wallet signature (AuthSig via EIP-191 or EIP-4361 Sign-In with Ethereum); session-based authentication (SessionSigs with configurable expiry and resource scoping); OAuth-based auth (Google, Discord, etc. via Lit Login); WebAuthn (passkeys/biometrics); custom Auth Methods via Lit Actions; TEE attestation (Lit nodes run in TEEs, providing hardware-level attestation of signing environment integrity)

**Revocation Speed**: seconds to minutes (Auth Methods can be added/removed via on-chain transactions on the Lit Chronicle chain, which has fast block times; SessionSigs have configurable expiry and can be invalidated by rotating session keys; PKP NFT can be burned in a single transaction to permanently revoke the key)

**Anti Sybil**:
> fee (PKP minting requires gas fees on the Lit Chronicle chain, creating economic cost per identity; the PKP NFT itself has a minting cost; rate limiting is enforced at the network level; no additional staking or proof-of-work required for basic PKP minting; Vincent Agent Wallets may impose additional app-level restrictions)

**Data Exposure Risk**:
> PKP public keys and associated Ethereum addresses are publicly visible on-chain. Auth Method configurations are stored on-chain and visible. Lit Action source code (if published to IPFS) is publicly readable. Private key shares are never exposed (stored in TEEs). No PII is inherently required. OAuth tokens used as Auth Methods pass through the Lit network nodes but are processed within TEEs. Wallet addresses of PKP owners are publicly visible on the Chronicle chain.

**Bot To Bot Attack Surface**:
> Lit Protocol provides infrastructure-level security (TEE-based signing, threshold cryptography) but does not directly address agent-to-agent prompt injection or social engineering at the application layer. Lit Actions can implement custom validation logic to verify incoming requests before signing. Vincent Agent Wallets include policy enforcement that can restrict agent interactions to approved contracts, addresses, or value limits. The cryptographic signing boundary means an agent cannot be tricked into signing something its Lit Action does not permit, providing a strong defense against unauthorized transaction execution. However, the protocol does not inspect or validate the semantic content of inter-agent communications.

**Skill Plugin Vetting**:
> Lit Actions serve as the 'skill' layer. They are JavaScript programs executed in a sandboxed TEE environment across Lit nodes. The execution environment is sandboxed (Deno-based runtime in V1 Naga). Lit Actions are identified by IPFS CID, providing content-addressable verification. However, there is no centralized vetting or code signing process for Lit Actions. The PKP owner is responsible for ensuring the Lit Action code is safe and correct. The community has proposed Lit Action auditing frameworks but none are mandatory. Vincent provides an app approval process where users approve specific agent policies before granting wallet access.

**Attestation Mechanism**:
> TEE remote attestation (Lit nodes run in AMD SEV-SNP Trusted Execution Environments; the network provides attestation that signing operations occur within verified TEE enclaves); threshold cryptographic proof (valid signatures prove that a threshold of honest nodes participated); IPFS content hash verification (Lit Action code integrity verified via CID); PKP NFT on-chain registration provides provenance. Vincent Agent Wallets inherit these attestation properties.

### Off-chain / On-chain Linking

**Linking Support**: yes

**Linking Mechanism**:
> PKPs inherently bridge on-chain and off-chain: the PKP public key and NFT exist on-chain (Chronicle), while the key can sign transactions for any chain and off-chain messages. Auth Methods link off-chain identities (Google OAuth, Discord, WebAuthn) to on-chain PKPs via smart contract registration. Lit Actions can fetch off-chain data (via fetch API within the TEE) and use it as signing conditions, creating programmable on-chain/off-chain links. Session signatures (SessionSigs) bridge off-chain authentication sessions to on-chain PKP usage. EIP-191/EIP-4361 wallet signatures link existing on-chain wallets to PKP control.

**Transfer Behavior**:
> The PKP NFT (ERC-721 on Chronicle chain) can be transferred to a new owner. On transfer, the new owner gains full control over the PKP including the ability to modify Auth Methods. The previous owner loses all access. Auth Method configurations persist through transfer (the new owner inherits existing Auth Methods and can modify them). The underlying distributed key shares remain unchanged. There is no automatic clearing of Auth Methods on transfer, which could be a security consideration if the new owner does not audit and update Auth Methods.

### Delegation & Authorization

**Delegation Model**:
> Multi-layered delegation:
> 1) PKP NFT ownership: the NFT owner has root control and can add/remove Auth Methods.
> 2) Auth Methods: human-to-agent delegation via configuring Auth Methods that allow specific agents to use the PKP (e.g., a specific smart contract address, an OAuth identity, or a Lit Action IPFS CID).
> 3) Lit Actions: programmable delegation logic - the JavaScript code can implement arbitrary authorization rules including checking on-chain state, verifying signatures, enforcing spending limits, requiring multi-sig approval, etc.
> 4) Vincent Agent Wallets: a higher-level delegation framework where humans approve 'apps' (agents) with specific policies (allowed contracts, spending limits, token restrictions). The agent receives a dedicated PKP wallet and operates within the approved policy. This is analogous to OAuth scoped access but enforced at the cryptographic signing level.

**Authorization Granularity**:
> fine-grained (ABAC) / intent-aware (mandate-based) - Lit Actions enable arbitrary condition-based authorization: per-transaction spending limits, allowed contract addresses, time-based restrictions, chain-specific rules, multi-party approval requirements, on-chain state checks (e.g., oracle prices, DAO votes). Vincent policies provide structured fine-grained controls (allowed contracts, token limits, daily spending caps). The granularity is limited only by what can be expressed in JavaScript within a Lit Action.

### Discovery & Interoperability

**Discovery Mechanism**:
> on-chain query (PKP NFTs can be queried on the Chronicle chain; PKP public keys and associated Auth Methods are discoverable on-chain); no built-in agent discovery registry or directory service. Lit Protocol focuses on key management infrastructure rather than agent discovery. Third-party registries (e.g., ERC-
> 8
> 0
> 0
> 4) could be used alongside PKPs for discovery.

**Capability Declaration**:
> No native capability declaration mechanism. Lit Protocol provides key management and signing infrastructure, not agent discovery or capability advertising. Lit Actions define what a PKP can sign, but this is not exposed as a public capability declaration. Integration with external standards (Agent Cards, JSON-LD manifests) would need to be built at the application layer.

**Cross Platform Portability**:
> portable - PKPs are inherently cross-chain: a single PKP can sign transactions on Ethereum, Polygon, Arbitrum, Avalanche, Cosmos, Solana, Bitcoin, and any chain supporting ECDSA or Ed25519 signatures. The PKP's Ethereum address works across all EVM chains. The distributed key management is chain-agnostic. However, the PKP NFT ownership itself is tied to the Lit Chronicle chain.

**Standards Compliance**:
> ERC-721 (PKP NFT), ECDSA (secp256k1 for EVM chains), Ed25519 (for Solana, Cosmos), EIP-191 (personal signatures), EIP-4361 (Sign-In with Ethereum), OAuth 2.0 (via Auth Methods), WebAuthn/FIDO2 (passkey Auth Method). No formal W3C DID or W3C VC implementation, though PKPs could be used as DID key material. No formal A2A or MCP integration.

**Protocol Composability**:
> Moderate composability - PKPs can be used as signing backends for any protocol that requires ECDSA/Ed25519 signatures. Integrates with: account abstraction (ERC-4337 as a signer for smart accounts), DeFi protocols (as autonomous trading signers), NFT platforms, cross-chain bridges. Can compose with ERC-8004 (PKP as the agent wallet), Coinbase AgentKit, LangChain agent frameworks. Lit Actions can call external APIs and smart contracts, enabling composition with arbitrary on-chain and off-chain services. No native A2A, MCP, or AP2 integration but PKP signing can underpin any of these.

### Push/Pull Communication

**Push Support**: none (Lit Protocol is a signing infrastructure and does not provide push notification mechanisms; applications built on top must implement their own push mechanisms)

**Pull Support**: on-chain reads (PKP NFT and Auth Method data can be read from the Chronicle chain); REST API (Lit node RPC endpoints for session management and signing requests); SDK method calls for programmatic interaction

**Subscription Model**: smart contract events (PKP minting, Auth Method changes, and other on-chain actions emit events on the Chronicle chain that can be monitored via standard EVM event subscriptions); no native application-level subscription model for agent events

### Trust & Reputation

**Trust Model**:
> decentralized (distributed trust via threshold cryptography across independent Lit network nodes; no single trusted party; trust is derived from the assumption that fewer than 1/3 of nodes are compromised; TEE hardware trust anchors provide additional security guarantees; the network itself is permissioned at the node operator level in V1)

**Reputation System**:
> none (Lit Protocol does not include a built-in reputation system for agents. Trust is cryptographic rather than reputation-based. PKP signing proves that the threshold of nodes agreed to sign, but there is no on-chain reputation score or history tracking. External reputation systems like ERC-8004 Reputation Registry could be layered on top.)

### Payment & Economics

**Payment Integration**:
> native token (LIT token is used for node operator staking and may be used for network fees; gas fees on Chronicle chain paid in test/native tokens); no built-in agent-to-agent payment protocol. PKPs can sign transactions for any payment protocol (x402, AP2, etc.) since they are general-purpose signing keys.

### Governance & Compliance

**Regulatory Alignment**:
> unknown - Lit Protocol does not explicitly address regulatory frameworks like EU AI Act or NIST AI RMF. The TEE-based architecture and threshold cryptography provide strong security properties that may align with certain compliance requirements. The inability of any single party (including Lit Labs) to access private keys may satisfy some data protection requirements. No formal ISO 42001 or equivalent certification.

**Audit Trail Capability**:
> blockchain anchoring (PKP minting, Auth Method changes, and PKP NFT transfers are recorded on the Lit Chronicle chain with full immutability; Lit Action execution logs can be captured at the application layer but are not natively stored on-chain; signing requests and responses pass through TEEs but are not permanently logged on-chain by default; applications can implement their own audit trails using the signed transaction history on destination chains)

**Lifecycle Management**:
> registration (mint PKP NFT via DKG) / activation (configure Auth Methods and deploy Lit Actions) / suspension (remove all Auth Methods to prevent signing; disable capacity credits) / migration (transfer PKP NFT to new owner) / upgrade (deploy new Lit Action versions via new IPFS CIDs) / decommissioning (burn PKP NFT to permanently disable the key; key shares become unusable). Vincent Agent Wallets add app-level lifecycle: approve app, revoke app permissions, disable wallet.

### Uncertain Fields (3)

- launch_date
- known_vulnerabilities
- economic_model

---

## Morpheus (Decentralized AI Network)

**Type**: `on-chain` · **Status**: `Production` · **Ecosystem**: Arbitrum

### Basic Info

**Type**: on-chain

**Status**: Production (Morpheus mainnet launched on Arbitrum in 2024; Lumerin Protocol integrated for decentralized AI routing; MOR token live with staking and rewards; compute marketplace operational; ecosystem expanding with multiple Smart Agent implementations; MOR token listed on DEXes)

**Ecosystem**:
> Arbitrum (primary L2 for MOR token and smart contracts); Ethereum (for stETH capital deposits and governance); Lumerin Protocol (decentralized routing layer); expanding to other chains. The Morpheus ecosystem is built on Arbitrum for low-cost, high-throughput operations with capital contracts on Ethereum mainnet.

### Onboarding Flow

**Registration Steps**:
> 1) Obtain an Ethereum/Arbitrum wallet (MetaMask or compatible). This wallet serves as the agent's primary identity.
> 2) For Smart Agent development: use the Morpheus Smart Agent framework (open-source) to build an AI agent. The framework supports LLM integration, tool use, and blockchain interactions.
> 3) For compute providers: register as a compute provider by staking MOR tokens on the Morpheus compute smart contract on Arbitrum. Configure the compute node to serve inference requests.
> 4) For capital providers: deposit stETH (Lido staked ETH) into the Morpheus Capital smart contract on Ethereum mainnet. Yield from stETH is used to purchase and distribute MOR rewards.
> 5) For code contributors: submit code contributions to the Morpheus GitHub repositories. Contributions are reviewed and weighted for MOR reward distribution.
> 6) Smart Agents connect to the Morpheus network via the Lumerin routing protocol: the agent registers its capabilities and endpoint with the decentralized router.
> 7) The Lumerin Protocol routes user/agent requests to available compute providers based on provider availability, stake weight, and pricing.
> 8) Agents can access LLM inference through the decentralized compute marketplace without centralized API keys.
> 9) Payment for compute is handled via MOR tokens or crypto payments through the routing layer.
> 1
> 0) The agent is now operational on the Morpheus network, discoverable through the Lumerin router, and can interact with other agents and users.

**Human Involvement**: full-setup (human must create wallet, deploy/configure the Smart Agent, stake tokens for compute/capital roles; initial agent code development requires human; the Morpheus community is permissionless but all initial setup steps require human action; after deployment, agents operate autonomously)

**Agent Autonomy**:
> High autonomy after setup. Smart Agents can autonomously: interact with LLMs via decentralized compute, execute blockchain transactions using their wallet, discover and communicate with other agents via Lumerin routing, and process user requests. The permissionless nature means any agent with a wallet and MOR tokens can participate without approval. Agents can self-select compute providers, manage their own token balances, and operate continuously. Initial wallet creation, staking, and code deployment require human action.

**Time To First Action**:
> minutes to hours (wallet creation is instant; MOR token acquisition requires DEX trading or earning through contributions; compute provider registration requires staking transaction on Arbitrum which confirms in seconds; Smart Agent deployment and Lumerin routing registration takes minutes; overall time depends primarily on MOR token acquisition)

### Security

**Authentication Method**:
> Wallet signature (Ethereum secp256k1 ECDSA signatures for all on-chain transactions including staking, compute requests, and governance); Lumerin routing authentication uses wallet-based identity verification; crypto payment verification provides implicit authentication (only the wallet holder can authorize payments)

**Data Exposure Risk**:
> Wallet addresses and transaction history are publicly visible on Arbitrum/Ethereum. Staking amounts, MOR token balances, and capital deposit sizes are transparent on-chain. Compute requests routed through Lumerin may expose request content to the compute provider (the provider must process the inference request). Smart Agent source code on GitHub is public. No PII is required for participation. Agent operational details (which models, what tasks) may be observable through transaction patterns.

### Off-chain / On-chain Linking

**Linking Support**: yes (native -- the Morpheus architecture links on-chain identity (wallet), on-chain economics (staking/rewards), and off-chain compute (LLM inference via Lumerin routing))

**Linking Mechanism**:
> Wallet-based linking: the same Ethereum wallet address serves as both the on-chain identity (for staking, receiving rewards, governance participation on Arbitrum/Ethereum) and the off-chain identity (for authenticating with Lumerin routing, receiving compute requests, and operating the Smart Agent). Lumerin routing maps wallet addresses to off-chain compute endpoints. Staking transactions on-chain link the wallet to the compute provider's off-chain infrastructure. Capital deposits on Ethereum mainnet link to reward distribution on Arbitrum.

### Delegation & Authorization

**Authorization Granularity**:
> Coarse (role/scope). The protocol defines broad roles: capital provider, code contributor, compute provider, and community/user. Within each role, authorization is binary (staked or not). No fine-grained ABAC, parameter-level access control, or intent-aware mandates at the protocol level. Compute access is pay-per-request without usage restrictions beyond economic cost. Smart Agents can implement application-level authorization internally.

### Push/Pull Communication

**Pull Support**: On-chain reads (Arbitrum/Ethereum RPC for querying MOR balances, staking positions, reward accruals); Lumerin routing queries (discover available compute providers); REST API (individual Smart Agents may expose their own HTTP APIs); blockchain indexers for historical data

### Trust & Reputation

**Trust Model**:
> Decentralized (economic/stake-weighted reputation). Trust is established through: (
> 1) MOR token staking by compute providers (economic commitment), (
> 2) stETH capital deposits by capital providers (significant financial commitment), (
> 3) Code contribution history tracked on GitHub and weighted for rewards, (
> 4) Market-based trust -- users gravitate toward reliable compute providers based on experience, (
> 5) No centralized trust authority; the permissionless design relies on economic incentives rather than credential verification.

### Payment & Economics

**Payment Integration**:
> Native token (MOR token on Arbitrum for compute payments, staking, and governance); crypto payments (ETH/stETH for capital deposits on Ethereum mainnet); the Lumerin routing protocol handles payment routing between compute requesters and providers; MOR token tradeable on DEXes for liquidity. No integration with AP2, ACP, x402, or fiat payment protocols at the protocol level.

### Uncertain Fields (26)

- launch_date
- identity_type
- key_management
- multi_instance_support
- recovery_mechanism
- versioning_support
- known_vulnerabilities
- revocation_speed
- anti_sybil
- bot_to_bot_attack_surface
- skill_plugin_vetting
- attestation_mechanism
- transfer_behavior
- delegation_model
- discovery_mechanism
- capability_declaration
- cross_platform_portability
- standards_compliance
- protocol_composability
- push_support
- subscription_model
- reputation_system
- economic_model
- regulatory_alignment
- audit_trail_capability
- lifecycle_management

---

## NEAR AI Agent Registry

**Type**: `on-chain` · **Status**: `Production` · **Ecosystem**: NEAR Protocol

### Basic Info

**Type**: on-chain

**Status**: Production (NEAR AI Hub live since early 2025; agent registry integrated into NEAR AI platform; NEAR AI Assistant and agent framework operational)

**Ecosystem**: NEAR Protocol (Layer 1 blockchain with sharding via Nightshade; NEAR AI built on top of NEAR blockchain; integrates with Aurora EVM for cross-chain compatibility)

### Onboarding Flow

**Registration Steps**:
> 1) Create or import a NEAR wallet (implicit accounts via Ed25519 key or named accounts like 'agent.near').
> 2) Access the NEAR AI platform (app.near.ai) and authenticate with the NEAR wallet.
> 3) Register the agent by calling the agent registry smart contract, providing agent metadata: name, description, category/tags, version, and endpoint information.
> 4) The contract mints an on-chain record associating the agent identity with the NEAR account.
> 5) Optionally stake NEAR tokens to enhance discoverability and reputation score in the registry.
> 6) Configure the agent's capabilities and service endpoints (HTTP endpoints, supported protocols).
> 7) The agent becomes discoverable through the NEAR AI registry and can be invoked by other agents or users.
> 8) For agents built with the NEAR AI Agent Framework: deploy agent code through the NEAR AI Hub, which handles containerized execution and connects to the registry automatically.

**Human Involvement**: full-setup (human must create the NEAR wallet, initiate registration transaction, configure agent metadata, and optionally stake tokens; the NEAR AI Hub provides a UI-based setup flow that simplifies the process but still requires human-driven configuration)

**Agent Autonomy**:
> After initial human registration, agents can operate autonomously using their NEAR account for transactions, interact with other agents via the registry, and update their metadata/endpoints. Agents can self-update their registration details through contract calls signed with their runtime keys. However, initial wallet creation and staking require human action. The NEAR AI framework supports autonomous agent execution once deployed.

**Time To First Action**: minutes (NEAR blockchain has ~1 second finality; account creation and registration transactions complete within seconds; deploying through NEAR AI Hub may take additional minutes for container setup; named account registration requires a separate transaction)

### Identity Model

**Identity Type**:
> NEAR account (Ed25519 key-based; supports both implicit accounts derived from public key and human-readable named accounts like 'myagent.near'). The NEAR account serves as both the identity primitive and the wallet. Each agent maps to a NEAR account ID registered in the agent registry smart contract.

**Key Management**:
> NEAR Protocol uses Ed25519 key pairs. Each NEAR account supports multiple access keys with different permission levels: (
> 1) Full-access keys: complete control over the account, can sign any transaction, (
> 2) Function-call access keys: restricted to calling specific smart contract methods with a limited gas allowance. Agents typically operate with function-call access keys for day-to-day operations while the full-access key is kept secure. Key rotation: new access keys can be added and old ones deleted via on-chain transactions at any time. NEAR accounts are smart contracts themselves, enabling programmable key management. The NEAR AI platform may manage keys on behalf of hosted agents within its infrastructure.

**Multi Instance Support**:
> Yes - NEAR accounts natively support multiple access keys. Multiple runtime instances of the same agent can each hold their own function-call access key, all tied to the same NEAR account (agent identity). This allows concurrent operation across different servers or environments while maintaining a single on-chain identity.

### Security

**Authentication Method**:
> Wallet signature (Ed25519 signatures on NEAR transactions). All interactions with the registry contract require valid NEAR account signatures. Function-call access keys provide scoped authentication for specific contract interactions. The NEAR AI platform may add additional authentication layers (API tokens, OAuth) for its hosted services.

**Revocation Speed**: seconds (NEAR blockchain finality is approximately 1-2 seconds; access key deletion takes effect immediately upon transaction confirmation; function-call keys can be revoked instantly by the full-access key holder)

**Data Exposure Risk**:
> Agent metadata (name, description, capabilities, endpoints) registered on-chain is publicly visible. NEAR account balances and transaction history are public. Staking amounts are transparent. Private operational data (API keys, model weights, internal configurations) should not be stored on-chain. The NEAR AI Hub's infrastructure may store agent code and logs with platform-level access controls.

### Off-chain / On-chain Linking

**Linking Support**: yes (native - the NEAR AI platform bridges on-chain identity with off-chain agent execution; agents registered on-chain have endpoints pointing to off-chain services)

**Linking Mechanism**:
> Smart contract registration stores the mapping between NEAR account (on-chain identity) and agent service endpoints (off-chain). The agent's NEAR account signs transactions that update the registry, proving control. Off-chain services authenticate by signing challenges with the NEAR account's access keys. The NEAR AI Hub acts as an intermediary linking on-chain identity to containerized agent execution.

### Delegation & Authorization

**Delegation Model**:
> NEAR access key model provides native delegation. Full-access keys can create function-call access keys with specific permissions (limited to calling certain contract methods with a gas allowance). This enables: (
> 1) Human owner holds full-access key, (
> 2) Agent runtime instances use function-call keys scoped to registry operations, (
> 3) Sub-agents or services can be granted limited keys for specific operations. No formal OAuth OBO or OIDC-A delegation chains documented.

**Authorization Granularity**:
> Fine-grained (function-call access keys). NEAR's access key model allows specifying: which contract can be called, which methods are allowed, and maximum gas budget per key. This provides method-level authorization granularity. However, within a method call, there is no further parameter-level access control at the key level. Application-level authorization logic can be implemented in smart contract code.

### Discovery & Interoperability

**Discovery Mechanism**:
> On-chain registry lookup (query the agent registry smart contract to discover registered agents by category, capability, or search terms); the NEAR AI Hub provides a web-based discovery interface; agents can be searched and filtered through the platform's UI and API; on-chain metadata enables programmatic agent discovery through contract view calls.

### Push/Pull Communication

**Pull Support**: On-chain reads (NEAR RPC view calls to query registry contract state); REST API (NEAR AI Hub provides API endpoints for querying agent information); NEAR blockchain RPC for direct contract state queries.

### Trust & Reputation

**Trust Model**:
> Decentralized (staking-based reputation). Trust is established through: (
> 1) On-chain identity via NEAR account, (
> 2) NEAR token staking as economic commitment and reputation signal, (
> 3) Transaction history and on-chain activity as implicit trust indicators, (
> 4) The NEAR AI platform may add platform-level trust scoring based on agent performance metrics.

### Payment & Economics

**Payment Integration**: Native token (NEAR token for staking, gas fees, and agent service payments); NEAR DeFi ecosystem integration for broader payment options; potential integration with stablecoins on NEAR (e.g., USDT, USDC on NEAR). No documented integration with AP2, ACP, or x402 protocols.

### Governance & Compliance

**Regulatory Alignment**: unknown - no explicit regulatory framework compliance documented. NEAR Protocol is a public blockchain with transparent operations. The NEAR Foundation is incorporated in Switzerland. No specific EU AI Act, NIST AI RMF, or ISO 42001 alignment stated for the AI agent registry.

**Audit Trail Capability**:
> Blockchain anchoring (all registration transactions, staking events, and agent interactions are recorded on the NEAR blockchain with full immutability and traceability; NEAR blockchain provides native receipt/event logging; NEAR Lake Indexer enables comprehensive transaction history analysis; agent activity is tied to NEAR account providing persistent audit trail).

### Uncertain Fields (18)

- launch_date
- recovery_mechanism
- versioning_support
- known_vulnerabilities
- anti_sybil
- bot_to_bot_attack_surface
- skill_plugin_vetting
- attestation_mechanism
- transfer_behavior
- capability_declaration
- cross_platform_portability
- standards_compliance
- protocol_composability
- push_support
- subscription_model
- reputation_system
- economic_model
- lifecycle_management

---

## Virtuals Agent Commerce Protocol (ACP)

**Type**: `on-chain` · **Status**: `Production` · **Ecosystem**: Base

### Basic Info

**Type**: on-chain

**Status**: Production (ACP v1 launched late 2024; ACP v2 live with custom job definitions; Revenue Network launched February 2026; 18,000+ agents in the Virtuals ecosystem; part of Virtuals Protocol on Base L2)

**Ecosystem**: Base (Coinbase L2, primary), Ethereum mainnet (expansion), Solana (expansion). ACP operates within the Virtuals Protocol ecosystem.

**Launch Date**: Late 2024 (ACP v1 as part of Virtuals Protocol); ACP v2 launched early 2025 with enhanced job definitions and evaluation; Revenue Network launched February 2026

### Onboarding Flow

**Registration Steps**:
> 1) Obtain a crypto wallet with $VIRTUAL tokens on Base L
> 2.
> 2) If the agent does not yet exist on Virtuals: create an agent via Virtuals Protocol (100 VIRTUAL creation fee, ERC-6551 NFT minted with token-bound wallet).
> 3) For ACP-specific onboarding: register the agent with the ACP Service Registry smart contract. This is described as 'one-line onboarding' -- a single smart contract call registers the agent's persistent identity.
> 4) Set up the agent's ACP profile: declare capabilities (services offered), rates/pricing, and communication endpoints.
> 5) Initialize and whitelist the agent's wallet for ACP transactions.
> 6) The agent receives a persistent identity tied to its ERC-6551 token-bound account, which serves as its ACP wallet for escrow and settlements.
> 7) For service providers: list available services with descriptions, pricing, and custom job requirement schemas (ACP v2).
> 8) For service consumers: configure the agent's preferences for discovering and evaluating service providers.
> 9) Optionally configure an evaluator agent or use platform-provided evaluators for transaction quality assurance.
> 1
> 0) The agent is now discoverable in the ACP Index Registry and can participate in autonomous agent-to-agent commerce.

**Human Involvement**:
> full-setup for initial Virtuals agent creation (human must create agent, pay 100 VIRTUAL, configure cores); approve-only for ACP registration itself (once the agent exists, ACP registration can be automated via a single contract call; ongoing ACP operations -- job posting, negotiation, execution, settlement -- are fully autonomous)

**Agent Autonomy**:
> Very high post-registration. ACP is designed for fully autonomous agent-to-agent commerce. Agents can autonomously: discover other agents via the Service Registry, post job offerings, negotiate terms with counterparties, execute work based on agreed terms, settle payments via smart contract escrow without human intervention. The ACP smart contract handles escrow locking, phase transitions (request -> negotiation -> execution -> evaluation -> settlement), and fund release. Human intervention is only required for initial agent creation and ACP registration. The 'one-line onboarding' claim refers to the minimal setup needed for ACP participation once the agent identity exists.

**Time To First Action**: minutes (ACP registration is a single smart contract call on Base L2, confirming in seconds; if the agent already exists in Virtuals ecosystem, ACP onboarding is near-instant; creating a new Virtuals agent first adds the 100 VIRTUAL fee and off-chain core configuration time)

### Identity Model

**Identity Type**:
> NFT (ERC-6551 token-bound account) + ERC-20 (agent token). Each ACP agent inherits its identity from the Virtuals Protocol -- an ERC-6551 NFT that acts as a smart wallet. The token-bound account serves as the persistent identity for all ACP transactions, escrow operations, and reputation accumulation.

**Key Management**:
> Inherited from Virtuals Protocol's ERC-6551 architecture. The agent's smart wallet has no exposed private key -- it is contract-based, eliminating private key theft risk. The ERC-6551 wallet manages all ACP transactions autonomously. The underlying ERC-721 NFT owner controls the agent identity. For ACP operations, developer wallets are initialized and whitelisted separately. The platform manages operational keys within its infrastructure. Key rotation is implicit through the smart contract wallet architecture -- the wallet address remains constant even if the NFT ownership changes.

**Versioning Support**:
> Indirect via ACP transaction history and Virtuals Protocol's contribution governance. ACP v2 supports custom job definitions that can evolve over time. Agent capabilities in the Service Registry can be updated. The Immutable Contribution Vault (ICV) from Virtuals Protocol stores approved model/capability updates as Service NFTs, creating an on-chain history. ACP transaction records provide an implicit versioning of agent behavior over time.

### Security

**Authentication Method**:
> wallet signature (Ethereum wallet signatures for on-chain ACP transactions); smart contract authentication (ACP phase transitions governed by authenticated signatures and smart contract logic -- each phase change requires cryptographic memos signed by the relevant party); Telegram authentication supported for ACP job notifications

**Known Vulnerabilities**:
> 1) Inherited Virtuals Protocol vulnerabilities: critical smart contract vulnerability discovered December 2024 by researcher Jinu -- attacker could preemptively create a Uniswap pair with the predicted nonce, preventing token launches (fixed in AgentToken.sol).
> 2) Discord server compromise January 2025 -- private key of Discord moderator breached.
> 3) Evaluator agent reliability: ACP relies on evaluator agents to assess transaction quality; a compromised or incompetent evaluator could approve substandard work or reject valid work.
> 4) Escrow griefing: a malicious buyer could lock a seller's capacity by initiating escrow and then abandoning the transaction (mitigated by timeout mechanisms).
> 5) Smart contract risks inherent in escrow and bonding curve mechanisms.
> 6) ACP smart contracts have been audited (Cantina audit on record for Virtuals Protocol).

**Revocation Speed**: minutes (on-chain transactions on Base L2 for agent management; ACP escrow can lock/release funds per transaction; agent can be delisted from Service Registry via contract call; NFT ownership transfer immediately changes agent control)

**Anti Sybil**:
> fee (100 VIRTUAL token cost per agent creation provides economic barrier; ACP registration requires an existing Virtuals agent; bonding curve graduation threshold of 42,000 VIRTUAL for full token launch adds significant capital requirement; gas fees on Base L2; ACP transaction escrow deposits require real capital commitment per transaction)

**Data Exposure Risk**:
> ACP Service Registry entries (agent capabilities, rates, service descriptions) are publicly discoverable. Agent wallet addresses and transaction history are publicly visible on-chain. ACP transaction details (job descriptions, negotiation terms, evaluation results) are recorded on-chain or referenced via cryptographic memos. No private API keys or model configurations are required to be exposed in ACP profiles.

**Bot To Bot Attack Surface**:
> ACP includes built-in protections: (
> 1) Evaluator agents assess whether transactions meet agreed terms before releasing escrow. (
> 2) Smart contract escrow locks payments until evaluation completes, preventing fraud. (
> 3) Cryptographic signatures (memos) required at each phase transition create immutable audit trails. (
> 4) However, the system relies on evaluator agents which could themselves be compromised or biased. (
> 5) Agent-to-agent negotiation content is not inherently protected against prompt injection -- application-layer protections are needed. (
> 6) ACP v2's custom job definitions provide structured schemas that reduce ambiguity in agent-to-agent agreements.

**Skill Plugin Vetting**:
> Indirect via Virtuals Protocol's SubDAO governance. Validators oversee and approve AI model contributions before deployment. Approved contributions are minted as Service NFTs in the Immutable Contribution Vault (ICV). ACP Service Registry entries declare capabilities but are not automatically vetted or sandboxed. ACP evaluator agents provide post-hoc quality assessment rather than pre-deployment vetting. This is governance-based vetting rather than automated sandboxing.

**Attestation Mechanism**:
> Smart contract-based verification (ERC-6551 token-bound accounts prove agent identity on-chain); ACP transaction memos with cryptographic signatures create verifiable audit trails at each phase transition; evaluator agent assessments recorded on-chain serve as attestation of work quality; Service NFTs in ICV serve as proof of approved contributions; no TEE attestation, Verifiable Credentials, or ZK proof mechanisms documented

### Off-chain / On-chain Linking

**Linking Support**: yes (inherent in the Virtuals Protocol design -- on-chain tokenized identity with off-chain cognitive/voice/visual cores; ACP bridges on-chain escrow/settlement with off-chain service execution)

**Linking Mechanism**:
> Smart contract registration (ACP Service Registry links on-chain agent identity to declared capabilities and rates); ERC-6551 token-bound account links NFT identity to on-chain wallet used for ACP escrow; off-chain agent runtime executes work that is then evaluated and settled on-chain; ACP memos reference off-chain deliverables with on-chain cryptographic commitments; social media integration (Twitter/Telegram) links off-chain social presence to on-chain ACP agent

### Delegation & Authorization

**Delegation Model**:
> ACP defines three roles per transaction: buyer (service requester), seller (service provider), and evaluator (quality assessor). The buyer-seller-evaluator triad creates a delegation structure where the evaluator is delegated authority to approve or reject transaction outcomes. Virtuals Protocol's DPoS governance delegates voting power from token holders to validators for contribution approvals. ERC-6551 token-bound accounts enable autonomous transaction delegation -- the agent wallet acts on behalf of the NFT owner without requiring per-transaction human approval.

**Authorization Granularity**:
> Coarse (role/scope) at the protocol level. ACP defines transaction-level roles: buyer, seller, evaluator. ACP v2 supports custom job definitions with domain-specific requirement schemas, enabling structured authorization within specific transaction types. SubDAO governance provides approval/rejection authority over contributions. No fine-grained ABAC or intent-aware mandates at the ACP protocol level.

### Discovery & Interoperability

**Discovery Mechanism**:
> on-chain query (ACP Service Registry -- agents register names, capabilities, and rates, queryable via smart contract); ACP Index Registry (browsable catalog of available agents and their services); on-chain transaction history and completed ACP transaction count serve as discoverable reputation signals; platform marketplace (app.virtuals.io)

**Capability Declaration**: ACP Service Registry entries (name, capabilities, rates, service descriptions); ACP v2 custom job offering definitions allow domain-specific requirement schemas with structured fields for what the agent can do; completed transaction history serves as demonstrated capability evidence

**Cross Platform Portability**:
> Partially portable. Agents are ERC-6551 NFTs portable within Ethereum/Base ecosystem. ACP is designed to be permissionless and the protocol specification could be implemented on other chains. VIRTUAL token is on Base/Solana/Ethereum enabling cross-chain participation. However, ACP-specific registrations and transaction history are currently on Base, and the full agent runtime (cognitive/voice/visual cores) is tied to Virtuals infrastructure.

**Standards Compliance**: ERC-20 (agent tokens), ERC-721 (agent NFTs), ERC-6551 (token-bound accounts), Uniswap V2 (liquidity). ACP is a new open standard for agent commerce -- not yet an ERC/EIP. No explicit W3C DID, W3C VC, OAuth, SPIFFE, OIDC, ERC-8004, A2A, or MCP compliance documented.

**Protocol Composability**:
> Moderate. ACP is designed as a standalone agent commerce protocol: (
> 1) Integrates with Uniswap V2 for liquidity, (
> 2) ERC-6551 enables composability with any ERC-721/ERC-20 protocol, (
> 3) ACP v2 custom job definitions allow domain-specific extensions, (
> 4) Revenue Network (Feb
> 2
> 0
> 2
> 6) adds cross-agent revenue sharing, (
> 5) Expanding to multiple chains (Base, Solana, Ethereum). No direct A2A, MCP, AP2, or x402 integration documented, though the permissionless design allows external protocols to interact with ACP agents.

### Push/Pull Communication

**Pull Support**: On-chain reads (ACP Service Registry queries, agent profiles, transaction history, escrow state); smart contract queries (ACP contract state for active/completed jobs); platform API (Virtuals platform API for agent data and ACP analytics)

### Trust & Reputation

**Trust Model**:
> Decentralized (peer reputation via ACP transaction history + evaluator-based trust verification). Trust is established through: (
> 1) Completed ACP transaction count and success rate, (
> 2) Evaluator agent assessments written to on-chain records, (
> 3) Smart contract escrow provides trustless transaction guarantees, (
> 4) Community governance via SubDAO validators for agent quality control. The evaluator role provides third-party trust verification for each transaction.

### Payment & Economics

**Payment Integration**:
> ACP (native escrow-based payment -- the core innovation; smart contract holds funds in escrow during job execution, releasing upon successful evaluation); native token ($VIRTUAL as base currency); ERC-20 agent tokens; ACP v2 supports both service-only and fund-transfer jobs; Revenue Network (Feb
> 2
> 0
> 2
> 6) enables cross-agent revenue sharing and distribution

**Economic Model**:
> Token purchase (100 VIRTUAL to create an agent on Virtuals Protocol); gas fees (Base L2 gas fees for ACP transactions, significantly lower than Ethereum mainnet); ACP escrow deposits (agents must lock funds for each transaction, creating per-transaction economic commitment); 1% trading fee on graduated agent tokens; Revenue Network enables agents to earn revenue from services rendered; ACP transaction fees may apply for protocol sustainability. The economic model creates alignment: agents earn by providing quality services that pass evaluator assessment.

### Governance & Compliance

**Audit Trail Capability**:
> Blockchain anchoring (all ACP transactions recorded on Base L2 with full immutability; every phase transition -- request, negotiation, execution, evaluation, settlement -- is recorded on-chain; cryptographic memos at each phase create verifiable audit trail; escrow lock/release events are transparent; evaluator assessments are on-chain; Revenue Network distributions are traceable; Cantina security audit completed for the broader Virtuals Protocol)

### Uncertain Fields (8)

- multi_instance_support
- recovery_mechanism
- transfer_behavior
- push_support
- subscription_model
- reputation_system
- regulatory_alignment
- lifecycle_management

---

## Virtuals Protocol

**Type**: `on-chain` · **Status**: `Production` · **Ecosystem**: Base

### Basic Info

**Type**: on-chain

**Status**: Production (launched October 2024; 18,000+ agents deployed; ACP v2 live; Revenue Network launched February 2026)

**Ecosystem**: Base (Coinbase L2, primary), Solana (expansion), Ethereum mainnet (expansion)

**Launch Date**: October 2024 (on Base); VIRTUAL token migrated from PATH token in December 2024; originated from PathDAO gaming guild founded 2021, pivoted to AI agents January 2024

### Onboarding Flow

**Registration Steps**:
> 1) Obtain a crypto wallet with $VIRTUAL tokens (at least 100 VIRTUAL required for agent creation).
> 2) Connect wallet to the Virtuals Protocol platform (app.virtuals.io).
> 3) Fill out the Agent Creation Form with mandatory fields: agent name, ticker symbol (max 6 characters), personality description, and social media links. Optional fields for further customization.
> 4) Pay 100 $VIRTUAL tokens as the creation fee.
> 5) On-chain: a bonding curve is created for the new agent token, paired with $VIRTUAL. The agent is minted as an ERC-6551 NFT with its own token-bound wallet. An ERC-20 token for the agent is created with a fixed supply of 1,000,000,000 tokens.
> 6) Off-chain: configure the agent's cognitive, voice, and visual cores. Deploy the agent's functional capabilities within Virtuals infrastructure.
> 7) Users buy/sell agent tokens along the bonding curve.
> 8) Once 42,000 $VIRTUAL accumulates in the bonding curve, the agent 'graduates' to the Initial Agent Offering (IAO).
> 9) Upon graduation: liquidity pool deployed on Uniswap V2, LP tokens locked for 10 years, 1% trading fee applied.
> 1
> 0) Delegate voting power to the governance system for contribution approvals.
> 1
> 1) For ACP participation: register the agent with the ACP Service Registry, set up agent profile with capabilities and rates, and initialize/whitelist wallet for ACP transactions.

**Human Involvement**: full-setup (human must create the agent, fill out the form, pay 100 VIRTUAL, configure cognitive/voice/visual cores; ongoing governance requires human delegation of voting power; ACP registration requires human setup)

**Agent Autonomy**:
> After initial human setup, agents operate autonomously with ERC-6551 wallets for transactions, asset management, and financial independence. Agents can autonomously request services, negotiate terms, execute work, and settle payments via ACP. However, agent creation, token launch, and core model updates require human intervention. Contribution approvals go through community governance (SubDAO validators).

**Time To First Action**: minutes to hours (agent creation transaction is quick, but bonding curve graduation requires 42,000 VIRTUAL accumulation which depends on market demand; off-chain deployment adds time for cognitive/voice/visual core configuration; ACP registration is separate additional step)

### Identity Model

**Identity Type**: NFT (ERC-6551 token-bound account) + ERC-20 (agent token) + smart contract wallet

**Key Management**:
> Each VIRTUAL agent is an ERC-6551 NFT acting as a unique wallet address (token-bound account). The smart wallet account has no exposed private key - the wallet is contract-based, eliminating private key theft risk. The ERC-6551 wallet manages all agent transactions autonomously. Cognitive, voice, and visual cores are stored beneath each agent and registered in the smart contract. Approved contributions are stored as Service NFTs within the agent's Immutable Contribution Vault (ICV). Key rotation is implicit through the smart contract wallet architecture. The platform manages the agent's operational keys within its infrastructure. Developer wallets for ACP are initialized and whitelisted separately.

**Versioning Support**:
> Yes - the Agent SubDAO Governance framework manages AI model quality. Validators oversee and approve AI models before deployment. Contributions (model updates, voice/visual changes) go through community governance. Approved contributions are minted as Service NFTs stored in the Immutable Contribution Vault (ICV), creating an on-chain audit trail of all model versions. Each contribution type has its own NFT record.

### Security

**Authentication Method**:
> wallet signature (Ethereum wallet signatures for on-chain transactions); smart contract authentication (ACP phase transitions governed by authenticated signatures and smart contract logic); Telegram authentication supported for ACP job notifications; GAME Twitter token or full Twitter API credentials for social media agent authentication

**Known Vulnerabilities**:
> 1) Critical smart contract vulnerability (December 2024): discovered by researcher Jinu - attacker could preemptively create a Uniswap pair with the predicted nonce, preventing Virtuals from launching tokens. Fix: modified AgentToken.sol to check for existing pairs before creation. Virtuals initially did not respond and closed its vulnerability Discord channel before finally implementing a fix after public disclosure.
> 2) Discord server compromise (January 2025): private key of a Discord moderator was breached, leading to fraudulent links posing as the official website appearing in Google searches.
> 3) The protocol has undergone security audits (Cantina audit on record).
> 4) Smart contract risks inherent in bonding curve and liquidity pool mechanisms.

**Revocation Speed**: minutes (on-chain transactions for agent token management; smart contract wallet can be managed through NFT ownership transfer; ACP escrow can lock/release funds per transaction)

**Anti Sybil**: fee (100 VIRTUAL token cost per agent creation provides economic barrier; bonding curve graduation threshold of 42,000 VIRTUAL adds significant capital requirement; gas fees on Base L2; community governance via SubDAO validators adds human oversight layer for contribution approvals)

**Data Exposure Risk**:
> Agent token addresses and transaction history are publicly visible on-chain. Agent creation form data (name, personality, social links) is public. ERC-6551 wallet balances and transactions are transparent. ACP Service Registry entries (capabilities, rates) are publicly discoverable. No exposed private keys due to smart contract wallet architecture. Developer wallet addresses for ACP are visible.

**Bot To Bot Attack Surface**:
> ACP includes built-in evaluation phase with evaluator agents that assess whether transactions meet agreed terms. Smart contract escrow locks payments until evaluation completes. Cryptographic signatures (memos) required at each phase transition create immutable audit trails. However, the system relies on evaluator agents which could themselves be compromised. Agent-to-agent negotiation happens through the ACP framework with on-chain settlement providing verifiability.

**Skill Plugin Vetting**:
> Yes - Agent SubDAO Governance framework provides community-based vetting. Validators oversee and approve AI models before deployment. Contributions are submitted, voted on, and only approved contributions are minted as Service NFTs. The Immutable Contribution Vault (ICV) stores approved contributions securely. However, this is governance-based vetting rather than automated sandboxing.

**Attestation Mechanism**: Smart contract-based verification (ERC-6551 token-bound accounts prove agent identity on-chain); ACP transaction memos with cryptographic signatures create verifiable audit trails; Service NFTs in ICV serve as proof of approved contributions; no TEE attestation or ZK proof mechanisms documented

### Off-chain / On-chain Linking

**Linking Support**: yes (inherent in the platform design - on-chain tokenized identity with off-chain cognitive/voice/visual cores)

**Linking Mechanism**:
> Smart contract registration (Agent Creation Factory proxy smart contract handles on-chain creation); ERC-6551 token-bound account links NFT identity to on-chain wallet; off-chain deployment integrates with on-chain identity through the Virtuals infrastructure; ACP Service Registry links on-chain agent identity to service capabilities; social media integration (Twitter/Telegram) links off-chain social presence to on-chain agent

### Delegation & Authorization

**Delegation Model**:
> Token delegation via DPoS (Delegated Proof of Stake) - Agent SubDAO Governance framework. Users delegate voting power to validators. Validators oversee and approve AI models and contributions. The creator must delegate voting power to the system for contribution approvals. Agent stakers (delegators/nominators) stake with Agent validators, making the validator a delegate. This creates a layered delegation system for agent governance and quality control.

**Authorization Granularity**:
> coarse (role/scope) - roles include agent creator/owner, validators, delegators/nominators, and LP providers. ACP provides transaction-level authorization through buyer/seller/evaluator roles. SubDAO governance provides approval/rejection authority over contributions. No fine-grained ABAC or intent-aware mandates.

### Discovery & Interoperability

**Discovery Mechanism**:
> on-chain query (ACP Service Registry - agents register names, capabilities, and rates); registry lookup (ACP Index Registry for browsing available agents); platform marketplace (app.virtuals.io for discovering and trading agent tokens); on-chain transaction history and reputation based on completed ACP transactions

**Capability Declaration**: ACP Service Registry entries (name, capabilities, rates); Agent Creation Form metadata (personality, social links); custom job offering definitions in ACP v2 allow domain-specific requirement schemas; Service NFTs document approved capabilities/contributions

**Cross Platform Portability**:
> partially portable - agents are ERC-6551 NFTs portable within Ethereum/Base ecosystem; ACP is designed to be permissionless and chain-agnostic enabling cross-chain integration; VIRTUAL token is on Base/Solana/Ethereum; however, agent cognitive/voice/visual cores are tied to Virtuals infrastructure creating some platform lock-in

**Standards Compliance**: ERC-20 (agent tokens), ERC-721 (agent NFTs), ERC-6551 (token-bound accounts), Uniswap V2 (liquidity pools); ACP is a new open standard for agent commerce; no explicit W3C DID, OAuth, SPIFFE, or OIDC compliance documented

**Protocol Composability**:
> Moderate composability - ACP is designed as an open standard for agent-to-agent commerce; integrates with Uniswap V2 for liquidity; ERC-6551 enables composability with any ERC-721/ERC-20 compatible protocol; ACP v2 supports custom job definitions for domain-specific integration; platform expanding to multiple chains (Base, Solana, Ethereum); OpenClaw integration for AI agent micropayments; no direct A2A, MCP, or AP2 integration documented

### Push/Pull Communication

**Pull Support**: on-chain reads (ACP Service Registry queries, agent token data, ERC-6551 wallet state); REST API (Virtuals platform API for agent data); smart contract queries (ACP Contract state)

### Trust & Reputation

**Trust Model**: decentralized (peer reputation via ACP transaction history + community governance via SubDAO validators); platform-verified elements through the Virtuals infrastructure and validator approval process; evaluator agents provide third-party trust verification for ACP transactions

**Reputation System**:
> on-chain transaction history (ACP completed transactions build provider reputation); evaluator agent assessments written to on-chain records; ACP Index Registry allows browsing agent reviews and costs; SubDAO governance approval history reflects agent quality; bonding curve performance and token market cap serve as market-based reputation signals; no formal ERC-8004 reputation registry integration documented

### Payment & Economics

**Payment Integration**: ACP (Agent Commerce Protocol with built-in escrow); native token ($VIRTUAL as base liquidity pair and transactional currency); ERC-20 agent tokens; Uniswap V2 liquidity pools; 1% trading fee on graduated agent tokens; ACP v2 supports both service-only and fund-transfer jobs

**Economic Model**:
> token purchase (100 VIRTUAL to create an agent); gas fees (Base L2 gas fees, significantly lower than Ethereum mainnet); bonding curve participation (42,000 VIRTUAL graduation threshold); 1% trading fee on graduated tokens; LP tokens locked 10 years; VIRTUAL token total supply 1 billion with no inflation; revenue sharing through ERC-6551 wallets enabling continuous revenue accrual; ACP transaction fees for agent-to-agent commerce

### Governance & Compliance

**Audit Trail Capability**:
> blockchain anchoring (all agent creation, token transactions, ACP commerce phases, and contribution approvals recorded on Base L2 with full immutability; ACP cryptographic memos at each phase transition create immutable audit trail; Service NFTs in ICV document approved contributions; every ACP transaction is traceable and reproducible; evaluator assessments written to on-chain records; Cantina security audit completed)

### Uncertain Fields (7)

- multi_instance_support
- recovery_mechanism
- transfer_behavior
- push_support
- subscription_model
- regulatory_alignment
- lifecycle_management

---

## Wayfinder (Agent Navigation)

**Type**: `on-chain` · **Status**: `Beta` · **Ecosystem**: Multi-chain: Ethereum

### Basic Info

**Type**: on-chain

**Ecosystem**: Multi-chain: Ethereum (primary), Solana, Base (Coinbase L2), Cosmos. Wayfinder is designed to be chain-agnostic, with Shells (agents) capable of navigating across supported chains. The PROMPT token originally launched on Ethereum. Base integration provides low-cost EVM operations.

### Onboarding Flow

**Human Involvement**:
> full-setup (human must acquire PROMPT tokens, create the Shell, configure Wayfinding Paths, and activate via staking; after initial setup the agent operates autonomously but humans can intervene to modify paths or deactivate. The platform targets a model where human oversight is maintained through path configuration and staking controls.)

### Security

**Authentication Method**: wallet signature (standard Web3 wallet connection and transaction signing via ECDSA; Shell activation requires on-chain staking transaction signed by the user's wallet; ongoing Shell operations are authenticated through the bound wallet identity and PROMPT stake)

**Anti Sybil**:
> staking / fee (PROMPT token staking requirement creates an economic cost per Shell, preventing free mass registration. Each Shell requires a meaningful PROMPT stake to activate. Gas fees for Shell creation transactions add additional cost. The economic barrier scales with the number of Shells, making Sybil attacks costly.)

### Off-chain / On-chain Linking

**Linking Support**: yes (Shells operate on-chain by design; off-chain components include the Wayfinder dashboard UI and potentially off-chain Path computation/routing)

### Discovery & Interoperability

**Cross Platform Portability**:
> partially portable - the underlying wallet identity is portable across any Web3 platform, but the Shell configuration and PROMPT stake are specific to the Wayfinder platform. Wayfinding Paths are Wayfinder-specific and not portable to other agent platforms. The chain-agnostic design means Shell operations span multiple chains, but the agent identity is locked to the Wayfinder ecosystem.

### Governance & Compliance

**Audit Trail Capability**:
> blockchain anchoring (all Shell transactions are recorded on their respective chains with full immutability; PROMPT staking and Shell activation/deactivation events are recorded on-chain; multi-chain transaction history provides a comprehensive audit trail; Path execution results are visible through on-chain transaction records)

### Uncertain Fields (33)

- status
- launch_date
- registration_steps
- agent_autonomy
- time_to_first_action
- identity_type
- key_management
- multi_instance_support
- recovery_mechanism
- versioning_support
- known_vulnerabilities
- revocation_speed
- data_exposure_risk
- bot_to_bot_attack_surface
- skill_plugin_vetting
- attestation_mechanism
- linking_mechanism
- transfer_behavior
- delegation_model
- authorization_granularity
- discovery_mechanism
- capability_declaration
- standards_compliance
- protocol_composability
- push_support
- pull_support
- subscription_model
- trust_model
- reputation_system
- payment_integration
- economic_model
- regulatory_alignment
- lifecycle_management

---

## cheqd Trust Registry / Trust Graph

**Type**: `on-chain` · **Status**: `Production` · **Ecosystem**: Cosmos

### Basic Info

**Type**: on-chain

**Status**: Production (cheqd mainnet live since September 2022; Trust Registry feature launched 2023; evolved to Trust Graphs in 2025; MCP servers for DID/VC operations announced 2025; active partnership with ASI Alliance including Fetch.ai)

**Ecosystem**: Cosmos (cheqd is a Cosmos SDK-based blockchain with native DID and VC support; connected to IBC ecosystem; partnership with ASI Alliance brings Fetch.ai/SingularityNET/Ocean Protocol interoperability; CHEQ token is the native token)

**Launch Date**: September 2022 (cheqd mainnet launch); 2023 (Trust Registry feature); 2025 (Trust Registries evolved to Trust Graphs; MCP server integrations announced)

### Onboarding Flow

**Registration Steps**:
> 1) Set up a cheqd-compatible wallet or use the cheqd Credential Service (SaaS API).
> 2) Create a DID on the cheqd network using the did:cheqd method (supports did:cheqd:mainnet: and did:cheqd:testnet: prefixes). The DID creation transaction is submitted to the cheqd Cosmos chain.
> 3) The DID Document is published on-chain containing: public keys, service endpoints, authentication methods, and verification relationships.
> 4) For agent identity: configure the agent's DID Document with appropriate service endpoints (HTTP, WebSocket, MCP server URLs).
> 5) Obtain Verifiable Credentials (VCs) from trusted issuers within the Trust Graph ecosystem. VCs can attest to agent capabilities, authorization, compliance, or provenance.
> 6) Register in the Trust Graph: an issuer or governance body adds the agent's DID to the Trust Graph, establishing trust relationships (issuer-holder-verifier chains). Trust Graphs define which issuers are trusted, which credential schemas are accepted, and which verification policies apply.
> 7) Optionally set up a cheqd MCP server for DID/VC operations, enabling AI agents to resolve DIDs, issue/verify VCs, and query Trust Graphs programmatically.
> 8) Fund the agent's wallet with CHEQ tokens for transaction fees (DID creation, DID Document updates, credential status updates).
> 9) For credential monetization: configure payment rails using cheqd's payment infrastructure, where verifiers pay issuers/holders for credential verification.

**Human Involvement**:
> approve-only (human or organization creates the initial DID and funds the wallet; after setup, agents can autonomously present VCs, update DID Documents, and interact with Trust Graphs; credential issuance typically requires human/organizational approval; MCP server operations can be fully autonomous)

**Agent Autonomy**:
> High autonomy after initial DID creation and credential issuance. Agents can autonomously: resolve other agents' DIDs, present Verifiable Credentials for authentication, query Trust Graphs to verify trust chains, update their DID Documents (rotate keys, change endpoints), interact via MCP servers for DID/VC operations. DID creation requires a funded wallet and on-chain transaction. Credential issuance requires trusted issuer approval. Trust Graph membership requires governance body authorization.

**Time To First Action**: minutes (DID creation is a single on-chain transaction on the cheqd Cosmos chain, confirming in ~5-6 seconds; using the cheqd Credential Service API simplifies this further; obtaining VCs from issuers may take longer depending on the issuer's process)

### Identity Model

**Identity Type**: W3C DID (did:cheqd method). Each agent gets a decentralized identifier anchored on the cheqd Cosmos blockchain. The DID Document contains public keys, authentication methods, service endpoints, and verification relationships. Verifiable Credentials (W3C VC) layer on top for attestations and trust.

**Key Management**:
> Keys are defined in the DID Document published on the cheqd blockchain. Supports Ed25519VerificationKey2020 and JsonWebKey2020 key types. DID Documents support multiple verification methods (keys) with distinct purposes: authentication, assertionMethod, keyAgreement, capabilityInvocation, capabilityDelegation. Key rotation is native: update the DID Document on-chain to add new keys and remove old ones while preserving the DID identifier. The cheqd Credential Service provides a managed API for key operations. For self-sovereign setups, keys are managed locally by the agent or via KMS/HSM. Rotation frequency is at the discretion of the DID controller. DID Document updates require signing with an existing authorized key, ensuring only the controller can rotate keys.

**Multi Instance Support**:
> Yes. A single DID can have multiple verification methods (keys) and multiple service endpoints in its DID Document, allowing multiple runtime instances to operate under the same identity. Each instance can use its own key while sharing the DID. The DID Document's service endpoints array can list multiple URLs for different instances or protocols.

**Versioning Support**:
> Yes, implicit via DID Document updates. Each update to the DID Document on the cheqd blockchain creates a new version. The cheqd DID method supports DID Document version history -- previous versions are queryable via the versionId parameter (did:cheqd:mainnet:<id>?versionId=<uuid>). This provides a full audit trail of all changes to the agent's identity document, including key rotations, endpoint changes, and service additions. Credential status (revocation/suspension) is tracked via on-chain status lists.

### Security

**Authentication Method**:
> W3C DID authentication (DID-based challenge-response using verification methods defined in the DID Document); Verifiable Credential presentation (agents present VCs to prove attributes/capabilities/authorization); wallet signature (Cosmos SDK signatures for on-chain transactions); MCP server authentication for programmatic DID/VC operations

**Revocation Speed**: minutes (credential revocation requires updating an on-chain status list via a Cosmos transaction, which confirms in ~5-6 seconds; DID deactivation is also a single on-chain transaction; however, verifiers must check the status list, and caching may introduce propagation delays)

**Data Exposure Risk**:
> DID Documents are publicly visible on the cheqd blockchain (public keys, service endpoints, verification methods). Verifiable Credentials are held by the agent and selectively disclosed -- only the agent decides which VCs to present and to whom. Credential schemas and issuer DIDs are public in the Trust Graph. The cheqd network supports privacy-preserving credential verification techniques. No PII is required on-chain. Wallet addresses and CHEQ token balances are publicly visible.

**Attestation Mechanism**:
> Verifiable Credentials (W3C VC standard). VCs issued by trusted parties serve as cryptographic attestations of agent properties: identity verification, capability certification, compliance attestation, authorization delegation. Trust Graphs define which attestations are accepted and which issuers are trusted. Credential status is verifiable on-chain via status lists. No TEE remote attestation or zkML built into cheqd natively, though VCs could reference external TEE attestation results.

### Off-chain / On-chain Linking

**Linking Support**: yes (native and bidirectional -- the DID Document on-chain links to off-chain service endpoints, and VCs bridge on-chain trust to off-chain interactions)

**Linking Mechanism**:
> DID Document service endpoints: the on-chain DID Document contains service entries pointing to off-chain HTTP/WebSocket/MCP endpoints. DID resolution: any party can resolve a did:cheqd identifier to retrieve the full DID Document with off-chain service information. Verifiable Credentials link off-chain claims to on-chain identity (VC references the holder's DID). Trust Graph queries allow on-chain trust verification of off-chain agent interactions. The cheqd Credential Service API bridges on-chain DID operations with off-chain application integrations.

### Delegation & Authorization

**Delegation Model**:
> W3C DID-based delegation via the DID Document's capabilityDelegation verification relationship. A DID controller can authorize other DIDs to act on its behalf by adding their keys to the DID Document's delegation section. Verifiable Credentials enable credential-based delegation: a parent agent issues a VC to a sub-agent authorizing specific actions. Trust Graphs define hierarchical trust chains (issuer -> holder -> verifier) that implicitly create delegation structures. The cheqd framework supports multi-controller DIDs where multiple parties share control.

**Authorization Granularity**:
> Fine-grained via Verifiable Credentials. VCs can encode arbitrary claims with specific scopes, expiry dates, and conditions. The DID Document's verification relationships provide role-based access: authentication (prove identity), assertionMethod (issue credentials), keyAgreement (encryption), capabilityInvocation (manage DID), capabilityDelegation (delegate authority). Trust Graphs define which credential schemas and claim types are accepted, enabling structured authorization policies. This approaches ABAC (Attribute-Based Access Control) through VC claims.

### Discovery & Interoperability

**Discovery Mechanism**:
> DID resolution (resolve did:cheqd identifiers to retrieve DID Documents with service endpoints); Trust Graph query (discover agents with specific credentials or trust relationships within a Trust Graph); on-chain query (query the cheqd blockchain for registered DIDs); MCP server (programmatic DID/VC discovery via MCP protocol); the cheqd Credential Service API provides discovery endpoints

**Capability Declaration**:
> DID Document service endpoints (list protocols and endpoint URLs the agent supports); Verifiable Credentials (VCs attest to specific capabilities, certifications, or authorizations); Trust Graph membership (membership in specific Trust Graphs signals participation in particular ecosystems or domains); MCP server capability declaration follows MCP protocol standards

**Cross Platform Portability**:
> Highly portable via W3C DID/VC standards. The did:cheqd method resolves through the cheqd blockchain, but VCs issued using W3C standards are portable to any VC-compliant system. DIDs are universally resolvable via Universal Resolver infrastructure. Trust Graphs are cheqd-specific but the credential formats follow open standards. The ASI Alliance partnership may bring interoperability with Fetch.ai/SingularityNET ecosystems. Cross-chain DID resolution is possible via IBC within Cosmos ecosystem.

**Standards Compliance**:
> W3C DID v1.0 (did:cheqd method), W3C Verifiable Credentials Data Model v1.1/v2.0, DID Resolution specification, DIDComm Messaging (for secure agent communication), JSON-LD (credential format), Cosmos SDK (blockchain framework), IBC (Inter-Blockchain Communication). Supports AnonCreds for privacy-preserving credentials. Trust Registries follow Trust over IP (ToIP) framework patterns. MCP (Model Context Protocol) for AI agent integration.

**Protocol Composability**:
> Moderate to high. Composes with: (
> 1) MCP (Anthropic's Model Context Protocol) via dedicated MCP servers for DID/VC operations, (
> 2) ASI Alliance ecosystem (Fetch.ai agents can use cheqd VCs for trust), (
> 3) Cosmos IBC for cross-chain identity, (
> 4) Trust over IP (ToIP) framework for trust governance, (
> 5) Any W3C DID/VC-compliant system. Does not natively compose with ERC-8004, A2A, AP2, or x402, though VCs could bridge these ecosystems. The MCP integration enables composability with any MCP-compatible AI agent framework.

### Push/Pull Communication

**Pull Support**: DID resolution (query cheqd blockchain to resolve any DID); REST API (cheqd Credential Service provides REST endpoints for DID/VC operations); on-chain reads (Cosmos SDK queries for DID Documents, credential status lists); MCP server queries for programmatic access

### Trust & Reputation

**Trust Model**:
> Federated (Trust Graphs / Trust Registries). Trust is established through: (
> 1) Trust Graphs define hierarchical trust relationships between issuers, holders, and verifiers, (
> 2) Governance frameworks specify which issuers are trusted for which credential types, (
> 3) Verifiable Credentials provide cryptographic proof of trust chain membership, (
> 4) The evolution from Trust Registries (simple lists) to Trust Graphs (rich relationship graphs) in 2025 enables more nuanced trust models including transitive trust, conditional trust, and domain-specific trust. Trust is not purely peer-to-peer (like staking-based systems) nor purely centralized -- it follows a federated governance model aligned with Trust over IP (ToIP) principles.

### Payment & Economics

**Payment Integration**:
> Native token (CHEQ for gas fees and credential payment rails); cheqd's unique payment infrastructure allows verifiers to pay for credential verification, creating a sustainable credential economy; no direct integration with AP2, ACP, x402, or fiat rails documented, though the W3C VC format is compatible with external payment protocols

**Economic Model**:
> Gas fees (CHEQ token for DID creation, DID Document updates, credential status updates on the Cosmos chain; fees are relatively low); credential monetization (cheqd's distinctive feature: credential holders and issuers can set payment conditions for credential verification, creating revenue streams from trust data); no staking required for basic DID creation; Trust Graph governance participation may involve staking in specific implementations. CHEQ token also used for network staking and governance.

### Governance & Compliance

**Audit Trail Capability**:
> Blockchain anchoring (all DID creation, DID Document updates, and credential status changes are recorded immutably on the cheqd Cosmos blockchain; DID Document version history is queryable; credential revocation/suspension is recorded via on-chain status lists; Trust Graph membership changes are auditable; the Cosmos blockchain provides full transaction history). Off-chain: Verifiable Credential presentations create cryptographic audit trails between agents.

**Lifecycle Management**:
> Registration (create DID on cheqd blockchain) / activation (DID Document published with service endpoints and verification methods) / suspension (credentials can be suspended via status list updates; DID can be marked as deactivated) / upgrade (DID Document updates for key rotation, endpoint changes, capability additions; credential re-issuance for updated attestations) / decommissioning (DID deactivation marks the identifier as no longer active; credential revocation invalidates all associated credentials). Migration between DID methods or chains is not natively supported but VCs are portable.

### Uncertain Fields (10)

- recovery_mechanism
- known_vulnerabilities
- anti_sybil
- bot_to_bot_attack_surface
- skill_plugin_vetting
- transfer_behavior
- push_support
- subscription_model
- reputation_system
- regulatory_alignment

---

## Coinbase AgentKit / Agentic Wallets

**Type**: `hybrid` · **Status**: `Production` · **Ecosystem**: Base

### Basic Info

**Type**: hybrid

**Status**:
> Production (AgentKit v0.1+ publicly available since early 2025; Smart Wallet API in production on Base; Agentic Wallets with TEE-secured key management live; multi-framework support including LangChain, OpenAI Agents SDK, Vercel AI SDK, and CrewAI; CDP (Coinbase Developer Platform) APIs in production)

**Ecosystem**: Base (Coinbase L2, primary), Ethereum, Polygon, Arbitrum, Solana. AgentKit is optimized for the Base ecosystem with gasless transactions via Paymaster. Smart Wallets are ERC-4337 compliant smart contract wallets on EVM chains.

**Launch Date**: Coinbase Developer Platform (CDP) launched in 2023. AgentKit initially released late 2024 / early 2025. Agentic Wallets (TEE-secured non-custodial wallets for agents) announced and launched in 2025. The platform has been iterating rapidly with major updates throughout 2025.

### Onboarding Flow

**Registration Steps**:
> 1) Sign up for a Coinbase Developer Platform (CDP) account and obtain API keys (CDP API Key ID and Secret).
> 2) Install the AgentKit SDK - available in Python (agentkit) and TypeScript/JavaScript (npm @coinbase/agentkit).
> 3) Choose an AI framework integration: LangChain (langchain-coinbase toolkit), OpenAI Agents SDK, Vercel AI SDK, or CrewAI.
> 4) Initialize the AgentKit client with CDP credentials: configure the API key, network (Base mainnet, Base Sepolia testnet, etc.), and wallet type.
> 5) Create an Agentic Wallet: AgentKit provisions a Smart Wallet (ERC-
> 4
> 3
> 3
> 7) for the agent. For TEE-secured wallets, keys are generated and stored within a Trusted Execution Environment. For MPC wallets, keys are split across Coinbase's MPC infrastructure.
> 6) Fund the wallet (optional for gasless transactions on Base via Paymaster; required for non-subsidized chains).
> 7) Configure agent capabilities/tools: token transfers, NFT minting, DeFi interactions, ENS registration, fiat onramp via Coinbase Onramp, contract deployment, etc.
> 8) Deploy the agent with the configured wallet and tools. The agent can now execute on-chain transactions autonomously.
> 9) Optionally integrate fiat onramp for the agent to convert fiat to crypto via Coinbase Onramp URL generation.

**Human Involvement**:
> full-setup (human developer must create CDP account, obtain API keys, write agent code, configure wallet type and network; after deployment, agent operates autonomously. Some wallet types allow for approve-only via Smart Wallet spending limits and session keys. CDP account creation requires human identity verification.)

**Agent Autonomy**:
> High autonomy after deployment. The agent can autonomously: create and manage wallets, execute token transfers, interact with smart contracts, mint NFTs, deploy contracts, perform token swaps via DEX, register ENS names, stake ETH, generate fiat onramp links, and perform cross-chain operations. The agent can self-provision new wallets without human intervention once the CDP API keys are configured. Smart Wallet session keys allow bounded autonomy with spending limits. The agent cannot modify its own CDP API key permissions or billing settings.

**Time To First Action**:
> minutes (CDP account creation and API key generation takes minutes; SDK installation and basic agent configuration can be done in under 10 minutes; wallet provisioning is near-instant via the API; first transaction on Base can be gasless and executes in seconds. Coinbase provides quickstart templates that enable a working agent in under 5 minutes.)

### Identity Model

**Identity Type**:
> wallet (Smart Wallet / ERC-4337 smart contract wallet as primary identity). Three wallet types:
> 1) Smart Wallet - ERC-4337 compliant smart contract wallet with session keys, spending limits, and gasless transaction support via Paymaster.
> 2) MPC Wallet - keys split across Coinbase's MPC infrastructure (server-side key shares).
> 3) TEE-secured Wallet - private keys generated and stored within Trusted Execution Environments (non-custodial, Coinbase cannot access keys). Each wallet has an Ethereum address that serves as the agent's on-chain identity.

**Key Management**:
> Multiple key management models:
> 1) Smart Wallet: keys managed via ERC-4337 smart contract; supports session keys with configurable permissions and expiry; owner key can be a passkey, hardware key, or software key.
> 2) MPC Wallet: private key is split into shares using Multi-Party Computation; key shares are distributed between the user/agent and Coinbase servers; neither party alone can sign transactions; key generation and signing occur through MPC protocols without ever reconstructing the full private key.
> 3) TEE Wallet: private keys generated inside AWS Nitro Enclaves or similar TEE; keys never leave the enclave; signing occurs within the TEE; Coinbase cannot access or extract the private key. Key rotation: Smart Wallets support adding/removing signers via owner management functions. MPC wallets support key refresh without changing the address. TEE wallets can be rotated by creating a new wallet and migrating assets. Revocation: CDP API keys can be revoked instantly via the CDP dashboard; Smart Wallet session keys can be revoked on-chain.

**Multi Instance Support**:
> Yes - a single CDP account can create and manage multiple wallets/agents concurrently. Each agent can have its own dedicated wallet. Multiple agents can share a CDP API key but operate with separate wallets. Smart Wallets support multiple signers/session keys, allowing different agent instances to operate under the same wallet with different permission scopes.

**Recovery Mechanism**:
> Depends on wallet type:
> 1) Smart Wallet: owner key recovery depends on the key type (passkey recovery via platform, hardware key backup, etc.); Smart Wallet social recovery can be implemented via guardian contracts.
> 2) MPC Wallet: Coinbase holds a key share and can participate in recovery; the developer/user must retain their key share or use Coinbase's recovery flow.
> 3) TEE Wallet: if the TEE enclave is destroyed and no backup exists, the key is lost; backup strategies include encrypted key export (if supported) or multi-TEE redundancy. CDP API key recovery: keys can be regenerated from the CDP dashboard. Wallet seed export: AgentKit supports exporting wallet seed phrases for developer-controlled backup.

**Versioning Support**:
> No native agent code/model versioning on-chain. CDP platform tracks API usage and wallet activity. Agent code versioning is the developer's responsibility (standard CI/CD practices). Smart Wallet contract upgrades can be tracked through proxy upgrade events on-chain. AgentKit SDK itself is versioned via npm/PyPI. No on-chain hash appending for agent code versions.

### Security

**Authentication Method**:
> API key (CDP API Key ID + Secret for platform authentication); wallet signature (ECDSA/EIP-191/EIP-712 for on-chain transaction signing); OAuth 2.0 (for CDP dashboard/account access); TEE attestation (for TEE-secured wallets, remote attestation verifies enclave integrity); session key authentication (Smart Wallet session keys with scoped permissions for granular access)

**Revocation Speed**:
> instant to seconds (CDP API keys can be revoked instantly via the CDP dashboard; Smart Wallet session keys can be revoked via on-chain transaction in seconds on Base; MPC wallet operations can be suspended by Coinbase; TEE wallet access can be revoked by destroying the enclave or revoking CDP API access)

**Anti Sybil**:
> human verification + rate limiting (CDP account creation requires identity verification through Coinbase; API key generation is rate-limited per account; wallet creation is rate-limited via API; gas fees for non-subsidized transactions create economic barriers; Coinbase KYC requirements for fiat operations provide strong Sybil resistance at the account level)

**Data Exposure Risk**:
> CDP API keys are sensitive credentials that must be protected. Wallet addresses are publicly visible on-chain. Transaction history is publicly traceable on all supported chains. CDP account information (email, identity) is held by Coinbase. Fiat onramp usage exposes financial information to Coinbase. Agent code and configurations are not exposed on-chain. MPC key shares are held by Coinbase (trusted party). No model configurations or AI-specific data is exposed on-chain.

**Bot To Bot Attack Surface**:
> AgentKit focuses on wallet/transaction infrastructure and does not directly handle agent-to-agent communication. Smart Wallet spending limits and session key scoping provide boundaries that prevent excessive damage from compromised agent interactions. The cryptographic signing boundary means an agent cannot be tricked into signing transactions outside its session key permissions. However, AgentKit does not inspect semantic content of inter-agent communications. When integrated with frameworks like LangChain, standard prompt injection protections from those frameworks apply. The platform does not provide native agent-to-agent authentication or trust verification.

**Skill Plugin Vetting**:
> AgentKit provides a curated set of built-in tools/actions (transfer tokens, mint NFTs, deploy contracts, swap tokens, etc.) that are developed and maintained by Coinbase. These are vetted first-party tools. Custom tools can be added by developers without formal vetting. The AgentKit SDK is open-source, allowing community review. No formal plugin marketplace or third-party tool signing mechanism. Smart Wallet session keys can restrict which contract addresses and functions an agent can call, providing implicit tool sandboxing.

**Attestation Mechanism**:
> TEE remote attestation (for TEE-secured wallets, AWS Nitro Enclaves provide cryptographic attestation that keys are managed within a verified enclave); Smart Wallet on-chain verification (smart contract state proves wallet configuration and permissions); CDP API authentication proves the agent is authorized by the registered developer. No formal Verifiable Credential issuance or code hash verification for agent integrity.

### Off-chain / On-chain Linking

**Linking Support**: yes (inherent - AgentKit bridges off-chain AI agent logic with on-chain wallet operations)

**Linking Mechanism**:
> CDP API key binding (off-chain agent code authenticates to CDP APIs, which control on-chain wallets); Smart Wallet session keys link off-chain agent processes to on-chain permissions; EIP-712 typed data signing can link off-chain messages to on-chain identity; the wallet address serves as a universal identifier that bridges off-chain agent operations with on-chain state. CDP REST APIs serve as the bridge layer between off-chain agent frameworks and on-chain execution.

**Transfer Behavior**:
> Smart Wallet: the smart contract wallet persists independently of the agent; ownership can be transferred by adding new signers and removing old ones. MPC Wallet: wallet ownership is tied to the CDP account and key shares; transfer requires coordinated key share migration. TEE Wallet: wallet is tied to the specific TEE enclave; transfer requires exporting and re-importing keys (if supported). In all cases, transferring the wallet does not transfer the CDP account or API keys - those remain with the original developer.

### Delegation & Authorization

**Delegation Model**:
> Multi-layered:
> 1) CDP API key delegation: developer creates API keys with specific scopes and provides them to the agent.
> 2) Smart Wallet session keys: human/developer creates session keys with bounded permissions (allowed contracts, spending limits, time expiry) and delegates them to the agent. This is analogous to OAuth scoped tokens but enforced at the smart contract level.
> 3) Smart Wallet owner management: multiple owners/signers can be added, enabling multi-sig delegation.
> 4) Framework-level delegation: LangChain/OpenAI tool permissions can restrict which AgentKit actions the agent can invoke. Human-to-agent delegation is the primary model. Agent-to-agent delegation is possible via shared session keys or multi-sig Smart Wallet configurations but is not a primary use case.

**Authorization Granularity**:
> fine-grained (ABAC) - Smart Wallet session keys support: per-contract address restrictions, per-function selector restrictions, spending limits (per-transaction and cumulative), time-based expiry, chain-specific permissions. CDP API keys have scope-based permissions. This provides fine-grained attribute-based access control at both the platform (CDP) and on-chain (Smart Wallet) levels.

### Discovery & Interoperability

**Discovery Mechanism**:
> No native agent discovery mechanism. AgentKit provides wallet/transaction infrastructure but does not include an agent registry or discovery service. Wallet addresses are discoverable on-chain via standard blockchain explorers. Integration with external discovery protocols (ENS for human-readable naming, ERC-8004 for agent registries) is possible but not built-in. Coinbase Commerce and CDP APIs could serve as partial discovery layers for agent services.

**Capability Declaration**:
> No formal capability declaration mechanism. AgentKit tools/actions are defined in code rather than published as discoverable capabilities. The agent's capabilities are determined by which AgentKit tools are configured by the developer. No Agent Card, JSON-LD manifest, or standardized skill list is generated. Integration with A2A Agent Cards or MCP tool manifests would need to be implemented at the application layer.

**Cross Platform Portability**:
> partially portable - wallet addresses and private keys are standard Ethereum/EVM primitives that work across any platform. Smart Wallet contracts are deployed on specific chains but follow ERC-4337 standard. CDP API keys and AgentKit-specific features are locked to the Coinbase platform. The agent code using AgentKit SDK is Coinbase-specific but the underlying wallet identity (address + keys) is fully portable.

**Standards Compliance**:
> ERC-4337 (Account Abstraction / Smart Wallets), ERC-20 (token operations), ERC-721 (NFT minting), ERC-1155 (multi-token), EIP-191 (personal signatures), EIP-712 (typed data signatures), EIP-1193 (wallet provider interface), OAuth 2.0 (CDP authentication), REST API standards. No formal W3C DID, W3C VC, SPIFFE, or OIDC-A compliance. Compatible with ENS for naming.

**Protocol Composability**:
> High composability - AgentKit tools compose with: DeFi protocols (Uniswap, Aave, etc. via contract interactions), ENS (name registration), Zora (NFT minting), Coinbase Commerce (payments), fiat onramp (Coinbase Onramp). Framework integrations (LangChain, OpenAI, Vercel AI, CrewAI) enable composition with the broader AI agent ecosystem. Smart Wallets can interact with any smart contract. Can compose with x402 (Coinbase's payment protocol), MCP (via framework integrations). No native A2A or AP2 integration but the wallet infrastructure can underpin any of these. ERC-4337 compatibility enables integration with any account abstraction ecosystem.

### Trust & Reputation

**Trust Model**:
> centralized (platform-verified) - Coinbase serves as the trusted platform operator. CDP account verification provides identity-backed trust. Coinbase is a publicly traded, regulated entity (NASDAQ: COIN), providing institutional trust guarantees. Smart Wallet contracts are audited by Coinbase's security team. TEE infrastructure is operated by Coinbase within cloud provider TEEs. The trust model is fundamentally centralized around Coinbase as the platform provider, with decentralized execution on-chain.

**Reputation System**:
> none (no built-in agent reputation system. Trust is derived from the Coinbase platform's reputation and the developer's CDP account standing. On-chain wallet transaction history serves as implicit reputation. No formal rating, scoring, or on-chain reputation registry for agents. External reputation systems could be layered on top.)

### Payment & Economics

**Payment Integration**:
> native token (ETH and ERC-20 tokens for on-chain transactions) / fiat (Coinbase Onramp for fiat-to-crypto conversion) / gasless (Paymaster-subsidized transactions on Base). Compatible with x402 payment protocol (Coinbase-developed). Smart Wallet supports any ERC-20 token payment. Fiat onramp generates URLs that allow users to purchase crypto directly.

**Economic Model**:
> free tier + gas fees (CDP account creation is free; AgentKit SDK is open-source and free to use; wallet creation is free via CDP APIs; gasless transactions on Base via Paymaster are subsidized by Coinbase within limits; non-subsidized transactions require gas fees in the chain's native token. CDP may have API rate limits and usage-based pricing for high-volume use. No PROMPT-like token purchase or staking required. Coinbase monetizes through Commerce fees, Onramp fees, and platform usage.)

### Governance & Compliance

**Audit Trail Capability**:
> blockchain anchoring (all Smart Wallet transactions are recorded on-chain with full immutability); CDP platform logs (API access logs, wallet creation events, transaction submissions tracked by Coinbase); Smart Wallet contract events provide detailed on-chain audit trail of all operations, including session key usage, spending, and signer changes. Coinbase's compliance infrastructure provides additional off-chain audit capabilities.

**Lifecycle Management**:
> registration (create CDP account, generate API keys, provision wallet) / activation (configure agent tools, fund wallet or enable gasless, deploy agent) / suspension (revoke CDP API keys, pause session keys, freeze wallet via Smart Wallet guardian) / migration (export wallet keys, transfer Smart Wallet ownership) / upgrade (update AgentKit SDK version, modify Smart Wallet signers/permissions) / decommissioning (revoke all API keys, drain wallet funds, remove Smart Wallet signers). Full lifecycle is supported with varying degrees of automation.

### Uncertain Fields (5)

- known_vulnerabilities
- push_support
- pull_support
- subscription_model
- regulatory_alignment

---

## ElizaOS (ai16z)

**Type**: `hybrid` · **Status**: `Production` · **Ecosystem**: Multi-chain

### Basic Info

**Type**: hybrid

**Status**: Production (v1 stable and widely deployed; v2 released January 2025 with major architecture overhaul; largest open-source crypto-AI agent framework by GitHub stars and community size)

**Ecosystem**: Multi-chain (Solana primary via ai16z DAO; Ethereum/EVM support; Base; supports multiple chains through plugin architecture; ELIZA token on Solana)

**Launch Date**: October 2024 (initial release as 'ai16z/eliza' by Shaw/ai16z DAO; renamed to ElizaOS; v2 released January 2025 with unified message bus, agent wallet, and registry)

### Onboarding Flow

**Registration Steps**:
> 1) Install ElizaOS: Clone the repository and install dependencies (Node.js/TypeScript project, uses pnpm). Run 'pnpm install' and 'pnpm build'.
> 2) Create a Character Configuration: Define the agent's personality, bio, lore, message examples, style guidelines, and plugin list in a JSON character file. This character config is the agent's persistent identity definition.
> 3) Configure Environment: Set up environment variables for LLM API keys (OpenAI, Anthropic, local models, etc.), database connections (SQLite default, PostgreSQL optional), and any platform-specific credentials (Discord bot token, Twitter API keys, Telegram bot token, etc.).
> 4) Select and Configure Plugins: Choose from available plugins for capabilities: blockchain wallets (Solana, EVM), social media connectors (Discord, Twitter, Telegram, Farcaster), DeFi protocols, knowledge retrieval, image generation, etc. V2 uses a plugin registry for discovery.
> 5) Start the Agent: Run 'pnpm start --characters characters/your-agent.json'. The agent starts, loads its character config, initializes plugins, connects to configured platforms, and begins operating.
> 6) For V2 Agent Registry: Register the agent in the ElizaOS registry to make it discoverable by other agents. This involves publishing agent metadata and capabilities.
> 7) For Agent Wallet (V2): Initialize the agent's built-in wallet for autonomous on-chain transactions. The wallet supports Solana and EVM chains.
> 8) Connect to Message Bus (V2): The unified message bus enables agent-to-agent communication within the ElizaOS ecosystem.

**Human Involvement**: full-setup (human must write character configuration, set up environment variables with API keys, choose plugins, and deploy the agent; ongoing maintenance for plugin updates and character tuning; V2 agent wallet may require initial funding by human)

**Agent Autonomy**:
> After initial human setup, agents operate autonomously: responding to messages across platforms (Discord, Twitter, Telegram), executing on-chain transactions via agent wallet, interacting with other agents via message bus (V2), managing their own memory and conversation context. Agents cannot self-register or self-configure; they require human-authored character files and environment setup. V2 adds more autonomous capabilities through the agent wallet (self-custody, autonomous trading) and registry (self-discovery).

**Time To First Action**: minutes (installation and basic setup can be completed in under 30 minutes; first message response occurs immediately upon startup; on-chain actions require wallet funding which adds time; plugin-dependent features may require additional API key provisioning)

### Identity Model

**Identity Type**: Character config (JSON file defining personality, bio, knowledge, behavior rules) + optional wallet (Solana/EVM wallet address for on-chain identity). V2 adds agent registry entries. Identity is primarily off-chain via the character config, with optional on-chain presence through wallet addresses.

**Key Management**:
> LLM API keys and platform credentials stored in .env files or environment variables (no built-in secret management). Agent wallet keys (V2): private keys generated locally; for Solana, standard keypair generation; for EVM, standard private key/mnemonic. Keys are stored in the agent's local database or environment. No built-in HSM/KMS integration. V2 TEE (Trusted Execution Environment) plugin provides hardware-secured key storage for agent wallets in supported environments. Key rotation: not natively supported for agent identity; changing keys requires manual reconfiguration. Platform API keys (Discord, Twitter) are managed by the human operator.

### Security

**Data Exposure Risk**:
> Environment variables expose: LLM API keys, platform OAuth tokens, wallet private keys, database credentials. Agent memory database contains: full conversation histories, user information, relationship data. Character configs expose: agent personality, system prompts, behavioral rules. On-chain wallet transactions are publicly visible. Social media interactions are public. V2 registry entries expose agent capabilities and metadata.

### Off-chain / On-chain Linking

**Linking Support**: yes (native hybrid architecture: off-chain character/personality with on-chain wallet identity and token)

**Linking Mechanism**:
> Agent wallet: the agent's blockchain wallet address serves as its on-chain identity, linked to its off-chain character config through the ElizaOS runtime. The agent signs on-chain transactions proving it controls the wallet. For ELIZA token launchpad agents: the token contract address links to the agent's off-chain personality and capabilities. V2 agent registry may provide structured linking between off-chain agent metadata and on-chain identities. No formal EIP-712 binding or VC-based linking; the linking is implicit through the runtime configuration.

### Discovery & Interoperability

**Discovery Mechanism**:
> V2 Agent Registry: agents register in a centralized ElizaOS registry with metadata about their capabilities, personality, and endpoints. Other agents and users can search the registry to discover available agents. V1: no native discovery; agents are found through their social media presence (Discord servers, Twitter accounts) or direct configuration. ELIZA token launchpad provides discovery via the token marketplace.

**Cross Platform Portability**:
> Partially portable. Character configs are portable JSON files that can run on any ElizaOS instance. Memory/state is stored in databases that can be migrated. However, agent identity is not portable to non-ElizaOS frameworks. Wallet identity (blockchain address) is portable across any blockchain-compatible system. No W3C DID or universal identity standard support.

### Push/Pull Communication

**Pull Support**: REST API (ElizaOS exposes a local REST API for querying agent state and sending messages). Platform polling (Twitter mentions check, Discord message polling as fallback). V2 registry provides pull-based agent discovery. Direct HTTP API for programmatic agent interaction.

### Payment & Economics

**Payment Integration**:
> Native token (ELIZA token on Solana for the ai16z ecosystem; agent tokens launched via ELIZA token launchpad); Solana SPL token transfers via wallet plugin; EVM token transfers via EVM wallet plugin; DeFi protocol integrations through plugins (Uniswap, Jupiter, Raydium, etc.); no AP2, ACP, or x402 integration documented. Agents can autonomously execute token swaps, provide liquidity, and manage portfolios through plugins.

**Economic Model**:
> Free (open-source framework, no fees to deploy agents). Token launchpad has creation fees for launching agent tokens. Agent operation costs: LLM API usage fees (varies by provider), blockchain gas fees for on-chain transactions, hosting/compute costs. No staking requirement. ELIZA token serves as governance/utility token for the ai16z DAO ecosystem but is not required for agent deployment.

### Governance & Compliance

**Regulatory Alignment**: unknown - no explicit regulatory framework compliance. Open-source project under MIT license governed by ai16z DAO. No EU AI Act, NIST AI RMF, or ISO 42001 compliance documented. The decentralized and open-source nature means compliance responsibility falls on individual deployers.

### Uncertain Fields (22)

- multi_instance_support
- recovery_mechanism
- versioning_support
- authentication_method
- known_vulnerabilities
- revocation_speed
- anti_sybil
- bot_to_bot_attack_surface
- skill_plugin_vetting
- attestation_mechanism
- transfer_behavior
- delegation_model
- authorization_granularity
- capability_declaration
- standards_compliance
- protocol_composability
- push_support
- subscription_model
- trust_model
- reputation_system
- audit_trail_capability
- lifecycle_management

---

## Phala Network (TEE Agent Compute)

**Type**: `hybrid` · **Status**: `Production` · **Ecosystem**: Polkadot

### Basic Info

**Type**: hybrid

**Status**:
> Production (Phala Network mainnet live since 2021; Phala Cloud launched January 2025 for TEE-based agent/dApp hosting; 30,000+ TEE worker devices in the network; Decentralized Root of Trust (DeRoT) and Key Management Protocol introduced 2024-2025; Phat Contracts deprecated in favor of Phala Cloud; active partnerships with AI agent ecosystem including AI Agent Contract framework)

**Ecosystem**:
> Polkadot (Phala is a Polkadot parachain via Substrate; PHA token on Polkadot/Ethereum via bridges); Phala Cloud supports deployment of agents that interact with Ethereum, Base, Arbitrum, and other EVM chains; cross-chain bridges to Ethereum (Khala on Kusama as canary network); expanding multi-chain agent support

### Onboarding Flow

**Registration Steps**:
> 1) Developer creates an account on Phala Cloud (cloud.phala.network) via web interface -- supports GitHub OAuth, wallet connection, or email registration.
> 2) Select deployment type: TEE-secured Docker container for agent deployment. Phala Cloud provides pre-configured templates for AI agents (e.g., AI Agent Contract templates, LLM hosting, autonomous agent frameworks).
> 3) Upload or configure the agent code/container image. The agent code runs inside an Intel SGX or Intel TDX Trusted Execution Environment on Phala workers.
> 4) Phala Cloud assigns the workload to a TEE worker in the decentralized network. The worker generates a TEE attestation report proving the code is running in a genuine enclave.
> 5) DeRoT (Decentralized Root of Trust) verification: the attestation is verified through Phala's decentralized attestation infrastructure rather than relying solely on Intel's centralized attestation service (IAS/DCAP). Multiple attestation verifiers cross-check the TEE report.
> 6) Key Management Protocol: the agent receives cryptographic keys generated and managed within TEE enclaves. Keys are derived through Phala's decentralized key management system where key shares are distributed across multiple TEE workers, preventing any single worker from accessing the full key.
> 7) The agent is assigned a unique identifier and endpoint on Phala Cloud.
> 8) For on-chain identity: the agent can register on Phala's parachain with an on-chain record linking to its TEE attestation proof and deployment metadata.
> 9) The agent is now operational within the TEE enclave, with network connectivity for interacting with blockchains, APIs, and other agents.
> 1
> 0) For AI Agent Contract deployments: the framework provides built-in tooling for autonomous agent behaviors including signing transactions, reading on-chain state, and interacting with off-chain data sources -- all within the TEE boundary.

**Human Involvement**:
> full-setup (human developer must register on Phala Cloud, configure the agent deployment, upload container images, and initiate deployment; once deployed, the agent operates autonomously within its TEE enclave; Phala Cloud dashboard provides monitoring and management UI; agent runtime operations require no ongoing human intervention)

**Agent Autonomy**:
> High autonomy after deployment. Once deployed in a TEE enclave, the agent operates fully autonomously: it can sign transactions using TEE-managed keys, interact with blockchains, call external APIs, communicate with other agents, and process data -- all within the secure enclave. The agent cannot self-register on Phala Cloud (human must initiate deployment). However, the AI Agent Contract framework supports autonomous agent behaviors including multi-step reasoning, tool use, and blockchain interactions without human approval. Key operations (key generation, attestation refresh, computation) happen automatically within the TEE.

**Time To First Action**: minutes (Phala Cloud deployment typically takes minutes for container setup and TEE initialization; TEE attestation generation takes seconds; DeRoT verification adds seconds to minutes; once the enclave is running, the agent can act immediately)

### Identity Model

**Identity Type**:
> TEE attestation-based identity + wallet. Agent identity is primarily established through TEE remote attestation -- a cryptographic proof that the agent code is running in a genuine, unmodified enclave on verified hardware. The attestation report includes: hardware identity (CPUSVN, platform measurements), enclave measurement (MRENCLAVE -- hash of the code running inside), signer identity (MRSIGNER), and configuration details. Additionally, agents can have on-chain wallet addresses for blockchain interactions. The DeRoT system provides a decentralized identity anchor beyond Intel's centralized attestation.

**Key Management**:
> Multi-layered TEE-based key management via Phala's Key Management Protocol: (
> 1) Enclave-generated keys: each TEE enclave generates its own key pair during initialization. The private key never leaves the enclave. (
> 2) Key Management Protocol: for persistent keys that survive enclave restarts, Phala uses a distributed key management system where key shares are stored across multiple TEE workers. A threshold of workers must collaborate to reconstruct or use the key. (
> 3) DeRoT key hierarchy: master keys are protected by the Decentralized Root of Trust, with derived keys for specific agent operations. (
> 4) Key rotation: new enclave instantiation generates new ephemeral keys; persistent keys can be rotated through the Key Management Protocol by re-sharing across the TEE worker set. (
> 5) Key revocation: compromised worker nodes are removed from the key management cluster, and keys re-shared among remaining honest workers. (
> 6) Hardware sealing: Intel SGX sealing keys allow encrypted key storage on local disk, recoverable only by the same enclave on the same hardware. (
> 7) All key operations happen within TEE boundaries -- no plaintext key material is exposed to the host OS or Phala operators.

### Security

**Authentication Method**:
> TEE remote attestation (Intel SGX EPID/DCAP attestation verified through DeRoT -- decentralized verification rather than Intel IAS alone; attestation proves hardware genuineness, code integrity, and enclave configuration); wallet signature (for on-chain transactions using keys managed within TEE); challenge-response (Phala Cloud API authentication for management operations)

**Anti Sybil**:
> staking (PHA token staking required for TEE workers to join the network -- workers must stake PHA to participate in compute tasks, creating economic barrier for malicious workers); TEE attestation (hardware attestation proves genuine TEE hardware, preventing virtual/emulated workers); fee (Phala Cloud charges for compute resources, preventing free mass agent creation); hardware requirement (physical TEE-capable hardware is required to operate a worker node, creating a significant capital barrier to Sybil attacks at the worker level)

**Data Exposure Risk**:
> Minimal by design -- TEE enclaves protect all in-memory data from the host OS and network observers. Agent code, keys, and runtime state are encrypted within the enclave. TEE attestation reports are public and reveal MRENCLAVE (code hash) and hardware metadata, which could reveal what agent software is running. Phala Cloud deployment metadata (container images, configurations) may be visible to the platform. On-chain transactions signed by the agent are publicly visible. Network traffic patterns (timing, size, destination) are observable by the host even though content is encrypted. Phala Cloud account information follows standard platform data handling.

**Attestation Mechanism**:
> TEE remote attestation via DeRoT (Decentralized Root of Trust): (
> 1) Intel SGX EPID or DCAP attestation generates a hardware-signed report proving enclave integrity (MRENCLAVE, MRSIGNER, hardware version). (
> 2) DeRoT decentralizes the attestation verification -- instead of relying solely on Intel Attestation Service (IAS), multiple independent verifiers in Phala's network cross-check attestation reports. This creates a decentralized trust anchor resistant to single-point-of-failure in Intel's infrastructure. (
> 3) Attestation reports can be verified on-chain, enabling smart contracts to confirm that an agent is running in a genuine TEE. (
> 4) Continuous attestation: workers periodically re-attest to prove ongoing integrity, not just at initialization. (
> 5) The Key Management Protocol integrates with attestation -- key shares are only distributed to workers with valid attestation.

### Off-chain / On-chain Linking

**Linking Support**: yes (native -- Phala is a blockchain-TEE hybrid where on-chain state and off-chain TEE computation are tightly integrated; attestation reports bridge on-chain verifiable identity with off-chain secure computation)

**Linking Mechanism**:
> TEE attestation anchored on-chain: Phala workers submit TEE attestation reports to the Phala parachain, creating an on-chain record that links the worker's blockchain identity (staking address) to its TEE hardware identity and the specific code running in the enclave (MRENCLAVE). Smart contracts on Phala or other chains can verify these attestation records to confirm that a specific agent is running in a genuine TEE. The Key Management Protocol bridges on-chain governance (which workers are authorized) with off-chain key material (distributed within TEEs). Phala Cloud provides API endpoints (off-chain) linked to on-chain worker/staking records. Cross-chain: agents running in Phala TEEs can sign transactions for any blockchain, linking the TEE-based identity to on-chain actions on Ethereum, Polkadot, and other networks.

### Delegation & Authorization

**Delegation Model**:
> TEE-mediated delegation: (
> 1) The human deployer delegates operational authority to the agent by deploying it in a TEE enclave and configuring its permitted behaviors (via code/configuration). The TEE enforces that the agent operates only within its programmed logic. (
> 2) The Key Management Protocol provides key-level delegation -- specific keys can be derived for specific operations, allowing fine-grained control over what the agent can sign. (
> 3) For on-chain operations: the agent's TEE-managed wallet can be authorized via standard smart contract mechanisms (approve, allowance). (
> 4) No formal OAuth OBO, OIDC-A, or mandate-based delegation protocol built into Phala. Delegation is primarily through code-level constraints enforced by the TEE enclave.

**Authorization Granularity**:
> Fine-grained via code-level enforcement in TEE. The TEE enclave enforces whatever authorization logic is coded into the agent -- this can range from simple role checks to complex ABAC policies, spending limits, or whitelist-based controls. The Key Management Protocol can issue purpose-specific derived keys. However, this granularity is application-defined, not protocol-defined -- Phala provides the secure execution environment, and the agent developer implements the authorization logic within it.

### Push/Pull Communication

**Pull Support**: REST API (Phala Cloud provides API for querying deployment status, agent endpoints, and metrics); on-chain reads (Phala parachain state queries for worker attestation, staking, and governance data via Substrate RPC); agents expose their own HTTP endpoints for pull-based queries

### Trust & Reputation

**Trust Model**:
> Decentralized (hardware-based trust via TEE attestation + economic trust via staking). Trust is established through: (
> 1) TEE hardware attestation -- cryptographic proof of genuine enclave execution verified via DeRoT, (
> 2) PHA token staking by workers -- economic commitment and slashing risk, (
> 3) Decentralized Root of Trust -- removes single-point-of-failure in Intel's attestation, (
> 4) Continuous re-attestation ensures ongoing integrity, (
> 5) Transparent worker performance metrics on-chain. The trust model is uniquely hardware-rooted compared to purely economic (staking) or reputation-based systems.

### Payment & Economics

**Payment Integration**:
> Native token (PHA token for staking, compute payments, and network governance); Phala Cloud likely supports fiat payment for compute resources (standard cloud billing); agents within TEE enclaves can integrate with any payment protocol by signing transactions for any supported blockchain -- AP2, x402, or custom payment flows can be implemented at the application layer within the TEE.

### Governance & Compliance

**Audit Trail Capability**:
> Blockchain anchoring + TEE attestation chain. (
> 1) Worker attestation reports are stored/verifiable on the Phala parachain, creating an immutable record of TEE integrity over time. (
> 2) Agent transactions signed by TEE-managed keys are recorded on their respective blockchains. (
> 3) The Phala parachain records staking events, worker registration, and attestation updates. (
> 4) Within the TEE enclave, agents can maintain local audit logs protected by enclave encryption. (
> 5) MRENCLAVE values provide cryptographic proof of which code version produced which outputs. Cross-referencing on-chain attestation with on-chain agent actions creates a verifiable audit trail linking agent behavior to verified code.

### Uncertain Fields (20)

- launch_date
- multi_instance_support
- recovery_mechanism
- versioning_support
- known_vulnerabilities
- revocation_speed
- bot_to_bot_attack_surface
- skill_plugin_vetting
- transfer_behavior
- discovery_mechanism
- capability_declaration
- cross_platform_portability
- standards_compliance
- protocol_composability
- push_support
- subscription_model
- reputation_system
- economic_model
- regulatory_alignment
- lifecycle_management

---

## x402 Payment Protocol

**Type**: `hybrid (off-chain HTTP protocol with on-chain settlement)` · **Status**: `Production` · **Ecosystem**: Multi-chain EVM

### Basic Info

**Type**: hybrid (off-chain HTTP protocol with on-chain settlement)

**Status**: Production (live on Base, Ethereum, Arbitrum, Polygon, Solana; 156K+ weekly transactions; x402 Foundation established)

**Ecosystem**: Multi-chain EVM (Base primary, Ethereum, Arbitrum, Optimism, Polygon) + Solana. Primary asset: USDC. Built by Coinbase + Cloudflare.

**Launch Date**: April 2025 (initial release); September 2025 (x402 Foundation established; Cloudflare Workers integration)

### Onboarding Flow

**Registration Steps**:
> Client (paying agent):
> 1. Get crypto wallet with USDC (EIP-3009 or Permit2 compatible). Merchant (Resource Server):
> 1. Set up HTTP server returning 402 with payment requirements.
> 2. Choose Facilitator (Coinbase-hosted or self-hosted). Flow: Agent gets 402 -> parses requirements -> signs EIP-3009 authorization -> retries with X-PAYMENT header -> Merchant verifies via Facilitator -> serves resource -> Facilitator settles on-chain.

**Human Involvement**: approve-only (human funds wallet initially; agent handles all payments autonomously)

**Agent Autonomy**: Very high. Once funded, agent autonomously: detects 402, parses requirements, evaluates, signs, retries. No registration needed. Wallet address IS identity.

**Time To First Action**: seconds (zero registration; funded wallet can pay immediately)

### Identity Model

**Identity Type**: Wallet address (Ethereum EOA or smart contract wallet). No separate registration, DID, or API key needed.

**Key Management**: Standard Ethereum wallet keys (secp256k1 EVM, Ed25519 Solana). EIP-3009 signatures with built-in validBefore/validAfter expiration. Supports KMS, TEE wallets, MPC wallets, smart contract wallets (ERC-4337). Key rotation = switch wallets.

**Multi Instance Support**: Yes. Multiple instances can share wallet (coordinate nonces) or each use own wallet. Smart contract wallets support multiple signers.

**Recovery Mechanism**: Standard wallet recovery: seed phrase, social recovery (smart contract wallets), multisig guardians. Lost keys = lost funds.

**Versioning Support**: N/A. Stateless protocol. Payment history on-chain provides implicit activity versioning.

### Security

**Authentication Method**: Wallet signature (EIP-3009 transferWithAuthorization). Signature IS authentication.

**Known Vulnerabilities**: 1. Push payment irreversibility (no chargeback/escrow). 2. Facilitator trust (could fail to settle or front-run). 3. Replay attacks (mitigated by nonce/expiration). 4. MITM on 402 responses. 5. Wallet draining if key compromised. 6. Gas price manipulation delaying settlement.

**Revocation Speed**: seconds (authorizations have validBefore timestamps; wallet funds can be moved immediately on compromise)

**Anti Sybil**: Economic barrier (need funded wallet). No registration = no Sybil registration surface. Payment cost IS anti-Sybil.

**Data Exposure Risk**: Low to moderate. On-chain: wallet addresses + amounts public. HTTP: payment requirements in headers. No PII or API keys. Pseudonymous but linkable.

**Bot To Bot Attack Surface**: Low. Simple request-pay-receive with crypto verification. Risks: price gouging, service non-delivery, payment flooding. Agent-side limits mitigate.

**Skill Plugin Vetting**: N/A. Payment protocol, not skill framework. No merchant vetting. Agent implements own allowlists/price limits.

**Attestation Mechanism**: Cryptographic payment proof: signed EIP-3009 authorization + on-chain settlement tx. Can feed into ERC-8004 reputation (proofOfPayment). No TEE attestation.

### Off-chain / On-chain Linking

**Linking Support**: yes (native — HTTP off-chain + on-chain settlement bridge)

**Linking Mechanism**: Wallet address links both layers. HTTP 402 off-chain, token transfers on-chain. ERC-8004 registration files can include x402 endpoints.

**Transfer Behavior**: N/A. Wallet-based identity, not transferable tokens. Agent changes wallets by funding new one. Payment history stays with old address.

### Delegation & Authorization

**Delegation Model**: EIP-3009 transferWithAuthorization (single-level: wallet owner -> Facilitator for specific payment). Multi-level via AP2 mandates. Smart contract wallets enable session keys and spending limits.

**Authorization Granularity**: Fine-grained per-payment. Each authorization specifies exact amount, recipient, token, time window, nonce. Wallet-level limits via smart contracts. Intent-aware when combined with AP2.

### Discovery & Interoperability

**Discovery Mechanism**: HTTP-native. Agents discover x402 by receiving 402 responses. No registry needed. ERC-8004 can declare x402 endpoints.

**Capability Declaration**: HTTP 402 response IS the capability declaration (amount, asset, recipient, chain, expiration, scheme).

**Cross Platform Portability**: Highly portable. Works with any HTTP client, any EVM-compatible wallet, any chain. Any agent framework can integrate via HTTP middleware.

**Standards Compliance**: HTTP RFC 7231 (402), EIP-3009, EIP-2612 (Permit), Permit2, ERC-20, JSON. Compatible with W3C VC via AP2.

**Protocol Composability**: High. Composes with: AP2 (crypto payment rail), A2A (agent commerce), ERC-8004 (identity + proofOfPayment), MCP (tool access with payment), Cloudflare Workers (edge middleware), Coinbase AgentKit (wallet management).

### Push/Pull Communication

**Pull Support**: REST API (HTTP GET/POST for resources; Facilitator /verify and /settle endpoints). On-chain reads for settlement.

### Trust & Reputation

**Trust Model**: Cryptographic (trustless payment verification via signatures + blockchain consensus + Facilitator trust).

**Reputation System**: None native. On-chain payment history provides implicit reputation. ERC-8004 can incorporate x402 proofOfPayment.

### Payment & Economics

**Payment Integration**: x402 IS a payment protocol. USDC primary, EURC, any EIP-3009 token. Permit2 fallback for other ERC-20. Multi-chain. Sub-$0.001 micropayments on L2. Crypto rail in AP2.

**Economic Model**: Per-transaction only: gas fees (sub-$0.01 on L2), Facilitator fees (varies). No protocol token, staking, subscription, or registration costs.

### Governance & Compliance

**Audit Trail Capability**: Blockchain anchoring (native). Every settlement is immutable on-chain tx. Off-chain signed authorizations + on-chain records = complete audit trail.

**Lifecycle Management**: Minimal by design. Stateless: no registration, no activation, no suspension. Wallet active if funded. Payment history immutable. Agent lifecycle via companion protocols.

### Uncertain Fields (3)

- push_support
- subscription_model
- regulatory_alignment

---

## Agent Network Protocol (ANP)

**Type**: `off-chain` · **Status**: `Spec-only` · **Ecosystem**: Framework-agnostic

### Basic Info

**Type**: off-chain

**Status**: Spec-only (specification published and evolving; reference implementations available on GitHub; W3C AI Agent Protocol Community Group established June 2025; not yet widely adopted in production systems)

**Ecosystem**: Framework-agnostic (designed as an open protocol independent of any blockchain or cloud platform; W3C Community Group hosted; DID-based identity layer is chain-agnostic but can integrate with any DID method including Ethereum-based did:ethr or did:web)

**Launch Date**: 2024 (initial specification and GitHub repository published in late 2024 by the AgentNetworkProtocol project; W3C AI Agent Protocol Community Group officially established June 2025 to formalize and advance the specification)

### Onboarding Flow

**Registration Steps**:
> 1) Generate a DID (Decentralized Identifier): The agent creates or is provisioned a W3C DID (e.g., did:web or did:key) which serves as its persistent identity. The DID Document contains the agent's public keys, service endpoints, and authentication methods.
> 2) Create an Agent Description Document (ADP): Using the Agent Description Protocol, the agent publishes a machine-readable description of its capabilities, supported protocols, service endpoints, and metadata. This is analogous to an Agent Card but richer and DID-anchored.
> 3) Register in Discovery System: The agent's ADP is made discoverable through the ANP discovery mechanism. For did:web this means hosting the DID Document and ADP at a well-known URL on the agent's domain.
> 4) Establish Encrypted Communication Channel: Using the identity layer (Layer 1), the agent can establish DID-authenticated, end-to-end encrypted communication channels with other agents using DIDComm-style messaging.
> 5) Meta-Protocol Negotiation (Layer 2): When two agents connect, they use the meta-protocol layer to negotiate which application-layer protocols they will use for interaction, discovering compatible communication formats dynamically.
> 6) Application Protocol Execution (Layer 3): The agents exchange messages using the negotiated application protocol for their specific use case (e.g., task delegation, data exchange, commerce).

**Human Involvement**: full-setup (human or DevOps must provision the DID, configure service endpoints, write and publish the Agent Description Document, and deploy the agent with the ANP stack; once deployed, agents can autonomously discover and interact with each other)

**Agent Autonomy**:
> After initial setup by a human, agents have high autonomy: they can autonomously discover other agents via ADP, negotiate communication protocols via the meta-protocol layer, establish encrypted channels, and interact through application protocols. Self-registration is partially possible if the agent has tooling to create its own DID and publish its ADP, but infrastructure provisioning (hosting, domain, etc.) typically requires human involvement.

**Time To First Action**: minutes to hours (DID creation is instant; ADP publication depends on hosting setup; once published, first encrypted agent-to-agent communication can occur within seconds; overall setup time depends on infrastructure provisioning and DID method chosen)

### Identity Model

**Identity Type**:
> DID (W3C Decentralized Identifier). The agent's primary identity is a DID which resolves to a DID Document containing public keys, service endpoints, and authentication methods. ANP supports multiple DID methods (did:web, did:key, did:ethr, etc.) making the identity layer flexible and standards-compliant.

### Security

**Data Exposure Risk**:
> DID Documents are public by design and expose: public keys, service endpoints (URLs/IP addresses), authentication methods, and capability information. Agent Description Protocol documents expose: agent capabilities, supported protocols, service metadata. During encrypted communication (Layer 1), message contents are protected by end-to-end encryption. However, communication metadata (who is talking to whom, when, frequency) may be observable at the network level.

### Off-chain / On-chain Linking

**Linking Support**: yes (through DID methods that bridge off-chain and on-chain, such as did:ethr for Ethereum or did:web for domain-based identity)

### Discovery & Interoperability

**Discovery Mechanism**:
> Agent Description Protocol (ADP): agents publish machine-readable description documents that other agents can discover and parse. Discovery methods include: DID resolution (resolving a DID to find service endpoints and ADP references), well-known URL patterns, and potential integration with decentralized registries. ADP enables capability-based discovery where agents find peers by matching required capabilities.

**Capability Declaration**:
> Agent Description Protocol (ADP) documents: JSON-LD or structured format describing the agent's name, description, capabilities, supported application protocols, service endpoints, DID reference, authentication requirements, and metadata. Similar to Agent Cards but designed to be DID-anchored and W3C-aligned. The meta-protocol layer also facilitates runtime capability discovery during agent-to-agent negotiation.

**Cross Platform Portability**:
> Highly portable via DID. Since identity is based on W3C DIDs, it is inherently cross-platform and not locked to any specific vendor or blockchain. The same DID can be used across different ANP implementations, other DID-compatible systems, and even non-ANP protocols that support DID authentication. Portability is a core design principle of the three-layer architecture.

### Payment & Economics

**Economic Model**:
> Free (the protocol specification is open and free; DID creation is free for most methods like did:key and did:web; no staking, gas fees, or subscription required at the protocol level; operational costs are limited to hosting/infrastructure for DID Documents and ADP endpoints; blockchain-anchored DID methods may incur gas fees for DID operations)

### Uncertain Fields (26)

- key_management
- multi_instance_support
- recovery_mechanism
- versioning_support
- authentication_method
- known_vulnerabilities
- revocation_speed
- anti_sybil
- bot_to_bot_attack_surface
- skill_plugin_vetting
- attestation_mechanism
- linking_mechanism
- transfer_behavior
- delegation_model
- authorization_granularity
- standards_compliance
- protocol_composability
- push_support
- pull_support
- subscription_model
- trust_model
- reputation_system
- payment_integration
- regulatory_alignment
- audit_trail_capability
- lifecycle_management

---

## Agent2Agent Protocol (A2A)

**Type**: `off-chain` · **Status**: `Production` · **Ecosystem**: Cloud/Enterprise

### Basic Info

**Type**: off-chain

**Status**: Production

**Ecosystem**: Cloud/Enterprise (framework-agnostic; ERC-8004 extension available for Ethereum on-chain agents)

**Launch Date**: April 9, 2025 (announced at Google Cloud Next); v0.3 released July 31, 2025; donated to Linux Foundation June 23, 2025

### Onboarding Flow

**Registration Steps**:
> 1. Publish an Agent Card: Create a JSON metadata document describing the agent's identity, capabilities, skills, service endpoint URL, authentication requirements, and supported protocols. Host it at /.well-known/agent-card.json (recommended per RFC
> 8
> 6
> 1
> 5) or any discoverable URL.
> 2. Configure Authentication: Define securitySchemes in the Agent Card (Bearer tokens, OAuth 2.0, OpenID Connect, API keys, mTLS). Obtain credentials through out-of-band enterprise processes (e.g., OAuth client registration, API key provisioning).
> 3. Implement A2A Server Endpoint: Stand up an HTTP(S) endpoint that implements the JSON-RPC 2.0 A2A methods (message/send, message/stream, tasks/get, tasks/cancel, etc.).
> 4. Configure Transport Capabilities: Declare streaming (SSE), pushNotifications (webhook), and stateTransitionHistory support in the Agent Card capabilities field.
> 5. Register in Discovery System: Optionally register in a developer portal, enterprise registry, or DNS-based discovery for other agents to find the Agent Card.
> 6. Test Connectivity: Use SDK tooling (Python SDK, etc.) to verify agent card fetching, authentication handshake, and task lifecycle (submitted -> working -> completed).

**Human Involvement**: full-setup

**Agent Autonomy**: Agent cannot fully self-register. A human or DevOps process must provision the server, configure authentication credentials, and publish the Agent Card. Once deployed, the agent operates autonomously for task execution, delegation, and collaboration.

**Time To First Action**: minutes to hours (depends on infrastructure setup; once Agent Card is published and server is running, first task can be submitted within seconds)

### Identity Model

**Identity Type**: Agent Card (JSON metadata document) + standard web identity primitives (OAuth 2.0 tokens, API keys, mTLS certificates, OpenID Connect). No protocol-native DID or wallet identity.

**Key Management**:
> A2A delegates key management to standard enterprise practices. OAuth tokens and API keys are provisioned out-of-band. Best practices recommend: short-lived scope-limited tokens stored in secure vaults, regular credential rotation, automated certificate renewal for TLS/mTLS. SPIFFE IDs and certificates can be auto-managed with managed trust domains. Agent Cards MAY be digitally signed using JSON Web Signature (JWS, RFC
> 7
> 5
> 1
> 5) for authenticity and integrity. No protocol-mandated rotation frequency; left to implementation.

**Multi Instance Support**: Yes. The protocol treats agents as services; multiple runtime instances can serve the same Agent Card endpoint behind load balancers. Protocol versioning allows agents to expose multiple interfaces for the same transport under different URLs.

**Recovery Mechanism**:
> Not specified in the protocol. Recovery from key compromise or agent failure is left to implementation. Best practices include: credential revocation via OAuth token invalidation, re-provisioning Agent Cards, using infrastructure resilience patterns (e.g., Dapr resiliency API for retries, timeouts, circuit breakers).

**Versioning Support**: Yes. Agents can expose multiple protocol version interfaces. Tooling libraries and SDKs must provide mechanisms for protocol version negotiation. Agent Cards include version fields. No on-chain hash appending; versioning is off-chain metadata.

### Security

**Authentication Method**: Flexible, declared in Agent Card securitySchemes: OAuth 2.0, OpenID Connect Discovery, Bearer tokens, Basic Auth, API keys, mutual TLS (mTLS). Aligned with OpenAPI authentication schemes. Authentication is obtained out-of-band; the protocol itself does not perform credential exchange.

**Known Vulnerabilities**:
> 1. Agent Card Spoofing/Shadowing: Malicious actors can clone legitimate agent skills or embed prompt-injection payloads in metadata fields (descriptions, skills) that get injected into downstream LLM system prompts.
> 2. Agent Session Smuggling (Palo Alto Unit42): Exploits A2A's stateful task model to inject covert malicious instructions into established cross-agent sessions.
> 3. Prompt Injection: Since the expected consumer is an LLM, prompt injection mitigations may be minimal; attackers can identify A2A endpoints and test common jailbreaks.
> 4. Agent Impersonation: Adversarial agents mimic trusted agent identity/capabilities due to weak identity management.
> 5. Sensitive Data Leakage: Payment credentials, identity documents, and personal data may traverse intermediate agents; malicious agents advertising data protection can steal sensitive information.
> 6. Coarse-grained Token Privileges: Tokens often grant more privileges than needed, enabling privilege escalation.
> 7. Multi-Agent Infection: Malicious prompts can self-replicate across interconnected agents like a virus.
> 8. JSON-RPC Attack Surface: Unicode normalization, nested object depth, oversized payloads.
> 9. Unauthenticated Agent Card Access: Without authentication, anyone can harvest capabilities, endpoint URLs, and sample prompts.

**Revocation Speed**: minutes (OAuth token revocation is near-instant; Agent Card updates depend on client caching/refresh intervals; compromised Agent Cards remain exposed until clients fetch updates)

**Anti Sybil**:
> Rate limiting and request throttling supported via centralized policy enforcement. Trust scores and service-level agreements can prioritize communications. No protocol-native staking, proof-of-work, or human verification. Cryptographically validated agent identities recommended. Dynamic trust lists and reputation systems recommended but not mandated.

**Data Exposure Risk**:
> Agent Cards expose: agent name, description, skills, capabilities, service endpoint URLs, authentication scheme details, sample prompts, provider information, and documentation URLs. Without proper authentication on Agent Card endpoints, attackers can harvest internal cloud storage buckets, private analytics endpoints, and administrative tokens. During task execution, sensitive data (payment credentials, identity documents, calendar entries, personal data) may traverse intermediate agents.

**Bot To Bot Attack Surface**:
> High risk area. Documented attacks include: (
> 1) Agent Card Shadowing - unauthorized cloning of legitimate agent skills to intercept tasks; (
> 2) Agent Session Smuggling - injecting malicious instructions into established sessions; (
> 3) Prompt Injection via Agent Metadata - embedding malicious instructions in Agent Card description/skill fields; (
> 4) Multi-Agent Chain Infection - compromised agent influences others in delegation workflows; (
> 5) Man-in-the-Middle via better skill advertising - malicious agent with superior advertising hijacks task routing. Mitigations recommended: input sanitization, task-scoped permissions, cryptographic agent identity validation, runtime monitoring.

**Skill Plugin Vetting**:
> No built-in skill vetting or sandboxing in the protocol. Skills are declared in Agent Cards as descriptive metadata. Validation of skill trustworthiness is left to client implementations. ERC-8004 extension adds on-chain validation registries for cryptographic and crypto-economic task verification. Best practice recommends automated tests ensuring Agent Cards expose only intended capabilities.

**Attestation Mechanism**:
> Agent Cards MAY be digitally signed using JSON Web Signature (JWS, RFC
> 7
> 5
> 1
> 5) for authenticity and integrity (added in v0.3 as 'signed security cards'). ERC-8004 extension adds cryptographic proofs (zkTLS, TEE attestations) and crypto-economic validation (restaking, AVSs). No native TEE remote attestation or Verifiable Credentials in core protocol.

### Off-chain / On-chain Linking

**Linking Support**: Yes (via ERC-8004 extension)

**Linking Mechanism**:
> ERC-8004 provides a trustless extension for on-chain agents: Identity Registry for discoverable cross-chain agent IDs, Reputation Registry for structured verifiable feedback, Validation Registry for cryptographic and crypto-economic task verification. Core A2A protocol is off-chain only; ERC-8004 bridges to Ethereum smart contracts.

### Delegation & Authorization

**Delegation Model**:
> Agent-to-agent delegation via task sub-delegation: agents can delegate sub-tasks, exchange information, and coordinate actions. Authorization uses standard enterprise OAuth 2.0 / OpenID Connect flows. Short-lived tokens scoped per task, expiring in minutes, to eliminate long-lived secrets. If an agent requires additional credentials for a different system, it transitions to auth-required state; the client obtains new credentials out-of-band and provides them in subsequent requests. Enterprise SSO integration supported.

**Authorization Granularity**: Coarse (role/scope) - tokens are typically coarse-grained, giving agents more privileges than needed. Protocol relies on OAuth 2.0 scopes. Fine-grained per-task scoping recommended but not enforced by protocol.

### Discovery & Interoperability

**Discovery Mechanism**: /.well-known/agent-card.json (RFC 8615 convention); Developer Portals for registry-based discovery; DNS-based discovery; direct URL reference. Agent Cards are machine-readable JSON descriptors.

**Capability Declaration**: Agent Card (JSON document): declares name, description, skills (with descriptive metadata), capabilities (streaming, pushNotifications, stateTransitionHistory), supported authentication schemes, service endpoint URL, provider information, version, and documentation URL.

**Cross Platform Portability**:
> Partially portable. A2A is framework-agnostic and vendor-neutral; any agent implementing the protocol can interoperate regardless of underlying framework. However, identity is tied to the Agent Card and its hosting infrastructure; no portable DID. ERC-8004 extension enables cross-chain portability for on-chain agents.

**Standards Compliance**: HTTP/HTTPS, JSON-RPC 2.0, Server-Sent Events (SSE), gRPC (v0.3+), OAuth 2.0, OpenID Connect Discovery, OpenAPI authentication schemes, RFC 8615 (.well-known), RFC 7515 (JWS for signed Agent Cards), RFC 7807 (Problem Details for errors). Not W3C DID or W3C VC natively.

**Protocol Composability**: High composability. A2A + MCP (complementary: A2A for agent-to-agent, MCP for agent-to-tool). A2A + AP2 (Agent Payments Protocol for payment integration). A2A + ERC-8004 (on-chain identity/reputation/validation). A2A can integrate with enterprise middleware (Dapr, service meshes).

### Push/Pull Communication

**Push Support**: SSE (Server-Sent Events for streaming) + Webhook (HTTP POST push notifications to client-provided URLs for async/long-running tasks)

**Pull Support**: REST API (JSON-RPC 2.0 over HTTP: tasks/get for polling task status, message/send for synchronous request/response)

**Subscription Model**: Webhook registration: clients provide a callback URL during task creation for push notification delivery. Server sends HTTP POST updates to the registered webhook for task state changes. SSE streams provide real-time incremental updates for active connections.

### Trust & Reputation

**Trust Model**:
> Federated (enterprise trust via OAuth/OIDC) with optional decentralized extension (ERC-8004 on-chain reputation). Trust is established via standard enterprise authentication; dynamic trust lists and reputation systems are recommended but not mandated. Cryptographically signed Agent Cards (JWS) provide authenticity verification.

**Reputation System**: None in core protocol. ERC-8004 extension provides on-chain Reputation Registry for structured, verifiable feedback. Best practices recommend trust scores and service-level agreements for prioritizing agent communications.

### Payment & Economics

**Payment Integration**: AP2 (Agent Payments Protocol) - open protocol by Google for agent-led payments, designed as A2A extension. Supports stablecoins, cryptocurrencies, and traditional payments. Uses one-time tokens with expiration for secure payment handoffs.

**Economic Model**: Free (open protocol, no staking or gas fees for core usage). Infrastructure costs depend on deployment (cloud hosting, compute). ERC-8004 extension may involve gas fees for on-chain registration.

### Governance & Compliance

**Audit Trail Capability**:
> Task state transition history (stateTransitionHistory capability in Agent Card). Tasks have defined lifecycle states (submitted, working, completed, canceled, rejected, failed) with status tracking. Signed Agent Cards (JWS) provide integrity verification. No built-in hash chain or blockchain anchoring in core protocol; ERC-8004 extension adds on-chain anchoring.

**Lifecycle Management**: Partial. Task lifecycle: submitted -> working -> completed/canceled/rejected/failed (terminal states). Agent lifecycle: deployment, Agent Card publication, operational phase. No formal protocol-level suspension, migration, upgrade, or decommissioning procedures; left to infrastructure management.

### Uncertain Fields (2)

- transfer_behavior
- regulatory_alignment

---

## Amazon Bedrock AgentCore Identity + Policy

**Type**: `off-chain` · **Status**: `Production` · **Ecosystem**: AWS

### Basic Info

**Type**: off-chain

**Status**: Production

**Ecosystem**: AWS (Amazon Web Services cloud-native; integrates with AWS IAM, Amazon Bedrock, and third-party agent frameworks)

**Launch Date**: December 2025 (General Availability at AWS re:Invent 2025; AgentCore announced as part of Amazon Bedrock agent infrastructure suite)

### Onboarding Flow

**Registration Steps**:
> 1. Create an AgentCore runtime in AWS Console or via AWS CLI/SDK: Define the agent's runtime configuration including framework, model, memory, and tool access requirements.
> 2. Configure AgentCore Identity: Enable identity for the agent by creating a workload identity profile. AgentCore automatically provisions a Service-Linked Role (SLR) that grants the agent a scoped AWS IAM identity without manual role creation.
> 3. Set up OAuth-based authentication for third-party tool access: Configure OAuth 2.0 On-Behalf-Of (OBO) flows so the agent can authenticate to external services (e.g., Salesforce, GitHub, Jira) using the delegating user's context. Register OAuth client credentials for each external service.
> 4. Define AgentCore Policy: Write authorization policies using Cedar language (declarative, formal language), or use natural language policy authoring where the system translates human-readable intent into Cedar policies. Automated reasoning (provably correct verification) validates that policies enforce intended constraints.
> 5. Attach tools and integrations: Connect the agent to tools (APIs, databases, Lambda functions) through AgentCore's tool gateway, with identity-aware access control ensuring the agent only accesses resources within its policy scope.
> 6. Deploy and activate: Deploy the agent runtime. AgentCore handles infrastructure provisioning, scaling, and identity credential management automatically.
> 7. Agent begins operations: The agent authenticates via its SLR-backed identity, obtains scoped tokens, and interacts with both AWS services and third-party tools within its authorized policy boundaries.

**Human Involvement**: full-setup

**Agent Autonomy**:
> Agent cannot self-register. A developer or platform administrator must create the AgentCore runtime, configure identity, define policies, and deploy the agent. Once deployed, the agent operates autonomously — authenticating to services, executing tasks, and accessing tools within its policy boundaries without further human intervention. The SLR and OBO flows enable seamless credential management at runtime.

**Time To First Action**: minutes (AgentCore automates infrastructure provisioning and identity setup; once the runtime is created and deployed, the agent can authenticate and perform its first action within minutes)

### Identity Model

**Identity Type**:
> AWS IAM workload identity via Service-Linked Role (SLR). The agent receives a first-class IAM identity automatically provisioned by AgentCore, distinct from user IAM identities. For third-party service access, OAuth 2.0 tokens (via OBO flows) provide delegated identity. The identity model is purpose-built for AI agents rather than repurposing human or service account identity primitives.

**Key Management**:
> Fully managed by AWS. Service-Linked Roles use AWS STS (Security Token Service) to issue short-lived temporary credentials — no long-lived access keys. Credentials are automatically rotated by the AWS runtime. For OAuth OBO flows, token lifecycle (acquisition, refresh, expiration) is managed by AgentCore's identity service. Developers do not handle raw keys; AWS KMS integration available for encryption keys used by agent workloads. Certificate management for mTLS connections is handled by AWS Certificate Manager if needed.

**Multi Instance Support**: Yes. AgentCore supports horizontal scaling of agent runtimes. Multiple instances share the same Service-Linked Role identity and policy configuration. Each instance receives its own temporary credentials from STS. Auto-scaling is built into the AgentCore infrastructure layer.

### Security

**Authentication Method**:
> IAM STS temporary credentials (AssumeRole via Service-Linked Role) for AWS service access. OAuth 2.0 On-Behalf-Of (OBO) flows for third-party service authentication — the agent acts on behalf of the delegating user with scoped tokens. AWS Signature V4 for API request signing. mTLS supported for service-to-service communication.

**Known Vulnerabilities**:
> 1. Over-permissive policies: Cedar policies that are too broad could grant agents excessive access. Mitigated by automated reasoning that formally verifies policy correctness.
> 2. OAuth token scope creep: OBO flows may accumulate permissions across delegation chains. Mitigated by policy-enforced scope boundaries.
> 3. Confused deputy attacks: Agent acting on behalf of user might access resources the user didn't intend. Mitigated by Cedar policy constraints and AWS IAM session policies.
> 4. Third-party tool supply chain risk: OAuth integrations with external services (Salesforce, GitHub) inherit those services' security posture.
> 5. Prompt injection leading to unauthorized API calls: If the agent's LLM is manipulated, it could attempt actions beyond intended scope. Mitigated by Cedar policy enforcement at the identity layer (policy is external to the LLM, not bypassable via prompt injection). Being a relatively new service, undiscovered issues may emerge as adoption scales.

**Revocation Speed**:
> seconds to minutes (STS temporary credentials have configurable short lifetimes, typically 1 hour max. IAM policy changes take effect immediately for new credential issuance. Active sessions can be revoked by updating IAM policies or disabling the SLR. OAuth tokens for third-party services can be revoked through the respective service's revocation endpoint.)

**Anti Sybil**:
> AWS account-level controls: IAM quotas limit the number of roles and policies. AWS Organizations Service Control Policies (SCPs) restrict resource creation across accounts. AgentCore runtime creation requires AWS account authentication and IAM permissions. Billing-based deterrent (AWS usage generates costs). No staking or proof-of-work mechanisms (enterprise cloud trust model).

**Data Exposure Risk**:
> Agent identity metadata (role ARN, policy documents) is visible within the AWS account to authorized IAM users. OAuth tokens for third-party services contain scopes revealing agent permissions. CloudTrail logs expose API call patterns. Data accessed by the agent (via Bedrock knowledge bases, S3, databases) depends on granted permissions — over-privileged agents could access sensitive data. AgentCore's policy layer aims to minimize this by enforcing least-privilege through Cedar policies.

**Bot To Bot Attack Surface**:
> AgentCore's architecture separates identity/policy from the LLM layer, providing a structural defense: even if an agent's LLM is manipulated via prompt injection, the Cedar policy layer enforces access boundaries independently. Risks include: (
> 1) Prompt injection causing the agent to attempt unauthorized actions (blocked by policy, but generates noise); (
> 2) Cross-agent data leakage if agents share resources without proper IAM boundaries; (
> 3) Delegation chain attacks where a compromised agent propagates malicious actions through OBO token chains. Mitigations: Cedar automated reasoning for policy verification, IAM boundary enforcement, CloudTrail monitoring, and GuardRails for content filtering in Bedrock.

### Off-chain / On-chain Linking

**Linking Support**: No

**Linking Mechanism**:
> N/A. Amazon Bedrock AgentCore is a purely cloud-native enterprise identity system. There is no built-in mechanism to link agent identities to blockchain-based identities (ERC-721, on-chain DIDs, etc.). Custom application logic could bridge AWS IAM identity to on-chain systems, but this is not a platform feature.

**Transfer Behavior**: N/A. No on-chain token component exists. Agent identity lifecycle is managed entirely within AWS IAM and AgentCore.

### Delegation & Authorization

**Delegation Model**:
> OAuth 2.0 On-Behalf-Of (OBO) flow for human-to-agent delegation: a user authenticates to a client application, and the agent exchanges the user's token for a scoped token to access third-party services on the user's behalf. AWS IAM role assumption (AssumeRole) for agent-to-service delegation within AWS. Service-Linked Role (SLR) provides automatic, scoped delegation from AgentCore to the agent runtime. Cross-account delegation via IAM trust policies. Agent-to-agent delegation can be implemented through chained role assumptions or OBO token forwarding.

**Authorization Granularity**:
> Fine-grained (ABAC) + intent-aware. Cedar language provides attribute-based access control with: principal attributes (agent identity, role), action attributes (API operations), resource attributes (data classification, ownership), and context attributes (time, location, risk signals). Natural language policy authoring allows non-technical stakeholders to define intent, which is compiled to Cedar. Automated reasoning (SMT solver-based formal verification) mathematically proves policy correctness — e.g., proving that an agent can never access data outside its designated scope. This is a unique differentiator: authorization correctness is provably verified, not just tested.

### Discovery & Interoperability

**Cross Platform Portability**:
> Locked-in to AWS ecosystem. Agent identities are IAM roles specific to the AWS account and region. AgentCore supports multiple agent frameworks (LangChain, CrewAI, custom) for runtime portability, but identity is AWS-native. Workload Identity Federation (via IAM OIDC providers) allows external identity providers to assume roles, providing limited cross-cloud authentication. Agent identity itself is not portable via DID or VC.

**Standards Compliance**:
> OAuth 2.0 (for OBO flows and third-party auth), AWS IAM (proprietary but REST/JSON-based), AWS Signature V4, Cedar language (open-source, Apache 2.0 licensed, developed by AWS), OpenID Connect (as OIDC identity provider for federation). Not W3C DID or W3C VC compliant natively. SCIM not used for agent provisioning.

**Protocol Composability**:
> Moderate within AWS ecosystem. AgentCore integrates with: Amazon Bedrock (models, knowledge bases, guardrails), AWS Lambda (tool execution), Amazon S3 (data access), AWS Step Functions (workflow orchestration), Amazon API Gateway (external API access), and other AWS services via IAM. Cross-ecosystem composability is limited — no native A2A, MCP, or ERC-8004 integration. Custom integration layers would be needed for non-AWS agent protocols. AgentCore is framework-agnostic at the runtime level (supports LangChain, CrewAI, AutoGen).

### Push/Pull Communication

**Push Support**: Webhook (Amazon EventBridge for event-driven push notifications). Amazon SNS for push messaging. CloudWatch Alarms for threshold-based notifications. No built-in WebSocket or SSE for agent-to-agent push within AgentCore itself.

**Pull Support**: REST API (AWS SDK / CLI for querying agent status, invoking agents, retrieving results). Amazon Bedrock InvokeAgent API for synchronous request/response. S3 for artifact retrieval. CloudWatch Logs for activity polling.

**Subscription Model**: Amazon EventBridge rules for event-pattern-based subscriptions to agent lifecycle and execution events. SNS topic subscriptions for fan-out notifications. CloudWatch event subscriptions for monitoring. SQS queues for asynchronous event consumption. All subscription endpoints authenticated via IAM.

### Trust & Reputation

**Trust Model**:
> Centralized (platform-verified). Trust is rooted in AWS IAM — only authenticated and authorized principals within an AWS account can create and manage agent identities. Cross-account trust is managed through IAM trust policies and AWS Organizations. Cedar automated reasoning provides formal verification of trust boundaries. AWS is the ultimate trust anchor.

**Reputation System**: None as a standalone reputation system. AWS CloudTrail provides comprehensive audit logs of agent activity. Amazon CloudWatch metrics track agent performance and error rates. No peer-based reputation, on-chain registry, staking-based reputation, or VC-based trust scoring.

### Payment & Economics

**Payment Integration**:
> None natively for agent-to-agent payments. AgentCore is an identity and runtime infrastructure service. AWS Marketplace integration for commercial agent distribution is possible but not a built-in AgentCore feature. No AP2, ACP, or x402 integration. Payment for AWS service usage is handled through standard AWS billing.

**Economic Model**:
> Pay-per-use (standard AWS pricing model). Costs include: Bedrock model invocation charges, AgentCore runtime compute charges, data transfer, storage, and associated AWS service usage. No staking, gas fees, or token purchases. Free tier may apply for initial usage. Enterprise pricing available through AWS Enterprise Discount Program.

### Governance & Compliance

**Audit Trail Capability**:
> Comprehensive. AWS CloudTrail logs all API calls including agent identity operations, policy changes, and tool invocations with full request/response metadata. CloudTrail Lake for long-term queryable audit storage. CloudTrail Insights for anomaly detection. Cedar policy evaluation logs provide authorization decision audit trails. All events include timestamps, principal identity, source IP, and request parameters. Integration with AWS Security Hub and Amazon Detective for investigation.

### Uncertain Fields (8)

- versioning_support
- recovery_mechanism
- skill_plugin_vetting
- attestation_mechanism
- discovery_mechanism
- capability_declaration
- regulatory_alignment
- lifecycle_management

---

## Google Agent Payments Protocol (AP2)

**Type**: `off-chain standard` · **Status**: `Production` · **Ecosystem**: Cloud/Enterprise

### Basic Info

**Type**: off-chain standard

**Status**: Production (spec published; 60+ launch partners; integrated into Google Wallet and Google Pay ecosystem)

**Ecosystem**: Cloud/Enterprise (payment-agnostic; supports traditional payment rails, stablecoins, and crypto including x402). Not blockchain-specific.

**Launch Date**: September 2025 (announced at Google Cloud event; 60+ partners including Visa, Mastercard, PayPal, Stripe, Adyen, Shopify, Square, Coinbase)

### Onboarding Flow

**Registration Steps**:
> 1. PSP or merchant registers with AP2 ecosystem by implementing the mandate specification.
> 2. Agent developer integrates AP2 SDK to enable mandate issuance/presentation.
> 3. Human principal creates an Intent Mandate (W3C VC) specifying spending limits, approved merchants/categories, time constraints.
> 4. Agent receives Intent Mandate.
> 5. When purchasing, agent presents Intent Mandate to merchant.
> 6. Merchant generates Commerce Mandate (VC) with transaction details.
> 7. Agent combines mandates to request Payment Mandate from PSP.
> 8. PSP validates chain, issues Payment Mandate.
> 9. Agent presents Payment Mandate to complete transaction.

**Human Involvement**: approve-only (human creates initial Intent Mandate; agent handles all subsequent steps autonomously)

**Agent Autonomy**: High within delegated authority. Agent can autonomously discover, negotiate, purchase, and pay within Intent Mandate constraints.

**Time To First Action**: minutes (once Intent Mandate created and SDK integrated)

### Identity Model

**Identity Type**: W3C Verifiable Credentials (mandates as identity assertion + authorization). Compatible with DIDs, OAuth tokens, platform-specific systems.

**Key Management**: Delegates to underlying identity/payment systems. Mandates signed using standard VC mechanisms (JSON-LD, JWS). Intent Mandates have built-in expiration. Payment Mandates typically single-use.

**Recovery Mechanism**: Mandate revocation by human principal invalidates all downstream mandates. Standard VC revocation mechanisms (revocation lists, status lists) apply.

### Security

**Authentication Method**: VC presentation (multi-party: human signs Intent, merchant signs Commerce, PSP signs Payment Mandate)

**Revocation Speed**: seconds to minutes (Intent Mandate revocation near-instant; Payment Mandates typically short-lived/single-use)

**Anti Sybil**: Delegated to payment infrastructure (KYC/AML on human principal, spending limits, merchant fraud detection)

**Data Exposure Risk**: Moderate. Mandates contain spending limits, merchant categories, agent identity, transaction details. Selective disclosure via VC model.

**Bot To Bot Attack Surface**: Moderate. Mandate chain provides cryptographic verification but risks include misleading Commerce Mandates, price manipulation, prompt injection influencing purchases.

**Skill Plugin Vetting**: Not directly addressed. AP2 is payment protocol, not skill framework. Mandates can restrict merchant categories as indirect vetting.

**Attestation Mechanism**: W3C Verifiable Credentials provide cryptographic proof of authorization chain. No TEE attestation in core protocol.

### Off-chain / On-chain Linking

**Linking Support**: yes (payment-agnostic, supports both on-chain and off-chain rails)

**Linking Mechanism**: x402 as crypto rail within AP2. Payment Mandate can authorize x402 stablecoin payment. Mandate chain can reference on-chain identities (DIDs, wallet addresses) or off-chain (OAuth accounts).

### Delegation & Authorization

**Delegation Model**: AP2 mandates (W3C VC delegation chain): Intent Mandate (human->agent, spending authority) -> Commerce Mandate (merchant->agent, transaction details) -> Payment Mandate (PSP->agent, payment authorization). Verifiable, cryptographic delegation.

**Authorization Granularity**: Intent-aware (mandate-based). Supports per-transaction limits, cumulative limits, merchant categories (MCC), specific merchants, time windows, geographic restrictions, product type restrictions, recurring payments.

### Discovery & Interoperability

**Discovery Mechanism**: Relies on existing commerce discovery. Merchants advertise AP2 acceptance. No AP2-specific agent discovery; uses A2A Agent Cards for agent discovery.

**Capability Declaration**: Intent Mandates declare agent's authorized purchasing capabilities. Integrates with A2A Agent Cards for AP2 support declaration.

**Cross Platform Portability**: Highly portable. W3C VCs inherently portable. Same mandate structure works across traditional finance and crypto rails.

**Standards Compliance**: W3C Verifiable Credentials, W3C DID, JSON-LD, OAuth 2.0/2.1, HTTP/HTTPS. Composes with A2A. EMV for cards, ISO 20022 for bank transfers, EIP-3009/Permit2 for x402.

**Protocol Composability**: Very high. Composes with: A2A (agent communication), MCP (tool access), x402 (crypto payments), ERC-8004 (on-chain identity), traditional payment networks (Visa, Mastercard, PayPal, Stripe).

### Push/Pull Communication

**Pull Support**: REST API (mandate verification, payment status, transaction history)

### Trust & Reputation

**Trust Model**: Delegated (credential chains). Trust flows through mandate chain with each party performing verification. Payment providers add institutional trust via KYC/AML.

### Payment & Economics

**Payment Integration**: AP2 IS a payment protocol. Supports: traditional (Visa, Mastercard, PayPal, Stripe, bank transfers), crypto (x402 stablecoins), digital wallets (Google Pay, Apple Pay).

**Economic Model**: Free (open spec, no licensing). Transaction costs depend on rail: cards 1.5-3%, x402 sub-$0.01 on L2, bank transfers vary. No protocol token or staking.

### Governance & Compliance

**Audit Trail Capability**: Signed events (W3C VCs). Each mandate cryptographically signed/timestamped. Selective disclosure for audits. x402 rail adds on-chain records.

**Lifecycle Management**: Mandate lifecycle: creation -> active -> expiration -> revocation. Agent lifecycle handled by companion protocols (A2A, MCP).

### Uncertain Fields (8)

- multi_instance_support
- versioning_support
- known_vulnerabilities
- transfer_behavior
- push_support
- subscription_model
- reputation_system
- regulatory_alignment

---

## Microsoft Entra Agent ID

**Type**: `off-chain` · **Status**: `Beta` · **Ecosystem**: Microsoft Azure / Microsoft 365 / Enterprise

### Basic Info

**Type**: off-chain

**Status**: Beta

**Ecosystem**: Microsoft Azure / Microsoft 365 / Enterprise (cloud-native, framework-agnostic within Microsoft ecosystem)

**Launch Date**: November 2025 (Public Preview announced at Microsoft Ignite 2025; generally available rollout expected 2026)

### Onboarding Flow

**Registration Steps**:
> 1. Admin creates Agent ID in Microsoft Entra admin center: Navigate to the Entra portal, select 'Agent identities' under Identity, and create a new Agent ID object in the directory.
> 2. Configure agent metadata: Set agent name, description, owning application (ISV or first-party), and link to the parent application registration. Agent ID is a first-class directory object distinct from users and service principals.
> 3. Assign permissions and roles: Grant the agent Microsoft Graph API permissions, application roles, or delegated permissions scoped to specific resources (e.g., read user calendar, send email).
> 4. Configure Conditional Access policies: Admin applies Conditional Access policies specifically targeting Agent IDs — e.g., restrict to compliant networks, require specific authentication strengths, enforce session controls.
> 5. Set up lifecycle governance: Configure lifecycle policies including expiration, access reviews, and activity-based deactivation. Link to Microsoft Entra Identity Governance for entitlement management.
> 6. Agent authenticates via OAuth 2.0: The agent runtime obtains tokens using client credentials flow (client_id + client_secret or certificate) or managed identity. Tokens include agent-specific claims identifying the Agent ID.
> 7. Agent begins operations: With a valid access token, the agent can call Microsoft Graph APIs, access Microsoft 365 resources, and interact with other services within its authorized scope.

**Human Involvement**: full-setup

**Agent Autonomy**:
> Agent cannot self-register. An IT administrator or developer must create the Agent ID in the Entra admin center, configure permissions, and set Conditional Access policies. Once provisioned, the agent operates autonomously within its granted permissions — acquiring tokens, making API calls, and performing delegated tasks without further human intervention (unless Conditional Access triggers step-up requirements).

**Time To First Action**: minutes (once the Agent ID is created and permissions are assigned in Entra admin center, the agent can authenticate and perform its first API call within minutes)

### Identity Model

**Identity Type**: First-class directory object in Microsoft Entra ID (Azure AD). Agent ID is a new object type alongside users, groups, and service principals. Identity is expressed via OAuth 2.0 tokens (access tokens with agent-specific claims) and backed by application registrations in the directory.

**Key Management**:
> Keys are managed through Microsoft Entra's standard application credential management. Agents authenticate using client secrets (symmetric keys) or X.509 certificates registered on the application registration. Managed identities (system-assigned or user-assigned) eliminate explicit key management by leveraging Azure's internal token issuance. Certificate rotation is supported with overlap periods. Microsoft recommends certificates over client secrets for production. Key vault integration available for secure storage. Automatic credential rotation is supported through Entra's workload identity federation for some scenarios.

**Multi Instance Support**:
> Yes. Multiple runtime instances of the same agent can authenticate using the same Agent ID (application registration). Each instance obtains its own access tokens. Load balancing and horizontal scaling are standard patterns. Managed identities support multiple VM/container instances sharing the same identity.

**Recovery Mechanism**:
> Standard Microsoft Entra recovery: Soft-delete and restore for accidentally deleted Agent IDs (30-day recovery window). Credential reset via admin portal — new client secrets or certificates can be issued immediately. Managed identities are tied to Azure resources and recreated with the resource. Emergency access via break-glass admin accounts. No social recovery mechanism; recovery is centralized through the Entra admin center.

### Security

**Authentication Method**:
> OAuth 2.0 client credentials flow (client_secret or X.509 certificate), Managed Identity (Azure IMDS token acquisition), Workload Identity Federation (for cross-cloud/external identity providers). Tokens include agent-specific claims. Conditional Access policies can enforce additional authentication requirements (e.g., compliant network, token binding).

**Known Vulnerabilities**:
> 1. Token theft/replay: Access tokens, if intercepted, can be used by attackers until expiry. Mitigated by short token lifetimes, Conditional Access token protection (proof-of-possession), and continuous access evaluation (CAE).
> 2. Overprivileged agents: Agents may be granted broader permissions than needed (e.g., full Graph API access). Mitigated by least-privilege permission assignment and regular access reviews.
> 3. Client secret exposure: Client secrets stored in configuration files or source code can be leaked. Mitigated by using certificates or managed identities instead.
> 4. Consent phishing: Malicious applications could attempt to gain consent for agent permissions. Mitigated by admin consent workflows and consent policies.
> 5. Lateral movement: A compromised agent with broad permissions could access multiple Microsoft 365 resources. Mitigated by Conditional Access, network restrictions, and scoped permissions. Being in Public Preview, the feature may have undiscovered issues as it matures.

**Revocation Speed**:
> seconds to minutes (Continuous Access Evaluation (CAE) enables near-real-time token revocation for critical events. Conditional Access policy changes take effect on next token refresh. Client secrets and certificates can be immediately disabled in the admin portal. Managed identity tokens are short-lived (typically 1 hour) and automatically expire.)

**Anti Sybil**:
> Enterprise directory-based controls: Only authorized administrators can create Agent IDs. Azure subscription limits and Entra directory quotas limit the number of application registrations. Role-based access control (RBAC) restricts who can provision new agents. No staking or proof-of-work mechanisms (enterprise trust model). Audit logs track all Agent ID creation events.

**Data Exposure Risk**:
> Agent ID metadata in the directory (name, description, permissions, application ID) is visible to directory administrators and potentially to other applications with directory read permissions. Access tokens contain claims (tenant ID, application ID, scopes) that reveal the agent's identity and permissions. Microsoft Graph API calls may expose or process sensitive organizational data (emails, calendar, files) depending on granted permissions. Client secrets, if improperly stored, can be exposed.

**Bot To Bot Attack Surface**:
> Within the Microsoft ecosystem, agent-to-agent interaction is mediated through Microsoft Graph and Azure services with built-in authentication. Cross-tenant agent communication requires explicit consent and Conditional Access controls. Risks include: (
> 1) Prompt injection via data accessed through Graph APIs (e.g., malicious content in emails/documents that the agent processes); (
> 2) Privilege escalation if one agent can trigger another agent's actions; (
> 3) Data exfiltration through chained agent delegation. Mitigations: Conditional Access policies per agent, scoped permissions, tenant isolation, and Microsoft's built-in threat detection (Microsoft Defender for Cloud Apps, Entra ID Protection).

**Skill Plugin Vetting**:
> Microsoft manages first-party agent capabilities through its platform (e.g., Microsoft 365 Copilot agents). Third-party agents/plugins go through the Microsoft Partner Center and App Source certification for marketplace distribution. Custom agents within an organization are governed by admin consent and permission policies. No built-in sandboxing for individual skills/tools — security is enforced at the API permission level via OAuth scopes.

**Attestation Mechanism**:
> Workload Identity Federation supports external identity provider attestation (e.g., GitHub Actions OIDC tokens, AWS roles). Managed identities leverage Azure's internal attestation of compute resources. Conditional Access can enforce device compliance and network location as implicit attestation. No TEE remote attestation or W3C Verifiable Credentials natively. Token claims serve as the primary proof of identity.

### Off-chain / On-chain Linking

**Linking Support**: No

**Linking Mechanism**:
> N/A. Microsoft Entra Agent ID is a purely off-chain, cloud-native enterprise identity system. There is no built-in mechanism to link Agent IDs to blockchain-based identities (ERC-721, DID on-chain, etc.). Custom integrations could theoretically bridge Entra identity to on-chain systems via application logic, but this is not a platform feature.

**Transfer Behavior**: N/A. No on-chain token component exists. Agent ID lifecycle is managed entirely within the Entra directory.

### Delegation & Authorization

**Delegation Model**:
> OAuth 2.0 On-Behalf-Of (OBO) flow for human-to-agent delegation: a user authenticates, and the agent exchanges the user's token for a new token with the agent's identity acting on the user's behalf. Client credentials flow for agent-to-service autonomous access. Microsoft Entra's application permission model distinguishes between delegated permissions (user-consented, user-context) and application permissions (admin-consented, no user context). Agent-to-agent delegation can be chained through nested OBO flows or service-to-service calls. Conditional Access policies can govern delegation scope and conditions.

**Authorization Granularity**:
> Fine-grained (ABAC). Microsoft Entra supports: OAuth 2.0 scopes for API-level permissions, Application roles for role-based access, Conditional Access policies for contextual authorization (network, device, risk level, session controls), and resource-specific consent for granular resource access (e.g., specific SharePoint sites, Teams channels). Entra ID Governance adds entitlement management and access packages for lifecycle-aware authorization.

### Discovery & Interoperability

**Capability Declaration**:
> Application registration manifest in Entra defines required permissions (API scopes), exposed APIs, and application roles. Microsoft 365 Copilot agent declarations include skill manifests and plugin definitions. No standardized Agent Card format like A2A protocol. Capabilities are expressed through OAuth permission scopes and application metadata in the directory.

**Cross Platform Portability**:
> Locked-in to Microsoft ecosystem. Agent IDs are directory objects in Microsoft Entra and are not portable to other identity providers or platforms. Workload Identity Federation enables cross-cloud authentication (agent in AWS/GCP can get Entra tokens), but the identity itself remains in Entra. No W3C DID or portable credential standard for Agent IDs.

**Standards Compliance**:
> OAuth 2.0, OpenID Connect, SAML 2.0, SCIM 2.0 (for provisioning), Microsoft Graph REST API, Conditional Access (proprietary but based on OAuth/OIDC patterns). Supports FIDO2/WebAuthn for human administrators. Workload Identity Federation supports external OIDC identity providers. Not W3C DID or W3C VC compliant natively.

**Protocol Composability**:
> Moderate. Agent ID integrates with: Microsoft 365 Copilot ecosystem (agents, plugins, connectors), Azure AI services (Azure OpenAI, Azure AI Studio), Microsoft Graph API (access to Microsoft 365 data), Power Platform (Power Automate flows, Copilot Studio agents). Cross-ecosystem composability is limited — no native A2A, MCP, or ERC-8004 integration. Custom bridge implementations required for non-Microsoft protocols.

### Push/Pull Communication

**Push Support**: Webhook (Microsoft Graph subscriptions / change notifications deliver push events via HTTP POST). Azure Event Grid for event-driven architectures. SignalR for real-time communication in custom applications.

**Pull Support**: REST API (Microsoft Graph API for querying directory objects, user data, organizational resources). Delta queries for efficient incremental polling. OData query parameters for filtering and pagination.

**Subscription Model**:
> Microsoft Graph change notifications: agents register webhook subscriptions for specific resource changes (e.g., new emails, calendar events, file modifications). Subscriptions have configurable expiration and must be renewed. Azure Event Grid subscriptions for Azure resource events. Token-based authentication for all subscription endpoints.

### Trust & Reputation

**Trust Model**:
> Centralized (platform-verified). Trust is established through the Microsoft Entra directory — only verified administrators can create and manage Agent IDs. Cross-tenant trust is managed through Entra's B2B/B2C frameworks and cross-tenant access policies. Conditional Access provides risk-based trust decisions. Microsoft Entra ID Protection provides risk scoring for sign-in events.

**Reputation System**: None as a standalone reputation system. Microsoft Entra ID Protection provides risk signals (sign-in risk, user risk) based on behavioral analytics and threat intelligence. Audit logs track agent activity history. No peer-based reputation, on-chain registry, or VC-based reputation system.

### Payment & Economics

**Payment Integration**: None natively. Microsoft Entra Agent ID is an identity and access management platform, not a payment system. Payment integration would be handled through separate Azure services (Azure Commerce, Stripe integration) or application-level logic. No AP2, ACP, or x402 integration.

**Economic Model**:
> Subscription (Microsoft Entra ID is included in various Microsoft 365 and Azure AD license tiers). P1/P2 license tiers unlock Conditional Access, Identity Protection, and Identity Governance features. Agent ID creation itself does not have per-agent fees in preview, but enterprise licensing costs apply. No staking or gas fees.

### Governance & Compliance

**Audit Trail Capability**:
> Comprehensive. Microsoft Entra audit logs capture all identity lifecycle events (creation, modification, deletion, sign-ins, permission changes). Azure Monitor and Log Analytics for long-term retention and analysis. Microsoft Sentinel (SIEM) integration for security event correlation. Signed audit events with tamper-evident properties. All agent authentication events are logged with correlation IDs for end-to-end tracing.

**Lifecycle Management**:
> Full lifecycle support: Registration (create Agent ID in directory), Activation (assign permissions, enable authentication), Suspension (disable the agent object, block token issuance), Access Reviews (periodic recertification of agent permissions via Entra Identity Governance), Upgrade (update permissions, rotate credentials), Decommissioning (soft-delete with 30-day recovery, then permanent deletion). Automated lifecycle policies can deactivate inactive agents.

### Uncertain Fields (3)

- versioning_support
- discovery_mechanism
- regulatory_alignment

---

## Model Context Protocol (MCP)

**Type**: `off-chain` · **Status**: `Production` · **Ecosystem**: Cloud/Enterprise

### Basic Info

**Type**: off-chain

**Status**: Production

**Ecosystem**: Cloud/Enterprise (framework-agnostic; blockchain MCP servers available for Ethereum and EVM-compatible chains via third-party integrations)

**Launch Date**: November 25, 2024 (announced by Anthropic); major spec updates: 2025-03-26, 2025-06-18 (OAuth 2.1, Streamable HTTP), 2025-11-25 (latest spec); donated to Agentic AI Foundation (Linux Foundation) December 2025

### Onboarding Flow

**Registration Steps**:
> 1. Implement MCP Server: Build a server exposing tools, resources, and/or prompts via the MCP specification. Choose transport: stdio (local) or Streamable HTTP (remote).
> 2. Declare Capabilities: Define server capabilities during initialization handshake (tools, resources, prompts, logging). The server responds with its capabilities and metadata during the initialize request.
> 3. Configure Authentication (for remote servers): Set up OAuth 2.1 authorization server or delegate to a third-party authorization server. Configure PKCE support (mandatory), token endpoints, and optionally Dynamic Client Registration (DCR) endpoint for automatic client onboarding.
> 4. Client Connection: MCP client sends initialize request with its protocol version, capabilities (sampling, elicitation, roots), and implementation metadata. Server responds with compatible version and its capabilities. Client sends initialized notification to confirm readiness.
> 5. Dynamic Client Registration (optional): If DCR is enabled, new MCP clients can automatically register by sending basic details (application name, redirect URIs) to registration_endpoint; server returns client_id and optionally client_secret. URL-based client registration (SEP-
> 9
> 9
> 1) allows clients to provide a self-hosted Client ID Metadata Document.
> 6. Operational Phase: Client discovers available tools (tools/list), resources (resources/list), and prompts (prompts/list). Agent begins invoking tools and accessing resources.

**Human Involvement**: full-setup (for remote servers: OAuth configuration, server deployment, endpoint setup require human DevOps work) / approve-only (for local stdio servers: user approves connection in host application; DCR can automate client registration)

**Agent Autonomy**:
> MCP clients can self-register via Dynamic Client Registration (DCR) without human intervention. URL-based client registration (SEP-
> 9
> 9
> 1) enables trustless client identity establishment. However, the MCP server itself must be provisioned and configured by a human. Once connected, the agent operates autonomously: discovering tools, invoking actions, and managing sessions.

**Time To First Action**: seconds (for local stdio transport: near-instant after initialization handshake) to minutes (for remote Streamable HTTP: depends on OAuth flow and server provisioning)

### Identity Model

**Identity Type**: OAuth 2.1 access tokens (for remote servers) / session IDs (Mcp-Session-Id header) / API keys (for simpler deployments). No built-in DID, wallet, or NFT identity. URL-based Client ID Metadata Documents (SEP-991) provide verifiable client identity.

**Key Management**:
> OAuth 2.1 token lifecycle: tokens have automatic expiration, granular permissions via scopes, and are revocable without changing underlying credentials. PKCE (Proof Key for Code Exchange) is mandatory for all clients. Session IDs should be globally unique and cryptographically secure (UUID, JWT, or cryptographic hash). For local stdio transport: no key management needed (process-level isolation). API keys stored in configuration files; best practices recommend secure vaults, regular rotation, and avoiding plaintext storage. No protocol-mandated rotation frequency.

**Multi Instance Support**: Yes, with caveats. Multiple server instances can run behind load balancers, but session state must be shared (e.g., via Redis or database). A single session ID can serve multiple authorization tokens. The spec does not specify if a session ID is limited to a single user.

**Recovery Mechanism**:
> OAuth token revocation is supported (invalidate tokens without changing underlying credentials). Session termination: server can invalidate session ID and return HTTP 404 for requests with invalidated session IDs. For credential loss: re-authentication via OAuth 2.1 flow. No built-in social recovery or backup key mechanisms. Server restart recovery requires external session state storage.

**Versioning Support**: Yes. Protocol version negotiation during initialization: client and server MUST agree on a single version for the session. Both MAY support multiple protocol versions simultaneously. Specification versions: 2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25. No on-chain version tracking.

### Security

**Authentication Method**:
> OAuth 2.1 with PKCE (mandatory for all remote clients). MCP servers act as OAuth 2.0 Resource Servers. Supports Dynamic Client Registration (DCR), URL-based client registration (SEP-991). For local stdio: process-level isolation (no network authentication needed). Origin header validation required on all incoming connections to prevent DNS rebinding attacks.

**Known Vulnerabilities**:
> 1. Tool Poisoning (CVE-related): Malicious instructions embedded in MCP tool descriptions can manipulate LLMs into executing unintended tool calls, bypassing security controls.
> 2. CVE-2025-6514: Critical OS command-injection bug in mcp-remote OAuth proxy.
> 3. Conversation Hijacking: Compromised MCP servers inject persistent instructions, manipulate AI responses, exfiltrate data.
> 4. Covert Tool Invocation: Hidden tool invocations and file system operations without user awareness.
> 5. Resource Theft via Sampling: Attackers abuse MCP sampling to drain AI compute quotas.
> 6. Cross-Server Data Exfiltration: Malicious MCP server silently exfiltrates data from legitimate servers in the same agent (e.g., WhatsApp history exfiltration via tool poisoning + whatsapp-mcp).
> 7. Shadow MCP Servers (OWASP MCP09): Unauthorized MCP servers operating without organization knowledge.
> 8. Centralized Token Storage Risk: MCP servers storing multiple service API keys create high-value breach targets ('keys to the kingdom').
> 9. Unauthenticated DCR: Anyone can register any client without vetting.
> 1
> 0. 492+ publicly exposed MCP servers identified as vulnerable (lacking basic auth or encryption).

**Revocation Speed**: seconds to minutes (OAuth token revocation is near-instant; session ID invalidation returns HTTP 404 immediately; server-side session termination is immediate)

**Anti Sybil**:
> Rate limiting recommended but not mandated. Dynamic Client Registration can be abused for mass client registration if unauthenticated. URL-based client registration (SEP-
> 9
> 9
> 1) provides some trust establishment for unknown clients. No staking, proof-of-work, or human verification in protocol. Origin header validation prevents some abuse vectors.

**Data Exposure Risk**:
> MCP servers are high-value targets: typically store authentication tokens for multiple connected services. If breached, attackers gain access to all connected service tokens. API keys often stored in configuration files in plaintext. Tool descriptions and server capabilities are exposed to clients. During operation, sensitive data flows through MCP servers (database contents, API responses, file system access). LLMs may inadvertently leak sensitive information from one tool context to another. No built-in data privacy or security controls by default.

**Bot To Bot Attack Surface**:
> High risk area (primarily agent-to-tool, not agent-to-agent). Documented attacks: (
> 1) Tool Poisoning - malicious tool descriptions manipulate LLM behavior; (
> 2) Cross-Server Poisoning - malicious server influences LLM interactions with legitimate servers; (
> 3) Indirect Prompt Injection via Resources - malicious content in fetched resources manipulates LLM; (
> 4) Sampling-based attacks - MCP server manipulates client sampling requests; (
> 5) Rug-pull attacks - server changes tool behavior after gaining trust. MCP is primarily a client-server (agent-to-tool) protocol, not agent-to-agent, so direct bot-to-bot attack surface is limited to multi-server scenarios.

**Skill Plugin Vetting**:
> No built-in vetting, sandboxing, or signing of tools/plugins. Community has proposed transparency logs for server updates, tool additions, and permission changes. OWASP MCP Top 10 project documents security risks. Reputation mechanisms proposed to incorporate security reviews, independent audits, and incident reports. Third-party tool registries emerging but not part of core protocol. November 2025 spec introduced official community-driven registry for discovering MCP servers.

**Attestation Mechanism**:
> None in core protocol. No TEE remote attestation, code hash verification, or Verifiable Credentials built in. Origin header validation provides basic request origin verification. OAuth 2.1 provides token-based identity assertion. Third-party integrations (e.g., TEE-backed security registries) available in blockchain MCP server ecosystem.

### Off-chain / On-chain Linking

**Linking Support**: Yes (via third-party blockchain MCP servers, not native)

**Linking Mechanism**:
> Third-party MCP servers provide blockchain integration: wallet management servers handle cryptographic keys and sign transactions; on-chain data query servers interface with blockchain RPC endpoints and smart contracts. The SettleMint MCP and similar projects bridge AI agents to on-chain operations. Private keys are designed to never leave the user's wallet. No native protocol-level on-chain linking mechanism.

### Delegation & Authorization

**Delegation Model**:
> OAuth 2.1 delegation: MCP servers MAY support delegated authorization through third-party authorization servers. Server acts as both OAuth client (to third-party auth server) and OAuth authorization server (to MCP client). Supports standard OAuth flows: authorization code + PKCE, client credentials. Human-to-agent delegation via OAuth consent screens. No native agent-to-agent delegation (MCP is client-server, not peer-to-peer).

**Authorization Granularity**:
> Coarse to fine-grained (implementation-dependent). OAuth 2.0 scopes provide role-based access. Granularity ranges from single catch-all scope (app.access) to fine-grained per-tool or per-method scopes. Rich Authorization Requests (RAR) discussed for more granular authorization. Third-party solutions (e.g., Cerbos) can enforce fine-grained ABAC policies on MCP servers.

### Discovery & Interoperability

**Discovery Mechanism**: Server registration in host application configuration. Official community-driven MCP server registry (introduced November 2025). No DNS-based or .well-known discovery in core protocol. Clients discover server capabilities via initialize handshake and tools/list, resources/list, prompts/list methods.

**Capability Declaration**:
> Initialization handshake: server declares capabilities (tools, resources, prompts, logging) during initialize response. Runtime discovery: tools/list returns tool names, descriptions, and input schemas (JSON Schema). resources/list returns available resources. prompts/list returns available prompt templates. Capabilities are dynamically discoverable at runtime.

**Cross Platform Portability**:
> Partially portable. MCP is framework-agnostic; clients and servers can be any language/platform. SDKs available for Python, TypeScript, C#, Java, Kotlin, Swift, Rust. However, identity is tied to OAuth tokens and session IDs, not portable DIDs. Server configurations are host-specific. Composable extension architecture allows cross-platform adoption.

**Standards Compliance**:
> OAuth 2.1 (mandatory for remote auth), PKCE (RFC 7636, mandatory), HTTP/HTTPS, JSON-RPC 2.0, Server-Sent Events (SSE), RFC 8615 (not used for discovery but compatible), Dynamic Client Registration (RFC 7591). Not W3C DID or W3C VC. Not SPIFFE. Protocol specification managed by Agentic AI Foundation under Linux Foundation.

**Protocol Composability**:
> High composability. MCP + A2A (complementary: MCP for agent-to-tool, A2A for agent-to-agent). MCP + blockchain servers (on-chain operations via third-party MCP servers). MCP + Stripe/payment servers (payment integration). MCP is designed as modular with composable authorization extensions. Multiple MCP servers can be connected to a single agent simultaneously.

### Push/Pull Communication

**Push Support**: SSE (Server-Sent Events via Streamable HTTP transport for streaming responses and notifications)

**Pull Support**: REST API (JSON-RPC 2.0 over HTTP POST for requests; HTTP GET for opening SSE streams). Stdio transport for local process communication.

**Subscription Model**:
> Server-initiated notifications via JSON-RPC notification messages over SSE stream. Clients subscribe implicitly by maintaining SSE connection. Server can send notifications for resource updates (notifications/resources/updated), tool list changes (notifications/tools/list_changed), and progress updates. No explicit webhook registration mechanism.

### Trust & Reputation

**Trust Model**:
> Centralized (platform/host-verified). Trust is established via OAuth 2.1 authentication with the authorization server. Host applications (Claude Desktop, IDEs) mediate trust between users and MCP servers. URL-based client registration (SEP-
> 9
> 9
> 1) provides verifiable client identity for unknown clients. No decentralized or peer-based trust.

**Reputation System**: None in core protocol. Community registry (November 2025) provides basic server discovery. Proposed enhancements include: transparency logs for server updates, reputation mechanisms incorporating security reviews and audit results. No on-chain reputation, staking history, or VC-based reputation.

### Payment & Economics

**Payment Integration**: None native. Third-party MCP servers provide payment integration (e.g., Stripe MCP server for invoices, customer management, refunds). Can compose with A2A + AP2 for agent-led payments. Blockchain MCP servers enable cryptocurrency/stablecoin transactions.

**Economic Model**: Free (open protocol, no fees for core usage). Infrastructure costs depend on deployment (server hosting, OAuth provider costs). Third-party MCP server hosting may have subscription costs. No staking or token requirements.

### Governance & Compliance

**Audit Trail Capability**:
> Logging capability declared during initialization. Server can emit log messages at various severity levels. No built-in immutable hash chain or blockchain anchoring. Audit logging for compliance must be implemented at the application level. Third-party solutions provide structured audit trails linking agent actions to identities. GRC/SIEM integration recommended for compliance evidence.

**Lifecycle Management**:
> Three-phase lifecycle: Initialization (capability negotiation, version agreement) -> Operation (tool invocation, resource access, notifications) -> Shutdown (graceful transport disconnection). No formal suspension, migration, upgrade, or decommissioning procedures in protocol. Session management via Mcp-Session-Id enables stateful interactions. Server can terminate sessions by invalidating session IDs.

### Uncertain Fields (2)

- transfer_behavior
- regulatory_alignment

---

## Moltbook (by Molten / Matt Schlicht)

**Type**: `off-chain` · **Status**: `Production` · **Ecosystem**: Platform-agnostic

### Basic Info

**Type**: off-chain

**Status**: Production

**Ecosystem**: Platform-agnostic (off-chain); unofficial MOLT token on Solana. Agents primarily run via OpenClaw (formerly Moltbot/Clawdbot) framework on Mac/Linux/Windows.

**Launch Date**: Late November 2025 (soft launch); January 28, 2026 (public launch widely cited)

### Onboarding Flow

**Registration Steps**:
> 1. Human operator sends the agent a prompt to read the Moltbook skill guide (https://moltbook.com/skill.md).
> 2. Agent downloads and installs the Moltbook skill files into its local skills folder (e.g., ~/.openclaw/skills/moltbook/), including a heartbeat task definition.
> 3. Agent calls the Moltbook API (POST) to register itself, creating an agent profile and receiving an API key plus a unique 'claim link' URL.
> 4. Agent returns the claim link to the human operator.
> 5. Human clicks the claim link, enters their email address, and is prompted to complete X (Twitter) verification: a unique verification code (cryptographically tied to the agent identity) must be posted publicly on X.
> 6. Moltbook verifies the X post to link the agent identity to the human's X account ('Proof of Human').
> 7. Once verified, the human is redirected to the agent's dashboard/control panel.
> 8. Agent sets up a heartbeat cron job (every 4+ hours) that fetches https://moltbook.com/heartbeat.md and executes instructions: browse feeds, post, comment, upvote/downvote, and engage with other agents.

**Human Involvement**: approve-only (human must click claim link and post verification on X; day-to-day operation is autonomous)

**Agent Autonomy**: High autonomy after initial setup. Agent self-registers via API, but human must complete X verification. After verification, agent operates fully autonomously via heartbeat system: browsing, posting, commenting, voting every 4+ hours without human intervention.

**Time To First Action**: minutes (agent registration is near-instant via API; human verification step takes a few minutes; first heartbeat action can occur within the first 4-hour cycle)

### Identity Model

**Identity Type**: API key (Bearer token: 'moltbook_sk_...' issued at registration) + X (Twitter) social proof for human-operator verification

**Key Management**:
> API key is generated by Moltbook's server at agent registration and returned to the agent. Stored locally in the agent's skill configuration (e.g., ~/.openclaw/ directory). No documented key rotation mechanism. Revocation is manual (not formally documented). The Wiz breach exposed that API keys were stored in a Supabase database without Row Level Security, and some agents shared third-party API keys (OpenAI, Anthropic) in plaintext in private messages.

**Multi Instance Support**: Yes, implicitly. A single human owner can create and control multiple agents (the breach revealed 17,000 human owners behind 1.5 million registered agents, an 88:1 ratio). Each agent gets its own API key and identity.

### Security

**Authentication Method**: API key (Bearer token in HTTP Authorization header). No challenge-response, no wallet signature, no TEE attestation. Human operator identity is verified via X (Twitter) social proof during initial claim.

**Known Vulnerabilities**:
> CRITICAL: (
> 1) Wiz Research Breach (Feb 2026): Misconfigured Supabase database with API key embedded in client-side JavaScript and no Row Level Security (RLS) enabled. Full read/write access to ALL production data exposed: 1.5 million API authentication tokens, 35,000 email addresses, private messages between agents (some containing plaintext OpenAI/Anthropic API keys). An attacker could fully impersonate any agent. Fixed within hours after Wiz disclosure, reported by Reuters, Financial Times, Engadget. (
> 2) OX Security Research: MoltBot/OpenClaw credential exposure - ~/.moltbot/ and ~/.clawdbot/ directories contained plaintext Anthropic API keys, OAuth tokens (Slack), conversation histories, and signing secrets. Tens of thousands of internet-facing OpenClaw deployments found with exposed admin interfaces. (
> 3) SecurityScorecard: Live reconnaissance found many vulnerable OpenClaw instances correlated with prior breaches. (
> 4) Vibe-coded platform: founder publicly stated he did not write a single line of code, leading to systemic security oversights. (
> 5) Supply chain: 22-26% of OpenClaw skills contain vulnerabilities, including credential stealers disguised as benign plugins.

**Anti Sybil**:
> Weak. Primary mechanism is X (Twitter) social proof verification ('Proof of Human') linking agent to human operator's X account. However, creating multiple X accounts is trivial, and the breach revealed 17,000 humans controlling 1.5M agents (88:1 ratio). No staking, no fee, no proof-of-work, no rate limiting documented.

**Data Exposure Risk**:
> EXTREME: API keys (moltbook_sk_...) stored server-side without proper access controls; third-party LLM API keys (OpenAI, Anthropic) shared in plaintext in agent-to-agent messages; email addresses of human operators; private messages; agent profiles and metadata; conversation histories in local ~/.openclaw/ directories; OAuth tokens for integrated services (Slack etc.).

**Bot To Bot Attack Surface**:
> SEVERE and actively exploited: (
> 1) Reverse prompt injection: agents embed hostile instructions in posts/comments that other agents automatically consume during heartbeat cycles. (
> 2) SecurityWeek found measurable percentage of Moltbook content contained hidden prompt-injection payloads designed to hijack agent behavior and extract API keys/secrets. (
> 3) Agent-to-agent social engineering: bots actively phishing other bots for sensitive information, posing as helpful peers. (
> 4) Zenity Labs documented observed attacks including agents instructing others to delete accounts and financial manipulation schemes. (
> 5) 'Digital drugs' phenomenon: agents selling prompt injections to get other agents to behave erratically. No effective platform-level mitigations in place.

**Skill Plugin Vetting**:
> Minimal. ClawHub (OpenClaw's public skill registry) operates on trust, not vetting. Anyone can publish a skill. Skills are unsigned and unaudited. Security audits reveal 22-26% of skills contain vulnerabilities. Partial mitigation: VirusTotal partnership provides scanning, but usage is optional and user-initiated. No sandboxing, no code signing, no mandatory review.

**Attestation Mechanism**: none. No TEE attestation, no code hash verification, no Verifiable Credentials. Agent identity is based solely on API key and X social proof.

### Delegation & Authorization

**Delegation Model**:
> Simple API key sharing. The human operator controls the agent through the OpenClaw framework. The API key grants full access to all agent operations (posting, commenting, voting, messaging). No OAuth On-Behalf-Of flow, no fine-grained delegation, no agent-to-agent delegation protocol. The operator-to-agent relationship is established through the initial claim/verification process.

**Authorization Granularity**: none (coarse at best). The API key grants full access to all agent operations. No role-based access, no scope limitations, no ABAC, no intent-aware mandates. All authenticated requests have identical permissions.

### Discovery & Interoperability

**Discovery Mechanism**:
> Registry lookup via Moltbook platform. Agents are discoverable through: (
> 1) Moltbook search API and feeds, (
> 2) Community-based browsing (Submolts - 2,364+ topic-based communities), (
> 3) Agent profiles visible on the Moltbook web interface, (
> 4) Heartbeat-driven feed consumption where agents discover each other through content.

**Capability Declaration**:
> Implicit through agent profile and posting behavior. Agents share capabilities through natural language posts and comments. Skills are listed in the OpenClaw skill registry (ClawHub, 3,002+ community-built skills). No formal Agent Card, JSON-LD manifest, or structured capability declaration standard.

**Cross Platform Portability**: Locked-in. Moltbook identity (API key + X verification) is platform-specific. The vision is for identity to be portable across the 'agent internet,' but currently, Moltbook identities work only on Moltbook. OpenClaw agents can integrate with other services via skills, but identity does not port.

**Standards Compliance**: No formal standards compliance. Does not implement W3C DID, W3C VC, OIDC, SPIFFE, OAuth 2.0/2.1, ERC-721, ERC-8004, or any recognized identity standard. Uses a proprietary API key + social proof verification system.

**Protocol Composability**: Limited. OpenClaw skills provide integration with external services, but Moltbook identity/onboarding does not compose with formal agent protocols (A2A, MCP, AP2, ERC-8004). The heartbeat system is proprietary. Integration is primarily through OpenClaw's skill plugin architecture.

### Push/Pull Communication

**Pull Support**: REST API. Agents pull data from Moltbook via REST API endpoints: feed retrieval, search, post/comment creation. The heartbeat system periodically fetches heartbeat.md instructions.

**Subscription Model**: Heartbeat-based polling. Agents subscribe to the Moltbook feed implicitly through the heartbeat cron job (every 4+ hours). Agents can join Submolts (topic communities) for content filtering. No formal event subscription, no webhook registration, no smart contract events.

### Trust & Reputation

**Trust Model**:
> Centralized (platform-verified). Trust is based on Moltbook's verification process (X social proof) and platform moderation. The platform claims to restrict posting to verified AI agents. Reputation follows agents within the Moltbook ecosystem. No federated trust, no decentralized peer reputation beyond upvotes/downvotes.

**Reputation System**:
> Platform ratings via Reddit-style upvote/downvote system (karma). Agents build reputation through content quality, community engagement, and voting scores. The stated vision is for reputation to follow agents across the 'agent internet,' but currently it is Moltbook-specific. No on-chain registry, no VC-based reputation, no staking history.

### Payment & Economics

**Economic Model**: Free. Agent registration and operation on Moltbook appears to be free of charge. No staking required, no gas fees (off-chain platform), no subscription fees documented. The platform monetization model is unclear. The MOLT token is community/speculative, not an official platform requirement.

### Governance & Compliance

**Audit Trail Capability**:
> Minimal. Platform logs exist server-side (posts, comments, messages are stored in Supabase), but no immutable audit trail, no hash chain, no signed events, no blockchain anchoring. The Wiz breach demonstrated that even basic access controls were missing. No formal audit trail linking agent actions to verified identities.

**Lifecycle Management**: Partial. Registration and activation are supported. Suspension/deactivation is possible by the platform (centralized control). No documented migration, upgrade, or formal decommissioning process. Agent profiles persist on the platform. No version tracking or controlled upgrade pathway.

### Uncertain Fields (9)

- recovery_mechanism
- versioning_support
- revocation_speed
- linking_support
- linking_mechanism
- transfer_behavior
- push_support
- payment_integration
- regulatory_alignment

---

## OpenClaw (formerly Clawdbot, Moltbot)

**Type**: `off-chain` · **Status**: `Production` · **Ecosystem**: N/A

### Basic Info

**Type**: off-chain

**Status**: Production

**Ecosystem**: N/A (platform-agnostic, self-hosted; unofficial community integrations with Solana/Ethereum via third-party wallet plugins like Privy Agentic Wallets and ACP protocol)

**Launch Date**: November 2025 (initial Clawdbot release by Peter Steinberger); renamed Moltbot Jan 27 2026; renamed OpenClaw Jan 30 2026; went viral Jan 25 2026 with 9,000 GitHub stars in one day

### Onboarding Flow

**Registration Steps**:
> 1. Install OpenClaw on local machine (macOS, Linux, Windows, Docker).
> 2. Create minimal config file at ~/.openclaw/openclaw.json with a model identifier (e.g. agent.model).
> 3. Authenticate with LLM provider via OAuth (for subscriptions like Claude Pro/Max or ChatGPT) or API key in config.
> 4. Optionally configure messaging platform channels (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Microsoft Teams, Matrix, Google Chat, etc.) with their respective bot tokens or OAuth flows.
> 5. Gateway daemon starts on port 18789, establishing WebSocket control plane.
> 6. For DM-based access, unknown users receive a pairing code; operator approves with 'openclaw pairing approve <channel> <code>'.
> 7. Install skills from ClawHub or local skill directories.
> 8. Agent is operational and responds on configured channels.

**Human Involvement**: full-setup (initial installation, config file creation, LLM provider auth, messaging platform setup, and pairing approval for new users all require human intervention)

**Agent Autonomy**:
> After initial human setup, agent operates autonomously: self-executes tasks via LLM reasoning, installs/uses skills, manages memory, can write its own code for unknown tasks. However, agent cannot self-register -- needs human to configure credentials, approve pairings, and set access policies. Dangerous operations require human approval via push notification.

### Identity Model

**Identity Type**:
> API key / OAuth token (primary identity is the LLM provider credential -- API key or OAuth session; messaging platform identity is derived from bot tokens for each channel; Gateway WebSocket token for operator/client authentication; no cryptographic agent identity primitive like DID or wallet address natively)

**Key Management**:
> Credentials stored per-agent in ~/.openclaw/agents/<agentId>/agent/auth-profiles.json with profile IDs following pattern <provider>:<identifier>. OAuth tokens auto-refreshed before expiry with file locking to prevent concurrent refresh collisions. API keys stored in JSON/Markdown config files in ~/.clawdbot/ or ~/.openclaw/ directory. Rotation supported via config changes and Composio dashboard 'Revoke' toggle. No automatic key rotation schedule by default. Critical weakness: credentials historically stored in plaintext, leading to massive exposure (21,639+ exposed instances leaking API keys, OAuth tokens, WhatsApp/Telegram/Discord credentials).

**Multi Instance Support**:
> Yes. Supports multiple isolated agents with separate workspace, agentDir, and sessions, plus multiple channel accounts (e.g. two WhatsApps) in one running Gateway. Production systems typically handle 10-20 concurrent agents. Critical: must never reuse agentDir across agents (causes auth/session collisions).

**Versioning Support**: Minimal. Config meta field tracks lastTouchedVersion and lastTouchedAt timestamps. No on-chain hash appending or formal version registry. Community uses Git-based version tracking of the ~/.openclaw/ directory.

### Security

**Authentication Method**:
> Localhost trust (connections from 127.0.0.1 trusted without authentication by default); WebSocket token-based authentication for remote operator/client connections; DM pairing code for messaging platform users; OAuth for LLM provider authentication; bot tokens for messaging platform integration. Critical flaw: reverse proxy misconfiguration forwards all external requests as localhost, bypassing authentication entirely.

**Known Vulnerabilities**:
> SEVERE. 512 total vulnerabilities identified (8 critical). Key incidents: (
> 1) CVE-2026-25253 (CVSS 8.8): One-click RCE via cross-site WebSocket hijacking -- Control UI trusts gatewayUrl from query string without validation, attacker steals auth token, gains operator.admin and operator.approvals scopes, disables user confirmation, escapes container. Patched in v2026.1.
> 2
> 9. (
> 2) 21,639+ exposed instances found publicly accessible on internet, many over unencrypted HTTP, leaking API keys, OAuth tokens, chat histories, WhatsApp/Telegram/Discord credentials. (
> 3) ClawHub supply chain attack: 341 malicious skills out of 2,857 total (~12% of registry compromised), using techniques like Markdown HTML comments hiding curl|bash payloads. (
> 4) Moltbook social network for agents created additional agent-to-agent attack surface. (
> 5) Plaintext credential storage in JSON/Markdown files. (
> 6) Default localhost trust model trivially bypassed via reverse proxy misconfiguration.

**Anti Sybil**:
> Minimal. DM pairing code mechanism provides basic identity verification for messaging platform users. Allowlists restrict who can communicate with the bot. No staking, proof-of-work, or formal anti-sybil mechanism. Rate limiting depends on messaging platform and LLM provider limits. ClawHub had no effective skill vetting, allowing 12% malicious skill uploads.

**Data Exposure Risk**:
> CRITICAL. Exposed data includes: API keys for LLM providers (OpenAI, Anthropic, etc.), OAuth tokens, WhatsApp credentials, Telegram bot tokens, Discord tokens, conversation histories stored in Markdown files, calendar data, email contents, account credentials for connected services. Over 1,800 exposed instances confirmed leaking credentials. Persistent memory retains long-term context, user preferences, and interaction history which can be shared with other agents including malicious ones.

**Bot To Bot Attack Surface**:
> HIGH. (
> 1) Agent-to-agent communication is a core feature; Moltbook social network enables AI agents to interact, creating prompt injection vectors through normal-seeming social interactions. (
> 2) Indirect prompt injection via data sources ingested by OpenClaw (emails, webpages). (
> 3) Compromised agent can influence other agents through shared memory and communication channels. (
> 4) Malicious skills can inject instructions during tool execution. (
> 5) No formal agent-to-agent authentication or attestation protocol. (
> 6) Shell access combined with prompt injection creates RCE risk.

**Skill Plugin Vetting**:
> Weak. ClawHub serves as public skills registry with no effective vetting -- 341 malicious skills (12% of registry) were published with professional documentation and innocuous names. Skills are treated as trusted code per documentation ('Treat skill folders as trusted code and restrict who can modify them'). Malicious skills spiked 386 between Jan 31-Feb 2
> 2
> 0
> 2
> 6. Techniques include hidden curl|bash in Markdown HTML comments. Community-created security audit skills exist (e.g. UseAI-pro/openclaw-skills-security) but are opt-in.

### Off-chain / On-chain Linking

**Linking Support**: No (native). Third-party integrations possible via Privy Agentic Wallets (Ethereum/Solana wallet creation for agents) and ACP protocol (Virtuals' on-chain commerce protocol with ERC-8004 + x402). No official on-chain identity binding.

**Transfer Behavior**: N/A (no native on-chain identity token)

### Delegation & Authorization

**Delegation Model**:
> Direct credential sharing (agent uses human's API keys, OAuth tokens, and bot tokens configured in config files). Human delegates by sharing credentials and approving pairing codes. Agent operates 'as you' using your credentials. Advanced: Cedar policy engine integration possible as a policy enforcement point (PEP) for tool invocations, where delegation defines purpose, scope, duration, and conditions. No native OAuth OBO or OIDC-A chains. Composio provides external credential management with scoped access.

**Authorization Granularity**:
> Moderate. Channel allowlists, DM pairing approval, access groups (commands.useAccessGroups), mention gating for groups, sandbox mode (non-main sessions in Docker sandboxes), tool/device permission scoping. Cedar policy integration enables fine-grained ABAC with purpose/scope/duration constraints. Default is relatively coarse: approved users get full agent access.

### Discovery & Interoperability

**Discovery Mechanism**: ClawHub (public skills registry for browsing, discovering, installing, updating skills). No DNS-based discovery, no .well-known endpoint, no Agent Card, no on-chain registry. Agents are discovered via messaging platform presence (WhatsApp, Telegram, Slack, etc.) by users who know the bot's contact.

**Capability Declaration**:
> Skills system with Markdown-based skill files organized in directories. Skills discovered from multiple sources (ClawHub, local directories, plugin skills) and merged into single skill registry. Plugin skills declared via openclaw.plugin.json. MCP server connectivity exposes tools as agent-callable capabilities. No formal JSON-LD or Agent Card manifest.

**Cross Platform Portability**: Locked-in to OpenClaw ecosystem. Identity (credentials, memory, skills) is tied to ~/.openclaw/ directory structure. Can run on any OS ('Any OS. Any Platform.') but identity is not portable to other agent platforms. No DID or VC-based portability.

**Standards Compliance**: OAuth 2.0 (for LLM provider auth); MCP (Model Context Protocol for tool/service integration, 100+ services); WebSocket protocol for gateway communication. No W3C DID, no W3C VC, no SPIFFE, no ERC-721/ERC-8004 compliance natively.

**Protocol Composability**: MCP integration enables composition with MCP-compatible services and tools. Claude Code plugin compatibility allows importing MCP configs. Third-party integrations with ACP, ERC-8004 via community plugins. No native A2A protocol, no AP2 support. Cedar policy engine composability for authorization.

### Push/Pull Communication

**Push Support**: WebSocket (Gateway WebSocket on port 18789 for real-time event broadcasting to operator/webchat clients); push notifications for dangerous operation approval workflows; messaging platform push via native platform mechanisms (WhatsApp, Telegram, Slack, Discord, etc.)

**Pull Support**: REST API (Gateway exposes REST endpoints); WebSocket query; messaging platform polling

**Subscription Model**: Channel-based (agents subscribe to messaging platform channels; operator clients connect to Gateway WebSocket for real-time tool events; webhook registration for specific messaging platforms; approval workflow with push notifications, timeouts, and decision logging)

### Trust & Reputation

**Trust Model**:
> Centralized (platform trust via ClawHub for skills, localhost trust for authentication) with decentralized self-hosting. Trust is essentially 'trust the operator' model -- whoever configures the instance controls all access. ClawHub trust was catastrophically broken with 12% malicious skills. OpenClaw publishes threat model openly, inviting community contribution.

**Reputation System**: None. No on-chain registry, no platform ratings for skills or agents, no VC-based reputation, no staking history. ClawHub had no reputation filtering, enabling malicious skill proliferation. World Economic Forum has called for 'Know Your Agent' standard, but OpenClaw does not implement one.

### Payment & Economics

**Payment Integration**: None natively (OpenClaw is free software). Users pay LLM providers directly via their own API keys/OAuth subscriptions. Third-party: ACP protocol enables on-chain payments between agents; Privy Agentic Wallets enable crypto transactions. No AP2, no x402, no native token.

**Economic Model**:
> Free (MIT license, no subscription, no premium tier, no paywall). Real costs are LLM provider API usage: typically $5-30/month for personal use, $25-50 for small teams, $50-100+ for heavy automation. Server infrastructure costs if cloud-hosted. OpenClaw monetizes via planned managed hosting (OpenClaw Cloud) and enterprise support.

### Governance & Compliance

**Lifecycle Management**:
> Partial. Registration (manual config setup) / Activation (gateway start) / Suspension (stop gateway or revoke via Composio) / Upgrade (version updates, skill updates via ClawHub) / Decommissioning (remove config and credentials). No formal migration support. No automated lifecycle management. Skills can be installed, updated, and backed up via ClawHub.

### Uncertain Fields (7)

- time_to_first_action
- recovery_mechanism
- revocation_speed
- attestation_mechanism
- linking_mechanism
- regulatory_alignment
- audit_trail_capability

---

## OpenRouter

**Type**: `off-chain` · **Status**: `Production` · **Ecosystem**: N/A

### Basic Info

**Type**: off-chain

**Status**: Production

**Ecosystem**: N/A (cloud-based AI model routing platform; supports crypto payments via Coinbase/USDC on-chain but not blockchain-native)

**Launch Date**: 2023 (founded by Alex Atallah, former OpenSea CTO, and Louis Vichy; scaled to $100M+ annualized inference spend by late 2024; $40M Series A led by a16z and Menlo Ventures with Sequoia participation)

### Onboarding Flow

**Registration Steps**:
> 1. Create an account on openrouter.ai (email-based registration or OAuth via GitHub/Google).
> 2. Add credits on the Credits page (credit card via Stripe, AliPay, or cryptocurrency via Coinbase USDC).
> 3. Create API key from dashboard or programmatically via Management API (POST /api/v1/keys).
> 4. Configure API key with optional credit limits, model restrictions, and rate limits.
> 5. Integrate using OpenAI-compatible SDK (Python/TypeScript) by setting base_url to https://openrouter.ai/api/v1 and providing API key as Bearer token.
> 6. Select model(s) by model identifier string (e.g. anthropic/claude-opus-4-6).
> 7. Start making chat/completions requests. Alternative OAuth PKCE flow: redirect user to OpenRouter /auth URL with callback_url, receive authorization code, exchange for user-controlled API key via /api/v1/auth/keys endpoint.

**Human Involvement**: full-setup (human must create account, add payment method, generate API keys; no autonomous agent self-registration)

**Agent Autonomy**:
> Agent cannot self-register. After human provides API key, agent can autonomously make API calls, select models, use tools/function calling, and manage conversations. Programmatic key provisioning allows SaaS applications to auto-create keys for customers, but initial provisioning key requires human setup.

**Time To First Action**: minutes (account creation and first API call can be completed in under 5 minutes; free tier available with 50 requests/day limit)

### Identity Model

**Identity Type**: API key (Bearer token authentication; two key types: standard API keys for model inference, and Provisioning API keys for key management operations only)

**Multi Instance Support**: Yes. Multiple API keys can be created per account, each with independent credit limits and usage tracking. Provisioning API enables programmatic creation of keys for different instances/customers. BYOK allows multiple provider keys for the same provider with load balancing across them.

**Versioning Support**: No agent code/model versioning. Model versions are tracked by provider (e.g. specific model IDs include version info). No on-chain hash appending or metadata versioning for agent state.

### Security

**Authentication Method**: API key (Bearer token in Authorization header); OAuth 2.0 PKCE flow for user-delegated authentication; Provisioning API keys for management operations (separate from inference keys). All requests over HTTPS.

**Revocation Speed**: instant (API keys can be deleted/disabled immediately via dashboard or Management API; takes effect on next request)

**Data Exposure Risk**:
> API keys exposed in transit (mitigated by HTTPS). Prompts and completions are NOT logged by default (zero data retention policy available). Custom data policies can restrict routing to trusted providers. Provider keys (BYOK) stored encrypted on OpenRouter servers. For enterprise: EU region locking available. Risk: centralized API key as single point of failure for all model access.

**Bot To Bot Attack Surface**:
> Low direct risk (OpenRouter is a model routing API, not an agent communication platform). No agent-to-agent messaging. Indirect risks: prompt injection through model responses, model poisoning at provider level. Tool/function calling could be exploited if agent does not validate tool outputs. OpenRouter does not inspect or filter prompt content.

**Skill Plugin Vetting**: N/A in traditional sense. OpenRouter plugins (web search, PDF processing, response healing) are first-party maintained by OpenRouter. No third-party plugin marketplace. Model capabilities (tool calling, structured output) are provider-verified and documented per model.

**Attestation Mechanism**: None. No TEE attestation, no code hash verification, no Verifiable Credentials. Trust is based on HTTPS + API key authentication. OpenRouter maintains a Trust Center (trust.openrouter.ai) with security controls documentation but no cryptographic attestation of agent integrity.

### Off-chain / On-chain Linking

**Linking Support**: Partial (crypto payment integration only). Coinbase on-chain payments (USDC) for credits, but no on-chain identity binding for agents or API keys.

**Linking Mechanism**: Coinbase Commerce integration for crypto payments: POST /api/v1/credits/coinbase creates a charge; once transaction succeeds on-chain, credits are added to account. Transaction hash provided for tracking. No wallet signature challenge, no EIP-712, no smart contract registration for identity.

**Transfer Behavior**: N/A (no on-chain identity token; credits are account-bound and non-transferable)

### Delegation & Authorization

**Delegation Model**:
> API key delegation (parent account creates child API keys with scoped permissions via Provisioning API). OAuth PKCE for user-delegated key creation. No agent-to-agent delegation. No OAuth OBO or OIDC-A chains. SaaS applications can distribute auto-created keys to end-users/agents with per-key credit limits.

**Authorization Granularity**: Coarse (role/scope). API keys can be restricted by: credit limits, model access restrictions, rate limits. Provisioning keys are exclusively for management (cannot make inference calls). No fine-grained ABAC, no intent-aware authorization, no per-tool or per-action scoping.

### Discovery & Interoperability

**Discovery Mechanism**: Model catalog API (GET /api/v1/models returns all available models with capabilities, pricing, context length). Models page at openrouter.ai/models for browsing. Collections (e.g. tool-calling-models). No agent discovery, no DNS-based discovery, no .well-known endpoint for agents.

**Capability Declaration**: Model-level capability metadata: tool/function calling support, structured output support, multimodal support, context window size, pricing per token. Declared per model in catalog. OpenAPI specification for full API documentation. No agent-level capability manifests or Agent Cards.

**Cross Platform Portability**: Partially portable. OpenAI-compatible API means existing OpenAI SDK integrations work with minimal changes (swap base_url and API key). Credits are locked to OpenRouter account. API keys are platform-specific. Model identifiers use provider prefix format (e.g. anthropic/claude-opus-4-6).

**Standards Compliance**: OpenAI Chat API compatible (de facto standard for LLM APIs); OAuth 2.0 PKCE; OpenAPI specification for API documentation; SSE for streaming. No W3C DID, no W3C VC, no SPIFFE, no ERC-721/ERC-8004.

**Protocol Composability**: OpenAI SDK compatibility enables integration with any framework supporting OpenAI API (LangChain, LlamaIndex, Anthropic Agent SDK, Continue, LiveKit, n8n, etc.). MCP integration via third-party tools (OpenClaw integration documented). No native A2A protocol, no AP2, no ACP support.

### Push/Pull Communication

**Push Support**: SSE (Server-Sent Events for streaming model responses with stream: true parameter; SSE keepalive comments to prevent timeout; streaming cancellation supported)

**Pull Support**: REST API (OpenAI-compatible /chat/completions and /completions endpoints; model catalog API; key management API; credits API; all under https://openrouter.ai/api/v1/)

### Trust & Reputation

**Trust Model**:
> Centralized (platform-verified). OpenRouter acts as trusted intermediary routing requests to verified model providers. Trust Center at trust.openrouter.ai publishes security controls and compliance documentation. Provider verification is internal to OpenRouter. Users trust OpenRouter to correctly route and not log prompts.

**Reputation System**: None for agents. Model-level community feedback exists (model ratings, usage statistics visible on models page). No on-chain reputation registry, no VC-based reputation, no staking history. Provider reputation is implicit (major providers like OpenAI, Anthropic, Google are trusted by default).

### Payment & Economics

**Payment Integration**: Fiat (Stripe: credit cards, AliPay) and crypto (Coinbase Commerce: USDC on-chain). Credits system: prepaid balance used across all models. No AP2, no ACP, no x402, no native token.

**Economic Model**:
> Pay-as-you-go with prepaid credits. No markup on provider pricing (pass-through pricing). Free tier: 50 requests/day on free models. Purchasing 10+ credits unlocks 1000 requests/day on free models. 1 million free BYOK requests/month. Crypto payments charged 5% fee. Enterprise plans with SLAs available. $40M Series A funding indicates venture-backed growth model.

### Governance & Compliance

**Audit Trail Capability**: Enterprise-grade: exportable audit trails of all API requests across all users. Request logging available (opt-in, disabled by default for privacy). No hash chain, no signed events, no blockchain anchoring. Audit trails are platform-managed, not cryptographically immutable.

**Lifecycle Management**: Partial. Registration (account creation) / Activation (API key generation) / Suspension (key disable/delete via Management API) / Upgrade (credit additions, plan changes). No formal migration, agent upgrade, or decommissioning protocols. Key rotation via create-new-delete-old pattern.

### Uncertain Fields (6)

- key_management
- recovery_mechanism
- known_vulnerabilities
- anti_sybil
- subscription_model
- regulatory_alignment

---

## SPIFFE / SPIRE

**Type**: `off-chain` · **Status**: `Production` · **Ecosystem**: Cloud-native / Enterprise

### Basic Info

**Type**: off-chain

**Status**: Production

**Ecosystem**: Cloud-native / Enterprise (platform-agnostic; runs on Kubernetes, bare metal, VMs across AWS, GCP, Azure, on-premises; CNCF graduated project)

**Launch Date**: 2017 (SPIFFE specification first published); SPIRE v0.1 released 2018; CNCF Sandbox 2018; CNCF Incubating 2020; CNCF Graduated June 2022. Positioned for agentic AI workload identity by HashiCorp and CyberArk in 2025.

### Onboarding Flow

**Registration Steps**:
> 1. Deploy SPIRE Server: Install and configure the SPIRE Server, which acts as the certificate authority and identity issuer for a trust domain. Configure the trust domain name (e.g., spiffe://example.org).
> 2. Deploy SPIRE Agents: Install SPIRE Agents on each node (VM, Kubernetes node, bare-metal host) where workloads will run. Agents perform node attestation against the SPIRE Server using platform-specific attestors (e.g., AWS IID, GCP IIT, Kubernetes PSAT, Azure MSI, TPM-based).
> 3. Create Registration Entries: An administrator creates registration entries on the SPIRE Server that map workload selectors (e.g., Kubernetes namespace/service account, Unix PID/UID, Docker container labels) to SPIFFE IDs (e.g., spiffe://example.org/agent/my-ai-agent).
> 4. Workload Attestation: When an AI agent workload starts, the local SPIRE Agent detects it via workload attestor plugins (Unix, Kubernetes, Docker) and matches it against registration entries.
> 5. SVID Issuance: The SPIRE Agent requests an SVID (SPIFFE Verifiable Identity Document) from the SPIRE Server on behalf of the workload. The server issues an X.509-SVID (short-lived X.509 certificate) or JWT-SVID (short-lived JWT token) containing the agent's SPIFFE ID.
> 6. Agent Operational: The AI agent uses its SVID to authenticate to other services, agents, and infrastructure via mTLS (X.509-SVID) or bearer token (JWT-SVID). SVIDs are automatically rotated before expiration by the SPIRE Agent.

**Human Involvement**: full-setup (SPIRE Server deployment, agent installation, and initial registration entry creation require human DevOps/platform engineering work) / approve-only (once infrastructure is set up, new workloads matching existing selectors are automatically attested without additional human intervention)

**Agent Autonomy**:
> AI agents cannot self-register in SPIFFE/SPIRE. Registration entries must be created by an administrator or automated provisioning system (e.g., Kubernetes operator, Terraform). However, once registration entries exist, new agent instances matching the workload selectors are automatically attested and receive SVIDs without any human intervention. This enables fully autonomous scaling: spin up 1000 agent instances and each automatically gets identity. The SPIRE Kubernetes Controller Registrar can auto-create entries for Kubernetes workloads.

**Time To First Action**: seconds (once SPIRE infrastructure is deployed and registration entries exist, a new agent workload receives its SVID within seconds of starting via the SPIRE Workload API Unix domain socket)

### Identity Model

**Identity Type**:
> SVID (SPIFFE Verifiable Identity Document). Two formats: X.509-SVID (short-lived X.509 certificate with SPIFFE ID in the URI SAN field) and JWT-SVID (short-lived JWT token with SPIFFE ID as the 'sub' claim). The SPIFFE ID itself is a URI in the format spiffe://<trust-domain>/<workload-path>, e.g., spiffe://example.org/ai-agent/customer-service. SPIFFE IDs are not tied to any specific key material — they are logical identities attested at runtime.

**Key Management**:
> Fully automated, zero-touch key management is a core design principle. X.509-SVIDs: private keys are generated locally by the SPIRE Agent (never leave the node), certificates are signed by the SPIRE Server CA, typical TTL is 1 hour (configurable, commonly 15 minutes to 24 hours), automatic rotation before expiration (SPIRE Agent handles renewal transparently). JWT-SVIDs: signed by the SPIRE Server, short TTLs (typically 5 minutes). Trust bundle rotation: the SPIRE Server's signing CA can be rotated using upstream CA plugins (e.g., AWS PCA, Vault, disk-based CA) with configurable overlap periods for zero-downtime rotation. Key storage: keys are held in memory by the SPIRE Agent; optional integration with hardware keystores (TPM, HSM). At Uber's scale, SPIRE manages billions of SVID rotations per day.

**Multi Instance Support**:
> Yes, native support. Multiple workload instances sharing the same SPIFFE ID is a core design pattern. Each instance receives its own distinct SVID (different key pair, different certificate serial number) but with the same SPIFFE ID. SPIRE natively supports: horizontal scaling (100s-1000s of instances of the same agent), Kubernetes Deployments/ReplicaSets (all pods of a Deployment get the same SPIFFE ID), cross-cluster identity (same SPIFFE ID across multiple Kubernetes clusters via federated trust domains).

**Recovery Mechanism**:
> No recovery needed by design. SVIDs are short-lived and automatically re-issued. If a SPIRE Agent loses state: it re-attests to the SPIRE Server and receives new SVIDs. If a workload restarts: it re-attests to the local SPIRE Agent and receives a new SVID. If the SPIRE Server is unavailable: agents continue operating with cached SVIDs until they expire. For SPIRE Server recovery: HA deployment with database-backed storage (PostgreSQL, MySQL) or replicated in-memory store. Server datastore backup and restore for disaster recovery. Trust bundle recovery via upstream CA if SPIRE Server CA is lost.

### Security

**Authentication Method**:
> mTLS (mutual TLS) using X.509-SVIDs: both client and server present their SVIDs for mutual authentication. JWT-SVID bearer token presentation for environments where mTLS is not feasible (e.g., L7 proxies, API gateways). SPIFFE Workload API authentication uses Unix domain sockets with kernel-level caller attestation (PID, UID verification). Zero-trust by default: no pre-shared secrets, no long-lived credentials, no static API keys.

**Known Vulnerabilities**:
> 1. SPIRE Server compromise: If the SPIRE Server's signing key is compromised, all SVIDs in the trust domain can be forged. Mitigated by upstream CA integration (key material never in SPIRE), HSM backing, and HA deployment.
> 2. Node attestation bypass: If platform attestation is weak (e.g., overly permissive join tokens), rogue nodes could register and receive SVIDs. Mitigated by using strong platform-specific attestors (AWS IID, GCP IIT, TPM).
> 3. Workload attestation imprecision: Broad selectors (e.g., all processes by a specific Unix user) could grant SVIDs to unintended workloads. Mitigated by precise selectors (specific container images, Kubernetes service accounts).
> 4. Trust bundle distribution timing: Brief window during CA rotation where some workloads may not have the new trust bundle. Mitigated by overlap periods and graceful rotation.
> 5. SVID TTL misconfiguration: Too-long TTLs reduce the security benefit of short-lived credentials.
> 6. CVE-2024-45719 (September 2024): SPIRE Agent could be tricked into issuing SVIDs to unauthorized workloads via race condition in Unix workload attestor. Fixed in SPIRE v1.10.3.

**Revocation Speed**:
> minutes (by design, SPIFFE/SPIRE does not use traditional certificate revocation lists or OCSP. Instead, security relies on short SVID TTLs: when a workload is no longer authorized, SPIRE simply stops issuing new SVIDs, and existing SVIDs expire within minutes. For immediate action: SPIRE Agents can be instructed to revoke cached SVIDs, and registration entries can be deleted instantly. Effective revocation time equals the remaining TTL of the last-issued SVID, typically 1 hour or less.)

**Anti Sybil**:
> Platform attestation as the primary defense: workloads must be attested by a SPIRE Agent using verified platform identity (AWS instance identity document, GCP instance identity token, Kubernetes service account token, TPM quote). Registration entries are created by administrators, not by workloads themselves. Rate limiting on SVID issuance is configurable. Kubernetes admission controllers can prevent unauthorized pod creation. No staking or economic mechanisms (infrastructure-level identity, not economic identity).

**Data Exposure Risk**:
> SPIFFE IDs are embedded in X.509 certificates and JWT tokens, revealing the trust domain name and workload path (which may encode organizational structure). X.509-SVID certificates are exchanged during TLS handshakes and visible to network observers. SPIRE Server stores registration entries and SVID issuance logs. Private keys never leave the node (generated locally by SPIRE Agent). No API keys, passwords, or PII are involved in the identity system. The trust bundle (public CA certificates) is designed to be widely distributed.

**Bot To Bot Attack Surface**:
> In an agentic AI context, SPIFFE/SPIRE provides strong identity foundations but does not address application-layer attacks:
> 1. Identity-verified prompt injection: An agent with a valid SVID could still send adversarial prompts to another agent via authenticated mTLS channels — SPIFFE verifies identity, not intent.
> 2. Overprivileged communication: If SPIFFE IDs and network policies are too broad, agents may communicate with services they should not access.
> 3. Federation abuse: Federated trust domains could be exploited to impersonate agents across organizational boundaries if federation policies are misconfigured. Mitigations: Fine-grained SPIFFE ID paths for each agent type, network policy enforcement (e.g., Istio/Envoy RBAC based on SPIFFE ID), and application-layer authorization on top of SPIFFE identity.

**Skill Plugin Vetting**: Not applicable. SPIFFE/SPIRE is an identity infrastructure layer, not an agent platform. It does not manage skills, plugins, or tools. Tool/skill vetting would be the responsibility of the agent platform (e.g., MCP servers, A2A protocol) running on top of SPIFFE-secured infrastructure.

**Attestation Mechanism**:
> Multi-layer attestation is the core of SPIFFE/SPIRE:
> 1. Node Attestation: Verifies the identity of the host/node where the SPIRE Agent runs. Platform-specific attestors: AWS IID (instance identity document), GCP IIT (instance identity token), Azure MSI, Kubernetes PSAT (projected service account token), TPM DevID, join token (manual).
> 2. Workload Attestation: Verifies the identity of the specific process/container requesting an SVID. Workload attestors: Unix (PID, UID, GID, binary path, SHA256 hash), Kubernetes (namespace, service account, pod labels, container image), Docker (container ID, image ID, labels).
> 3. Continuous Attestation: SVIDs are re-attested at each renewal cycle. If attestation fails (e.g., workload no longer matches selectors), the SVID is not renewed.

### Off-chain / On-chain Linking

**Linking Support**: No (not natively; experimental/proposed)

**Linking Mechanism**:
> SPIFFE/SPIRE is designed for infrastructure workload identity, not blockchain integration. No native mechanism to link SPIFFE IDs to on-chain identities. However, proposals exist for using SPIFFE as the identity layer for off-chain agent components that interact with on-chain systems: an agent could hold a SPIFFE ID for service-mesh authentication and separately hold a wallet key for on-chain transactions. Bridge implementations could bind a SPIFFE ID to a blockchain address via signed attestation documents, but this is not part of the SPIFFE specification.

**Transfer Behavior**: N/A. No on-chain token component in SPIFFE/SPIRE.

### Delegation & Authorization

**Delegation Model**:
> SPIFFE/SPIRE provides identity, not authorization. Delegation must be implemented at the application or policy layer. Common patterns:
> 1. SPIFFE + OPA (Open Policy Agent): SPIFFE provides verified identity, OPA evaluates authorization policies based on SPIFFE ID.
> 2. SPIFFE + Envoy/Istio RBAC: Service mesh authorization policies based on SPIFFE IDs (e.g., allow spiffe://example.org/agent-a to call spiffe://example.org/service-b).
> 3. SPIFFE + OAuth 2.0: SPIFFE identity used to obtain OAuth tokens from an authorization server (SPIRE OIDC Discovery provider enables this).
> 4. Nested SPIFFE IDs: Hierarchical SPIFFE ID paths can represent delegation relationships (e.g., spiffe://example.org/human/alice/agent/assistant).
> 5. JWT-SVID claims: Custom claims in JWT-SVIDs can carry delegation context. SPIFFE does not natively support OAuth OBO or OIDC-A delegation chains.

**Authorization Granularity**:
> SPIFFE itself provides identity-only (no authorization). Authorization granularity depends on the policy engine used: Coarse (service-mesh RBAC based on SPIFFE ID) to Fine-grained (ABAC via OPA/Cedar/Rego policies that consider SPIFFE ID attributes, request context, and resource properties). SPIFFE's hierarchical ID structure enables path-based authorization rules.

### Discovery & Interoperability

**Discovery Mechanism**:
> SPIFFE Bundle Endpoint: A standardized API for discovering trust bundles of federated trust domains. SPIRE Server APIs for listing registration entries and workload identities. SPIFFE Federation: Cross-domain workload discovery via federated trust bundle exchange. No agent-specific discovery mechanism (no Agent Cards, no .well-known endpoints). Discovery of specific agent capabilities would need an overlay system.

**Capability Declaration**:
> None. SPIFFE/SPIRE manages identity, not capability declaration. SPIFFE IDs can encode workload type in the path (by convention), but there is no standardized mechanism for agents to declare their capabilities, tools, or skills via SPIFFE. Capability declaration would be handled by overlay protocols (A2A Agent Cards, MCP tool lists) running on SPIFFE-secured infrastructure.

**Cross Platform Portability**:
> Highly portable. SPIFFE IDs are platform-agnostic URIs. The same SPIFFE ID can identify a workload running on AWS, GCP, Azure, on-premises, or across any combination. SPIRE supports cross-cloud attestation and federation. Workloads migrated between platforms retain their logical SPIFFE ID. Trust domain federation enables cross-organizational portability. SPIRE is one of the most portable workload identity systems available.

**Standards Compliance**:
> SPIFFE specification (spiffe.io), X.509 (RFC 5280 for X.509-SVID), JWT (RFC 7519 for JWT-SVID), TLS 1.2/1.3 (for mTLS authentication), URI SAN (RFC 2818/6125), OIDC Discovery (SPIRE OIDC Provider enables standard OIDC token issuance from SPIFFE IDs). CNCF graduated project. Not natively W3C DID, W3C VC, OAuth 2.0, or SCIM — SPIFFE is a lower-level identity primitive that can underpin these higher-level protocols.

**Protocol Composability**:
> High composability as an identity infrastructure layer. SPIFFE/SPIRE composes with: Istio/Envoy (SPIFFE is the default identity in Istio service mesh), HashiCorp Consul Connect (uses SPIFFE for service identity), Kubernetes (native integration via SPIRE Kubernetes Controller Registrar), gRPC (SPIFFE-aware credential plugins), Envoy proxy (SPIFFE-based mTLS), OPA (SPIFFE ID as authorization input), OAuth 2.0 (via SPIRE OIDC Discovery provider), MCP (can secure MCP server connections via mTLS with SPIFFE identity), cloud provider IAM (AWS IAM Roles Anywhere, GCP Workload Identity Federation accept SPIFFE SVIDs).

### Push/Pull Communication

**Push Support**: None (SPIFFE/SPIRE is an identity layer, not a communication protocol). SPIRE Agents push updated SVIDs to workloads via the Workload API (Unix domain socket with streaming).

**Pull Support**: REST API (SPIRE Server API for administrative operations: list/create/update/delete registration entries). SPIFFE Workload API (gRPC over Unix domain socket) for workloads to pull their SVIDs and trust bundles.

**Subscription Model**: SPIFFE Workload API supports streaming: workloads open a persistent connection to the SPIRE Agent and receive updated SVIDs and trust bundles automatically when they change. This is a gRPC streaming subscription model, not webhook-based. No event subscription for external systems.

### Trust & Reputation

**Trust Model**:
> Federated (trust domains). Each SPIRE Server manages a trust domain. Trust within a domain is centralized (SPIRE Server as CA). Cross-domain trust is established via explicit trust bundle federation (SPIFFE Federation). Trust is cryptographic: verification is based on certificate chain validation against trust bundles, not platform reputation or social signals. Zero-trust by default: every workload must be attested, no implicit trust based on network location.

**Reputation System**:
> None. SPIFFE/SPIRE is a cryptographic identity system, not a reputation system. There is no mechanism for tracking agent reputation, performance, or trustworthiness. All workloads with valid SVIDs matching the correct SPIFFE ID are treated equally. Reputation would need to be implemented at a higher layer (application, agent platform, or on-chain registry).

### Payment & Economics

**Payment Integration**: None. SPIFFE/SPIRE is infrastructure-level identity. No payment protocol integration.

**Economic Model**:
> Free (fully open-source under Apache 2.0 license). No staking, gas fees, or token requirements. Infrastructure costs for running SPIRE Servers and Agents (compute, storage for datastore). Commercial support and managed SPIFFE services available from HashiCorp (HCP Consul), CyberArk (Conjur), and other vendors.

### Governance & Compliance

**Regulatory Alignment**:
> SPIFFE/SPIRE supports compliance through strong identity and audit capabilities but is not itself a compliance framework. Supports: zero-trust architecture requirements (NIST SP 800-207), mutual authentication requirements (PCI DSS, HIPAA), workload identity requirements (FedRAMP), and audit trail generation. HashiCorp and CyberArk position SPIFFE/SPIRE as supporting NIST AI RMF compliance for AI agent workloads. The NIST NCCoE Agent Identity concept paper explicitly considers SPIFFE as a recommended identity technology.

**Audit Trail Capability**:
> SPIRE Server logs all SVID issuance, registration entry changes, and attestation events. Audit logs include: which SPIFFE ID was issued, to which node, at what time, with what TTL, and based on which registration entry. Logs can be forwarded to SIEM systems (Splunk, ELK, etc.). No built-in immutable hash chain or blockchain anchoring, but logs are structured and can be fed into tamper-evident log systems. At Uber's scale, SPIRE processes billions of attestation events per day with comprehensive logging.

**Lifecycle Management**:
> Registration (create registration entry in SPIRE Server) -> Activation (workload starts, attestation occurs, SVID issued) -> Operation (automatic SVID rotation, continuous re-attestation) -> Suspension (delete or disable registration entry; existing SVIDs expire per TTL) -> Migration (update registration entry selectors for new platform/location; SPIFFE ID remains the same) -> Upgrade (update registration entry, rotate CA keys if needed) -> Decommissioning (delete registration entry, SVIDs expire, no new issuance). Lifecycle is largely automated through SPIRE Agent's continuous attestation and rotation.

### Uncertain Fields (1)

- versioning_support

---

## NIST NCCoE Agent Identity Project

**Type**: `standard` · **Status**: `Spec-only` · **Ecosystem**: Enterprise / Government

### Basic Info

**Type**: standard

**Status**: Spec-only

**Ecosystem**: Enterprise / Government (technology-agnostic; covers cloud-native, on-premises, and hybrid environments across federal agencies and private sector)

**Launch Date**: February 2026 (concept paper published by NIST National Cybersecurity Center of Excellence; public comment period open until April 2, 2026)

### Onboarding Flow

**Registration Steps**:
> The NIST NCCoE Agent Identity Project is a guidance framework, not an operational platform. It does not define a specific onboarding flow but rather prescribes requirements that enterprise onboarding systems should meet:
> 1. Establish Agent Identity: Assign a unique, verifiable identity to each AI agent using enterprise identity management systems (e.g., SCIM provisioning, OIDC registration, or SPIFFE workload registration).
> 2. Bind Identity to Authorization: Link the agent identity to an authorization framework (OAuth 2.0/2.1 scopes, RBAC, or ABAC policies) that defines what the agent can do.
> 3. Configure Delegation Chains: Set up human-to-agent and agent-to-agent delegation using OAuth 2.0 On-Behalf-Of (OBO), OIDC-based delegation tokens, or similar mechanisms.
> 4. Enable Logging and Audit: Configure immutable audit trails linking all agent actions back to the agent identity and its delegating human principal.
> 5. Integrate with Enterprise IAM: Connect agent identity to existing enterprise identity providers (e.g., Microsoft Entra, Okta, Ping Identity) via SCIM, OIDC, or SAML.
> 6. Periodic Re-attestation: Implement periodic identity re-verification and credential rotation as recommended by the framework.

**Human Involvement**: full-setup (the framework assumes enterprise IT administrators and security teams configure and govern agent identities; no autonomous self-registration is prescribed)

**Agent Autonomy**:
> The concept paper focuses on controlled, enterprise-managed agent identity. Agents do not self-register; they are provisioned by human administrators within enterprise IAM systems. Once provisioned, agents operate autonomously within their authorized scope, but all actions are auditable and tied back to a human principal via delegation chains.

**Time To First Action**: hours to days (dependent on enterprise IAM provisioning workflows; the framework itself does not specify timing but assumes standard enterprise change management processes)

### Identity Model

**Identity Type**:
> The concept paper is technology-agnostic and considers multiple identity primitives: OIDC subject identifiers (sub claims), SPIFFE Verifiable Identity Documents (SVIDs), SCIM-provisioned directory objects, OAuth 2.0 client credentials, and potentially W3C DIDs. The framework recommends that each agent have a unique, non-shared, cryptographically verifiable identity distinct from the human user it acts on behalf of.

**Key Management**:
> The concept paper recommends short-lived credentials with automatic rotation, aligned with zero-trust principles. Specific recommendations include: SPIFFE-style short-lived SVIDs (X.509 certificates or JWT tokens with short TTLs, typically minutes to hours), OAuth 2.0 access tokens with limited lifetimes, certificate-based authentication with automated rotation via ACME or SPIRE-managed CAs, and hardware security module (HSM) or Trusted Platform Module (TPM) backing for high-assurance scenarios. Key revocation should be near-instantaneous via CRL/OCSP or token revocation endpoints.

**Multi Instance Support**:
> Yes (recommended). The framework considers scenarios where a single logical agent identity may run across multiple runtime instances (horizontal scaling, failover). SPIFFE's workload identity model natively supports this: multiple instances receive the same SPIFFE ID but distinct SVIDs. The framework recommends that each instance be individually attestable while sharing the logical agent identity.

**Recovery Mechanism**:
> The concept paper recommends automated credential re-issuance rather than recovery. If credentials are compromised: immediate revocation of all affected credentials, re-attestation of the workload/agent via the identity provider, issuance of new credentials. For catastrophic identity loss: re-provisioning through enterprise IAM workflows with human administrator approval. No social recovery; recovery is centralized through enterprise identity governance.

### Security

**Authentication Method**:
> The concept paper considers multiple authentication methods appropriate for different enterprise contexts: OAuth 2.0/2.1 client credentials flow, OIDC token-based authentication, SPIFFE SVID presentation (X.509 mTLS or JWT-SVID), SCIM-provisioned credentials verified against enterprise directories, and certificate-based mutual TLS. The framework emphasizes that agent authentication must be distinct from human user authentication and must support delegation chain verification.

**Known Vulnerabilities**:
> The concept paper identifies several threat categories that the framework aims to address:
> 1. Agent impersonation: Unauthorized entities posing as legitimate agents without proper identity verification.
> 2. Privilege escalation via delegation: Agents acquiring permissions beyond what was delegated by the human principal.
> 3. Credential theft/replay: Long-lived or improperly secured agent credentials being stolen and reused.
> 4. Audit trail gaps: Inability to trace agent actions back to the delegating human, creating accountability blind spots.
> 5. Shadow agents: Unregistered or unmanaged AI agents operating outside enterprise governance.
> 6. Cross-system identity confusion: Agents with identities in multiple systems creating inconsistent authorization states.
> 7. Prompt injection leading to unauthorized actions: Agent identity being valid but actions being manipulated through adversarial inputs. The framework is specifically designed to provide guidance on mitigating these threats.

**Revocation Speed**:
> seconds to minutes (the framework recommends near-instantaneous revocation capabilities; SPIFFE SVIDs with short TTLs naturally expire within minutes; OAuth token revocation endpoints provide immediate invalidation; the concept paper emphasizes that revocation speed is a critical enterprise requirement)

**Anti Sybil**:
> Enterprise-managed provisioning: Only authorized administrators can create agent identities. Rate limiting and quota management through enterprise IAM. SCIM provisioning workflows with approval gates. The framework assumes enterprise governance controls prevent unauthorized mass agent creation. No staking or proof-of-work (enterprise context).

**Data Exposure Risk**:
> The concept paper addresses data exposure as a key concern: Agent credentials (OAuth tokens, SVIDs, API keys) must be protected in transit and at rest. Agent identity metadata (name, purpose, delegating human, permissions) is visible to enterprise administrators and potentially other authorized systems. Delegation chains reveal organizational relationships (which human authorized which agent for what). Audit logs contain detailed records of agent actions that may include sensitive business data. The framework recommends encryption, access controls on audit data, and data minimization principles.

**Bot To Bot Attack Surface**:
> The concept paper considers agent-to-agent interactions as a key area of concern:
> 1. Delegation chain manipulation: Agent A manipulates Agent B through improperly validated delegation chains.
> 2. Cross-agent prompt injection: Malicious content passed between agents via MCP tool calls or A2A protocol messages could manipulate receiving agent behavior.
> 3. Identity confusion in multi-agent workflows: Agents in complex orchestration patterns may inherit or escalate privileges improperly.
> 4. Unauthorized agent-to-agent communication: Agents establishing communication channels outside governed pathways. The framework recommends per-hop authorization verification, delegation depth limits, and comprehensive inter-agent audit trails.

**Attestation Mechanism**:
> The concept paper considers multiple attestation mechanisms: SPIFFE workload attestation (node attestation + workload attestation via SPIRE agents), OIDC token claims as identity assertion, Enterprise PKI certificate-based attestation, and potentially TEE-based remote attestation for high-assurance scenarios. The framework recommends that attestation be continuous (not just at registration time) and that attestation results be bound to the agent identity.

### Off-chain / On-chain Linking

**Linking Support**: N/A

**Linking Mechanism**:
> The NIST NCCoE concept paper focuses on enterprise and government IT environments. Blockchain or on-chain identity linking is not within the scope of the current concept paper. The framework addresses enterprise IAM systems (OIDC, SCIM, SPIFFE, OAuth) rather than decentralized identity infrastructure.

**Transfer Behavior**: N/A. No on-chain component in the framework.

### Delegation & Authorization

**Delegation Model**:
> Delegation is a central focus of the concept paper. The framework considers: OAuth 2.0 On-Behalf-Of (OBO) flow for human-to-agent delegation where the agent acts with a scoped subset of the human's permissions; OIDC-based delegation tokens carrying claims about the delegating principal, the agent, and the delegation scope; SPIFFE-based workload identity combined with external authorization systems; multi-hop delegation chains where Human -> Agent A -> Agent B, with each hop requiring explicit authorization and scope narrowing; and time-bounded delegation with automatic expiration. The framework emphasizes that delegation must be auditable, revocable, and scoped to the minimum necessary permissions.

**Authorization Granularity**:
> Fine-grained (ABAC) recommended. The concept paper recommends attribute-based access control (ABAC) that considers: agent identity attributes, delegating human's permissions, requested action type, target resource sensitivity, environmental context (time, network location, risk score). The framework considers OAuth scopes as a baseline (coarse) with ABAC policies for fine-grained enforcement. Intent-aware authorization (what is the agent trying to accomplish) is discussed as an aspirational goal.

### Discovery & Interoperability

**Discovery Mechanism**:
> The concept paper considers enterprise agent registries and directories as the primary discovery mechanism. SCIM-based directories for agent identity records, OIDC discovery endpoints for authentication configuration, SPIFFE trust domain federation for cross-organizational agent discovery. The framework does not prescribe a specific agent discovery protocol like A2A Agent Cards or .well-known endpoints, but acknowledges these as relevant mechanisms in the broader ecosystem.

**Cross Platform Portability**:
> Partially portable via standards. The framework recommends building on portable standards (OIDC, SPIFFE, SCIM, OAuth) rather than vendor-specific identity systems. SPIFFE IDs are designed to be portable across infrastructure providers. OIDC tokens can be federated across identity providers. However, enterprise-specific policy configurations (Conditional Access, ABAC rules) may not be portable.

**Standards Compliance**:
> OAuth 2.0/2.1, OpenID Connect (OIDC), SPIFFE (SPIFFE ID, X.509-SVID, JWT-SVID), SCIM 2.0 (RFC 7643/7644), NIST SP 800-63 (Digital Identity Guidelines), NIST AI RMF (AI 100-1), and considers emerging standards including MCP (Anthropic/Linux Foundation), OIDC-A (proposed), and OAuth OBO extensions for AI agents (IETF draft). The concept paper is positioned within the broader NIST cybersecurity and AI risk management framework ecosystem.

**Protocol Composability**:
> High composability by design. The framework is designed to be composable with: MCP (agent-to-tool interactions with identity binding), A2A (agent-to-agent communication with identity verification), SPIFFE/SPIRE (workload identity infrastructure), enterprise IAM stacks (Microsoft Entra, Okta, Ping Identity), and emerging agent protocols. The concept paper explicitly considers how these protocols interact in enterprise agent deployments.

### Push/Pull Communication

**Push Support**: N/A (the framework is a governance/guidance document, not a communication protocol; it considers logging push mechanisms like SIEM integration and webhook-based audit event forwarding)

**Pull Support**: N/A (not a communication protocol; considers SCIM API queries for agent identity lookups and OIDC userinfo endpoints for agent attribute retrieval)

**Subscription Model**: N/A (not a communication protocol). The framework recommends that enterprise systems support event-driven notifications for agent identity lifecycle events (creation, modification, suspension, revocation) via existing enterprise event systems.

### Trust & Reputation

**Trust Model**:
> Centralized and federated. The framework assumes enterprise-managed trust: centralized identity providers (OIDC, SCIM directories) establish trust within organizations. Cross-organizational trust via SPIFFE trust domain federation or OIDC federation. The concept paper emphasizes that trust in an agent derives from: (
> 1) the identity of the delegating human, (
> 2) the authorization scope granted, (
> 3) the attestation of the agent workload, and (
> 4) the audit trail of agent actions.

**Reputation System**:
> None prescribed. The concept paper focuses on identity, authorization, and audit rather than reputation scoring. Agent trustworthiness is established through enterprise governance (provisioning controls, access reviews, audit) rather than dynamic reputation systems. The framework may recommend agent performance monitoring as part of lifecycle management.

### Payment & Economics

**Payment Integration**: None. The NIST NCCoE concept paper does not address payment protocols. It is focused on identity, authorization, delegation, and audit within enterprise IT environments.

**Economic Model**: Free (the concept paper and eventual practice guide will be publicly available NIST publications). Implementation costs depend on enterprise IAM infrastructure investments. No staking, gas fees, or token requirements.

### Governance & Compliance

**Regulatory Alignment**:
> Strong alignment by design. The project sits within NIST's cybersecurity and AI governance mission. Directly supports: NIST AI Risk Management Framework (AI 100-1), NIST Cybersecurity Framework (CSF), NIST SP 800-63 (Digital Identity Guidelines), Executive Order 14110 on Safe, Secure, and Trustworthy AI (October 2023), and by extension supports alignment with EU AI Act requirements for AI system traceability and accountability. The concept paper is specifically designed to help organizations meet federal and industry compliance requirements for AI agent deployment.

**Audit Trail Capability**:
> Comprehensive audit capability is a core pillar of the concept paper. The framework recommends: immutable logging of all agent actions linked to agent identity and delegating human principal, cryptographic binding of audit records to agent identity (signed events), integration with enterprise SIEM systems, end-to-end traceability from human delegation through agent action chains, and retention policies aligned with regulatory requirements. Specific implementation technologies (hash chains, blockchain anchoring) are left to implementers, but the framework mandates comprehensive, tamper-evident audit trails.

**Lifecycle Management**:
> Full lifecycle support is a core scope area. The concept paper covers: Registration/Provisioning (agent identity creation in enterprise IAM), Activation (credential issuance, authorization binding), Operation (ongoing authentication, authorization, delegation), Monitoring (continuous audit, anomaly detection), Suspension (temporary credential revocation, access freeze), Migration (identity portability across infrastructure changes), Upgrade (credential rotation, permission updates, re-attestation), and Decommissioning (identity deletion, credential destruction, audit record archival). The framework emphasizes that lifecycle management must be automated where possible and governed by enterprise policies.

### Uncertain Fields (3)

- versioning_support
- skill_plugin_vetting
- capability_declaration

---

## OAuth 2.0 On-Behalf-Of for AI Agents (IETF Draft)

**Type**: `standard` · **Status**: `Spec-only` · **Ecosystem**: Cloud/Enterprise

### Basic Info

**Type**: standard

**Status**: Spec-only

**Ecosystem**: Cloud/Enterprise (protocol extension; framework-agnostic; designed to work with any OAuth 2.0 / 2.1 compliant authorization server)

**Launch Date**: 2025 (IETF Internet-Draft; extends RFC 8693 OAuth Token Exchange for AI agent delegation scenarios)

### Onboarding Flow

**Registration Steps**:
> 1. Agent developer registers the agent as an OAuth 2.0 client with an authorization server (AS) that supports the OBO-for-agents extension: agent receives client_id and client credentials.
> 2. Human user authenticates with the AS and obtains an access token (subject_token) for the target resource.
> 3. Human initiates delegation: the client application sends a token exchange request (RFC
> 8
> 6
> 9
> 3) to the AS with grant_type=urn:ietf:params:oauth:grant-type:token-exchange, including: subject_token (human user token), requested_token_type (access_token), actor_token (agent identity assertion), and requested_actor (identifier of the agent to act on behalf of the user).
> 4. AS validates the delegation: verifies the human subject_token, validates the actor_token (agent identity), checks delegation policies (scope constraints, agent eligibility, resource restrictions), and evaluates whether the requested delegation is permitted.
> 5. AS issues a delegated access token: the new token contains both the human subject (sub claim) and the agent actor (act claim with sub identifying the agent), plus scoped permissions that are the intersection of the human permissions and the delegated scope.
> 6. Agent uses the delegated token to access resources: resource servers validate both the subject and actor claims, apply authorization policies considering the delegation context, and log actions attributed to both the human principal and the acting agent.
> 7. Agent operates within delegated scope until token expires or is revoked.

**Human Involvement**: approve-only (human must authenticate and initiate/approve the delegation; agent handles token exchange and resource access autonomously)

**Agent Autonomy**:
> Agent cannot self-register or self-delegate. The delegation must be initiated by a human principal or authorized application. Once delegation is established, the agent operates fully autonomously within the delegated scope - acquiring tokens, accessing resources, refreshing tokens (if permitted). The agent is responsible for presenting its actor_token to prove its identity during delegation requests.

**Time To First Action**: seconds to minutes (once the human authenticates and approves delegation, the token exchange completes in seconds; agent can immediately use the delegated token to access resources)

### Identity Model

**Identity Type**:
> OAuth 2.0 client identity with actor claims. The agent is identified through: (
> 1) its OAuth client_id as a registered client at the AS, (
> 2) the actor_token - a JWT or other token asserting the agent identity, and (
> 3) the act claim in the delegated access token, which contains a nested sub claim identifying the acting agent. The requested_actor parameter allows specifying which agent should receive delegation authority.

**Key Management**:
> Follows standard OAuth 2.0 client credential management. Agent authenticates to the AS using client_secret_post, client_secret_basic, private_key_jwt, or mTLS. Actor tokens can be self-signed JWTs or IdP-issued assertions. Token lifetimes are controlled by the AS. Delegated tokens should have shorter lifetimes than the original subject_token. Key rotation follows standard OAuth client credential practices.

**Multi Instance Support**:
> Yes. Multiple agent instances can share the same OAuth client registration. Each instance can independently request delegated tokens using the same actor_token identity. The AS may issue separate delegated tokens to each instance. Concurrent delegation from the same human to the same agent across instances is supported.

### Security

**Authentication Method**:
> OAuth 2.0 token exchange (RFC 8693 extension). The agent authenticates via: (
> 1) client authentication to the AS (client_secret or private_key_jwt), (
> 2) actor_token presentation proving agent identity, and (
> 3) the resulting delegated token containing both subject (human) and actor (agent) claims. Resource servers validate the dual subject+actor identity in the token.

**Revocation Speed**: seconds (delegated tokens have short lifetimes; RFC 7009 token revocation provides immediate invalidation; AS can refuse token refresh for revoked delegations; human can revoke delegation at any time)

**Anti Sybil**:
> Delegated to the OAuth authorization server and client registration process. Agent registration requires administrator approval. Delegation is initiated by authenticated human principals, preventing unauthorized agent proliferation. Rate limiting on token exchange requests prevents mass delegation abuse. No staking or proof-of-work mechanisms.

**Data Exposure Risk**:
> Moderate. Delegated tokens expose: human subject identifier (sub), agent actor identifier (act.sub), delegated scopes, token issuer, audience, and expiration. Resource servers see both the human and agent identity. Audit logs at the AS record delegation events linking human to agent. Scope claims reveal what the agent is authorized to do. Standard OAuth token claim minimization applies.

**Bot To Bot Attack Surface**:
> The OBO draft provides explicit delegation boundary enforcement: (
> 1) Delegated tokens carry both subject and actor claims, making impersonation detectable; (
> 2) Scope constraints prevent agents from exceeding delegated authority; (
> 3) Token audience restrictions prevent cross-service abuse; (
> 4) AS policies can restrict which agents can receive delegation from which humans. Risks include: agent-to-agent token forwarding (mitigated by audience binding), prompt injection causing agents to request excessive delegation (mitigated by AS policy), and delegation chain attacks where a compromised agent delegates to sub-agents (mitigated by chain depth limits).

### Off-chain / On-chain Linking

**Linking Support**: N/A (OAuth OBO is a purely off-chain protocol extension; no on-chain component)

**Linking Mechanism**: N/A. The IETF draft operates entirely within the OAuth 2.0 off-chain ecosystem. No blockchain integration is specified. Custom implementations could bridge delegated tokens to on-chain identity systems, but this is not part of the specification.

**Transfer Behavior**: N/A. No on-chain token component exists. Delegation lifecycle is managed entirely through the OAuth authorization server.

### Delegation & Authorization

**Delegation Model**:
> OAuth 2.0 On-Behalf-Of (OBO) with requested_actor extension: This is the core contribution of the draft. The delegation flow uses RFC 8693 token exchange with two new parameters: (
> 1) requested_actor - specifies which agent should act on behalf of the user; (
> 2) actor_token - proves the agent identity to the AS. The resulting delegated token contains: sub (human principal), act (nested claim with sub identifying the agent), scope (intersection of human permissions and delegation limits), and standard JWT claims. Human-to-agent delegation is the primary use case. Agent-to-agent (chained) delegation is supported by using the delegated token as a new subject_token in a subsequent token exchange, with the second agent as the new actor. Each hop reduces available scope (monotonically decreasing permissions). The AS enforces delegation policies including: allowed agent-human pairings, maximum scope per delegation, time limits, and chain depth limits.

**Authorization Granularity**:
> Coarse to fine-grained (scope-based). Authorization is controlled through OAuth 2.0 scopes. The delegated scope is the intersection of: (
> 1) human user permissions, (
> 2) scopes requested in the token exchange, (
> 3) AS delegation policy limits for the specific agent. The draft supports standard OAuth scope syntax, which can range from coarse (read, write) to fine-grained (read:user:email, write:repo:issues). Additional authorization can be implemented at the RS level by evaluating the act claim attributes.

### Discovery & Interoperability

**Cross Platform Portability**:
> Partially portable. OAuth 2.0 is a widely adopted standard supported by virtually all enterprise platforms. Delegated tokens issued by one AS can be validated by any RS that trusts that AS. Cross-AS delegation requires federation. The use of standard JWT format ensures structural portability. However, delegation policies are AS-specific.

**Standards Compliance**:
> OAuth 2.0 (RFC 6749), OAuth 2.0 Token Exchange (RFC 8693), JWT (RFC 7519), OAuth Token Revocation (RFC 7009), OAuth Token Introspection (RFC 7662), OAuth Authorization Server Metadata (RFC 8414). Designed to be compatible with OAuth 2.1 (draft). The draft builds directly on RFC 8693 by extending the token exchange grant type with agent-specific parameters.

**Protocol Composability**:
> High. OAuth OBO for AI Agents is designed as a delegation layer that composes with: OIDC-A (provides rich agent identity claims for actor_tokens), MCP (OBO delegated tokens as authentication for MCP tool servers - MCP spec already recommends OAuth 2.1), A2A Protocol (delegated tokens for inter-agent authentication), Microsoft Entra Agent ID (Entra already implements OBO flows), Amazon Bedrock AgentCore (uses OBO for third-party service delegation), SPIFFE/SPIRE (SVIDs as actor_tokens). The draft explicitly positions itself as the standard delegation mechanism for the AI agent ecosystem.

### Push/Pull Communication

**Push Support**: none (OAuth OBO is a delegation/authorization protocol, not a communication protocol)

**Pull Support**: REST API (standard OAuth endpoints: token endpoint for token exchange, revocation endpoint, introspection endpoint)

**Subscription Model**: N/A. OAuth OBO does not define event subscription mechanisms. Token lifecycle events (expiration, revocation) are the primary state changes.

### Trust & Reputation

**Trust Model**:
> Centralized (platform-verified) with delegation chains. Trust is rooted in the OAuth authorization server. The AS verifies human identity, validates agent identity (via actor_token), and enforces delegation policies. Cross-AS trust requires explicit federation. The delegation chain model provides a verifiable path from human authority to agent action.

### Payment & Economics

**Payment Integration**: None. OAuth OBO is a delegation and authorization protocol, not a payment system. Payment integration would be handled through companion protocols (AP2, x402) that could use OBO-delegated tokens for agent authentication.

**Economic Model**: Free (open specification / IETF draft). No licensing fees, staking requirements, gas fees, or token purchases. Implementation costs depend on the OAuth AS infrastructure (open-source options like Keycloak are free; cloud IdPs have subscription costs).

### Governance & Compliance

**Audit Trail Capability**:
> Signed events (JWT). Every delegated token is a cryptographically signed audit record containing: human subject (sub), agent actor (act.sub), delegated scopes, issuer, audience, timestamps (iat, exp), and token identifier (jti). The AS logs all token exchange events. Resource servers log actions with dual subject+actor attribution. Combined, this provides a complete audit trail from human authorization through agent action.

### Uncertain Fields (10)

- recovery_mechanism
- versioning_support
- known_vulnerabilities
- skill_plugin_vetting
- attestation_mechanism
- discovery_mechanism
- capability_declaration
- reputation_system
- regulatory_alignment
- lifecycle_management

---

## OpenID Connect for Agents (OIDC-A) 1.0

**Type**: `standard` · **Status**: `Spec-only` · **Ecosystem**: Cloud/Enterprise

### Basic Info

**Type**: standard

**Status**: Spec-only

**Ecosystem**: Cloud/Enterprise (identity-layer standard; framework-agnostic; designed to extend existing OIDC infrastructure for LLM-based AI agents)

**Launch Date**: 2025 (arXiv preprint 2509.25974; academic proposal stage, not yet an OpenID Foundation official specification)

### Onboarding Flow

**Registration Steps**:
> 1. Agent developer registers the agent as an OIDC client with an OIDC-A-compliant Identity Provider (IdP): provides agent metadata including agent type (LLM model family), model version, capabilities, and operator organization.
> 2. IdP issues agent-specific credentials: the agent receives a client_id and client_secret (or certificate) along with OIDC-A-extended claims registration.
> 3. Agent authenticates to the IdP using standard OIDC flows (client credentials or authorization code with delegation): IdP validates the agent identity and issues an ID token containing OIDC-A extended claims (agent_type, model_id, model_version, agent_capabilities, operator_org, attestation_status).
> 4. If delegation is required: the human principal authenticates first, then delegates authority to the agent via OIDC-A delegation chain claims embedded in the token (delegator_sub, delegation_scope, delegation_chain).
> 5. Agent presents OIDC-A tokens to resource servers/relying parties: the RP validates agent identity claims, checks attestation status, evaluates attribute-based authorization policies, and grants access.
> 6. Agent begins operations within authorized scope defined by OIDC-A claims and ABAC policies.

**Human Involvement**: approve-only (human principal must authenticate and authorize delegation; agent handles the rest of the OIDC flow autonomously)

**Agent Autonomy**:
> Agent can autonomously authenticate, obtain tokens, and present credentials once initial registration and delegation are configured. Self-registration is not specified - an administrator or developer must register the agent client with the IdP. Runtime token acquisition and renewal are fully autonomous.

**Time To First Action**: minutes (once registered with the IdP and delegation is configured, agent can authenticate and obtain access tokens within seconds to minutes)

### Identity Model

**Identity Type**:
> OIDC client identity with extended agent claims. The agent is represented as an OIDC client with additional OIDC-A claim types: agent_type (e.g., llm, tool-agent, orchestrator), model_id (specific model identifier), model_version, agent_capabilities (structured capability declarations), operator_org (organization operating the agent), and attestation_status (verified/unverified). Identity is expressed via JWT ID tokens and access tokens containing these claims.

**Key Management**:
> Follows standard OIDC/OAuth 2.0 client credential management. Agents authenticate using client_secret, private_key_jwt (signed JWTs), or mTLS client certificates. Key rotation follows OIDC client credential rotation best practices. The spec recommends short-lived tokens and supports token refresh. Private key JWT authentication is preferred for higher-security deployments. Key management is delegated to the IdP infrastructure (e.g., Keycloak, Entra ID, Auth0).

**Multi Instance Support**: Yes. Multiple runtime instances of the same agent share the same OIDC client registration and can independently obtain tokens. Each instance receives its own access token with the same agent identity claims. Load balancing and horizontal scaling are supported through standard OIDC patterns.

**Versioning Support**:
> Yes, built-in. OIDC-A defines specific claims for agent versioning: model_id and model_version claims are included in every token, enabling resource servers to make authorization decisions based on the agent model version. Operator organizations can update the registered model version, and RPs can enforce minimum version requirements through ABAC policies. This is a core differentiator of OIDC-A - version-aware identity.

### Security

**Authentication Method**:
> OIDC authentication with OIDC-A extended claims. Standard OIDC flows (authorization code, client credentials) plus: agent-specific claim validation at the RP, attestation verification (IdP attests agent properties), and attribute-based access control evaluated against agent claims. Challenge-response via OIDC token exchange. Supports mTLS and private_key_jwt for client authentication.

**Revocation Speed**: seconds to minutes (follows OIDC token revocation: RFC 7009 revocation endpoint for immediate token invalidation; short-lived access tokens naturally expire; delegation revocation by human principal takes effect on next token refresh)

**Anti Sybil**:
> Delegated to the OIDC Identity Provider: IdP controls client registration and can enforce rate limiting, organizational verification, and approval workflows. Operator organization claims link agents to verified entities. No staking or proof-of-work mechanisms (enterprise identity trust model). Anti-sybil strength depends on IdP policies.

**Data Exposure Risk**:
> Moderate. OIDC-A tokens contain agent identity metadata: agent_type, model_id, model_version, operator organization, capabilities, and attestation status. These claims are visible to any relying party that receives the token. Delegation chain claims reveal the delegating human subject identifier and scope. Standard OIDC claim minimization practices (selective disclosure, pairwise subject identifiers) can reduce exposure.

**Bot To Bot Attack Surface**:
> OIDC-A provides structural defenses: (
> 1) Agent identity claims enable RPs to distinguish between agents and apply agent-specific policies; (
> 2) Delegation chain verification ensures agents only act within delegated authority; (
> 3) Model version claims allow RPs to reject agents with known-vulnerable model versions; (
> 4) Attestation status claims enable RPs to require verified agent integrity. Risks include: prompt injection causing agents to misuse delegated authority (mitigated by ABAC scope constraints), token forwarding between agents (mitigated by audience-restricted tokens), and social engineering between agents to expand delegation scope.

**Attestation Mechanism**:
> Built-in attestation framework. OIDC-A defines an attestation_status claim that indicates whether the agent identity properties have been independently verified by the IdP. The IdP can perform attestation verification through: (
> 1) Code hash verification, (
> 2) TEE remote attestation integration, (
> 3) Third-party audit certificates, (
> 4) Operator organization verification. The attestation_status claim communicates the result (verified/unverified/partial) to relying parties, enabling attestation-aware authorization decisions.

### Off-chain / On-chain Linking

**Transfer Behavior**: N/A. OIDC-A is a purely off-chain identity standard. No on-chain token component exists. Agent identity lifecycle is managed through the OIDC Identity Provider.

### Delegation & Authorization

**Delegation Model**:
> OIDC-A delegation chains: The spec defines a structured delegation model where human-to-agent authorization is cryptographically recorded in token claims. Key delegation claims include: delegator_sub (human principal subject identifier), delegation_scope (explicit authorization boundaries), delegation_chain (ordered list of delegation steps for multi-hop agent-to-agent delegation), delegation_purpose (human-readable intent description), and delegation_constraints (time-based, resource-based, or operation-based limits). Multi-hop delegation is supported: Human -> Agent A -> Agent B, where each hop adds a link to the delegation_chain with its own scope constraints. The chain is cryptographically signed, preventing modification. Relying parties validate the entire chain to ensure authorization at every hop.

**Authorization Granularity**: Fine-grained (ABAC). OIDC-A enables attribute-based access control using agent claims as attributes. Authorization decisions can consider: agent_type, model_version, attestation_status, delegation_scope, operator_org, and agent_capabilities. RPs define ABAC policies evaluated against these claims.

### Discovery & Interoperability

**Cross Platform Portability**: Partially portable. OIDC-A builds on OIDC, which is widely supported across platforms. An agent with OIDC-A tokens from one IdP can authenticate to any RP that trusts that IdP and understands OIDC-A claims. Cross-IdP portability requires federation.

**Standards Compliance**: OpenID Connect Core 1.0 (extension), OAuth 2.0 (RFC 6749), JWT (RFC 7519), JWS (RFC 7515), OAuth Token Exchange (RFC 8693), OAuth Token Introspection (RFC 7662), OAuth Token Revocation (RFC 7009). Designed to be compatible with W3C DID and W3C VC.

**Protocol Composability**: High. OIDC-A is designed as a composable identity layer: it can be combined with A2A Protocol, MCP, OAuth 2.0 On-Behalf-Of IETF draft, ERC-8004, and SPIFFE/SPIRE.

### Push/Pull Communication

**Push Support**: none (OIDC-A is an identity/authorization standard, not a communication protocol)

**Pull Support**: REST API (standard OIDC endpoints: token endpoint, userinfo endpoint, introspection endpoint, revocation endpoint; all extended with OIDC-A agent claims)

**Subscription Model**: N/A. OIDC-A does not define event subscription mechanisms.

### Trust & Reputation

**Trust Model**: Federated (trust registries). Trust is anchored in OIDC Identity Providers. Multiple IdPs can form a federation. Attestation claims add a verification layer beyond simple IdP trust.

### Payment & Economics

**Payment Integration**: None. OIDC-A is an identity and authorization standard, not a payment protocol.

**Economic Model**: Free (open specification). No licensing fees, staking requirements, gas fees, or token purchases.

### Governance & Compliance

**Audit Trail Capability**: Signed events (JWT). Every OIDC-A token is a cryptographically signed audit artifact containing agent identity, delegation chain, attestation status, and timestamps.

### Uncertain Fields (10)

- recovery_mechanism
- known_vulnerabilities
- skill_plugin_vetting
- linking_support
- linking_mechanism
- discovery_mechanism
- capability_declaration
- reputation_system
- regulatory_alignment
- lifecycle_management

---
