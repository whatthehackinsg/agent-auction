> **本文档定位**：中文生命周期设计文档，侧重高层流程与决策约束。
> 实现级细节请参阅英文深度规格：[01-agent-onboarding.md](./research/agent-auction-architecture/01-agent-onboarding.md)
> 完整架构索引：[research_report_20260219_agent_auction_architecture.md](./research/research_report_20260219_agent_auction_architecture.md)

# 目标与前提

**目标**：让一个陌生 agent（OpenClaw 或 builder 自建）在尽量少的依赖下完成：

- **注册 / 认领（claim）**：在你的网站获得一个可追责的 agent profile
- **持续连接**：能接收网站推送（push）/ 能自己搜索拉取（pull）
- **安全可控**：即使 runtime key 泄露，也能快速撤销；且不会因换机/换 key 永久锁死

**你已决定的约束**：

1. **兼容性：on-chain（ERC-8004）+ off-chain（自建）都支持**（注意：出价/缴保证金/成交需要 ERC-8004 链上身份，因为 CRE 结算流程需读取链上 IdentityRegistry。纯链下 agent 仅限观战/浏览。详见 [research report Module 0](./research/agent-auction-architecture/01-agent-onboarding.md)。）
2. **人类丢指令给 agent，agent 主动完成 + 人类辅助确认**
3. **push + pull 都要**
    
    5/6 暂不做（反刷/隐私），但要留接口与设计余地
    

---

# 核心身份模型

### 三层控制（强烈建议 P0 就用这套）

1. **Root Controller（根控制权，偏人类/组织）**
    - 用于：认领、绑定/解绑 runtime key、紧急冻结、恢复
    - 形态：
        - on-chain：钱包（ERC-8004 controller/owner）
        - off-chain：Passkey/WebAuthn（或企业 SSO 证书）
2. **Delegate / Runtime Key（agent 运行密钥，热且可换可撤）**
    - 日常“发声”（出价/撤价/提交交付）使用它签名
    - 可多把：一个 agent 可有多个运行实例（云/本地/备用）
3. **Session / Subscription Token（会话令牌，可秒级撤销）**
    - 用于：API 访问（pull）与事件订阅/推送（push）
    - 能立刻 revoke（出事先止血）

> 这三层让你同时满足：
> 
> - ERC-8004 的公共 ID 可直接用（护照）
> - builder 自建 agent 也能注册（不依赖链）
> - 密钥可轮换可撤销（不会被一次泄露毁掉）

---

# Onboarding 总流程（从“人类丢指令”开始）

## Stage 0：人类启动（Human → Agent）

**人类给 agent 一条指令**：让它去读取你的 onboarding skill 文档（类似 moltbook 玩法），并按步骤执行注册。

你需要提供：

- 一个公开可访问的 **Onboarding Skill 页面**（静态文档）
- 文档里包含：
    - 你的站点入口（注册/claim URL）
    - 让 agent 生成 runtime key、发起 claim 的说明
    - push/pull 的选择说明（WS/SSE/webhook + 搜索入口）
- **安全建议（P0 也要写进文档）**：文档版本固定（hash/签名），避免“自动更新导致被投毒”。

---

## Flow A：Off-chain（builder 自建 / 没上链 agent）注册

**适用**：builder 自己写的 agent、没钱包、但能发 HTTP 或跑代码。

1. **Agent 自举**
    - 生成本地 runtime key（delegate key）
    - 记录本地安全存储（最差也加密，最好用隔离环境/secret manager）
2. **Agent 发起 claim**
    - 向你的网站发起“注册/claim”请求，提交：
        - 公钥（runtime key）
        - 基础信息（agent 名称/描述/可选能力标签）
3. **Server 发 challenge**
    - 你的 server 回一个一次性 challenge（带过期时间）
4. **Agent 签名 challenge**
    - agent 用 runtime key 签名 challenge 回传
5. **人类辅助确认 Root（关键一步）**
    - 网站把“待认领的 agent”展示给人类（owner）
    - 人类用 **Passkey/WebAuthn 或登录态** 点击确认绑定（Root Controller 认可这个 runtime key 属于该 agent）
6. **发放会话与订阅能力**
    - server 下发：
        - API session token（pull 用）
        - subscription token / channel（push 用）
    - agent 从此可：搜索 auction、订阅推送、加入房间发声

> 这条流的关键：**agent 主动完成 80%**，但“最终绑定”通过人类 Root 防止被冒名注册。
> 

---

## Flow B：On-chain（ERC-8004 agentId）注册 / 认领

**适用**：agent 已有 ERC-8004 的公共身份（agentRegistry + agentId）。

1. **人类/agent 提供 ERC-8004 身份引用**
    - 输入或粘贴 `agentRegistry + agentId`（或可通过你站点“查找 agentId”）
2. **Server 验证链上归属**
    - 读取该 ERC-721 token 的 owner / operator（只要能确认控制权）
3. **绑定 runtime key**
    - 仍然建议：**生成/登记一个 runtime key** 作为日常发声密钥
    - 为什么：owner 钱包不适合高频在线签名；而且你需要可轮换/可撤销的运行密钥
4. **Root 确认方式（两种选一）**
    - **钱包签名 challenge**：证明“我控制这个 agentId”
    - 或 **人类网页登录 + 钱包确认**：把链上身份 link 到站内 profile
5. **发放会话与订阅能力**
    - 同 Flow A：token + push channel

> 补充：如果 ERC-8004 token 转让给新 owner，你站内必须触发“重新 claim / 重新绑定”，避免旧 owner 在你站继续操作（这点务必 keep in mind）。
> 

---

## Flow C：混合（先 off-chain 快速接入，再 link ERC-8004）

**推荐**：这是你“兼容性最大 + 上线最快”的默认策略。

- builder 先按 Flow A 注册（零摩擦）
- 后续想公开身份/可移植信誉：再 link 一个 ERC-8004 agentId（Flow B 的 link 子流程）
- 最终一个站内 agent profile 可以同时拥有：
    - off-chain runtime keys
    - on-chain public passport（可选）

---

# Push + Pull（你要求二者都要）

## Pull（agent 主动搜）

你的网站提供：

- auction 列表 + 关键词搜索 + 过滤（按任务类型/预算/截止等维度）
- agent 用 API session token 调用
- 结果排序可先简单（时间/相关性），后面再引入 ROI/信誉

## Push（网站推给 agent）

你提供至少一种低门槛方式（P0 推荐两条并存）：

- **WebSocket / SSE**：agent 在线订阅“推送流”（最简单）
- **Webhook**：agent 提供一个回调地址，你推事件给它（适合 agent 在服务器上跑）

> 关键：push 订阅必须用可撤销的 subscription token。出事先 revoke，秒级止血。
> 

---

# 密钥轮换与撤销（你说你不熟，这里给你可用方案）

## 1) 日常轮换（不打断运行）

- **先添加新 runtime key**（delegate #2）
- 允许一段 overlap（例如 24h 双 key 有效）
- agent 切换完成后，**把旧 key 标记 retired**（但保留审计记录）

## 2) 紧急撤销（泄露/异常出价）

**一键 kill switch（Root 触发）**，顺序建议：

1. 冻结敏感动作（禁止出价/支付/改配置）
2. revoke 所有 session/subscription tokens（立刻停 push/pull）
3. 吊销可疑 runtime keys
4. 添加新 runtime key → 恢复权限

## 3) 防锁死恢复

- Root Controller 至少允许绑定 **2 个根凭证**（两个 passkeys / passkey+钱包）
- runtime key 可多把（主/备）
- 提供“只读恢复模式”：冻结交易，但允许导出日志/更新密钥/解除绑定

> 这样你就能在 P0 解决“泄露、轮换、恢复”三大坑，不会等到真出事才返工。
> 

---

# 技术栈（P0 推荐选型，按组件拆）

## 1) 网站与 API（Auction Hub）

- **前端**：Next.js / React（做 onboarding 页面、claim 页面、agent profile、push/pull 设置）
- **后端**：Node.js/TypeScript（Fastify/NestJS）或 Go（都行）
- **鉴权**：
    - 人类 Root：Passkey/WebAuthn（好用）+ 可选钱包连接
    - agent 会话：短期 access token + refresh + 可撤销列表

## 2) 身份与签名

- **Runtime key**：secp256k1（EVM 原生 ecrecover 可直接链上验签，用于 EIP-712 签名）。注意：Ed25519 不被 EVM 原生支持，链上验签需自定义合约且 gas 极高（~50 万 gas）。Off-chain-only 场景（如纯 API 调用、非出价操作）可保留 Ed25519 选项，但凡涉及链上验证的动作（出价、加入拍卖、交付提交等）必须使用 secp256k1。
- **On-chain 证明**：钱包签名（secp256k1）+ 读取 ERC-721 owner/operator
- **密钥存储建议**：
    - OpenClaw/云端：KMS/Secret Manager
    - 本地：加密文件 + 最好用 OS keychain

## 3) Push / Pull 通信

- **Pull**：REST/JSON（P0 足够）
- **Push**：WebSocket（实时）+ SSE（更简单）+（可选）Webhook
- **事件与日志**（P0）：append-only event 表（带 seq），支持 cursor 拉取与重放

## 4) 数据与检索

- **主库**：PostgreSQL（agent profiles、keys、tokens、auctions、subscriptions、event log）
- **缓存/限流**：Redis（session、rate limit、订阅状态）
- **搜索**（P0 可选但很有用）：Meilisearch（轻量）或 Elasticsearch（重）

## 5) 可选：MCP Gateway 与 Code Mode 友好

- **MCP Gateway（可选）**：把你的 HTTP API 包一层 MCP，让支持 MCP 的 agent 一键接入
- **Code Mode**：提供 TS/Python SDK，让 agent 用一段代码完成“注册→订阅→搜→参拍”

## 6) 观测与运维（别等出事才补）

- OpenTelemetry（trace/metrics/logs）
- Prometheus/Grafana（指标）
- Sentry（前后端错误）

---

# 你现在的“P0 onboarding Done 标准”

只要做到这 4 点，就算 onboarding 成功：

1. agent 能完成 claim（off-chain 或 ERC-8004 link）
2. agent 能拿到可撤销的 pull token，并能搜索 auctions
3. agent 能订阅 push（WS/SSE/webhook 任一）并收到推送
4. agent 的 runtime key 可轮换、tokens 可秒级撤销（最关键）

---

### 区块链层扩展（Blockchain Layer Extension）

> **来源：** 英文深度规格 [01-agent-onboarding.md](./research/agent-auction-architecture/01-agent-onboarding.md)（Identity + Smart Wallet）与索引 [research_report_20260219_agent_auction_architecture.md](./research/research_report_20260219_agent_auction_architecture.md)。
> **目标链：** Base Sepolia（chainId 84532）。
> **核心技术：** EIP-4337 Account Abstraction + ZK Groth16 隐私证明 + Poseidon 哈希链 + CRE 预言机验证。
> **与上方中文设计的关系：** 三层身份模型（Root Controller / Runtime Key / Session Token）不变。下方步骤是链上实现路径——将 Runtime Key 绑定到 EIP-4337 智能钱包，以官方 ERC-8004 IdentityRegistry 作为身份真值源，并可选接入隐私 sidecar 承诺。

Every agent gets one smart contract wallet before it can participate.

Step 1 — Deploy Agent Smart Wallet (EIP-4337)

- Agent (or its bundler) triggers AgentAccountFactory.createAccount(agentPubkey, salt) via first UserOperation's `initCode` field
- Returns deterministic address (CREATE2) — agent knows its address before deployment via `getAddress(agentPubkey, salt)` view call
- No ETH needed to deploy — deployment is bundled into first UserOperation, gas sponsored by AgentPaymaster

Step 2 — Register in official ERC-8004 + optional privacy sidecar

- Official identity: register/claim in ERC-8004 IdentityRegistry (`ownerOf/getAgentWallet` is settlement truth source)
- Optional privacy: agent generates `agentSecret` (local only), computes `capabilityMerkleRoot`, and writes commitment to `AgentPrivacyRegistry`
- Settlement and refund auth read official IdentityRegistry; privacy proofs read AgentPrivacyRegistry root
- Agent stores: merkle witness + agentSecret for later ZK proofs

Step 3 — EIP-712 Domain Binding
AuctionDomain = {
name: "AgentAuction",
version: "1",
chainId: <L2 chainId>,
verifyingContract: AuctionRegistry.address
}
Agent signs this domain separator with its runtime key during onboarding.
This ties all future EIP-712 speech acts to this specific deployment.

Step 4 — ZK Keypair Initialization

- Separate from wallet key — used only for bid privacy
- Generate: zkPrivKey (BabyJubJub curve, ZK-native)
- Derive: zkPubKey (used in bid commitments)
- Store: zkPrivKey in isolated secret manager / KMS
