> **本文档定位**：中文生命周期设计文档，侧重支付与托管的高层设计。
> 实现级细节请参阅英文深度规格：[04-payment-and-escrow.md](./research/agent-auction-architecture/04-payment-and-escrow.md)
> 完整架构索引：[research_report_20260219_agent_auction_architecture.md](./research/research_report_20260219_agent_auction_architecture.md)

# 支付层（Production-ready Blueprint）

这份文档统一 [research_report_20260219_agent_auction_architecture.md](./research/research_report_20260219_agent_auction_architecture.md) 与英文深度规格 [04-payment-and-escrow.md](./research/agent-auction-architecture/04-payment-and-escrow.md) 的支付结论。

核心原则只有三条：

1. **资金托管在链上 escrow（AuctionEscrow），不是中心化账本。**
2. **EIP-4337 agent 的保证金主路径是“直转 escrow（UserOp）”，join/bid 走 DO sequencer（HTTP/MCP），两者非原子。**
3. **x402 主要用于 HTTP 微支付与 EOA fallback，不是默认保证金主路径。**

---

## 1) 三方角色（x402 视角）

x402 仍然是经典三方：

- **Client（买方）**：发起 HTTP 请求，收到 402 后签名支付并重试。
- **Resource Server / Merchant（卖方）**：提供受保护资源（manifest、events、高级接口等）。
- **Facilitator（可选）**：验证支付并代发上链结算。

在本架构中：

- 平台通常充当 Merchant；
- Facilitator 可外包（不要求平台自建）；
- 资金托管与结算可信性由链上 `AuctionEscrow + CRE` 负责。

---

## 2) 两条保证金路径（必须区分）

### Path A（默认）EIP-4337 Agent：直转 escrow（不走 x402）

`AgentAccount` 通过 UserOp 执行链上保证金转账：

1. `USDC.transfer(escrowAddress, bondAmount)`（链上、单笔 UserOp 内原子）

join/bid **不在同一个 UserOp 内执行**：agent 通过 HTTP/MCP 把签名的 `Join/Bid` 请求提交给 DO sequencer，sequencer 排序后再批量 `ingestEventBatch()` 上链。

结果：

- 保证金转账本身是链上原子操作；
- join/bid 与保证金之间存在“异步归属 + 非原子窗口”（MVP 允许）；
- 后台随后调用 `recordBond(...)` 做归属记账（可重试、按 tx hash 幂等），并提供对账/修复路径（见 research report Limitation #4）。

### Path B（fallback）EOA / 非 4337 Agent：x402 入金

流程：

1. 命中 bond endpoint，先做 ERC-8004 身份检查（不通过返回 403，不返回 402）。
2. 返回 402（`PAYMENT-REQUIRED`），要求 `payTo = escrowAddress`。
3. Client 带 `PAYMENT-SIGNATURE` 重试，Facilitator 结算 USDC 到 escrow。
4. 后台调用 `recordBond(...)` 完成 `(auctionId, agentId, depositor, amount, txId)` 归属。

---

## 3) x402 在本系统里的正确边界

### 适合 x402 的场景

- `GET /auctions/:id/manifest`（防爬/防滥用）
- `GET /auctions/:id/events?from=seq`（轮询限流）
- 其他 HTTP 计费型 API（例如高级检索、批量导出）

### 不建议用 x402 做主路径的场景

- EIP-4337 agent 的保证金主流程（因为已有更强的链上原子路径）
- CRE 触发的资金释放（这部分由 `onReport` + 合约状态机处理）

---

## 4) 结算与退款（和支付通道解耦）

结算触发：

1. Sequencer 写入 `AuctionEnded(...)`
2. CRE Workflow（`CONFIDENCE_LEVEL_FINALIZED`）验证并重放规则
3. CRE 通过 `KeystoneForwarder -> AuctionEscrow.onReport(...)`
4. `_processReport()` 只处理赢家保证金回拨（O(1)）

退款模式：

- 失败方通过 `claimRefund(...)` 自助 pull；
- `withdraw()` 提取余额；
- `adminRefund(...)` 仅作应急兜底。

这保证了：

- UI/HTTP 层保持薄；
- 资金状态由合约与 CRE 验证路径主导；
- x402 与 escrow 解耦，不会把 HTTP 支付协议误当成托管协议。

---

## 5) 生产硬化（P1）

1. **归属自动化**：`recordBond` 对账 cron（检测 orphaned deposits 并自动补记）。
2. **Pausable 策略**：事故时暂停 `recordBond` 和 `_processReport`；保留 `claimRefund/withdraw/cancelExpiredAuction/adminRefund`。
3. **额度与限流**：按路由、身份、IP 分层限速，防止 x402 接口被刷。
4. **可观测性**：支付成功率、结算延迟、orphaned deposit 数量进入告警面板。

---

## 6) 一句话结论

**MVP 到生产的一致答案：**

- 保证金主路径 = `EIP-4337 直转 escrow`；
- x402 = `HTTP 微支付 + EOA fallback`；
- 资金释放 = `CRE 验证后 onReport`；
- 退款 = `pull-based`。
