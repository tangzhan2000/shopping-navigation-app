# Shopping Navigation

省心购是一个语音优先、证据驱动的 AI 购物决策与购后保护平台：用户可以用语音、文字、图片、系统分享、淘口令或商品链接表达需求；系统在明确市场、类目和授权来源范围内识别商品、澄清约束、比较可验证的真实总成本、解释同款/变体/平替/相似关系，并通过官方入口完成购买，随后在获得授权时提供订单、物流、售后和返现守护。

完整目标态和唯一验收基线见 [`docs/ai-shopping-navigation-prd.md`](docs/ai-shopping-navigation-prd.md)。完整目标能力不因首发阶段删减；首发只承诺一个明确市场/法域、币种、时区、类目范围和闭合的授权来源 allowlist。allowlist 外来源不检索、不展示、不计覆盖率。平台支付、商家售后和最终履约责任不由本产品替代。Ruflo 工程任务清单、依赖顺序和人工审批边界见 [`research/ruflo-task-inventory-and-implementation-plan.md`](research/ruflo-task-inventory-and-implementation-plan.md)。

## 当前实现状态

仓库当前是可回放的工程骨架，不是生产平台：

- `apps/api`：健康检查、能力注册、识别任务、首发市场/来源授权元数据、购后保护 case API，以及仅测试环境可用的 fixture 比较和官方入口条件预检 API；
- `apps/admin`：运营控制台骨架；
- `apps/mobile`：Expo 客户端原型，包含沙盒入口预检提示（不打开链接）；
- `packages/contracts`：版本化 API/领域合同；
- `packages/domain`：能力注册、识别任务状态机、来源查询和确定性总成本规则。

当前已具备文本/URL/淘口令结构化与用户确认/删除、首发市场策略校验、来源授权边界、购后保护 case 状态机、原子 JSON 本地仓储、fixture 价格证据、比较 API 和不返回 URL 的沙盒入口条件预检。订单、推荐、提醒、提现及自动购买路由在缺少授权 provider 时明确返回不可用；预检不等于真实跳转或下单。默认运行时的本地仓储用于开发/测试，不是生产数据库；JSON 快照现在具备跨实例文件锁、原子替换、权限校验和损坏/恢复测试，但仍不能替代多副本数据库，生产接入前必须补充数据库 adapter、并发控制、备份/恢复和权限审查。识别任务和奖励账本仍是进程内存实现；真实平台来源、生产认证、语音/OCR/视觉服务、OAuth 订单同步、返现联盟、钱包提现或自动购买仍未接入。未配置 provider 的能力必须保持 unavailable，任何能力只有在 PRD 规定的授权、数据质量、用户同意、安全、合作和合规闸门通过后才可启用。

**工程进度（2026-10-02）：** Wave 0 已基本完成本地验证：workspace `typecheck` 通过；本地 workspace 测试通过（API 12 个测试文件/63 个测试，domain 10/42，mobile 2/10，admin 2/10；contracts 无测试文件）；API loopback 集成测试 6/6 通过，并覆盖重启读取、用户隔离、认证/同意和错误映射。此前受限 sandbox 的 `listen EPERM` 已在普通本机终端复验通过。CI 安装已改为严格 frozen lockfile；`pnpm build` 也已通过。仍待远程 CI run 记录后，才能正式标记 Wave 0 exit；source map 缺失目前仅为非阻断警告。consent JSON 仓储已补充锁内重新加载、原子写入、文件/目录权限、文件与目录 fsync，以及 stale repository 并发回归测试。

## Workspace

- `apps/api`: HTTP and asynchronous application entrypoints
- `apps/admin`: framework-neutral operations and compliance model
- `apps/mobile`: framework-neutral decision journey state machine
- `packages/contracts`: versioned API and event contracts
- `packages/domain`: deterministic domain rules and capability registry

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

No production platform adapter is enabled by default. Source integrations must implement the contracts and pass the authorization, replay, privacy, security and compliance gates in the PRD.
