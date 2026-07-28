<p align="center">
  <img src="./public/brand/app-icon-1024.png" alt="Melody Hub" width="112" />
</p>

<h1 align="center">Melody Hub</h1>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.8-blue?style=flat-square" alt="version" />
  <img src="https://github.com/Lhy723/MelodyHub/actions/workflows/ci.yml/badge.svg" alt="ci" />
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square" alt="tauri" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square" alt="react" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="license" />
</p>

<p align="center">
  <em>A local-first LLM API gateway and desktop console.</em>
</p>


## Overview

Melody Hub is built with Tauri, React, and Rust. It unifies OpenAI, Anthropic, DeepSeek, and other OpenAI-compatible services behind a single local address. Manage providers and models, compose routing rules, and monitor request volumes, token usage, latency, and upstream health — all from a desktop interface.

**Core Features:**

- **Tri-Protocol Bidirectional Conversion** — OpenAI Chat Completions, Anthropic Messages, and OpenAI Responses can each access upstream services of the other two protocols, with SSE streaming conversion.
- **Multi-Provider & Model Management** — Built-in presets for common services, plus support for custom OpenAI-compatible APIs. Includes model aliases, capability parameters, and detail views.
- **Aggregation Routing & Failover** — Supports round-robin, lowest latency, random, and sequential strategies. Selects available models based on capability, concurrency, and upstream health.
- **Secure Local Configuration** — API Keys are encrypted with AES-256-GCM. An authentication token is auto-generated on first launch.
- **Usage & Health Monitoring** — Displays tokens, requests, response time, trends, heatmaps, recent requests, and provider health status.
- **Tunable Proxy Policies** — Supports rate limiting, timeout, retry, concurrency, IP allowlist, CORS, and upstream network proxy.
- **Desktop Experience** — Auto-save settings, Chinese/English i18n, themes and accent colors, system tray, and auto-start.
- **Local Logging** — Request records are persisted as rolling JSONL files, with export and direct log directory access.


## Screenshots

| Dashboard | Models | Settings |
|---|---|---|
| <img src="./docs/screenshots/dashboard.png" alt="Melody Hub Dashboard" width="280" /> | <img src="./docs/screenshots/models.png" alt="Melody Hub Models" width="280" /> | <img src="./docs/screenshots/settings.png" alt="Melody Hub Settings" width="280" /> |


## Installation

Download the appropriate installer from [GitHub Releases](https://github.com/Lhy723/MelodyHub/releases/latest):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `MelodyHub_*_aarch64.dmg` |
| macOS (Intel) | `MelodyHub_*_x64.dmg` |
| Windows | `MelodyHub_*_x64-setup.exe` |
| Linux | `melody-hub_*_amd64.deb` or `*.AppImage` |

On macOS, if you see "cannot be opened because the developer cannot be verified", go to System Settings → Privacy & Security and click "Open Anyway".

### System Requirements

- Windows 10+ with WebView2 Runtime
- macOS 10.15+
- Linux requires `webkit2gtk-4.1`, `libappindicator`, and other system dependencies

See [Development](#development) for build-from-source requirements.


## Usage

### Quick Start

1. Launch Melody Hub.
2. In "API Providers", configure providers with Base URL, API Key, and model list.
3. In "Model Config", view and manage aggregation rules to combine multiple models into routable logical models.
4. In "Settings", confirm the local proxy port, auth token, concurrency, and timeout settings.
5. In your client application, point the API Base URL to the Melody Hub local proxy and use the auth token from the Settings page.

Default proxy address:

```text
http://127.0.0.1:8080
```

### Supported Local Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Local proxy health check (no auth required). |
| `GET` | `/v1/models` | Returns currently routable models. |
| `GET` | `/v1/capabilities` | Returns protocol matrix, model capabilities, target configs, and current availability. |
| `POST` | `/v1/chat/completions` | OpenAI Chat Completions-compatible endpoint. |
| `POST` | `/v1/responses` | OpenAI Responses API-compatible endpoint. |
| `POST` | `/v1/messages` | Anthropic Messages API-compatible endpoint. |
| `POST` | `/v1/messages/count_tokens` | Returns estimated input token count (`estimated: true`). |
| `POST` | `/v1/responses/input_tokens` | Returns estimated input token count (`estimated: true`). |
| `*` | `/v1/images/*` | Image API passthrough. |
| `*` | `/v1/audio/*` | Audio API passthrough. |
| `*` | `/v1/files/*` | File API passthrough. |
| `*` | `/v1/batches/*` | Batch API passthrough. |

For image, audio, file, and batch requests without a unified model field, use
`x-melody-provider-id` to specify the upstream. When only one provider is configured, it is selected automatically.
These endpoints do not include Embeddings.

### Conversion & Degradation Rules

- Text, streaming text, tool definitions/selections/results, JSON Schema structured output, image/file inputs, and reasoning parameters are converted through an internal unified representation.
- When tool calls or structured output cannot be losslessly converted, a
  `capability_conversion_error` is returned (HTTP `422` on the request side); fields are never silently dropped.
- Other protocol differences follow representable-capability conversion. Responses carry
  `x-melody-upstream-protocol`, and explicit targets additionally carry `x-melody-target-id`.
- Aggregation targets can individually set upstream protocol, model name, priority, weight, timeout, and retry.
  Legacy configurations with only `models` continue to work under the original logic.

### Key Concepts

| Concept | Description |
|---------|-------------|
| Provider | An upstream model service, e.g. OpenAI, Anthropic, DeepSeek, or a custom compatible service. |
| Model | A specific model configuration under a Provider. |
| Aggregation | A routing rule that combines multiple models into a single routable logical model. |
| Routing Strategy | The selection strategy for aggregation: round-robin, lowest latency, random, sequential. |
| Proxy Auth Token | The Bearer Token for the Melody Hub local proxy, used to prevent unauthorized access. |

### Configuration Reference

<details>
<summary><b>Configuration Options</b></summary>

| Name | Default | Description |
|------|---------|-------------|
| `host` | `127.0.0.1` | Local proxy bind address. |
| `port` | `8080` | Local proxy listen port. |
| `autoStart` | `true` | Whether to auto-start the proxy on app launch. |
| `maxConcurrency` | `20` | Maximum concurrent requests. |
| `apiTimeout` | `60` | Upstream request timeout in seconds. |
| `authToken` | Generated on first launch | Bearer Token required to access proxy endpoints. |
| `proxyEnabled` | `false` | Whether to use a network proxy for upstream requests. |
| `rateLimit` | `0` | Requests per minute limit; `0` means unlimited. |
| `maxRetries` | `0` | Maximum retries on upstream request failure. |
| `logRetentionDays` | `30` | Local request log retention in days. |

</details>


## Development

### Prerequisites

- Node.js `^20.19.0 || >=22.12.0`
- pnpm `>= 9`
- Rust stable `>= 1.77` (via [rustup](https://rustup.rs/) recommended)
- macOS requires Xcode Command Line Tools
- Linux requires Tauri system dependencies (`webkit2gtk-4.1`, `libappindicator`, etc.)

### Run from Source

```bash
git clone https://github.com/Lhy723/MelodyHub.git
cd MelodyHub

pnpm install
pnpm tauri dev
```

### Build Installers

```bash
pnpm tauri build
```

Build artifacts are in `src-tauri/target/release/bundle/`.


## Data & Security

- The local proxy binds to `127.0.0.1` by default and is not exposed to the local network.
- `/health` requires no authentication; all other proxy endpoints require `Authorization: Bearer <token>`.
- API Keys are encrypted and stored in the Tauri app data directory.
- Request records are persisted as rolling JSONL files; export flushes in-memory records first.
- Upstream error responses are truncated to prevent excessively long errors from reaching the UI.

App data directories:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%/com.melody-hub.app/melody-hub/` |
| macOS | `~/Library/Application Support/com.melody-hub.app/melody-hub/` |
| Linux | `~/.local/share/com.melody-hub.app/melody-hub/` |


## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full version history.


## License

This project is licensed under the [MIT License](./LICENSE).



<p align="center">
  <sub>Built with Tauri, React and Rust by <a href="https://github.com/Lhy723">Lhy723</a></sub>
</p>
