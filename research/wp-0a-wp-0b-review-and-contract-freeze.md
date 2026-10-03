# WP-0A / WP-0B 只读审查与接口冻结

**审查日期：** 2026-10-03  
**范围：** `apps/api` 的 recognition、purchase-protection case、event、job repository；JSON snapshot 持久化；API listener 测试策略。  
**目标：** 在实现真实 provider 或启动并行 implementer 前，冻结底座边界，区分已验证能力、明确限制和必须由 CI/部署环境复验的事项。

## 结论摘要

1. **repository 接口继续使用 async。** 即使内存实现没有 I/O，async 形状已经与 JSON 实现、未来数据库/队列实现一致；不应为了内存测试改成同步接口。
2. **JSON snapshot 适合作为本地/单节点工程骨架，不是多副本生产存储。** 当前实现已有充分的本地安全与崩溃一致性保护，但没有跨主机锁、租约续期、数据库级查询或多副本协调。
3. **event/job/case/recognition 不应被强行合并成一个泛型 repository。** 它们的并发和一致性语义不同：event 以 aggregate version/idempotency 为核心，job 以 lease/ack/retry 为核心，case 以 expected version/idempotency/ownership 查询为核心，recognition 以 user ownership 和状态转换为核心。
4. **listener 测试分为两层：** 默认 handler-level `createTestFetch` 测试必须在所有环境运行；真实 loopback HTTP 测试作为 CI/具备本地端口绑定权限的环境门禁。当前受限环境的 `listen EPERM` 只能记录为环境限制，不应改写业务测试来规避。
5. **launch policy 必须是 API 依赖，不得由 fixture 常量隐式提供。** 当前 API 已支持注入 `policyReader`，测试默认 fixture，非测试默认 JSON repository；无有效策略时 fail closed。

## 逐项审查

### 1. Recognition task store

接口位于 [`apps/api/src/recognition-store.ts`](../apps/api/src/recognition-store.ts)：

```ts
create(input): Promise<RecognitionTask>
get(taskId, userId): Promise<RecognitionTask | undefined>
confirm(taskId, confirmedFields, userId, fieldValues?): Promise<RecognitionTask>
delete(taskId, userId): Promise<RecognitionTask>
```

冻结语义：

- `userId` 是读取、确认、删除的强制 ownership 边界；调用者不能先 `get(taskId)` 再自行过滤。
- `confirm` 是状态转换，不是任意字段 patch；实现必须继续由 domain `RecognitionTaskStore` 校验字段和状态。
- 未找到任务和不属于当前用户的任务都对 API 表现为不可操作，避免枚举 task ID。
- JSON 实现通过 `JsonSnapshot` 在每次变更时重新加载并持久化，适合当前单节点骨架。

### 2. Purchase-protection case repository

接口位于 [`apps/api/src/purchase-store.ts`](../apps/api/src/purchase-store.ts)：

```ts
create(caseRecord): Promise<PurchaseProtectionCase>
get(caseId): Promise<PurchaseProtectionCase | undefined>
update(caseRecord, expectedVersion): Promise<PurchaseProtectionCase>
listByUser(userId): Promise<readonly PurchaseProtectionCase[]>
listAll(): Promise<readonly PurchaseProtectionCase[]>
```

冻结语义：

- `create` 由 idempotency key 去重；同 key 不同业务内容必须抛 `CaseIdempotencyConflictError`。
- `update` 必须带调用方观察到的 `expectedVersion`；冲突抛 `CaseVersionConflictError`，API 映射为 409。
- `listByUser` 是用户侧默认查询；`listAll` 仅供受控运营/审计路径，不能直接暴露给普通用户路由。
- repository 不负责授权决定；ownership、consent、launch policy 和 capability gating 在 API/domain 层完成。

### 3. Event store

接口位于 [`apps/api/src/event-store.ts`](../apps/api/src/event-store.ts)：

```ts
append(event, expectedAggregateVersion?): Promise<void>
get(eventId): Promise<EventEnvelope | undefined>
list(aggregateId?): Promise<readonly EventEnvelope[]>
aggregateVersion(aggregateId): Promise<number>
```

冻结语义：

- `eventId` 全局去重；重复事件抛 `DuplicateEventError`。
- `expectedAggregateVersion` 是乐观并发门；冲突抛 `AggregateVersionConflictError`。
- `list` 返回不可变快照，不允许调用方修改 store 内部记录。
- projection/replay 是独立能力，不属于 event persistence contract；`replayEvents` 按 `occurredAt,eventId` 稳定排序。

当前实现的一个边界：aggregate version 由该 aggregate 的事件数量推导。对于当前骨架足够，但若未来允许删除/重建、分区写入或高并发数据库实现，应将 version 作为持久化原语，而不是依赖 count。

### 4. Job queue / worker

接口位于 [`apps/api/src/worker.ts`](../apps/api/src/worker.ts)：

```ts
enqueue(job): Promise<JobRecord>
claim(now?, leaseMs?): Promise<JobClaim | undefined>
ack(jobId, leaseToken): Promise<void>
fail(jobId, error, now?, leaseToken?): Promise<JobRecord>
list(): Promise<readonly JobRecord[]>
```

冻结语义：

- `idempotencyKey` 防止重复入队；相同 key 必须返回既有 job，冲突 payload 不能静默覆盖。
- `claim` 产生 lease token；`ack`/`fail` 必须校验 token，防止过期 worker 覆盖新 owner 的状态。
- retry 次数、有界退避和 dead-letter 是 queue contract 的一部分；handler 不应自行实现第二套重试语义。
- `Worker` 只消费已注册 handler；未知 job type 返回 unsupported/dead-letter 结果，不执行任意 payload。

### 5. JSON snapshot 持久化

实现位于 [`apps/api/src/json-snapshot.ts`](../apps/api/src/json-snapshot.ts)。当前已具备：

- 进程内 promise queue，避免同一实例的变更交错。
- `.lock` 的 `O_CREAT | O_EXCL` 获取，避免同一文件的多实例并发写入。
- lock 超时错误 `SnapshotLockTimeoutError`，不会无限等待。
- 新目录 `0700`、snapshot/temporary/lock 文件 `0600`。
- 写临时文件、`fsync`、rename 到目标文件，再 `fsync` 父目录。
- 读取时拒绝不安全的文件或父目录权限。
- 解析错误、读错误、rename/sync 错误向上抛出，不把损坏数据静默当作空仓储。
- 变更前重新 load，避免使用过期进程内缓存覆盖其他实例已经提交的数据。

明确限制：

- lock 是本机文件锁，不适用于共享文件系统上的跨主机协调。
- 没有锁的 owner/TTL 恢复机制；进程被强制终止留下 lock 时，后续写入会等待到超时。
- 每次变更是完整 JSON snapshot 重写，不适合高写入量、大数据集或复杂查询。
- rename 后目录 fsync 失败时，内存状态标记为 uncertain，下一次操作会重新读取；调用方必须把该错误视为持久化不确定，而不能报告成功。

因此：继续把 JSON store 用于本地 fixture、单节点开发和受控验收；进入生产数据、跨副本部署或高并发前，必须替换为具备事务/租约/审计能力的持久化实现，并保持上述接口语义。

### 6. API listener 测试策略

- [`apps/api/src/index.test.ts`](../apps/api/src/index.test.ts) 使用 `createTestFetch` 直接调用 handler，覆盖认证、consent、policy、fail-closed、错误映射和 capability gating；这是快速、稳定、无需端口权限的主测试层。
- [`apps/api/src/index.integration.test.ts`](../apps/api/src/index.integration.test.ts) 使用 `startTestServer` + 原生 `fetch`，覆盖真实 HTTP header、body、连接和 repository 重启/持久化行为；这是第二层集成门禁。
- 当前环境运行 loopback suite 时得到 `listen EPERM: operation not permitted 127.0.0.1`。这不是产品测试断言失败，而是执行沙箱不允许绑定本地端口。CI 必须在允许 loopback 的 runner 中执行这 6 个测试。
- 不应删除 loopback suite，也不应把它全部改成 handler-level 测试；两层分别验证不同边界。

## Wave 0 exit criteria

| 闸门 | 状态 | 证据 |
|---|---|---|
| repository async contract 已存在且实现一致 | 通过 | recognition/case/event/job 的 in-memory 与 JSON 实现 |
| JSON 权限、原子性、锁和损坏数据行为有测试 | 通过 | `json-snapshot.test.ts`、`worker.test.ts`、`event-file-store.test.ts` |
| API policy 依赖可注入且默认 fail closed | 通过 | `index.ts` policyReader 注入；`index.test.ts` policy cases |
| workspace typecheck | 通过 | `pnpm typecheck` |
| workspace build | 通过 | `pnpm build` |
| 非 loopback API 测试 | 通过 | 11 files / 60 tests |
| loopback HTTP 集成 | 待 CI/非沙箱环境 | 当前环境 `listen EPERM` |
| 真实 provider / 生产 source enable | 未授权、未开始 | 需要外部合同、许可和人工批准 |

## 下一步建议

1. 在允许 loopback 的 CI runner 执行 `apps/api/src/index.integration.test.ts`，将结果附到 Wave 0 记录。
2. 保持当前 repository contract，不为下一波 provider 接入增加泛型大抽象。
3. 下一项代码工作优先是 provider adapter 的 contract test harness：只接受已授权 source、显式 policy/consent、可重放请求和脱敏审计事件；不要接入真实平台账号或生产数据。
4. 在任何 source enable、资金动作、自动购买或生产发布前，分别取得合同/法务、合规、安全和产品责任人的人工批准。
