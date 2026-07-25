# Changelog

## 0.1.5 (2026-07-25)

### 新增
- 完整中英文国际化覆盖：新增 ~180 个翻译 key，30+ 页面组件现已支持语言切换
- 英文 README（README_EN.md）

### 修复
- 修复页面顶端无法拖动窗口的问题（将 drag region 从 sticky 元素移至独立 absolute overlay）

## 0.1.4 (2026-07-25)

### 新增
- Responses 协议支持：新增 `/v1/responses` 端点，兼容 OpenAI Responses API
- Anthropic 协议支持：新增 `/v1/messages` 端点，支持 Anthropic Messages API
- 页面标题栏恢复，添加渐进模糊效果（GradualBlur），标题滚动时悬浮固定
- 全局禁用文本选中，仅保留输入框等可编辑区域的选中能力
- 启动代理按钮添加 StarBorder 光晕动效
- 关于页新增项目链接卡片（帮助文档、更新日志、官方网站、意见反馈）

### 变更
- 仪表盘时间范围 tab 调整到 KPI 卡片上方
- 模型分布环形图和近期调用记录现在按时间范围筛选
- 供应商卡片点击直接进入详情页，移除箭头按钮
- 模型配置页隐藏协议转换能力、模型聚合规则和添加聚合功能
- 模型卡片 hover 光晕效果范围调整
- Dashboard 空状态文案优化

### 修复
- 修复 Responses 协议流式响应中 `msg_melody` text part 缺失的问题
- 修复近期调用记录延迟列无数据显示的问题
- 修复设置页背景色与其他页面有色差的问题
- 修复检查更新按钮 loading 动画不旋转的问题
- 修复检查更新时动画阻塞的问题
- 修复模型颜色显示问题（GPT/DeepSeek/Qwen/Claude 更新为官方品牌色）

## 0.1.0 (2026-07-03)

Initial development release.

### 新增
- 多 LLM 提供商管理（OpenAI、Anthropic、DeepSeek 等）
- 智能路由聚合（轮询、最低延迟、随机、顺序）
- 本地代理服务器（`/v1/chat/completions`，支持 SSE 流式响应）
- 统一 Provider Adapter 架构（OpenAI / Anthropic / OpenAI-compatible）
- 仪表盘（Token 用量、请求数、活跃模型、平均响应时间）
- 多语言支持（简体中文 / English）
- 设置持久化（Tauri app data 目录）
- API Key 加密存储（AES-256-GCM，自动生成密钥）
- 代理认证（`Authorization: Bearer <token>`）
- 速率限制、请求超时、CORS 限制
- 健康检查 `/health`
- 统一错误响应格式
- 请求记录持久化（JSONL 滚动日志，每 50 条自动落盘）
- 日志导出功能（Export → Downloads 文件夹）
- 打开日志目录（系统文件管理器）

### 工程
- Rust 后端：Axum 代理服务器、文件持久化、14 个单元测试
- 前端：React 19 + Zustand + Recharts、TypeScript 严格模式
- CI：GitHub Actions（前端 typecheck+build，后端 cargo check+test+clippy+fmt）
- 可复用 UI 组件库（FormField、FormGrid、SectionTitle、Button 等）
- `.gitignore` 覆盖 Tauri/Rust 构建产物

### 变更
- Tauri identifier: `com.tauri-app.melody-hub` → `com.melody-hub.app`
- CSP: `null` → 最小 CSP 策略
- 构建命令: `pnpm` → `npm`（更广泛兼容）
- 后端设置路径: `current_dir()` → Tauri app data 目录
- 前端类型: 移除 `apiKeyDisplay` 字段，由前端派生
- 前后端数据契约: 统一 camelCase 映射

### 修复
- OpenAI base URL 双 `/v1` 拼接问题
- 设置保存失败时不再提示成功
- 路由策略只推进当前聚合的轮询索引
- 失败请求进入统计记录（含错误类别）
- 上游错误响应脱敏（截断超长消息）
- 仪表盘热力图使用真实数据替代随机生成

### 待实现
- 日志导出功能
- 打开日志目录
- 统一 provider adapter
- 请求记录持久化到本地数据库（v0.3.0 计划中）
- Windows 代码签名与打包说明（v0.2.0 计划中）

## 版本策略

Melody Hub 遵循语义化版本（SemVer 2.0.0）：

| 版本 | 说明 |
|---|---|
| **v0.1.x** | 初始开发版 — API 和数据结构可能不兼容变更 |
| **v0.2.x** | 日志导出、provider adapter、Windows 签名 |
| **v0.3.x** | 请求记录持久化、数据库支持 |
| **v1.0.0** | 首个稳定版 — 向前兼容保证 |

补丁版本（v0.1.1, v0.1.2, ...）仅修复 bug，不新增功能。
次要版本（v0.2.0, v0.3.0, ...）可包含破坏性变更，变更前会在 CHANGELOG 中标注 `BREAKING`。
