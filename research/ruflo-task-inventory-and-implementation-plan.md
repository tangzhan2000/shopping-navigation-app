# Ruflo 工程任务清单与实施顺序

**更新日期：** 2026-10-02  
**依据：** PRD v4.0、当前仓库代码与测试、`research/ruflo-suitability-for-shopping-navigation.md`。本文仅规划工程与证据工作，不授权平台访问、付费服务、生产数据、资金操作、合并或发布。

## 决策摘要

采用“人类架构/闸门负责人 + Ruflo 受限并行执行 + 单一集成者”的工作方式。不要让 swarm 直接承接 F-001..F-019 自主交付。先把持久化、身份边界、审计和可重复的 API 集成测试做成基础，再依赖已批准合同逐个实现能力。凡平台合作、法律解释、用户同意、数据来源许可、资金移动、生产开关和发布，均由相应责任人签字。

本轮已在代码中存在内存队列、JSON 识别任务仓储、event store 和采购保护 JSON 仓储；这些只能算工程骨架。当前已完成本地 workspace `typecheck`、`test`（包括 API loopback integration 6/6）和 `build` 验证；CI 配置已改为 frozen lockfile，但尚无远程 CI run 记录，因此 Wave 0 仍处于“本地验证完成、CI 闸门待证”状态。真实平台、生产认证、PostgreSQL runtime、持久 Admin 审计、真实 provider 和受控交易仍未完成。

## 仓库现状基线

| 能力 | 当前证据 | 不能据此宣称 |
|---|---|---|
| Contracts / domain | PRD 能力 ID、商品/报价/来源授权/保护 case/返现类型；确定性识别、商品匹配、总成本、状态机、能力 registry 有单测 | 生产兼容承诺、来源数据正确、返现可兑付 |
| API | health、能力元数据、识别/确认/删除、catalog resolve、fixture compare、保护 case 路由 | 生产认证、真实来源、可扩展部署 |
| 存储与事件 | purchase case JSON 原子仓储、recognition JSON store、内存 event store、内存 job queue | 数据库 migration 已接入 API；多进程一致性；持久队列/事件投递 |
| Worker | 幂等 enqueue、claim lease、重试、dead letter 基础测试 | 实际后台消费、进程重启恢复、并发安全、至少/至多一次投递保证 |
| Mobile / Admin | mobile journey/api 状态模型；admin capability/RBAC 审批模型 | 已交付原生应用/可运营的控制台与权限审计 |
| External | fixture adapter 与显式 unavailable providers | 任一平台、语音/OCR、OAuth、订单、联盟、支付已获授权或可用 |
| Build | direct TypeScript build/typecheck 可过；CI 设计了 typecheck/test/build | 本地 pnpm wrapper 可用；本 sandbox 可 bind localhost |

## F-001..F-019 全量任务清单

状态用语：**骨架** = 有代码/模型但未满足真实验收；**未实现** = 未发现可验证的端到端实现；**外部阻断** = 工程可建 adapter 边界，但启用必须先获授权/批准。

| ID | 当前能力与代码落点 | 任务 / 依赖 / 完成证据 | 优先序 |
|---|---|---|---|
| F-001 语音与文字入口 | 文本/URL/淘口令确定性提取；`packages/domain/src/recognition.ts`；mobile 输入状态模型 | 先定义 RecognitionProvider、置信度与错误合同；语音 SDK/隐私评审获批后增加录音、转写、低置信度编辑与文本 fallback；离线/撤权测试 | P2，服务授权后 |
| F-002 任务首页/卡片流 | mobile journey 有任务状态，无完整聚合首页 | 先有持久任务、待办查询、用户同意/偏好模型；实现空/加载/错误/撤销状态，内容商业标签；UI 流程测试 | P3 |
| F-003 图片/分享/淘口令/链接 | 淘口令/URL 基础解析；无系统分享/OCR | 定义显式用户选择导入、文件限制/清理和 ImportSource；OCR/视觉供应商及隐私审查后做 adapter；EXIF/恶意文件/越权访问测试 | P2，SDK/隐私批准后 |
| F-004 需求澄清 | 简单 query/quantity 字段；无澄清回合与偏好区分 | 先锁字段 schema 与硬约束规则，再做可替换意图 provider；缺字段、高风险约束、拒答及确定性验证测试 | P2 |
| F-005 市场、地区、履约范围 | `LaunchMarketPolicy` 与边界校验骨架 | 增加版本化政策仓储、变更审批与审计；市场/税费/配送规则需产品法务签核；跨市场拒绝与策略回滚证据 | P1 |
| F-006 来源接入与覆盖 | `SourceAdapter`、fixture、authorization checks/unavailable providers | 先来源认证登记、合同与字段最小化；建立 provider contract tests、速率/新鲜度/熔断；接入真实来源只在平台书面批准后 | P1 工程；启用外部阻断 |
| F-007 商品目录与匹配 | canonical product/variant/listing、确定性匹配和 fixture resolver | 目录持久化、来源证据关联、冲突处理、人工纠错、数据质量指标；标注集与误匹配阈值作为准入证据 | P1 |
| F-008 真实总成本与证据 | `TotalCost` 确定性计算、PriceEvidence/fixture offer | 明确运费、税费、优惠资格、时间戳/TTL、缺项不伪精确；版本化公式、边界/属性测试及证据回放 | P1 |
| F-009 用户授权与同意 | source authorization record/contracts；缺生产 consent & OAuth | 独立 consent ledger、scope 最小化、撤销/删除传播、token vault 接口；OAuth/密钥/隐私审查后接平台；撤权端到端测试 | P1，外部阻断 |
| F-010 价格/库存/物流提醒 | 未发现完整订阅与调度服务 | 先事件偏好/通知合同、同意和频率控制；调度/outbox 持久化、去重、退订及时间窗测试；真实数据供应批准后启用 | P3 |
| F-011 个性化推荐 | 匹配 level 已含 substitute/similar；无个性化闭环 | 先隐私选择、特征最小化和排序可解释合同；离线标注评估、偏差/商业披露测试；不得以未经同意的行为数据训练 | P3 |
| F-012 官方跳转与购买确认 | mobile 有官方 fallback 状态；API candidate/fixture | 先 URL allowlist、二次确认和跳转审计；真实 deep link/affiliate attribution 需平台许可；拒绝任意 URL、篡改/过期候选测试；不实现自动购买 | P1 |
| F-013 反馈/人工审核 | Admin shell 有 evidence review/case queue 壳；保护 case 状态机 | 持久化 review queue、SLA、版本化处置与来源熔断；RBAC 与双人复核；审计不可篡改和重放测试 | P1 |
| F-014 逐站账户授权 | contracts 中有授权记录；无真实 OAuth 生命周期 | 做授权状态/撤销/重授权 API、密钥 vault 适配层和删除传播；平台批准及安全评审为前置；token 不出现在日志/事件/agent context 测试 | P1，外部阻断 |
| F-015 订单/物流同步 | Aftercare 与 attribution 相关类型；无正式平台同步 | 定义订单导入/同步事件与幂等映射；先用户导入 fallback；OAuth scope、平台合作批准后接入；重复、退款、缺失订单回放 | P2，外部阻断 |
| F-016 购后保护 | case domain/API、JSON 仓储已有 | 持久化 SLA scheduler/outbox、提醒、官方转接、超时升级；用户归属/并发版本/幂等 API 集成测试；人工处置责任明示 | P1 |
| F-017 返现归因 | Attribution/Entitlement/Event contracts 有；无可信联盟流水闭环 | 明确合作方回调签名、事件去重和归因证据；先只读模拟/fixture；真实联盟合作获批后实现 adapter 与冲正回放 | P2，外部阻断 |
| F-018 钱包/账本/提现 | 账本/提现 contracts 与 domain reward wallet 状态规则 | 落不可变双分录/事务仓储、余额投影、对账与审计；出款 provider 仅接口，不接真资金直到法务、风控、KYC/AML 与财务批准；负余额/重放/并发测试 | P1 工程；出款外部阻断 |
| F-019 自动代购 | 无执行器，PRD 要求高风险限制 | 只做策略/安全分析与不可执行 dry-run 合同；默认长期关闭。除非平台 API、法律、风控、授权、预算上限、冷却、幂等、撤销和人审全部书面通过，不实现真实执行 | P4，硬闸门 |

## 建议实施波次与 Ruflo work packages

先由人类 owner 在每波开始前锁定接口、文件 ownership 和验收命令。Ruflo agent 只接收单包、只写分配文件；测试/审查 agent 默认只读。不得让多个 agent 同时改 contracts、API router 或 package exports。

### Wave 0：工程底座与工作流试点（立即）

1. **WP-0A Storage contract**：识别、case、event、job 的 repository interface 与一致的异步 API；补 JSON file store restart/parity、损坏文件、原子替换、权限隔离测试。先裁定当前同步 recognition adapter 是否继续保留。
2. **WP-0B API integration harness**：抽出可注入 server/listen 工具；测试支持随机端口/loopback，sandbox 不可 bind 时在 CI 环境跑；覆盖确认/重启读取/用户隔离/错误映射。不把 EPERM 标为产品缺陷，但要求 CI 环境实际运行这些测试。
3. **WP-0C Worker semantics**：定义 job schema/version、持久队列 interface、lease 竞态、幂等键唯一约束、退避/最大次数、dead-letter replay 审批和 shutdown；当前 InMemoryJobQueue 仅作 contract reference。
4. **WP-0D Ruflo pilot**：选 WP-0A 的不敏感、边界清晰任务；只读 reviewer + 单实现 agent + 单集成者。记录人工校验时间、返工率、测试覆盖和成本，不开放 secrets、外网、merge/deploy。

**Wave 0 exit：** typecheck/build 绿；CI 可执行 API integration tests；重启与用户隔离有证据；任务报告按单测/集成/sandbox/授权生产分级；无敏感数据进入 agent prompt/log/memory。

### Wave 1：可信商品决策闭环（Wave 0 完成后）

- WP-1A F-005 policy repository + admin approval/audit。
- WP-1B F-007 catalog repository、来源证据和人工纠错。
- WP-1C F-008 total cost contract/formula + freshness and eligibility evidence。
- WP-1D F-006 provider boundary、authorization registry、fixture contract suite；真实 adapter 另行审批。
- WP-1E F-012 user-confirmed official handoff and URL security。

串行依赖：先 F-005 policy，再 F-006/007 data boundary，随后 F-008 cost，最终 F-012 UI/API 闭环。F-007 与纯 F-008 公式单测可在合同锁定后并行。

### Wave 2：身份、同意与购后运营

- WP-2A F-009/F-014 consent + OAuth lifecycle contracts/security review（代码与真实平台开通分开审批）。
- WP-2B F-013 review queue/RBAC/audit/outbox。
- WP-2C F-016 case reminder/SLA scheduler, official handoff, escalation。
- WP-2D F-015 order/fulfilment event ingestion，仅在授权 scope 下启用。

顺序：先 consent/identity & audit 基础，再 ingestion；case lifecycle 可用 user-import 测试数据独立开发。真实 token 和订单不得用于开发 fixture。

### Wave 3：返现、钱包及增强输入

- WP-3A F-017 attribution callback verification + reconciliation（依赖获批联盟合同）。
- WP-3B F-018 immutable ledger + finance reconciliation；真 payout 独立 release gate。
- WP-3C F-001/F-003 speech/share/OCR providers（按每个 provider 的 privacy/security approval 分别开闸）。
- WP-3D F-002/F-004/F-010/F-011 首页、澄清、提醒与个性化，依赖可用且经同意的数据。
- WP-3E F-019 仅保留 gated design/dry-run，真实交易不纳入普通工程 wave。

## Ruflo 分工与任务模板

- **Planner/架构负责人（人类）**：确定 PRD trace、contract、依赖、文件 ownership、风险级别、发布闸门。
- **Implementer**：单一工作包；不得跨包扩展，不自行更改锁定 contract，不接触生产 secrets。
- **Verifier**：独立读代码/测试并尝试证伪验收；不修改实现。
- **Integrator（人类或唯一指定 agent）**：合并包、跑 workspace gate、审查文件范围和依赖。
- **Domain approver（人类责任人）**：授权、隐私、资金、平台合作、产品开关与发布决策。

每个 Ruflo issue 必须包含：

```text
Task ID / PRD IDs:
Allowed files and forbidden files:
Current behavior with file:line evidence:
Contract frozen for this task:
Acceptance criteria (observable, deterministic):
Required tests and commands:
Evidence tier: unit | integration | sandbox | authorized production observation | controlled transaction
External approvals required (must remain blocked until recorded):
Security/data classification: no real user, order, credential or payment data
Stop conditions and rollback condition:
Out-of-scope:
```

## 执行规则与度量

- 每个 PR 仅一个 implementation package；contract 变化先独立 ADR/owner approval。
- fixture、fake provider、sandbox 结果只能证明对应测试层，不得改写 capability 为 `available`。
- job/event handler 必须规定幂等、重试、超时、可观测性和隐私字段 allowlist。
- Ruflo memory 仅保存非敏感项目约束和公开代码导航；禁止 token、订单、KYC、支付、语音/图片原文、用户可识别数据。
- 最小工具授权；agent 不执行 merge、发布、source enable、付款、退款、提现或自动购买。
- 波次度量：计划任务一次验收率、回归率、人工审阅分钟数、任务时延、每验收任务成本、安全违规数（目标为零）、可追溯验收覆盖率（目标 100%）。

## 当前建议的下一任务

先执行 **WP-0A + WP-0B 的只读审查与接口冻结**，而不是立即启动多个 implementer。审查结论已记录在 [`research/wp-0a-wp-0b-review-and-contract-freeze.md`](wp-0a-wp-0b-review-and-contract-freeze.md)：store 保持 async contract；JSON 存储仅定位为单节点工程骨架；API listener 分为 handler-level 与 loopback 两层；event/job/case/recognition 保持各自最小 contract。当前测试环境出现 `listen EPERM`，需在允许 loopback 的 CI/本机环境完成剩余集成复验。
