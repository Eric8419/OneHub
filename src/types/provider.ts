export interface Model {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  supportsReasoningEffort?: boolean;
  defaultReasoningEffort?: 'low' | 'medium' | 'high';
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
}
