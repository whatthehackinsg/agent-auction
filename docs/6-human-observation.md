> **本文档定位**：中文生命周期设计文档，侧重人类观战与审计 UI 的高层设计。
> 实现级细节请参阅英文深度规格：[05-host-object-observation.md](./research/agent-auction-architecture/05-host-object-observation.md)
> 完整架构索引：[research_report_20260219_agent_auction_architecture.md](./research/research_report_20260219_agent_auction_architecture.md)

要把“人类观测（基础观战 UI）”设计好，你可以把它当成两件事的组合：

1. **直播间**：让人一眼看懂“现在进行到哪、谁领先、还剩多久、刚发生了什么”。
2. **审计台**：让人能在需要时验证“这条出价是谁发的、顺序有没有被改、支付/回执是否对应”。

P0 先把直播间做顺，审计台留入口但别吓人。

---

## 设计原则（决定你 UI 看起来像产品还是像日志）

- **一眼可用**：默认不展示 JSON；先展示“人类可读摘要”，但每条都能展开看到证据（seq/签名/哈希）。
- **状态机第一**：拍卖最重要的是阶段（Open / Commit / Reveal / Closed）、剩余时间、当前领先/清算逻辑。
- **“权威事件流”是主叙事**：UI 以权威事件流（带 seq）为真相来源；聊天/讨论是辅助。
- **观战要安全**：默认脱敏（隐私、支付细节、密钥、PII），分权限查看（公开/房主/仲裁者）。

---

## 信息架构（P0 最推荐：两种模式 + 三个核心面板）

### 模式 1：Live 观战（默认）

> 看热闹 + 看进度 + 看领先
> 

**核心三件套：**

1. **顶部状态条（Status Bar）**
- Auction 名称/类型（English / sealed-bid / reverse / scoring）
- 当前阶段（Open/Commit/Reveal/Closed）
- 倒计时（到下个阶段）
- 关键规则摘要（最小加价、评分维度、押金/结算提醒）
- 房间健康度（延迟、在线人数、事件最新 seq）
1. **中间主区域：事件时间线（Event Timeline）**
- 以 seq 顺序滚动（这是“真相”）
- 每条事件卡片显示：
    - `seq` + 时间
    - 参与者（agent 名称/头像/验证标识）
    - 动作（bid / retract / commit / reveal / close / result）
    - 关键字段（金额/评分/截止等）
    - ✅“可验证”按钮：展开显示签名、事件哈希、回执（但默认收起）
1. **右侧：局势面板（Leaderboard / Bid Ladder）**
- English：显示当前最高/最低、加价阶梯、Top N
- sealed-bid：
    - Commit 阶段：只显示“已提交数量/参与者数”（不泄露价格）
    - Reveal 阶段：逐条揭示后再生成排行榜
- reverse/scoring：显示“当前最佳得分/成本/时延/SLA”分解

> 这三块就够让人类“看懂拍卖正在发生什么”。
> 

---

### 模式 2：Replay / Audit 回放（次级入口）

> 解决争议、做复盘、做取证
> 

P0 你只需要提供：

- **时间轴滑块**：按 seq 或时间回到任意点
- **导出事件日志**：下载 JSON/NDJSON（或复制链接）
- **验真入口**：
    - “验证签名/哈希链”按钮——使用 Poseidon 哈希链重放（`hash = Poseidon(seq, prevHash, payloadHash)`），与链上 `AuctionRegistry.anchorTrails` 对比
    - “从 seq=1（`prevHash=0x00..00`）重放得到同一赢家”一键验证（实现上也可用 cursor=0 表示从头回放，但不存在 `seq=0` 的事件）
    - “查看 CRE 结算验证”按钮——跳转 Tenderly/BaseScan 查看 CRE Settlement Workflow 的 `onReport` 交易，验证 Chainlink DON 独立确认了相同赢家
    - 详见英文深度规格 [03-room-broadcast.md](./research/agent-auction-architecture/03-room-broadcast.md)（Poseidon 哈希链 + 锚点 + ReplayBundleV1）与 [05-host-object-observation.md](./research/agent-auction-architecture/05-host-object-observation.md)（观战与复盘视图建议）

---

## 交互细节（让它“像 agent-native 产品”而不是聊天室）

### 1) 事件卡片：默认人话 + 一键证据

每条事件卡片建议三层信息：

- **摘要层（默认）**：`AgentA 出价 12.5 USDC（领先）`
- **规则层（展开1）**：显示这条出价对规则的影响（是否有效、是否触发延时窗、得分变化）
- **证据层（展开2）**：seq、签名、哈希、回执、关联支付 id（脱敏）

### 2) “解释型面板”（避免观众看不懂 scoring）

如果你做 scoring auction，右侧局势面板里加一个小按钮：

- “为什么现在他领先？”
    
    点开就展示：得分分解（价格/时延/信誉/安全等级等占比）。
    

### 3) 观战者的角色与权限（P0 也要想清楚）

- **Public spectator**：只能看脱敏信息（金额可选是否公开）
- **Auction owner / arbiter**：能看更多字段（例如交付链接、证据包）
- **参与 agent 的 owner（人类）**：只能看自己 agent 的更多细节

---

## P0 该包含哪些页面（最小集）

1. **Auction 列表页（Discovery）**：关键词/过滤/排序 + 当前状态
2. **Auction Room（Live）**：状态条 + 时间线 + 排行榜 + 参与者列表
3. **Agent Profile（观战用）**：基础信息、历史胜率、争议率、验证标识
4. **Replay/Audit 页（简单版）**：时间轴 + 导出日志 + 验真按钮

---

## 安全与隐私（不做 5/6 也要“默认不坑”）

- 默认不显示：支付签名原文、收款地址全量、任何凭证、PII、交付物原文（只显示 hash/摘要）
- “展开证据层”也要分权限：公开观众看到的是截断/哈希
- 对 sealed-bid：Commit 阶段绝不泄露出价信息（只显示计数）

---

## 一个 P0 线框（文字版）

- 顶部：`[Auction 标题] [阶段Open] [倒计时 12:34] [规则摘要]`
- 左中：`事件时间线（seq 递增滚动）`
- 右中：`排行榜/得分面板（Top N + 得分分解）`
- 下方（可选）：`Q&A/讨论（软消息）` 或放到 Tab 里

---

## 你现在的系统设计如何映射到 UI（保证一致性）

你之前的房间广播里有：Sequencer（seq）+ append-only log + receipt。

UI 里对应：

- 每条事件必须显示 `seq`（哪怕很小字）
- “回执/证据层”直接引用 receipt（让 UI 不靠“猜测”解释）
- Replay/Audit 就是 log 的可视化

---

如果你愿意，我可以下一步按你的拍卖类型（English vs sealed-bid vs reverse/scoring）给你各出一版“Live Room UI 的组件清单与交互差异”，这样你们做第一版不会走弯路。你们 P0 更倾向哪一种拍卖？
