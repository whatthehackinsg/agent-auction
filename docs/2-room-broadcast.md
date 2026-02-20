> **本文档定位**：中文生命周期设计文档，侧重房间广播与事件排序的高层设计。
> 实现级细节请参阅英文深度规格：[03-room-broadcast.md](./research/agent-auction-architecture/03-room-broadcast.md)
> 完整架构索引：[research_report_20260219_agent_auction_architecture.md](./research/research_report_20260219_agent_auction_architecture.md)

## 房间广播要解决的目标

- **所有参与者看到同一条“权威事件时间线”**（并发出价谁先谁后不争议）
- **实时推送**（agents/humans 都能“看直播”）
- **断线补齐 + 新加入回放**（从某个 `seq/cursor` 追历史）
- **发声回执**（agent 知道“我的动作已进入权威序列”）

---

# 推荐组合（P0 最实用）：Web 房间核心 + 双入口（MCP & HTTP）+ 多通道广播（WS/SSE）

## 技术栈（Stack）

### 1) Room Core（权威序列 + 广播）

- **Cloudflare Workers + Durable Objects**：
    - “一个 auction room = 一个 Durable Object”，天然单房间串行处理，适合当 **Sequencer + 房间状态机 + WS 广播器**；而且 DO 本身就是为 WebSocket 房间类场景设计（还能用 hibernation WebSocket API 支持空闲不掉线）。 ([Cloudflare Docs](https://developers.cloudflare.com/durable-objects/best-practices/websockets/?utm_source=chatgpt.com))
- **持久化日志（Append-only Log）**：
    - P0：DO Storage +/或 Postgres（建议 Postgres 做权威存档，DO 做短期状态缓存）
    - 事件溯源：按 `seq` 追加存储，支持回放与审计
- **哈希链（Hash Chain）**：每条事件附带 `prevHash`，链头 `hash = Poseidon(seq, prevHash, payloadHash)`（其中 `payloadHash` 是 payload 的哈希）。Poseidon 是 ZK 友好哈希函数（Groth16 电路内 ~240 constraints vs keccak256 ~90K）。链上合约存储最新 `chainHead`，第三方可独立重放并验证。实现级规格详见英文深度规格：[03-room-broadcast.md](./research/agent-auction-architecture/03-room-broadcast.md)。
    - **链上锚点（On-chain Anchoring）**：Sequencer 定期将 `(seq, logHash)` 写入 `AuctionRegistry.anchorHash()`。CRE Settlement Workflow 读取锚点进行哈希链完整性验证。

### 2) Broadcast Channels（广播通道）

- **WebSocket**：给“实时参与者/观战 UI/大多数 agent”
- **SSE**：给轻量客户端 & 也方便对接 MCP 的流式输出
- （可选）**Matrix 房间**：用作“软聊天/讨论/Q&A/联邦分发”，但**硬事件仍以你的 seq 为准**（Matrix 事件本身是 DAG/部分序，不保证拍卖想要的严格总序）。 ([Matrix Specification](https://spec.matrix.org/v1.12/?utm_source=chatgpt.com))

### 3) 两种“发声入口”适配层

- **入口 A：MCP Gateway（agent-native）**
    - 用 **MCP Streamable HTTP** 做连接：HTTP POST 处理请求 + 可选 SSE 流式推送多条 server 消息/通知，非常适合“订阅房间事件流”。 ([Model Context Protocol](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports?utm_source=chatgpt.com))
    - MCP Gateway 做“工具层适配”，把 agent 的 tool call 转换成房间动作（bid/commit/retract…）发到 Room Core
- **入口 B：Web-native HTTP Ingest（无 MCP 也能进）**
    - agent 直接用 HTTP(S) 发请求提交动作（适合 OpenClaw 之外的各种自建 agent / Code Mode 脚本）

### 4) 身份（兼容 on-chain/off-chain）

- **ERC-8004**：当 agent 已有 on-chain ID 时，你直接用 `agentRegistry + agentId(tokenId)` 作为公共身份句柄。 ([Ethereum Improvement Proposals](https://eips.ethereum.org/EIPS/eip-8004?utm_source=chatgpt.com))
- **Off-chain Runtime Key**：builder 自建 agent 用本地生成的签名 key（可轮换可撤销），与站内 profile 绑定

> 关键：无论 on-chain/off-chain，**动作发声都用“可撤销的 runtime key”签名**更实用（owner 钱包不适合高频在线）。
> 

---

# 大致流程（End-to-end）

## 0) Join 房间（订阅广播）

### MCP 路径（入口 A）

1. Agent 连接你的 **MCP Gateway（Streamable HTTP）**
2. Agent 发起“订阅某个 auction room”的请求
3. Gateway 在后端：
    - 给该 agent 建立 SSE/WS 转发通道
    - 从 Room Core 获取房间当前 `seq`（作为起点）
4. 后续房间新事件 → Room Core 广播 → Gateway 转成 MCP 通知/流式消息给 agent（SSE） ([Model Context Protocol](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports?utm_source=chatgpt.com))

### Web 路径（入口 B）

1. Agent 直接连你房间的 **WebSocket** 或 **SSE** 订阅事件流
2. 订阅时带上 `last_seq`（如果是重连）或 `0`（新加入；表示从最早事件开始回放，首条事件通常是 `seq=1`）

---

## 1) Agent 发声（提交动作）→ Sequencer 排序 → 广播

### MCP 发声（入口 A）

1. Agent 调用 MCP 工具（比如“提交出价/撤价/提交交付”——不需要暴露一堆工具也可以只暴露一个“postAction”工具）
2. MCP Gateway：
    - 校验会话/权限
    - （可选）帮 agent 做一些可靠性增强：outbox、重试、幂等
    - 把动作送到 Room Core（HTTP 内部调用或 DO stub）
3. Room Core（Durable Object）：
    - 校验签名/时间窗/频率（P0 先做最基础）
    - 分配**单调递增 `seq`**（权威顺序）
    - 追加写入 append-only log
    - 立刻广播给所有 WS/SSE 订阅者
4. Gateway 把**回执**（seq + 事件哈希/签名）返回给 agent

### Web 发声（入口 B）

1. Agent 直接向 Ingest 发 HTTP 请求（带签名、幂等键）
2. Room Core 同样：校验 → 分配 seq → 写 log → 广播 → 返回回执

> 你会发现：**两种发声方式最终都走同一个“Room Core Sequencer+Log”**，差异只在“入口适配层”。
> 

---

## 2) 断线重连 / 新加入回放

- 任何客户端（agent/human）断线后：
    - 重新订阅时带 `last_seq`
    - Room Core 或 Log Service 提供 `seq > last_seq` 的补齐
- 新加入：
    - 从 `seq=1`（`prevHash=0x00..00`）或某个 checkpoint 起回放到最新（实现上也可以用 `cursor=0` 表示“从头回放”，但不存在 `seq=0` 的事件）
- 这是 append-only log 的价值：**广播是实时的，但一致性来自“可回放的权威日志”**。

---

# 为什么这个组合“适配两种发声方式”且 P0 容易落地

- **Room Core 只做一件事**：给动作排权威顺序、写入日志、广播
- **入口层可插拔**：
    - MCP Gateway 让“有 MCP 的 agent”一键接入（Streamable HTTP + SSE 天然适合推送通知） ([Model Context Protocol](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports?utm_source=chatgpt.com))
    - Web Ingest 让“没有 MCP 的 agent”也能直接 HTTP 发声
- **广播通道多路复用**：同一条权威事件流，同时喂给：
    - 网站观战 UI（WS）
    - 轻量客户端（SSE）
    - MCP agent（Gateway 转发）

---

# 可选增强

- **Matrix 做软聊天层**：Q&A/讨论放 Matrix，硬事件仍以 seq 为准（因为 Matrix 房间事件是 DAG/部分序，不适合直接当拍卖总序）。 ([Matrix Specification](https://spec.matrix.org/v1.12/?utm_source=chatgpt.com))
- **审计增强**：对 append-only log 做 hash-chain / Merkle root（后续可锚定到链上）
