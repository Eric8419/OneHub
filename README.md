# Melody Hub

**Melody Hub** 是一个本地桌面应用，作为 LLM API 的聚合代理网关。它让你在桌面端统一管理和路由多个 AI 模型提供商（OpenAI、Anthropic、DeepSeek 等）的 API 请求，并提供用量监控仪表盘。

## 功能特性

- **多提供商管理** — 添加和管理多个 LLM API 提供商（OpenAI、Anthropic、DeepSeek 等）
- **智能路由聚合** — 将多个模型组合成聚合规则，支持轮询、最低延迟、随机、顺序等多种策略
- **本地代理服务器** — 提供 OpenAI 兼容的 HTTP API（`/v1/chat/completions`），支持 SSE 流式响应
- **安全认证** — 内置本地认证令牌，防止代理被未授权访问
- **用量监控** — 仪表盘展示 Token 用量、请求数、活跃模型、平均响应时间等指标
- **多语言支持** — 简体中文 / English 界面切换

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 7 |
| 状态管理 | Zustand |
| 桌面框架 | Tauri 2 (Rust) |
| 代理服务器 | Axum (Rust) |
| HTTP 客户端 | reqwest |
| 图表 | Recharts |

## 环境要求

- **Node.js** >= 18
- **Rust** >= 1.77 (通过 [rustup](https://rustup.rs/) 安装)
- **系统依赖** (Tauri v2 要求):
  - Windows: WebView2 (Windows 10+ 自带)
  - macOS: 无需额外依赖
  - Linux: `webkit2gtk-4.1`, `libappindicator`

## 快速开始

```bash
# 安装前端依赖
npm install

# 启动开发模式（桌面窗口）
npm run tauri dev

# 仅启动前端开发服务器（浏览器）
npm run dev
```

## 构建

```bash
# 构建桌面安装包
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

### Windows 打包说明

- **安装包格式**: MSI （Windows Installer）和 NSIS 安装包
- **输出位置**: `src-tauri/target/release/bundle/msi/` 和 `src-tauri/target/release/bundle/nsis/`
- **代码签名**（可选）:
  1. 获取代码签名证书（如 DigiCert、Sectigo）
  2. 设置环境变量:
     ```bash
     $env:SIGNTOOL_PATH = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"
     $env:CERTIFICATE_THUMBPRINT = "你的证书指纹"
     ```
  3. 构建时自动签名: `npm run tauri build`
- **系统要求**: Windows 10+（WebView2 已预装）
- **静默安装**: `msiexec /i melody-hub_0.1.0_x64.msi /quiet`

## 开发

```bash
# 前端类型检查
npm run typecheck

# 后端检查
cd src-tauri && cargo check

# 运行后端测试
cd src-tauri && cargo test
```

## 数据目录

应用配置（提供商、聚合规则、设置）存储在 Tauri app data 目录：

| 平台 | 路径 |
|---|---|
| Windows | `%APPDATA%/com.melody-hub.app/melody-hub/` |
| macOS | `~/Library/Application Support/com.melody-hub.app/melody-hub/` |
| Linux | `~/.local/share/com.melody-hub.app/melody-hub/` |

## 安全说明

- 代理服务器绑定在 `127.0.0.1`，仅本地可访问
- API 端点需要 `Authorization: Bearer <token>` 认证（令牌在首次启动时自动生成）
- 健康检查 `/health` 无需认证
- CORS 默认仅允许 Tauri WebView 同源请求
- API Key 存储在本地 JSON 文件中（建议在 Windows 上配合 BitLocker 或 EFS 使用）

## 代理 API

启动代理后，本地服务监听在 `http://127.0.0.1:8080`：

```bash
# 健康检查
curl http://127.0.0.1:8080/health

# Chat Completions (需认证令牌)
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'

# 流式响应
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}], "stream": true}'
```

## 常见问题

**Q: 代理启动失败？**
检查端口是否被占用，默认端口 8080 可在设置中修改。

**Q: 配置的提供商在重启后丢失？**
确保应用正常退出（不要强制关闭），配置会在添加/修改时自动保存到数据目录。

**Q: 如何查看认证令牌？**
在设置页面的「安全与认证」分类中查看或修改本地认证令牌。

## 许可证

MIT