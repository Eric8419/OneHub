export interface Model {
  id: string;
  name: string;
  /** Optional alias. Clients can call this alias instead of the
   *  real model name; the proxy resolves it back to `name`. */
  alias?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  supportsReasoningEffort?: boolean;
  defaultReasoningEffort?: 'low' | 'medium' | 'high';
  /** Whether the model supports OpenAI-style function/tool calls. */
  supportsToolCalls?: boolean;
  /** Whether the model supports `response_format: { type: "json_object" }`. */
  supportsJsonMode?: boolean;
}

export interface ProviderProxyConfig {
  enabled: boolean;
  /** Full proxy URL, e.g. "http://127.0.0.1:7890" or "socks5://127.0.0.1:1080". */
  url: string;
}

export interface Provider {
  id: string;
  name: string;
  apiBase: string;
  apiKey: string;
  status: 'connected' | 'configuring' | 'error' | 'disabled' | 'testing';
  models: Model[];
  apiFlavor?: string;
  /** True when `apiKey` holds ciphertext (disk form). Always
   * false for values returned to the UI at runtime. */
  apiKeyEncrypted?: boolean;
  /** Optional model name mapping. Keys are logical model names
   * (what the client requests); values are the actual model names
   * sent to the upstream provider. Keys support a trailing `*`
   * wildcard (e.g. "claude-*"). */
  modelMapping?: Record<string, string>;
  /** Optional per-provider HTTP proxy configuration. */
  proxyConfig?: ProviderProxyConfig;
}
