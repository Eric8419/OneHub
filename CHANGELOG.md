# Changelog

## 0.1.0 (2026-07-03)

Initial development release.

### 新增
- 多 LLM 提供商管理（OpenAI、Anthropic、DeepSeek 等）
- 智能路由聚合（轮询、最低延迟、随机、顺序）
- 本地代理服务器（`/v1/chat/completions`，支持 SSE 流式响应）
- 仪表盘（Token 用量、请求数、活跃模型、平均响应时间）
- 多语言支持（简体中文 / English）
- 设置持久化（Tauri app data 目录）
- API Key 加密存储（AES-256-GCM，自动生成密钥）
- 代理认证（`Authorization: Bearer <token>`）
- 速率限制、请求超时、CORS 限制
- 健康检查 `/health`
- 统一错误响应格式

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
- 日志导出功能（v0.2.0 计划中）
- 打开日志目录（v0.2.0 计划中）
- 统一 provider adapter（v0.2.0 计划中）
- 请求记录持久化到本地数据库（v0.3.0 计划中）
- Windows 代码签名与打包说明（v0.2.0 计划中）