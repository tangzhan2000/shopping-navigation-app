# 移动端原生原型

当前目录包含 Expo + React Native 客户端原型。先安装依赖：

```bash
pnpm install
```

本地 API 需要另开终端运行：

```bash
pnpm --filter @shopping-navigation/api dev
```

启动移动端：

```bash
pnpm --filter @shopping-navigation/mobile start
```

开发环境如需连接受保护的演示接口，设置 `EXPO_PUBLIC_DEMO_USER_ID`；正式构建不会自动发送演示身份头。`EXPO_PUBLIC_API_URL` 可用于指定 API 地址，例如真机访问开发机时使用局域网地址。

当前已实现：

- 任务首页、文字/链接/淘口令输入
- 识别确认和低置信度字段提示
- 本地沙盒官方入口条件预检（只在测试 API 可用；不返回链接、不创建订单、不打开平台）
- 无可验证报价时的诚实降级状态
- 购后待办空态/列表/详情
- 市场、来源和能力范围说明
- iOS/Android 共用的 Expo/React Native UI

当前明确未实现：

- 生产认证和 OAuth
- 真实语音、OCR、图片搜索
- 生产商品/报价来源
- 自动订单同步、返现和自动购买

首版视觉采用暖灰画布、深墨色文字、深青色主操作和琥珀色待确认提示，目标是让商品决策信息比装饰更突出；后续可根据实际品牌规范替换 `src/app/theme.ts`。
