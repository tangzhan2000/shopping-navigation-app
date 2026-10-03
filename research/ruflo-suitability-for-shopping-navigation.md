# Ruflo 对省心购 PRD 全量交付的适用性评估

**评估日期：** 2026-10-02  
**范围：** Ruflo 是否适合作为 F-001..F-019 后续工作的执行/编排平台；本报告是适用性评估，不代表已批准安装、初始化、授权外部访问或自动发布。  
**结论摘要：** Ruflo 适合承接受约束的工程编排、并行实现、测试和研究任务；不适合独立承担完整产品交付，更不能替代产品/法务/平台合作/安全/资金责任人对外部事实和发布闸门的批准。建议小范围试点后逐步扩大，而不是一次性把 F-001..F-019 全部交给自主 swarm。

## 1. 事实基线

### 本机与仓库状态

- 本机 Ruflo CLI 已安装，实测版本 `3.38.9`；命令路径为 `~/.local/bin/ruflo`。全局 npm 包也显示该版本。
- Ruflo MCP 服务实测处于运行状态，transport 为 `stdio`；`ruflo mcp tools` 可列出 `agent_spawn`、`agent_execute`、swarm、memory、hooks 等工具。
- 当前项目目录执行 `ruflo init check --format json` 返回 `initialized: false`、`claude: false`、`claudeFlow: false`；`ruflo status` 提示当前目录未初始化。
- 仓库有 `.claude/proven-config.json`，其 manifest 标记为 `ruflo.proven-config/v1`，兼容条件 `ruflo >=3.24.0`。这是配置/基准凭据，不等于项目初始化成功，也不能证明 swarm、项目 MCP 配置或业务流程已接通。
- 仓库 CI 目前执行 pnpm install、typecheck、test、build；没有 Ruflo 专属 CI 校验、agent 变更策略或自动发布步骤。
- PRD 和 README 明确说明当前实现是工程骨架；生产身份/持久化、真实来源、OAuth、语音/OCR、订单同步、返现、提现和自动购买等尚未接入。参见 [README](../README.md)、[PRD 功能矩阵](../docs/ai-shopping-navigation-prd.md#功能需求矩阵) 与 [PRD 发布阻断](../docs/ai-shopping-navigation-prd.md#12-验收与发布阻断)。

**解释：** Ruflo“已安装并有运行中的 MCP server”与“本仓库已初始化并验证可执行项目 swarm”是不同状态。目前前者成立，后者未证实/不成立。不要把机器上存在工具等同于项目已经依赖它。

### Ruflo 一手资料

以下产品能力是 Ruflo 自身文档/仓库的描述，属于供应方自述；应在本项目试点中验证效果、权限边界、稳定性和成本，不视为独立性能审计结论。

- 官方仓库将 Ruflo 描述为面向 Claude Code 和 Codex 的 agent meta-harness，并列出 agents、coordinated swarms、memory、federation、MCP、hooks、workflows 等能力。来源：[Ruflo README](https://github.com/ruvnet/ruflo#readme)。
- 官方用户指南覆盖 Quick Start、Core Features、Intelligence & Learning、Swarm & Coordination、Security 和 Configuration。来源：[Ruflo User Guide](https://github.com/ruvnet/ruflo/blob/main/docs/USERGUIDE.md)。
- 官方 README 还列出团队协作/合并前检查清单；这说明其生态提供治理指导，但不代表项目默认已部署相同门禁。来源：[Team Gateway Checklist](https://github.com/ruvnet/ruflo/blob/main/docs/TEAM-GATEWAY-CHECKLIST.md)。
- 官方仓库：[ruvnet/ruflo](https://github.com/ruvnet/ruflo)；本次通过 GitHub API 查询时显示约 73.6k stars（2026-10-02 查询值，star 数会变化）。Star 数只表示平台关注度，不代表对省心购的适配、安全或生产质量认证。
- 本机 CLI 的 `ruflo agent_execute` 工具说明指出该方式通过 Anthropic Messages API 执行已登记 agent，并要求 `ANTHROPIC_API_KEY`。因此在本机代理托管认证环境下，执行前必须确认 Ruflo MCP 所用凭证、数据出口和费用归属；不要把凭证注入共享 agent 上下文，也不要为此绕过当前安全策略。此项来自本机已安装 CLI 的工具元数据，可通过 `ruflo mcp tools --format json` 复查。

## 2. 决策

**建议采用 Ruflo，但采用范围是“工程协调与受控执行”，不是“自主完成完整 PRD 并自行发布”。**

Ruflo 的 agent/swarm/memory/hooks/MCP 能力与仓库的多包结构、跨层需求和大量测试工作有匹配度；而 F-001..F-019 的完成包含外部合同、平台授权、真实数据、支付资质、受控交易和合规批准。任何编排器都不能凭代码推断这些外部条件成立。PRD 要求未通过授权、数据质量、用户同意、安全、合作和合规闸门的能力保持限制/不可用，并明确 fixture/sandbox/演示不能替代真实授权和受控交易。参见 PRD §6、§7、§12、§14、§16。

| Ruflo 用途 | 评估 | 约束 |
|---|---|---|
| PRD 拆解、依赖/影响分析、跨包任务分派 | 适合 | 产品范围和验收阈值由负责人确认；agent 不得改写已批准需求来规避闸门。 |
| Contracts/domain/API/mobile/admin 并行实现 | 适合，有条件 | 任务按目录/接口隔离，预先锁定契约；共享文件并发修改须由单一集成负责人处理。 |
| 测试、类型检查、lint、构建、fixture 回放 | 适合 | CI 是准入条件；测试报告要区分 fixture/sandbox 与生产验证。 |
| 供应商文档研究、字段映射草案、adapter prototype | 适合 | 以平台官方文档/已签约接口为来源；agent 无权申请生产授权或宣称覆盖已成立。 |
| 生产 OAuth、token 管理、订单/联盟/支付接入 | 只能辅助实现 | 平台授权、密钥边界、最小 scope、合同和合规由人审；使用测试账户/沙箱并检查日志和上下文泄密。 |
| 真实交易验收、资金对账、KYC/AML、返现 payout | 不适合独立执行/批准 | 必须由有权限的业务、合作方、财务、法务/合规和安全责任人签核。 |
| 自动购买 F-019、能力启用/恢复、生产发布 | 不可自主化 | PRD 要求默认关闭或受控启用；保持人类批准、双人/职责分离、紧急停止与回滚。 |
| 跨机器 federation 或共享长期记忆 | 首阶段不建议 | 先核对数据分类、访问控制、保留/删除、隔离和出口；不得把用户图片、平台 token、订单或 KYC 数据送入通用记忆。 |

## 3. F-001..F-019 适用矩阵

“适合 Ruflo 执行”是指可由它协调代码/测试任务，不表示该需求已实现或允许启用。

| PRD | Ruflo 可承担的工程部分 | 必须由人/外部方完成的部分 | 推荐控制 |
|---|---|---|---|
| F-001 语音与文字 | 输入状态、转写 adapter、权限/失败回退、测试 | 语音供应商、隐私评估、设备权限和保留策略批准 | 先做接口与模拟测试；录音数据不进共享记忆。 |
| F-002 任务型首页 | 页面/状态机、待办查询和交互测试 | 推荐/商业标记规则、用户同意与产品验收 | 以 PRD 验收清单为准，agent 不自行扩张个性化用途。 |
| F-003 多模态导入 | OCR/图像/分享 adapter、解析测试 | OCR/视觉服务许可、图片处理和删除策略 | 外部模型只返回候选事实，必须经确认与证据校验。 |
| F-004 澄清 | 结构化提问流程、prompt/评测 harness | 硬约束与软偏好定义、模型风险阈值 | 模型不得写入商品事实/价格/授权状态；规则层校验。 |
| F-005 Canonical 商品目录 | schema、版本/迁移、校验与检索服务 | 商品主数据来源许可及类目治理 | 人工金标准和审计版本负责 exact 晋级。 |
| F-006 SKU/listing 匹配 | 确定性匹配、属性规范化、测试集 | 真 SKU 标注、precision 门槛和人工抽检 | 不足规格降级 unknown；跨 agent 共享同一 golden set。 |
| F-007 报价证据 | Offer/Evidence adapter、归一化、过期策略测试 | 来源字段/价格展示许可、数据 SLA | 价格事实必须可追溯来源、时间和版本。 |
| F-008 跨来源检索 | adapter 框架、并发/熔断/来源过滤 | 至少一个/多个平台书面授权、API 配额与合同 | 未授权 source 在构建和运行时均拒绝。 |
| F-009 优惠/税费/总成本 | 确定性计算和属性测试 | 税务/费用规则确认及目标地区验证 | 未知项不得视为零；人工签字确认币种/取整政策。 |
| F-010 推荐卡/比较 | 排序接口、卡片/证据抽屉、可访问性与测试 | 商业排序披露和体验验收 | 佣金排序可关闭；`exact` 比较规则不能绕过。 |
| F-011 推荐/平替/图像搜索 | candidate pipeline、评测、回归工具 | 商业规则、图像/目录数据许可和质量阈值 | 相似度模型不得晋级 exact；建立误导/偏见审查。 |
| F-012 官方购买跳转 | deep-link adapter、确认页、失败状态、遥测 | 官方跳转/推广链接授权和归因条款 | 用户确认商品/规格/数量；agent 不模拟点击或自动下单。 |
| F-013 反馈/纠错 | API、队列、Admin 页面、回归用例 | 客服职责、升级 SLA、申诉处置规则 | 用户反馈中的敏感内容按留存政策隔离。 |
| F-014 平台 OAuth/授权 | OAuth/PKCE 流程框架、撤权清理测试 | 正式 OAuth client、scope/合同、安全与隐私批准 | 生产密钥由专门 secret store 管理，不放 agent memory/log。 |
| F-015 个性化/提醒 | preference API、通知调度、关闭/退订测试 | 个性化同意、频率政策、通知供应商配置 | 默认最小化；退订与删除必须可回放验证。 |
| F-016 订单/物流/售后 | 事件 adapter、case 状态机、幂等和 SLA 计时 | 订单/物流数据权限、官方售后流程与客服承接 | 缺失回传不能声称成功；支持用户导入降级。 |
| F-017 归因/返现/申诉 | 事件模型、append-only ledger、冲正/replay 测试 | 联盟合作、归因窗口/规则、结算报表及争议裁决 | 不显示预计金额为可用余额；真实订单回放必需。 |
| F-018 钱包/提现 | payout 状态/对账接口、幂等和审计测试 | 持牌 provider、资金责任、KYC/AML、税务和法域批准 | 默认不可用；严禁 agent 触发真实支付。 |
| F-019 购买执行 | 可先实现 policy/simulation、限额、kill switch 测试 | 平台许可、品类/预算/确认/冷却规则和独立安全批准 | 默认关闭；Ruflo 不得自行启用或执行真实购买。 |

## 4. 主要风险与控制

1. **凭证/数据外泄：**平台 token、订单、图片、语音、KYC 和支付信息禁止进入普通日志、prompt 或跨 agent memory；对应 PRD 强制不变量见 §7.3。开始任务前定义数据分类和脱敏样例，执行后检查 MCP 日志、agent transcript、记忆存储和缓存。
2. **错误并行和冲突：**多个 agent 共同改 contracts/API 边界会放大返工；先由架构负责人锁 schema/acceptance contract，按包拆任务，单一集成 agent/人负责合并。
3. **假验收：**agent 可能把绿测试、fixture 或 sandbox 报成可发布；所有报告强制标识证据等级：单测、集成、sandbox、授权生产观测、真实受控交易，不能相互替代。
4. **过度授权：**Ruflo 的 tool/server 能力不能自动获得修改权限；只启用必要 MCP 工具，生产 secrets/支付工具禁止 agent 可见，合并、部署、启用能力均保留人工 approval。
5. **模型/API/成本边界：**先确认 MCP 实际模型路由、凭证来源、请求是否离开本机、数据保留条款和费用归属。未核清前只用合成/公开数据做试点。
6. **工具自身质量和变更：**版本更新需锁定版本、记录配置、跑回归并可回滚；Ruflo 的营销性 benchmark/star 不作为本项目选型验收指标。
7. **人类不可委派决策：**市场、商业、合同、风险容忍、资金/法律责任及自动执行范围必须由有权限人员直接确认，不能由 agent 代表用户回答或自动关闭审批事项。

## 5. 推荐落地阶段

### 阶段 A：安全只读试用

不执行 `ruflo init`，先使用当前 MCP 完成只读 PRD/代码盘点、依赖图和测试映射；仅使用公开或合成数据。记录 agent 的权限、模型/凭证路由、输出去向和成本。试验通过标准：每条结论能追溯到文件/测试/官方来源，且无敏感数据进入记忆或日志。

### 阶段 B：一个竖切试点

由人确定一个获准市场和来源后，试做“文本/链接输入 → 服务端确认任务 → 有授权的一个来源 adapter → evidence/total cost → 官方跳转 → 遥测/失败回退”。Ruflo 可以并行实现 adapter、测试、API 和 UI，但先冻结 contracts，agent 使用隔离分支，所有合并由 CI 与人工 review 把关。若尚无平台授权，就用 fixture 继续做工程验证，但明确标注“未达生产验收”。

### 阶段 C：扩展到跨来源与购后

仅在首个来源的授权、数据 SLA、证据精度和受控交易验证通过后，扩第二来源和 F-014..F-017；按来源/需求分 agent 工作，事件、状态、身份及隐私接口由负责人集中审定。

### 阶段 D：资金和自动执行

F-018/F-019 作为独立项目 gate。先有书面法务/资金方案、持牌合作与安全威胁模型，再让 Ruflo 协助实现 sandbox 和控制验证；任何真实 payout/购买、能力切换及生产发布都需要有权限的人类批准和审计记录。

## 6. 试点退出/停止条件

出现以下任一项时，暂停 Ruflo 执行并由负责人复核：凭证进入 prompt/log/memory；agent 越过来源 allowlist 或用户确认；agent 将 fixture/sandbox 结论报告成真实覆盖/交易；合并绕过 CI/人工 review；缺少来源授权却启用查询；无法解释请求数据出口或费用归属；不可审计/不可回滚的能力状态改变。

## 7. 最终建议

**适合：**把 Ruflo 当作受策略约束的工程编排层，承担可并行、可测试、可回滚的代码、测试和研究工作，并用 CI、证据分级和人工批准约束它。  
**不适合：**把 Ruflo 当作自主产品负责人、平台合作方、法务/合规批准人、资金运营者或发布经理，要求其单独“完成并验收全部 F-001..F-019”。  
**当前下一步：**先完成只读安全与路由核查；随后由用户/项目负责人批准是否做仓库级初始化及具体允许的文件/工具范围。报告本身不执行初始化，也不修改 PRD/业务代码。

## Sources

### First-party Ruflo sources

- Ruflo repository and project claims: https://github.com/ruvnet/ruflo
- Ruflo README: https://github.com/ruvnet/ruflo#readme
- Ruflo User Guide: https://github.com/ruvnet/ruflo/blob/main/docs/USERGUIDE.md
- Team Gateway Checklist: https://github.com/ruvnet/ruflo/blob/main/docs/TEAM-GATEWAY-CHECKLIST.md
- Ruflo npm package: https://www.npmjs.com/package/ruflo
- Installed local CLI observations: `ruflo --version`, `ruflo init check --format json`, `ruflo status --format json`, `ruflo mcp status --format json`, and `ruflo mcp tools --format json` (observed 2026-10-02; output depends on local installation/configuration).

### Project sources

- [省心购 PRD v4.0](../docs/ai-shopping-navigation-prd.md), especially §6 functional matrix, §7 invariants/security, §12 acceptance/release blockers, §14 architecture/operations, §16 CEO decision.
- [Repository README](../README.md), current implementation status and explicit non-production integrations.
- [Repository CI workflow](../.github/workflows/ci.yml), current typecheck/test/build gates.
- [.claude/proven-config.json](../.claude/proven-config.json), Ruflo proven-config manifest present in the checkout; not proof of successful project initialization.

No secondary ranking article was used to determine technical suitability. GitHub star count is cited only as a transient popularity indicator, not as evidence of fitness.
