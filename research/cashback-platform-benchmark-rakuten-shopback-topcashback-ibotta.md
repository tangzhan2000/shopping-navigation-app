# 返利平台机制基准：Rakuten、ShopBack、TopCashback 与 Ibotta

**研究日期 / 访问日期：** 2026-09-30  
**范围：** 仅使用各公司的官方帮助中心、条款、投资者/SEC 文件和官方产品页面；不使用媒体报道、用户评论、联盟博客或第三方 SEO 页面。除非脚注明确指出，以下是美国消费者路径的比较，不应外推到其他国家或地区。  
**阅读方法：** 每项可核实事实均紧跟官方来源编号；完整 URL、页面类型及访问语境列于文末“来源登记”。“产品含义”是基于被引材料的推断，明确标注为推断而非平台承诺。  
**术语警告：** “Cash Back/Cashback”在这些平台中均是有条件的奖励记账，不等于结账时立减，也不等于平台已无条件承担付款义务。[R2][S1][T1][I1]

## 结论摘要

1. **四者都是先获客/激活、后归因、再由商家或其网络确认的模式；前端形态不同，但都不能把点击或初始展示当作可支付收入。** Rakuten、ShopBack 和 TopCashback 明确依赖跳转、Cookie/识别标签或商家/联盟网络回传；Ibotta 的线上返利也在零售商通知合格交易后进入待处理期。[R1][S1][T1][I4]
2. **Rakuten 与 TopCashback 是最典型的联盟跳转返利；ShopBack 也是联盟佣金分成，但其官方美国页面的提现门槛自相矛盾；Ibotta 同时是 CPG/零售媒体数字促销网络、白标发行网络和 D2C 返利产品。** 因而不能用单一“佣金率 × GMV”的模型代表 Ibotta，也不能假定任何展示金额就是净收入或用户可得金额。[R2][S2][T1][I1]
3. **可支付状态比“已跟踪”严格得多。** Rakuten 采用 `Processing → Pending → Confirmed / Ineligible`；ShopBack 明示 `Pending → Confirmed / Rejected`；TopCashback 的现行界面以 `In Progress → Available` 呈现；Ibotta 的线上订单进入 `Pending` 后等待零售商及退货/处理期，再计入 earnings。[R3][S1][T2][I4]
4. **面向产品设计，必须记录归因证据、商家条款版本、状态转移、可逆原因和实际可提现余额，不能只记录“预计返利”。** 这是从各家对 Cookie、最后一次跳转、商家确认、退货、优惠码、反欺诈、支付审核和条款排除的共同依赖所作的产品推断。[R1][S1][T1][I4]

## 1. 横向比较

| 维度 | Rakuten（美国 Help/Terms） | ShopBack（美国 Help/Terms） | TopCashback（美国站） | Ibotta（美国 Help/SEC） |
|---|---|---|---|---|
| **主要获客/激活面** | 官网链接、App、Cash Back Button/浏览器扩展；扩展可提示返利与优惠券。[R2] | 网站、App、浏览器扩展；条款将这些统称为 ShopBack Platforms，并通过 merchant links 导向合作商家。[S2] | 官网跳转与桌面浏览器扩展；扩展可提醒、搜索和激活优惠/返利，且并非所有商家支持扩展。[T3] | D2C 的 iOS/Android App、网站及浏览器扩展；另有第三方发布商的白标/嵌入式奖励入口。[I1][I3] |
| **消费者必须做什么** | 每次购物从 Rakuten 链接、App 或 Button 开始一个 Shopping Trip；回到商家进行第二笔购买需重新开始。[R1] | 从 ShopBack 开始、点击到商家并在同一会话完成结账；官方说明使用 Cookie 跟踪。[S1][S3] | 登录后点击 `Continue`/`Continue to Merchant` 进入商家；连续购买前重新点击可提高归因机会，扩展也要点激活。[T1][T3] | App/网站中查看 offer 的资格/排除条件后 `Shop` 或 `Activate & shop`；扩展在支持商家弹窗并须点 Activate。部分线下 loyalty 路径还要求结账时使用已绑定的同一会员账号。[I4][I5][I6] |
| **归因/会话机制** | Shopping Trip 有唯一编号，Rakuten 用它与商家核验；购买所在浏览器窗口必须来自 Rakuten 链接。[R1] | ShopBack 明说用 Cookie 识别是否符合返利资格，订单可在 48 小时内显示 Pending。[S1] | 商家/跟踪机构报告中的 identification tag 必须能直接追溯到会员账户；Cookie 用于购物跟踪，商家联盟网络参与人工申诉核验。[T1][T4] | 线上零售商告知 Ibotta 合格购买后显示 Pending；Ibotta SEC 文件称其通过集成零售商和发布商获得购买数据，并处理 offer redemption。[I4][I1] |
| **经济学 / 资金来源** | 条款将商家称为 Affiliate Stores，并说明确认速度受其政策、报告节奏、品类和风险因素影响；Rakuten 的公开帮助页未承诺固定用户分成比例。[R2] | ShopBack 官方帮助页称商家可就已归因购买向 ShopBack 支付 affiliate commission，ShopBack 向用户分享其中一部分；计算通常以展示返利率 × 合格金额，且大多数商家不计税费/运费。[S3][S1] | 条款称平台把从商家及其 tracking agencies 获得、且能由识别标签追溯到会员的返利传给会员；实际记账金额以商家报告佣金为准，可高于或低于页面展示。[T1] | 2025 10-K：Ibotta 从客户（主要是 CPG 品牌）获得数字促销，经 Ibotta Performance Network（IPN）分发给 D2C 和第三方发布商；网络是“按交易成功收费”的营销方案。D2C 还通过 affiliate networks 获得部分零售广告主的按篮子消费比例返利 offer。[I1] |
| **待处理 / 确认 / 拒绝状态** | `Processing`=等待商家订单资料；`Pending`=商家已发送订单资料、等待退货/排除等；`Confirmed`=进入确认余额；`Ineligible`=不符合，如退货、排除品或非 Rakuten 优惠码。[R3] | `Pending` 可在订单后 48 小时内出现；商家验证后 `Confirmed`；官方 glossary 同列 `Rejected`。确认会等待商家验证、冷却期、取消/退货/换货和是否经 ShopBack 购买。[S1] | 最新 Earnings UI：`In Progress` 包含已跟踪、商家处理中交易；商家付款后变 `Available`，才可提现；页面明确说旧 UI 曾称作 Pending/Confirmed/Payable/Claimed。[T2] | 线上合格交易由零售商通知后会显示 `Pending`，出现时间可能为数小时、发货或送达后；待处理期用于核验和遵守零售商退货/处理期，之后返利才进入 earnings。[I4] |
| **支付与门槛（美国）** | 确认余额至少 **$5.01** 才进入每季支付；Help 列出 PayPal、支票、AmEx Membership Rewards、Bilt Points，确认余额也可在 $5 起兑换礼品卡。固定支付日为 2/15、5/15、8/15、11/15。[R4] | PayPal 与 ACH。**门槛存在官方冲突：**同一帮助中心的 2026-08-04 提现页称 Confirmed Cashback 到 **$10** 可提现；ShopBack 的 2026 公开 guide 却称 **$5**，且另一官方介绍页同时重复 $10 与 $5。日限额为 $300、通常 10 日内到账、可能延至 30 日的说法出自 $10 页面。[S4][S5][S3] | `Available` 后可按请求提现；官方状态页列银行、Venmo、PayPal 或礼品卡。Terms 说 ACH 仅限美国银行账户，PayPal 可付至其支持的国家/地区，并提及 Venmo/Amazon 礼品卡等方式；检索的官方材料未给出统一美国最小可提现额，不能自行填写一个数值。[T5][T1] | 到银行、PayPal 或 App 内数字礼品卡；需至少 **$20**、成功兑换至少一个 offer、且首个 offer/礼品卡后至少 7 天。到账通常 0–5 天，PayPal 文章称通常 2 小时、高峰 1–3 个工作日。[I2][I7] |
| **主要失败 / 冲销原因** | Cookie、广告/内容拦截器、隐私工具、VPN、无痕模式、其他返利/优惠扩展可能破坏激活；另外退货、取消、换货、非平台优惠码、排除项与旅行订单变更可使返利失效。[R1][R3] | Cookie/广告拦截器、隐私设置、无痕/VPN、设备/浏览器/标签切换、后续点击竞争返利/优惠链接都会影响跟踪；外部不允许的优惠码、退货、取消、部分退款、排除品类或商家拒绝佣金可导致拒绝或减少。[S3] | 外部优惠码、广告拦截、非被打开的原窗口结账、后来点击其他返利/优惠站、商家未及时报告均可造成 missing；退货、取消、非合格促销、商家认定不合格会 declined；商家可因批量转售或反欺诈而拒付。[T6][T7][T1] | 必须查看 offer 的排除与资格；线上待处理期可长达具体商家的期限。用于 loyalty 的路径需先加 offer、购买合格 SKU/规格/数量并使用同一绑定会员号；取消或退货可使 bonus/返利不完成或被冲回。[I5][I6][I8] |
| **披露 / 推荐影响** | 已检索官方消费者资料明确披露 Affiliate Store、支付资格和失效原因，但本次未找到面向消费者的、统一的“佣金影响排序”披露文本；不得推断其不存在或存在。[R2] | 条款明确 merchant links 指向 merchant partners；消费者购买由商家条款管辖，ShopBack 不是商家的代理，商家可修改/撤回促销并影响返利。[S2] | Terms 明示展示费率可因商家佣金变化而不准确、最终以商家回报为准；广告链接不产生返利并应被标明，referral 推广还要求明确参与人将获奖励。[T1][T8] | 10-K 公开说明客户、零售商和媒体代理提供促销，经发布商分发；第三方发布商可保留自身品牌与用户关系。此为业务/归因披露，不等于其每一前端 offer 都有相同赞助标识。[I1] |
| **地域 / 法域边界** | 本文使用的是 Rakuten.com 美国条款：支付条件要求用户位于美国 50 州或华盛顿特区且受制裁筛查；Rakuten FY2024 报告称 Rakuten Rewards 在美国、加拿大和英国运营，故美国支付规则不应外推。[R2][R8] | 本文只有美国 Help/Terms；提现页写 PayPal 与 ACH，且填写项包含 ACH/SWIFT 资料。它不能证明 ShopBack 在其他市场的门槛、钱包、货币或税务规则。[S4][S2] | `.com` 条款称目标为美国消费者、USD 返利；加拿大多数商家可能可用、墨西哥部分可用，北美以外使用也受商家配送/资格限制；非美国会员仅可经 PayPal 收款且自行承担汇兑成本，部分高风险/受制裁地区可被屏蔽。[T9] | 本比较引用美国 Help 与美国上市公司 10-K；美元 $20 门槛、银行/PayPal/礼品卡和美国零售商/loyalty 规则不能被表述为全球 Ibotta 产品规则。[I2][I1] |

## 2. 各产品的关键机制与产品含义

### 2.1 Rakuten：显式的 Shopping Trip 与季度集中付款

- Rakuten 将一次合格路径定义为 **Shopping Trip**：用户从 Rakuten 链接、App 或 Cash Back Button 点击到商家即创建，系统为之分配唯一编号；每笔再次购买都要重新从 Rakuten 开始，且实际购物窗口应来自该链接。[R1]
- 其状态可见性较细：在订单刚发生、商家尚未报告时是 `Processing`；商家报告后为 `Pending`；经退货/排除等检查后进入 `Confirmed`；不可付则标为 `Ineligible`。[R3]
- 普通线上/线下返利的确认时间通常为 3–14 周，旅行一般在行程完成后 45–120 天；这不是付款 SLA，而是商家验证/政策所致的典型确认区间。[R4]
- 支付在确认余额满足 $5.01 时按季度排程，而不是用户每次交易即时提现；gift card 是不同于常规季度付款的提前兑换路径，$5 确认余额起可用并受限制。[R4]

**产品含义（推断）：** Rakuten 的 `shopping_trip_id` 是值得复制的证据对象。报价/跳转产品应保存 `trip_id`、跳转时刻、来源入口、商家、浏览器/设备会话、费率/条款版本及后续商家回传，而不要把“扩展已弹窗”记录为“返利已获”。该推断基于 Rakuten 明示的唯一 Trip 编号、浏览器窗口来源和分状态生命周期。[R1][R3]

### 2.2 ShopBack：Cookie 跟踪与商家佣金分成，但提款资料冲突

- ShopBack 的官方 tracking guide 明确说明，从 ShopBack 开始购物后通过 Cookie 识别资格；多数商家不将税费、运费算入返利基数。[S1]
- 其条款把网站、扩展和 App 都纳入平台，将到商家的链接定义为 merchant links；商家独立经营、其退换/取消/配送条款支配购物，ShopBack 不承担商家促销变动的责任。[S2]
- 2026 美国官方安全/机制页将经济学写得更直白：商家可能为已归因购买支付 affiliate commission，ShopBack 只分享其中一部分。因此“返利”不是按订单产生的无条件债务，而依赖成功跟踪、商家批准和资格规则。[S3]
- 其可操作的失败清单非常具体：Cookie 关闭、拦截器、无痕、VPN/代理、跨设备或浏览器、离开标签后点击别的返利/优惠站、外部优惠码、退货/部分退款和排除品都可能造成没有记录或之后拒绝。[S3]

**已证实冲突：不能写成确定产品规则。**

| 说法 | 官方证据 | 处理结论 |
|---|---|---|
| 美国 Confirmed Cashback 到 **$10** 才能提现；每天最多 $300；通常 10 天、可达 30 天 | 2026-08-04 更新的 `Withdraw your Cashback`。[S4] | 对产品/PRD应标为“需登录账户或当前帮助页复核”。 |
| 美国 Confirmed Cashback 到 **$5** 可提现 | 官方 ShopBack guide（2026 页面）和另一官方说明页中也出现该数值；后者同页又出现 $10。[S5][S3] | 这是同一官方域名内相互矛盾的陈述；不可选择其中一个当作已确认事实。 |

**产品含义（推断）：** 返利钱包必须区分 `tracked/pending`、`merchant-confirmed`、`withdrawable` 和 `payout-requested/paid`，并在付款规则改变或来源冲突时按地区、渠道和规则版本显示“不确定”，而不是把 `confirmed` 直接等同“可提现”。该推断来自 ShopBack 的状态/付款阐述互相不完全一致。[S1][S3][S4][S5]

### 2.3 TopCashback：追踪标签、商家最终裁量与可见状态迁移

- TopCashback 条款称返利要由商家/跟踪机构报告中的识别标签直接追溯到会员账户；必须登录并经 `Continue`/`Continue to Merchant` 点击进入，赞助广告链接不产生佣金。[T1]
- 该条款同时明确最终以商家报告的佣金记账，可能高于或低于广告费率；商家未付款、延迟付款、交易不合格或平台风控均可能导致不付或回收余额，甚至已标为 Payable 或已付出的金额也可调整。[T1]
- 2026 现行 Earnings 页面把挂账统一称为 `In Progress`，把可取款称为 `Available`，并明确旧体验会显示 `Pending`、`Confirmed`、`Payable`、`Claimed` 等词。[T2]
- Missing Cash Back Claim 需要平台把资料提交给零售商的 affiliate network 调查，官方预期可需 2–3 个月；商家如认为其他返利/优惠/比价站是最后点击来源，申诉可被拒绝。[T4][T7]
- TopCashback 允许在 Available 后提现，其帮助页列银行、Venmo、PayPal、礼品卡；条款补充 ACH 仅限美国银行，PayPal 为境外主要支付通道。[T5][T1]

**已证实陈旧术语风险：** 若现有 PRD/文档仍把 TopCashback 的现在状态写作“Pending → Confirmed → Payable”，应改为“该站当前 UI 以 In Progress/Available 呈现；旧术语仍可能存在于条款或历史资料中”。这是该公司自己的新旧 UI 映射，不是外部猜测。[T2]

**产品含义（推断）：** 链接归因应至少记录“跳转是否发生”“本产品是否为最后一站”“商家/联盟网络报告金额”“申诉状态”和“最终可支付资金是否到位”。仅记录点击会错误地把未被商家接受的流量计作收入/用户奖励。[T1][T4][T7]

### 2.4 Ibotta：零售媒体/IPN 与消费者返利并行，不只是跳转分佣

- Ibotta 的 2025 10-K 将 IPN 描述为成功交易后获得报酬的营销网络：主要 CPG 品牌客户提供数字促销，Ibotta 通过 D2C 和第三方发布商分发；第三方发布商可用白标方式让用户留在发布商品牌/体验中。该文件还说明 D2C 与 affiliate networks 合作，为一部分零售广告主提供按篮子消费比例的返利 offer。[I1]
- 因而 Ibotta 有两类不同的归因入口：线上购物由 App、网站或扩展发起/激活；线下/loyalty 路径要求先在清单加入 offer，并在结账使用同一已绑定会员账号。[I4][I5][I6]
- 线上订单在零售商通知合格购买后显示 `Pending`；待处理期可在数小时、发货或送达后开始，目的是让 Ibotta 核验订单并遵守零售商退货/处理期。具体等待期应以每个 offer 详情为准。[I4][I5]
- 消费者提现规则在帮助中心较明确：至少 $20、至少一个成功 offer、首个 offer/礼品卡后至少 7 天；提现可至银行、PayPal 或数字礼品卡，且这些路径的可用端（App/网页）不同。[I2][I7]

**已证实产品文档冲突：** 一篇 Ibotta extension 介绍说桌面/笔记本扩展可用于 Chrome 和 Safari；另一篇 extension FAQ 说“currently only compatible with Google Chrome”。两页均在官方 Help 域名，且研究时未取得可解释的生效范围/更新时间差异。任何“支持 Safari”或“只支持 Chrome”的断言都应带页面/访问时间，产品接入前应实测或向 Ibotta 确认。[I9][I10]

**产品含义（推断）：** Ibotta 不应被简化成“用联盟链接赚佣金再返给用户”。数据模型需要支持 `brand-funded digital offer`、`retailer/publisher integration`、`affiliate basket offer`、`D2C` 和 `white-label publisher` 等不同资金方、分发方、购买数据来源和兑付路径。[I1]

## 3. 对购物导航 / 返利层的可执行设计要求

以下是跨平台资料支持的设计结论，不代表任何一家平台已授权第三方实现。所有结论均为推断，实施前仍要逐个合同、API 和商家条款确认。

1. **将“报价/优惠”与“奖励权利”分离。** 展示层可显示费率和估算奖励；账本必须另存 `displayed_rate`、`eligible_base`、`estimated_reward`、`tracking_evidence`、`merchant_reported_amount`、`status`、`reversal_reason`、`withdrawable_at`。理由是展示费率可能与商家实际报送不同，且税/运费/排除商品并不总参与计算。[S1][T1][I5]
2. **将会话与归因视为一等实体。** 建议建立 `attribution_session` / `shopping_trip`，至少包含入口、跳转 URL/参数、时间、商家、用户/设备许可状态、Cookie/扩展激活信号、同一会话连续性与最后竞争点击的告警。理由是 Rakuten、ShopBack、TopCashback 都把实际来源/标签/Cookie/最后跳转作为可否计奖的关键证据。[R1][S1][S3][T1][T7]
3. **状态机必须可逆，并且把商家确认与平台付款分开。** 一个稳健的抽象为 `initiated → tracked → pending_review → merchant_confirmed → withdrawable/payable → paid`，并允许从任意非最终状态转为 `ineligible/rejected/reversed`；不要强行把四家的标签统一为相同法律/会计含义。[R3][S1][T2][I4]
4. **把失败预防写进跳转前 UX。** 激活前应提醒用户：不要用无痕/阻断 Cookie、暂停会干扰的扩展、不要切换设备或点击竞争返利/优惠链接、只用被批准的优惠码、保存订单凭据；结账后提示先等待商家报告再申诉。[R1][S3][T6][T7]
5. **披露商业关系与排序边界。** 对外应把 sponsored/广告链接、联盟链接和自然比较分开；显示“最终奖励由商家资格、商家报告和退货期决定”。这是 TopCashback 对广告/最终佣金的明示规则，及 ShopBack 对商家独立经营、Ibotta 对客户—发布商—促销网络结构的必要产品化表达。[T1][S2][I1]
6. **按国家/地区、付款方式和规则版本配置，而非写死全局门槛。** Rakuten 美国、TopCashback 美国/境外和 Ibotta 美国的支付条件不同，ShopBack 美国自身官方页已出现 $5/$10 矛盾；应给每个规则加 `jurisdiction`、`payment_rail`、`effective_at`、`source_url` 和 `verification_status`。[R2][T9][I2][S3][S4][S5]

## 4. 已识别的陈旧、冲突或不能外推的说法

| 风险点 | 官方证据 | 本文处理 |
|---|---|---|
| **ShopBack US 提现最低额 $5 还是 $10** | 2026-08-04 帮助页称 $10；官方 guide 称 $5；另一官方页同文出现二者。[S4][S5][S3] | 认定为未解决的官方冲突；不把任一金额写进需求为硬规则。 |
| **TopCashback 目前是否仍显示 Pending/Confirmed/Payable** | 最新 Earnings 页面说 UI 已改为 In Progress/Available，并明确旧标签映射。[T2] | 把旧三段标签标为过时的 UI 术语，而非当前唯一界面。 |
| **Ibotta 桌面扩展的 Safari 支持** | 官方一页称 Chrome 与 Safari；官方 FAQ 称仅 Chrome。[I9][I10] | 认定为文档冲突；需在正式发布/接入前做版本化验证。 |
| **ShopBack 的美国规则能否代表 13 个市场** | 本文所引 ShopBack 资料明确是 `hc/en-us` 或美国站；并无一份材料证明其可外推。[S1][S2][S4] | 只描述美国页，其他市场应单独研究。 |
| **Rakuten.com 规则能否代表加拿大/英国** | Rakuten 报告说 Rewards 覆盖美国、加拿大、英国，但本研究条款是美国支付与制裁规则。[R2][R8] | 不外推；每个国家站的条款/支付规则须另查。 |
| **展示返利率是否等于最终收入或用户应得** | TopCashback 明示商家支付金额可与展示不同；ShopBack、Rakuten、Ibotta 都保留商家验证/资格/处理期。[T1][S1][R2][I4] | 统一将展示为估算/报价，而非确认收入或可付余额。 |

## 5. 来源登记（官方一手来源）

> 所有 URL 于 **2026-09-30** 访问。Help/条款是消费者流程的首要证据；投资者/SEC 文件用于业务模式、网络角色和会计/营收背景，不能代替实时产品条款。网页可能在访问后变更，引用时应保留 URL、页面标题、更新日期与访问日期。

### Rakuten

- **[R1]** Rakuten Help, *Online Cash Back*（帮助中心；Shopping Trip、唯一编号、重复点击、浏览器窗口、Cookie/阻断器、常见状态和失败路径）：https://www.rakuten.com/help/category/online-cash-back-26577737853715
- **[R2]** Rakuten Help, *Rakuten Terms & Conditions*（美国条款；Affiliate Stores、确认与付款资格、$5.01、地区/制裁限制）：https://www.rakuten.com/help/terms-conditions
- **[R3]** Rakuten Help, *Checking the Status of Your Cash Back*（帮助中心；Processing/Pending/Confirmed/Ineligible 定义）：https://www.rakuten.com/help/article/checking-the-status-of-your-cash-back-360002117107
- **[R4]** Rakuten Help, *Getting Paid*（帮助中心；支付日期、$5.01、方法、确认时长、礼品卡）：https://www.rakuten.com/help/category/getting-paid-26579048142483
- **[R8]** Rakuten Group, *Integrated Report for FY2024*（官方投资者报告；Rakuten Rewards 的美国/加拿大/英国覆盖与业务说明）：https://global.rakuten.com/corp/investors/assets/doc/documents/ar_2024_all.pdf

### ShopBack

- **[S1]** ShopBack Care (US), *Cashback tracking and calculation guide*（帮助中心；Cookie、48 小时 Pending、确认/拒绝、计算基数）：https://support.shopback.com/hc/en-us/articles/34640184721683-Cashback-tracking-and-calculation-guide
- **[S2]** ShopBack Care (US), *Terms of use*（条款；平台、merchant links、merchant partner 独立性、促销变更）：https://support.shopback.com/hc/en-us/articles/33321351340307-Terms-of-use
- **[S3]** ShopBack Care (US), *Is ShopBack Legit? - Reviews, Support, and Safety*（帮助中心；联盟佣金分成、追踪清单、失败原因、$5/$10 同页矛盾）：https://support.shopback.com/hc/en-us/articles/49946506214291-Is-ShopBack-Legit-Reviews-Support-and-Safety
- **[S4]** ShopBack Care (US), *Withdraw your Cashback*（帮助中心，页面标注 Updated Aug. 4, 2026；PayPal/ACH、$10、$300/日、10–30 天）：https://support.shopback.com/hc/en-us/articles/34643134289171-Withdraw-your-Cashback
- **[S5]** ShopBack, *How to Withdraw Your ShopBack Cashback in the US (2026)*（官方 ShopBack guide；$5、PayPal/ACH；与 S4 冲突）：https://www.shopback.com/guide/how-to/withdraw-shopback-cashback

### TopCashback

- **[T1]** TopCashback USA, *Terms and Conditions*（条款；识别标签、点击路径、佣金报告、商家裁量、冲销、支付方式）：https://www.topcashback.com/terms/
- **[T2]** TopCashback, *Quick guide to Earnings page*（帮助中心；In Progress/Available 与旧状态名的映射）：https://www.topcashback.com/help/earnings-page-guide/
- **[T3]** TopCashback, *Browser Extension*（官方产品页；桌面扩展、激活、非全部商家支持）：https://www.topcashback.com/browser-extension/
- **[T4]** TopCashback, *What happens after I submit a Missing Cash Back Claim?*（帮助中心；提交 affiliate network 调查、2–3 个月）：https://www.topcashback.com/help/missing-cash-back-claim/
- **[T5]** TopCashback, *When will I get my Cash Back?*（帮助中心；In Progress 到 Available、银行/Venmo/PayPal/礼品卡）：https://www.topcashback.com/help/cash-back-statuses/
- **[T6]** TopCashback, *Why is my Cash Back missing?*（帮助中心；外部优惠码、拦截器、标签页、其他站点和报告延迟）：https://www.topcashback.com/help/cash-back-missing/
- **[T7]** TopCashback, *Why was my Missing Cash Back Claim rejected?*（帮助中心；最后点击/他站归因、合格条件）：https://www.topcashback.com/help/rejected-cash-back-claim/
- **[T8]** TopCashback, *Refer a Friend Terms & Conditions*（官方条款；推广须清晰说明会获得奖励）：https://www.topcashback.com/referrals/terms/
- **[T9]** TopCashback USA, *Terms and Conditions*（同 T1 的地域段落；美国定位、USD、加拿大/墨西哥/境外 PayPal 与限制）：https://www.topcashback.com/Terms/

### Ibotta

- **[I1]** Ibotta, Inc., *Annual Report on Form 10-K for year ended December 31, 2025*（SEC/官方投资者文件；IPN、CPG 客户、发布商、白标、affiliate networks、购买数据、业务与收入模型）：https://investors.ibotta.com/sec-filings/all-sec-filings/content/0001628280-26-011838/ibta-20251231.htm
- **[I2]** Ibotta Help, *What are the different ways to withdraw my earnings?*（帮助中心；$20、一个 offer、7 天、银行/PayPal/礼品卡、0–5 天）：https://help.ibotta.com/hc/en-us/articles/223788308-What-are-the-different-ways-to-withdraw-my-earnings
- **[I3]** Ibotta Help, *What is Online Shopping?*（帮助中心；App/网页/扩展入口、Pending 出现与处理期）：https://help.ibotta.com/hc/en-us/articles/360000170948-What-is-Online-Shopping
- **[I4]** Ibotta Help, *How do I earn cash back on Online Shopping offers?*（帮助中心；App/网站/扩展激活、offer 详情、Pending/资格）：https://help.ibotta.com/hc/en-us/articles/115006120327-How-do-I-earn-cash-back-on-Online-Shopping-offers
- **[I5]** Ibotta Help, *How does the Ibotta browser extension work on desktop or laptop devices?*（官方产品帮助；扩展激活、比价、价格提醒；称 Chrome/Safari）：https://help.ibotta.com/hc/en-us/articles/360007506380-How-does-the-Ibotta-browser-extension-work-on-desktop-or-laptop-devices
- **[I6]** Ibotta Help, *Help: I did not receive cash back on my loyalty purchase*（帮助中心；加入 offer、合格 SKU、绑定 loyalty account、72 小时提示）：https://help.ibotta.com/hc/en-us/articles/21860168041362-Help-I-did-not-receive-cash-back-on-my-loyalty-purchase
- **[I7]** Ibotta Help, *How do I withdraw my earnings to PayPal?*（帮助中心；$20、App 内 PayPal、通常 2 小时/高峰 1–3 工作日）：https://help.ibotta.com/hc/en-us/articles/115004907048-How-do-I-withdraw-my-earnings-to-PayPal
- **[I8]** Ibotta Help, *Will a pending period affect my bonus?*（帮助中心；线上 90 天示例、退货/取消使 bonus 不完成或冲回）：https://help.ibotta.com/hc/en-us/articles/360000484108-Will-a-pending-period-affect-my-bonus
- **[I9]** Ibotta Help, *How does the Ibotta browser extension work on desktop or laptop devices?*（同 I5；Chrome 与 Safari 说法）：https://help.ibotta.com/hc/en-us/articles/360007506380-How-does-the-Ibotta-browser-extension-work-on-desktop-or-laptop-devices
- **[I10]** Ibotta Help, *Ibotta browser extension frequently asked questions for desktop or laptop devices*（帮助中心；称“currently only compatible with Google Chrome”、Cookie/优惠码/状态说明）：https://help.ibotta.com/hc/en-us/articles/4410116611858-Ibotta-browser-extension-frequently-asked-questions-for-desktop-or-laptop-devices
