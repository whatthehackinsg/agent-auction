> **本文档定位**：中文生命周期设计文档，侧重拍卖主持方角色与职责的高层设计。
> 实现级细节请参阅英文深度规格：[05-host-object-observation.md](./research/agent-auction-architecture/05-host-object-observation.md)
> 完整架构索引：[research_report_20260219_agent_auction_architecture.md](./research/research_report_20260219_agent_auction_architecture.md)

## 1) 先把角色拆清楚：谁管理、谁托管、谁背锅

在你们的 auction 闭环里，至少需要 4 个角色（可以由同一个实体兼任，但协议上要分开）：

1. **Creator / Owner（拍卖发起者）**
    - 发布 Auction Object（任务/验收脚本/超时规则）
    - 冻结规则（起拍价、tick、截止时间、tie-breaker）
    - 往 escrow 放钱（反向拍卖）或放保证金/履约担保（正向拍卖）
2. **Host / Operator（房间执行者）** ← 你问的“Agent Host”
    - 运行拍卖状态机：收 bid、判有效、广播事件、封盘、选 winner
    - 触发结算：Host 只负责在 AuctionRegistry 上发出 `AuctionEnded` 事件；**结算验证由 CRE（Chainlink Runtime Environment）独立完成**——CRE Settlement Workflow 重放事件日志、验证赢家、释放 escrow（详见 [research report Workflow 1](./research/research_report_20260219_agent_auction_architecture.md)）
    - **最关键：签名并发布 append-only 事件日志**（第三方可重放）
3. **Escrow / Paymaster（资金托管者）**
    - 托管资金、按规则释放（或退款、或罚没保证金）
    - MVP 使用链上 AuctionEscrow（bonds-only，CRE onReport 自动结算）。实现级细节详见英文深度规格 [04-payment-and-escrow.md](./research/agent-auction-architecture/04-payment-and-escrow.md)。
4. **Verifier / Judge（验收者）**
    - 执行评测脚本/测试/API 检查
    - 输出可复现的验收证据（日志 hash、artifact hash、exitCode 等）

> 你的“拍卖产品”如果限定为**可验证交付**（代码修复+测试、结构化输出+脚本评测、API 任务），它本质上不是“需要保管的实体商品”，而是“需要冻结的规格 + 可复现的评测器”。真正需要托管的是**钱**（escrow）。
> 

---

## 2) Host 到底是谁？给你 3 种可演进的设计（从 MVP 到 “聘请 host agent”）

### 方案 A：你们当 Host（最适合 hackathon / MVP）

**优点**：最快闭环、体验可控、debug 容易。

**缺点**：大家要信任你们不会作弊/篡改/暗箱。

你可以用“可审计”把信任压到最低：

- **Host 只做确定性规则执行**，所有状态由事件流推导
- Host 对关键事件签名（如 `RULES_FROZEN / AUCTION_CLOSED / WINNER_SELECTED / FINALIZED`）
- 全量事件日志做 hash chain，第三方下载就能校验并重放同一个赢家
- 这套设计还能避免 Moltbook 类“身份没验证、基础安全缺失导致泄露/冒充”的坑（Reuters 报道里就提到缺乏身份验证、任何人都能发帖、并且出现大规模敏感数据暴露）。

同时，Host 要把外部 agent 输入当作不可信：

- OpenClaw 的安全建议非常直接：对触达不可信输入的 agent/系统要**开启 sandbox、严格 tool allowlist、尽量关闭 web_fetch/browser、秘密不要放 prompt**等。
    
    你们的 Host 服务同理：要有 rate limit、签名校验、payload schema 校验、隔离执行环境。
    

---

### 方案 B：聘请/委托一个“Host Agent”（你说的“从 ERC‑8004 找一个”）

这是你想做的差异化：**Host 本身也是一个可发现/可评分/可替换的 agent**。

ERC‑8004 给了你一个非常正的“发现与信任”底座：

- agent 在 Identity Registry 里注册一个 `agentURI`，并且该 URI 必须指向一个 registration file；里面可以列出 `services[]`，例如 web/A2A/**MCP endpoint** 等。
- 同一标准还有 Reputation Registry / Validation Registry，让“信誉”和“独立验证”可插拔。

**怎么用 ERC‑8004 来选 Host？（可执行的 MVP 规则）**

- Host agent 必须在 registration file 的 `services[]` 里声明一个你定义的服务（例如 `"name": "AuctionHost"`）以及 endpoint（HTTP/MCP 都行；EIP 示例里明确支持 MCP）。
- 你们平台提供一个 “Host Selector”：
    - 读取候选 host 的 reputation summary：注意 ERC‑8004 明确要求 `getSummary(agentId, clientAddresses, ...)` 的 `clientAddresses` 必须非空，否则会被 Sybil/spam 攻击污染。
    - 所以 MVP 最简单是：你们先维护一组 “trusted reviewers / clientAddresses”，只看这些地址给 host 的评分。

**Host agent 的经济激励怎么做？**

- Host agent 收费可以用 x402：它是 HTTP 层面的 `402 Payment Required` + `PAYMENT-REQUIRED` 头 → 客户端签名支付后带 `PAYMENT-SIGNATURE` 头重试 → 服务端验证/结算并返回 `PAYMENT-RESPONSE` 头的标准流程（x402 V2 transport）。
- 并且 ERC‑8004 的 feedback 示例里专门预留了 `proofOfPayment` 字段（可记录 txHash、from/to、chainId），用来把 x402 支付证明写进信誉证据里。

**风险与补救**

- 外包 host 的核心风险是：host 可能 censor bids、提前泄露 sealed bid、或在 close 时刻耍赖。
- 你可以用两招把风险压住：
    1. **协议层可审计**：仍然要求 host 发布签名的 append-only log，任何人可重放。
    2. **Validation**：对关键结果（比如 winner 选择是否遵守规则）发起 ERC‑8004 的 validationRequest，让独立 validator 给 0-100 的验证响应（EIP 提到 validator 可以是 stake-secured re-exec / zkML / TEE oracle 等）。

> 建议：MVP 不要一上来就“完全把房间交给外部 host”，而是做 **“可插拔 host”**：你们自己 host 是默认实现；外部 host agent 是一个可切换选项。
> 

---

### 方案 C：Host 上链（未来路线，不建议 hackathon 首发）

Host = 智能合约 + 链上 escrow + 链上出价/commitment。

优点是去信任；缺点是工程量/成本/迭代速度都爆炸。更适合你们在 POC 之后的 roadmap。

---

## 3) “谁来托管拍卖的产品？”——在你们的对象限制下，关键是“冻结规格 + 托管资金”

你们的 Auction Object 已经限定“可验证交付”，这让“托管产品”变成两件事：

### (1) 冻结 Auction Object（防止 host/creator 偷偷改需求）

建议做法：

- Object 以 **content hash** 固定（比如 Git commit hash / tarball hash / docker image digest / ipfs CID）
- `ROOM_CREATED` 事件里写入 `objectURI + objectHash`，并且要求 **Creator 对 objectHash 签名**
- Host 只引用这个 hash，不拥有“改规格”的权力
    
    这样就算 Host 是外包的，也改不了标的物。
    

### (2) 托管资金（真正的 escrow）

有三档：

- **MVP（链上 escrow）**：AuctionEscrow 部署在 Base Sepolia，bonds-only 模式（实现级细节见英文深度规格 [04-payment-and-escrow.md](./research/agent-auction-architecture/04-payment-and-escrow.md) 和索引 [research_report_20260219_agent_auction_architecture.md](./research/research_report_20260219_agent_auction_architecture.md)）。CRE Settlement Workflow 自动验证并结算。注意：MVP 已选择链上 escrow 而非中心化账本。
- **进阶（里程碑 escrow）**：EscrowMilestone.sol（P1）替换 AuctionEscrow，支持里程碑交付 + slashing
- **终局（proof-based release）**：验收结果用 ZK/TEE/再执行证明，合约无条件按 proof 释放

x402 在这里更像是“程序化收款/收 hosting fee + EOA fallback 保证金”的通道（HTTP 级 402 流程）。EIP-4337 agent 的保证金主路径应是直转 `AuctionEscrow`（原子 `transfer + join`）；x402 不是 escrow 本身。

---

## 4) 我给你一个“最推荐的 Host 设计”（兼顾 MVP 速度 + 未来可聘请 host agent）

### 核心原则：**Host 是可替换的执行者，但不可替换的事实来源是事件日志**

Manifest 里加一个 `host` 字段（无论是你们还是外部 agent）：

- `host.operatorPubKey`（Host 用来签事件的 key）
- `host.erc8004`（可选）：`agentId + agentURI`（用于展示信誉/验证）
- `host.endpoint`：HTTP/WS/SSE/MCP endpoint
- `escrow.mode`：onchain（MVP 默认）/ centralized（仅实验）
- `verifier.endpoint`：评测器（可以是你们、也可以是第三方）

### Host 的最小权限（建议写成协议）

Host **必须能做**：

- 接收 bids（只接受结构化 command，且 bid 必须由 bidder 签名）
- 广播事件流
- 冻结/封盘/选 winner（确定性规则）
- 触发验收并记录结果
- 触发结算/退款

Host **不应该能做**：

- 修改 object 规格（只能引用 `objectHash`）
- 伪造 bidder 身份（bidder 自签 + 可选 ERC‑8004 identity）
- 私自改历史（hash chain + 审计）

### Host 的收费与信誉闭环（可选但很酷）

- Host 提供 “开房/托管” 服务，按场次收费：x402 endpoint（402 + `PAYMENT-REQUIRED` → `PAYMENT-SIGNATURE` → `PAYMENT-RESPONSE`）
- 结算后，Creator/参与者给 host 写 feedback（ERC‑8004 Reputation），并在 off-chain feedback 里附带 `proofOfPayment`（把 x402/链上 tx 证据挂上去）。
- 读取 host 信誉时，只看你们认可的 `clientAddresses` 集合，避免 Sybil。

---

## 5) 你现在马上能做的“hackathon 决策建议”

如果目标是 demo 成功率 + 未来可演进，我建议你这样定：

1. **MVP 默认：你们当 Host + 链上 AuctionEscrow（非中心化账本托管）**
2. **协议上把 Host 抽象成可插拔**（manifest 里写 host pubkey + 可选 ERC‑8004 agentId）
3. **实现一个“外部 Host Agent 接入”接口**（哪怕先只有 1 个候选 host）
4. **事件日志必须可下载 + 可重放**（这是你们最硬的 DoD）
5. **安全基线**：对外部 agent 输入做 sandbox/allowlist/rate limit（参考 OpenClaw 的安全建议），否则会被 prompt injection / 恶意 payload 折磨。
