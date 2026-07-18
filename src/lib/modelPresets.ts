// ═══════════════════════════════════════════════════════════════
// modelPresets — auto-fill Model metadata from name regex matching
// ═══════════════════════════════════════════════════════════════
// When a model is fetched from a provider's /models endpoint or
// added manually, we have only its name. This module applies
// known parameter presets based on regex matching against the
// model name, so users don't have to fill in contextWindow,
// maxOutputTokens, capability flags, etc. one by one.
//
// Patterns are evaluated in order; the FIRST match wins. More
// specific patterns must come before more general ones (e.g.
// "gpt-4-turbo" before "gpt-4", "deepseek-reasoner" before
// "deepseek-").
//
// Parameter sources: OpenRouter /api/v1/models (real-time),
// official vendor docs. All context lengths and output limits
// are verified against production API responses.
//
// After auto-fill, users can still manually edit any field in
// the model editor UI; presets are only applied at add time.
// ═══════════════════════════════════════════════════════════════

import type { Model } from '../types/provider';

type ReasoningEffort = NonNullable<Model['defaultReasoningEffort']>;

export interface ModelPreset {
  /** Regex tested against the model name (case-insensitive). */
  pattern: RegExp;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  supportsReasoningEffort?: boolean;
  defaultReasoningEffort?: ReasoningEffort;
  supportsToolCalls?: boolean;
  supportsJsonMode?: boolean;
}

// ── Presets ─────────────────────────────────────────────────
// Order matters: first match wins. Place specific patterns
// (e.g. "gpt-4-turbo") before generic ones (e.g. "gpt-4").
const PRESETS: ModelPreset[] = [
  // ═══════════════════════════════════════════════════════════
  // OpenAI
  // ═══════════════════════════════════════════════════════════

  // ── GPT-5.6 family (1.05M context, 128K output) ─────────
  // Luna / Terra / Sol variants all share 1,050,000 ctx.
  {
    pattern: /gpt-5\.6/i,
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-5.4-image-2 (272K ctx, 128K out, no tools) ──────
  // MUST come before /gpt-5\.[45]/ to win first-match.
  {
    pattern: /gpt-5\.4-image/i,
    contextWindow: 272000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsJsonMode: true,
  },
  // ── GPT-5.4-mini / nano (400K ctx, 128K out) ───────────
  // MUST come before /gpt-5\.[45]/ to win first-match.
  {
    pattern: /gpt-5\.4-(mini|nano)/i,
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-5.5 / GPT-5.5-pro / GPT-5.4 (1.05M ctx, 128K out)
  {
    pattern: /gpt-5\.[45]/i,
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-5.3-chat (128K ctx, 16K out, no reasoning) ──────
  {
    pattern: /gpt-5\.3-chat/i,
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-5.1/5.2 chat variants (128K ctx, 16K out) ──────
  // Lightweight chat-only variants — much smaller than full.
  {
    pattern: /gpt-5\.[12]-chat/i,
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-5.1-codex-mini (400K ctx, 100K out) ────────────
  {
    pattern: /gpt-5\.1-codex-mini/i,
    contextWindow: 400000,
    maxOutputTokens: 100000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-5.1 / GPT-5.2 (400K ctx, 128K out) ─────────────
  {
    pattern: /gpt-5\.[12]/i,
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── gpt-chat-latest (400K ctx, 128K out, no reasoning) ──
  {
    pattern: /gpt-chat-latest/i,
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-5-chat (128K ctx, 16K out, no tools, no reason) ─
  {
    pattern: /gpt-5-chat/i,
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsJsonMode: true,
  },
  // ── GPT-5-image / GPT-5-image-mini (400K, no tools) ────
  {
    pattern: /gpt-5-image/i,
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsJsonMode: true,
  },
  // ── GPT-5-codex (400K ctx, no reasoning effort) ─────────
  // MUST come before /gpt-5/ to win first-match.
  {
    pattern: /gpt-5-codex/i,
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-5 / GPT-5-mini / GPT-5-nano ────────────────────
  {
    pattern: /gpt-5/i,
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── OpenRouter "gpt-mini-latest" alias (400K ctx) ───────
  {
    pattern: /gpt-mini-latest/i,
    contextWindow: 400000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── OpenRouter "gpt-latest" alias (1.05M ctx) ───────────
  {
    pattern: /gpt-latest/i,
    contextWindow: 1050000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-OSS 120B / 20B (131K ctx, open) ────────────────
  // Safeguard variants have smaller max_output (65K).
  {
    pattern: /gpt-oss-safeguard/i,
    contextWindow: 131072,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  {
    pattern: /gpt-oss/i,
    contextWindow: 131072,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-audio / GPT-audio-mini (128K ctx, 16K out) ─────
  {
    pattern: /gpt-audio/i,
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-4.1 family (1M context) ─────────────────────────
  {
    pattern: /gpt-4\.1/i,
    contextWindow: 1047576,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-4o search-preview (no vision, no tools) ─────────
  // MUST come before /gpt-4o/ to win first-match.
  {
    pattern: /gpt-4o-(mini-)?search-preview/i,
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsJsonMode: true,
  },
  // ── GPT-4o-2024-05-13 (original release, 4K out) ────────
  // MUST come before /gpt-4o/ to win first-match.
  {
    pattern: /gpt-4o-2024-05-13/i,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── OpenAI GPT-4o family ─────────────────────────────────
  {
    pattern: /gpt-4o/i,
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── OpenAI o1-pro (no tools, vision supported) ──────────
  {
    pattern: /o1-pro/i,
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsVision: true,
    supportsReasoning: true,
    supportsJsonMode: true,
  },
  // ── OpenAI o3-mini (no vision, no effort) ───────────────
  // MUST come before /o[1-4]/ to win first-match.
  {
    pattern: /o3-mini/i,
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsReasoning: true,
    supportsToolCalls: true,
  },
  // ── OpenAI o-series reasoning models (o1, o3, o4) ───────
  // OpenRouter exposes reasoning but no supported_efforts.
  {
    pattern: /\bo[1-4]\b/i,
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
  },
  // ── GPT-4 Turbo Preview (text-only, no vision) ──────────
  {
    pattern: /gpt-4-turbo-preview/i,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-4 Turbo / GPT-4 Vision ──────────────────────────
  {
    pattern: /gpt-4-turbo|gpt-4-1106|gpt-4-0125|gpt-4-vision/i,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-4 original (8K, no vision) ──────────────────────
  {
    pattern: /gpt-4(?![o\d.])/i,
    contextWindow: 8191,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GPT-3.5 / GPT-3.5-turbo-instruct ────────────────────
  // -turbo-instruct is text-only, no tools.
  {
    pattern: /gpt-3\.5-turbo-instruct/i,
    contextWindow: 4095,
    maxOutputTokens: 4096,
    supportsJsonMode: true,
  },
  // ── GPT-3.5-turbo-0613 (legacy 4K ctx) ──────────────────
  // MUST come before /gpt-3\.5/ to win first-match.
  {
    pattern: /gpt-3\.5-turbo-0613/i,
    contextWindow: 4095,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  {
    pattern: /gpt-3\.5/i,
    contextWindow: 16385,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Anthropic Claude
  // ═══════════════════════════════════════════════════════════

  // ── Claude Sonnet 5 / Sonnet-latest (1M ctx, 128K out) ──
  {
    pattern: /claude-sonnet-5|claude-sonnet-latest/i,
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Claude Opus 4.7 / 4.8 / Opus-latest (1M ctx, 128K) ─
  {
    pattern: /claude-opus-4[.-]?[78]|claude-opus-latest/i,
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Claude Opus 4.6 (1M ctx, 128K out) ─────────────────
  {
    pattern: /claude-opus-4[.-]?6/i,
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Claude Sonnet 4.6 (1M ctx, 128K out) ───────────────
  {
    pattern: /claude-sonnet-4[.-]?6/i,
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Claude Opus 4.5 (200K ctx, 64K out, no effort ctrl) ─
  {
    pattern: /claude-opus-4[.-]?5/i,
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Claude Opus 4.1 / 4 (200K ctx, 32K out, no effort) ──
  {
    pattern: /claude-opus-4/i,
    contextWindow: 200000,
    maxOutputTokens: 32000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
  },
  // ── Claude Sonnet 4.5 / 4 (1M ctx, 64K out, no effort) ──
  {
    pattern: /claude-sonnet-4/i,
    contextWindow: 1000000,
    maxOutputTokens: 64000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
  },
  // ── Claude Fable 5 / Fable-latest (1M ctx, 128K out) ────
  {
    pattern: /claude-fable/i,
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Claude Haiku 4.5 / Haiku-latest (200K ctx, 64K out) ─
  {
    pattern: /claude-haiku-4[.-]?5|claude-haiku-latest/i,
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Claude 3.7 Sonnet (200K ctx, extended thinking) ────
  {
    pattern: /claude-3[.-]7-sonnet/i,
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
  },
  // ── Claude 3.5 Sonnet ───────────────────────────────────
  {
    pattern: /claude-3[.-]5-sonnet/i,
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
  },
  // ── Claude 3.5 Haiku ────────────────────────────────────
  {
    pattern: /claude-3[.-]5-haiku/i,
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
  },
  // ── Claude 3 Opus ───────────────────────────────────────
  {
    pattern: /claude-3-opus/i,
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsToolCalls: true,
  },
  // ── Claude 3 Haiku ──────────────────────────────────────
  {
    pattern: /claude-3-haiku/i,
    contextWindow: 200000,
    maxOutputTokens: 4096,
    supportsVision: true,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Google Gemini & Gemma
  // ═══════════════════════════════════════════════════════════

  // ── Gemini 3 Pro image variants (65K ctx, no tools) ─────
  // Image-gen variants have small ctx and no tool calls.
  {
    pattern: /gemini-3(\.[0-9]+)?-?pro-image/i,
    contextWindow: 65536,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsReasoning: true,
    supportsJsonMode: true,
  },
  // ── Gemini 3.1 flash-image (131K ctx, no tools) ─────────
  {
    pattern: /gemini-3\.1-flash-image/i,
    contextWindow: 131072,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsJsonMode: true,
  },
  // ── Gemini 3.1 flash-lite-image (65K ctx, no tools) ─────
  {
    pattern: /gemini-3\.1-flash-lite-image/i,
    contextWindow: 65536,
    maxOutputTokens: 66000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsJsonMode: true,
  },
  // ── Gemini 3.1 / 3.5 (1M ctx, 64K out, reasoning) ──────
  {
    pattern: /gemini-3\.[15]/i,
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Gemini 3 Pro / Flash (1M ctx, 65535 out) ────────────
  {
    pattern: /gemini-3/i,
    contextWindow: 1048576,
    maxOutputTokens: 65535,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── OpenRouter "gemini-pro-latest" / "gemini-flash-latest"
  {
    pattern: /gemini-(pro|flash)-latest/i,
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Gemini 2.5 Flash-image (32K ctx, small) ─────────────
  {
    pattern: /gemini-2\.5-flash-image/i,
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsVision: true,
  },
  // ── Gemini 2.5 Flash-Lite (1M ctx, 65K out) ─────────────
  {
    pattern: /gemini-2\.5-flash-lite/i,
    contextWindow: 1048576,
    maxOutputTokens: 65535,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Gemini 2.5 Flash (1M ctx, 65K out) ──────────────────
  {
    pattern: /gemini-2\.5-flash/i,
    contextWindow: 1048576,
    maxOutputTokens: 65535,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Gemini 2.5 Pro (1M ctx, 65536 out, reasoning) ───────
  {
    pattern: /gemini-2\.5/i,
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Gemini 2.0 Flash ────────────────────────────────────
  {
    pattern: /gemini-2\.0/i,
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Gemini 1.5 Pro (2M context) ─────────────────────────
  {
    pattern: /gemini-1\.5-pro/i,
    contextWindow: 2097152,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Gemini 1.5 Flash ────────────────────────────────────
  {
    pattern: /gemini-1\.5-flash/i,
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Google Gemma 4-26b (262K ctx, 256K out, multimodal) ──
  // MUST come before /gemma-?4/ to win first-match.
  {
    pattern: /gemma-?4-26b/i,
    contextWindow: 262144,
    maxOutputTokens: 256000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Google Gemma 4-31b (262K ctx, 16K out) ──────────────
  // MUST come before /gemma-?4/ to win first-match.
  {
    pattern: /gemma-?4-31b/i,
    contextWindow: 262144,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Google Gemma 4 generic (262K ctx, multimodal) ────────
  {
    pattern: /gemma-?4/i,
    contextWindow: 262144,
    maxOutputTokens: 256000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Google Gemma 3n (32K ctx, text-only, no tools) ──────
  {
    pattern: /gemma-?3n/i,
    contextWindow: 32768,
    maxOutputTokens: 16384,
    supportsJsonMode: true,
  },
  // ── Google Gemma 3-4b (128K ctx, no tools) ──────────────
  // MUST come before /gemma-?3/ to win first-match.
  {
    pattern: /gemma-?3-4b/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsJsonMode: true,
  },
  // ── Google Gemma 3-27b (128K ctx, 131K out) ─────────────
  // MUST come before /gemma-?3/ to win first-match.
  {
    pattern: /gemma-?3-27b/i,
    contextWindow: 131072,
    maxOutputTokens: 131072,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Google Gemma 3 (128K ctx, multimodal, 16K out) ──────
  {
    pattern: /gemma-?3/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Google Gemma 2 (8K ctx, 2K out, text-only) ──────────
  {
    pattern: /gemma-?2/i,
    contextWindow: 8192,
    maxOutputTokens: 2048,
  },

  // ═══════════════════════════════════════════════════════════
  // xAI Grok
  // ═══════════════════════════════════════════════════════════

  // ── Grok 4.20 multi-agent (2M ctx, no tools) ────────────
  // MUST come before /grok-4\.2/ to win first-match.
  {
    pattern: /grok-4\.20-multi-agent/i,
    contextWindow: 2000000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsJsonMode: true,
  },
  // ── Grok 4.20 (2M ctx, no effort) ───────────────────────
  {
    pattern: /grok-4\.2/i,
    contextWindow: 2000000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Grok 4 Fast (2M ctx, low-cost reasoning) ────────────
  {
    pattern: /grok-4-fast|grok-4\.1-fast/i,
    contextWindow: 2000000,
    maxOutputTokens: 30000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
  },
  // ── Grok 4.5 (500K ctx) ─────────────────────────────────
  {
    pattern: /grok-4\.5/i,
    contextWindow: 500000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
  },
  // ── Grok 4.3 (1M ctx) ───────────────────────────────────
  {
    pattern: /grok-4\.3/i,
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
  },
  // ── Grok 4 (256K ctx) ───────────────────────────────────
  {
    pattern: /grok-4/i,
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
  },
  // ── Grok 3 ──────────────────────────────────────────────
  {
    pattern: /grok-3/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
  },
  // ── Grok 2.5 (128K ctx, reasoning) ──────────────────────
  {
    pattern: /grok-2\.5/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
  },
  // ── Grok 2 (128K ctx) ───────────────────────────────────
  {
    pattern: /grok-2/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // DeepSeek
  // ═══════════════════════════════════════════════════════════

  // ── DeepSeek V4-Pro (1M ctx, 384K out) ──────────────────
  {
    pattern: /deepseek-v4-pro/i,
    contextWindow: 1048576,
    maxOutputTokens: 384000,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── DeepSeek V4-Flash (1M ctx, 384K out) ──────────────────
  {
    pattern: /deepseek-v4/i,
    contextWindow: 1048576,
    maxOutputTokens: 384000,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── DeepSeek V3.2 (163K ctx, 65K out, reasoning) ────────
  {
    pattern: /deepseek-v3\.2/i,
    contextWindow: 163840,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── DeepSeek V3.1-terminus (131K ctx, 32K out) ──────────
  {
    pattern: /deepseek-v3\.1-terminus/i,
    contextWindow: 131072,
    maxOutputTokens: 32768,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── DeepSeek V3.1 / chat-v3.1 (163K ctx, 32K out) ───────
  {
    pattern: /deepseek-v3\.1|deepseek-chat-v3\.1/i,
    contextWindow: 163840,
    maxOutputTokens: 32768,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── DeepSeek R1-distill (128K ctx, 8K out, no tools) ────
  // MUST come before /deepseek-r1/ to win first-match.
  {
    pattern: /deepseek-r1-distill/i,
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsReasoning: true,
  },
  // ── DeepSeek R1-0528 (163K ctx, 32K out) ────────────────
  // MUST come before /deepseek-r1/ to win first-match.
  {
    pattern: /deepseek-r1-0528/i,
    contextWindow: 163840,
    maxOutputTokens: 32768,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── DeepSeek R1 base (163K ctx, 16K out) ────────────────
  {
    pattern: /deepseek-r1/i,
    contextWindow: 163840,
    maxOutputTokens: 16000,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── DeepSeek chat-v3-0324 (163K ctx, 65K out) ───────────
  {
    pattern: /deepseek-chat-v3/i,
    contextWindow: 163840,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── DeepSeek Chat (131K ctx, 16K out) ───────────────────
  {
    pattern: /deepseek/i,
    contextWindow: 131072,
    maxOutputTokens: 16000,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Alibaba Qwen 通义千问
  // ═══════════════════════════════════════════════════════════

  // ── Qwen3.7-plus / flash (1M ctx, vision, no effort) ────
  {
    pattern: /qwen-?3\.7-(plus|flash)/i,
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3.7-max (1M ctx, text-only, no effort) ──────────
  {
    pattern: /qwen-?3\.7-max/i,
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3.7 generic (1M ctx, no effort) ─────────────────
  {
    pattern: /qwen-?3\.7/i,
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3.6-plus / flash (1M ctx, vision, no effort) ────
  // MUST come before /qwen-?3\.6/ to win first-match.
  {
    pattern: /qwen-?3\.6-(plus|flash)/i,
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3.6-35b-a3b (262K ctx, 262K out, vision) ────────
  {
    pattern: /qwen-?3\.6-35b/i,
    contextWindow: 262144,
    maxOutputTokens: 262144,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3.6-max-preview (262K ctx, text-only) ───────────
  {
    pattern: /qwen-?3\.6-max/i,
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3.6 generic (262K ctx, no effort) ───────────────
  {
    pattern: /qwen-?3\.6/i,
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3.5-flash / plus (1M ctx, no effort) ────────────
  {
    pattern: /qwen-?3\.5-(flash|plus)/i,
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3.5-9b / 35b-a3b (262K ctx, 262K out) ───────────
  // MUST come before /qwen-?3\.5/ to win first-match.
  {
    pattern: /qwen-?3\.5-(9b|35b)/i,
    contextWindow: 262144,
    maxOutputTokens: 262144,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3.5 generic (262K ctx, 65K out, no effort) ──────
  {
    pattern: /qwen-?3\.5/i,
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-coder-next (262K ctx, 262K out, no reasoning) ──
  {
    pattern: /qwen-?3-coder-next/i,
    contextWindow: 262144,
    maxOutputTokens: 262144,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-coder-30b-a3b-instruct (160K ctx, no reasoning)
  {
    pattern: /qwen-?3-coder-30b/i,
    contextWindow: 160000,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-coder-plus / coder-flash (1M ctx, 65K out) ────
  // MUST come before /qwen-?3-coder/ to win first-match.
  {
    pattern: /qwen-?3-coder-(plus|flash)/i,
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-coder / coder-plus / coder-flash (1M, no reason)
  {
    pattern: /qwen-?3-coder/i,
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-VL-8b (256K ctx, 32K out, vision) ─────────────
  // MUST come before /qwen-?3-vl/ to win first-match.
  {
    pattern: /qwen-?3-vl-8b/i,
    contextWindow: 256000,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-VL-235b / 30b-a3b-thinking (131K ctx, vision) ──
  // MUST come before /qwen-?3-vl/ to win first-match.
  {
    pattern: /qwen-?3-vl-(235b|30b-a3b-thinking)/i,
    contextWindow: 131072,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-VL (vision-language, 262K ctx, 32K out) ───────
  {
    pattern: /qwen-?3-vl/i,
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-next-instruct (262K ctx, 262K out, no reasoning) ─
  // MUST come before /qwen-?3-next/ to win first-match.
  {
    pattern: /qwen-?3-next-.*instruct/i,
    contextWindow: 262144,
    maxOutputTokens: 262144,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-next-thinking (262K ctx, 32K out, reasoning) ───
  {
    pattern: /qwen-?3-next/i,
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-Max (262K ctx, 32K out, no effort) ────────────
  {
    pattern: /qwen-?3[.-]?max/i,
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-235b-a22b-thinking-2507 (262K ctx, reasoning) ─
  // MUST come before /qwen-?3-235b/ and /qwen-?3/ to win.
  {
    pattern: /qwen-?3-235b-a22b-thinking-2507/i,
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-235b-a22b-2507 (262K ctx, no reasoning) ───────
  // MUST come before /qwen-?3-235b/ and /qwen-?3/ to win.
  {
    pattern: /qwen-?3-235b-a22b-2507/i,
    contextWindow: 262144,
    maxOutputTokens: 16384,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-30b-a3b-instruct-2507 (262K ctx, no reasoning) ─
  // MUST come before /qwen-?3-30b/ and /qwen-?3/ to win.
  {
    pattern: /qwen-?3-30b-a3b-instruct-2507/i,
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-30b-a3b-thinking-2507 (131K ctx, 32K out, reasoning)
  // MUST come before /qwen-?3-30b/ and /qwen-?3/ to win.
  {
    pattern: /qwen-?3-30b-a3b-thinking-2507/i,
    contextWindow: 131072,
    maxOutputTokens: 32768,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-235b-a22b (131K ctx, 8K out) ──────────────────
  {
    pattern: /qwen-?3-235b/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-32b (131K ctx, 16K out) ───────────────────────
  {
    pattern: /qwen-?3-32b/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-30b-a3b (131K ctx, 16K out) ───────────────────
  {
    pattern: /qwen-?3-30b/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-14b (131K ctx, 40K out) ───────────────────────
  {
    pattern: /qwen-?3-14b/i,
    contextWindow: 131702,
    maxOutputTokens: 40960,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3-8b (131K ctx, 8K out) ─────────────────────────
  {
    pattern: /qwen-?3-8b/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen3 (131K ctx, reasoning + tools, no effort) ──────
  {
    pattern: /qwen-?3/i,
    contextWindow: 131072,
    maxOutputTokens: 32768,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen-plus (1M ctx, 32K out) ─────────────────────────
  {
    pattern: /qwen-plus/i,
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen2.5-VL (vision, 131K ctx, 128K out) ─────────────
  {
    pattern: /qwen-?2\.5-vl|qwen-?vl/i,
    contextWindow: 131072,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsJsonMode: true,
  },
  // ── Qwen2.5-coder (128K ctx) ────────────────────────────
  {
    pattern: /qwen-?2\.5-coder/i,
    contextWindow: 128000,
    maxOutputTokens: 32768,
  },
  // ── Qwen2.5-72b (131K ctx, 16K out) ─────────────────────
  // MUST come before /qwen-?2\.5/ to win first-match.
  {
    pattern: /qwen-?2\.5-72b/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen2.5 (131K ctx, tool calls) ──────────────────────
  {
    pattern: /qwen-?2\.5/i,
    contextWindow: 131072,
    maxOutputTokens: 32768,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Qwen2 (32K ctx) ─────────────────────────────────────
  {
    pattern: /qwen-?2(?!\.)/i,
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
  },
  // ── Qwen Max / Turbo ────────────────────────────────────
  {
    pattern: /qwen-(max|turbo)/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Moonshot AI Kimi
  // ═══════════════════════════════════════════════════════════

  // ── Kimi K2-thinking / kimi-latest (262K ctx, no vision) ─
  // K2-thinking is text-only despite the "thinking" branding.
  {
    pattern: /kimi-?k2-?thinking|kimi-latest/i,
    contextWindow: 262144,
    maxOutputTokens: 262144,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Kimi K2.5+ / K2.7-code (262K ctx, 262K out, vision) ─
  {
    pattern: /kimi-?k2\.[5-9]/i,
    contextWindow: 262144,
    maxOutputTokens: 262144,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Kimi K2-0905 (262K ctx, 100K out) ───────────────────
  {
    pattern: /kimi-?k2-?0905/i,
    contextWindow: 262144,
    maxOutputTokens: 100352,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Kimi K2 (131K ctx, 100K out) ────────────────────────
  {
    pattern: /kimi-?k2/i,
    contextWindow: 131072,
    maxOutputTokens: 100352,
    supportsToolCalls: true,
  },
  // ── Moonshot v1 (128K context) ──────────────────────────
  {
    pattern: /moonshot-v1/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Zhipu AI GLM 智谱
  // ═══════════════════════════════════════════════════════════

  // ── GLM-5.2 (1M ctx, 131K out, reasoning) ───────────────
  {
    pattern: /glm-5\.2/i,
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-5.1 (202K ctx, 128K out) ────────────────────────
  {
    pattern: /glm-5\.1/i,
    contextWindow: 202752,
    maxOutputTokens: 128000,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-5v-turbo (202K ctx, 131K out, vision) ───────────
  {
    pattern: /glm-5v-turbo/i,
    contextWindow: 202752,
    maxOutputTokens: 131072,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-5-turbo (202K ctx, 131K out, no vision, no effort)
  // MUST come before /glm-5/ to win first-match.
  {
    pattern: /glm-5-turbo/i,
    contextWindow: 202752,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-5 (202K ctx, 202K out) ──────────────────────────
  {
    pattern: /glm-5/i,
    contextWindow: 202752,
    maxOutputTokens: 202752,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-4.7-flash (200K ctx, 131K out) ──────────────────
  {
    pattern: /glm-4\.7-flash/i,
    contextWindow: 200000,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-4.7 (202K ctx, 131K out) ────────────────────────
  {
    pattern: /glm-4\.7/i,
    contextWindow: 202752,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-4.6v (131K ctx, 32K out, vision) ────────────────
  {
    pattern: /glm-4\.6v/i,
    contextWindow: 131072,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-4.6 (202K ctx, 131K out) ────────────────────────
  {
    pattern: /glm-4\.6/i,
    contextWindow: 202752,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-4.5v (65K ctx, 16K out, vision) ─────────────────
  {
    pattern: /glm-4\.5v/i,
    contextWindow: 65536,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-4.5-air (131K ctx, 98K out, no JSON) ────────────
  {
    pattern: /glm-4\.5-air/i,
    contextWindow: 131072,
    maxOutputTokens: 98304,
    supportsReasoning: true,
    supportsToolCalls: true,
  },
  // ── GLM-4.5 (131K ctx, 98K out) ─────────────────────────
  {
    pattern: /glm-4\.5/i,
    contextWindow: 131072,
    maxOutputTokens: 98304,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── GLM-4 (general, 128K ctx) ───────────────────────────
  {
    pattern: /glm-4/i,
    contextWindow: 131072,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Meta Llama
  // ═══════════════════════════════════════════════════════════

  // ── Hermes-3 (llama-3.1 based, no tools, no JSON) ───────
  // MUST come before /llama-?3\.[12]/ to win first-match.
  {
    pattern: /hermes-3/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
  },
  // ── Aion-rp (llama-3.1 based, 32K ctx, no tools) ────────
  // MUST come before /llama-?3\.[12]/ to win first-match.
  {
    pattern: /aion-rp/i,
    contextWindow: 32768,
    maxOutputTokens: 32768,
  },
  // ── Llama 4 Scout (10M context) ─────────────────────────
  {
    pattern: /llama-?4-scout/i,
    contextWindow: 10000000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Llama 4 Maverick (1M context) ───────────────────────
  {
    pattern: /llama-?4-maverick/i,
    contextWindow: 1048576,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Llama-3.3-nemotron-super (131K ctx, 16K out) ────────
  // MUST come before /llama-?3\.3/ to win first-match.
  {
    pattern: /nemotron-super/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Llama 3.3 (128K ctx, 128K out) ──────────────────────
  {
    pattern: /llama-?3\.3/i,
    contextWindow: 131072,
    maxOutputTokens: 128000,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Llama 3.2 vision (128K ctx, 16K out, vision) ────────
  {
    pattern: /llama-?3\.2-.*vision/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsJsonMode: true,
  },
  // ── Llama 3.2-1b (128K ctx, 60K out, no tools) ──────────
  // MUST come before /llama-?3\.[12]/ to win first-match.
  {
    pattern: /llama-?3\.2-1b/i,
    contextWindow: 131072,
    maxOutputTokens: 60000,
  },
  // ── Llama 3.2-3b (128K ctx, 80K out, no tools) ──────────
  // MUST come before /llama-?3\.[12]/ to win first-match.
  {
    pattern: /llama-?3\.2-3b/i,
    contextWindow: 131072,
    maxOutputTokens: 80000,
  },
  // ── Llama 3.1-8b (128K ctx, 131K out) ───────────────────
  // MUST come before /llama-?3\.[12]/ to win first-match.
  {
    pattern: /llama-?3\.1-8b/i,
    contextWindow: 131072,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Llama 3.2 / 3.1 (128K context) ──────────────────────
  {
    pattern: /llama-?3\.[12]/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Llama 3 base (8K context) ───────────────────────────
  {
    pattern: /llama-?3(?!\.)/i,
    contextWindow: 8192,
    maxOutputTokens: 4096,
  },
  // ── Llama 2 (4K context) ────────────────────────────────
  {
    pattern: /llama-?2/i,
    contextWindow: 4096,
    maxOutputTokens: 4096,
  },

  // ═══════════════════════════════════════════════════════════
  // Mistral AI
  // ═══════════════════════════════════════════════════════════

  // ── Mistral Large 2512 (262K ctx, vision) ───────────────
  {
    pattern: /mistral-large-2512/i,
    contextWindow: 262144,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mistral Large 2407 (131K ctx) ───────────────────────
  // MUST come before /mistral-large/ to win first-match.
  {
    pattern: /mistral-large-2407/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mistral Large 2 (128K ctx) ──────────────────────────
  {
    pattern: /mistral-large/i,
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mistral Medium 3.5 (262K ctx, reasoning) ────────────
  {
    pattern: /mistral-medium-3[.-]5/i,
    contextWindow: 262144,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mistral Medium 3.1 / 3 (131K ctx) ───────────────────
  {
    pattern: /mistral-medium/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mistral Small 2603 (262K ctx, reasoning) ────────────
  {
    pattern: /mistral-small-2603/i,
    contextWindow: 262144,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mistral Small 3.1-24b (128K ctx, 128K out, no tools) ─
  // MUST come before /mistral-small-3/ to win first-match.
  {
    pattern: /mistral-small-3\.1/i,
    contextWindow: 128000,
    maxOutputTokens: 128000,
    supportsVision: true,
  },
  // ── Mistral Small 3.x (128-131K ctx) ────────────────────
  {
    pattern: /mistral-small-3/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsVision: true,
  },
  // ── Mistral Small 24b-instruct-2501 (32K ctx, no tools) ──
  // MUST come before /mistral-small/ to win first-match.
  {
    pattern: /mistral-small-24b-instruct-2501/i,
    contextWindow: 32768,
    maxOutputTokens: 16384,
    supportsJsonMode: true,
  },
  // ── Mistral Small (32K ctx) ─────────────────────────────
  {
    pattern: /mistral-small/i,
    contextWindow: 32000,
    maxOutputTokens: 16384,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Ministral 14B/8B 2512 (262K ctx, vision) ────────────
  {
    pattern: /ministral-(14b|8b)-2512/i,
    contextWindow: 262144,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Ministral 3B 2512 (131K ctx) ────────────────────────
  {
    pattern: /ministral-3b/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Devstral (262K ctx, coding) ─────────────────────────
  {
    pattern: /devstral/i,
    contextWindow: 262144,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Codestral (256K ctx, coding) ────────────────────────
  {
    pattern: /codestral/i,
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Pixtral (vision, 131K ctx) ──────────────────────────
  {
    pattern: /pixtral/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
  },
  // ── Mistral Nemo (131K ctx) ─────────────────────────────
  {
    pattern: /mistral-nemo/i,
    contextWindow: 131072,
    maxOutputTokens: 16384,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mixtral 8x22B (65K ctx) ─────────────────────────────
  {
    pattern: /mixtral/i,
    contextWindow: 65536,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mistral Saba (32K ctx) ──────────────────────────────
  {
    pattern: /mistral-saba/i,
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },

  // ═══════════════════════════════════════════════════════════
  // MiniMax
  // ═══════════════════════════════════════════════════════════

  // ── MiniMax M3 (1M ctx, 512K out, vision + reasoning) ───
  {
    pattern: /minimax-m3/i,
    contextWindow: 1048576,
    maxOutputTokens: 512000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── MiniMax M2-her (65K ctx, 2K out, no tools) ──────────
  // MUST come before /minimax-m2/ to win first-match.
  {
    pattern: /minimax-m2-her/i,
    contextWindow: 65536,
    maxOutputTokens: 2048,
  },
  // ── MiniMax M2.5 (204K ctx, 196K out) ───────────────────
  // MUST come before /minimax-m2/ to win first-match.
  {
    pattern: /minimax-m2\.5/i,
    contextWindow: 204800,
    maxOutputTokens: 196608,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── MiniMax M2.x (204K ctx, 131K out) ───────────────────
  {
    pattern: /minimax-m2/i,
    contextWindow: 204800,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── MiniMax M1 (1M ctx, 40K out, reasoning) ─────────────
  {
    pattern: /minimax-m1/i,
    contextWindow: 1000000,
    maxOutputTokens: 40000,
    supportsReasoning: true,
    supportsToolCalls: true,
  },
  // ── MiniMax-01 / Text-01 (1M ctx, 1M out, vision) ───────
  {
    pattern: /minimax-01|minimax-text-01/i,
    contextWindow: 1000192,
    maxOutputTokens: 1000192,
    supportsVision: true,
  },

  // ═══════════════════════════════════════════════════════════
  // StepFun 阶跃星辰
  // ═══════════════════════════════════════════════════════════

  // ── Step-3.7-flash (256K ctx, 256K out, multimodal) ─────
  {
    pattern: /step-?3\.7/i,
    contextWindow: 256000,
    maxOutputTokens: 256000,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Step-3.5-flash (262K ctx, 65K out) ──────────────────
  {
    pattern: /step-?3\.5/i,
    contextWindow: 262144,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsToolCalls: true,
  },
  // ── Step-3 (32K ctx, multimodal reasoning) ──────────────
  {
    pattern: /step-?3/i,
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
  },
  // ── Step-2 (32K ctx) ────────────────────────────────────
  {
    pattern: /step-?2/i,
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
  },
  // ── Step-1V (vision, 32K ctx) ───────────────────────────
  {
    pattern: /step-?1v/i,
    contextWindow: 32768,
    maxOutputTokens: 4096,
    supportsVision: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Tencent 腾讯
  // ═══════════════════════════════════════════════════════════

  // ── Tencent HY3-preview (262K ctx, reasoning, no JSON) ──
  // MUST come before /hy3/ to win first-match.
  {
    pattern: /hy3-preview/i,
    contextWindow: 262144,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
  },
  // ── Tencent HY3 (262K ctx, 131K out, reasoning + JSON) ─
  {
    pattern: /hy3/i,
    contextWindow: 262144,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Hunyuan-A13B (131K ctx, 131K out) ───────────────────
  {
    pattern: /hunyuan-a13b/i,
    contextWindow: 131072,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsJsonMode: true,
  },
  // ── Hunyuan-Large (256K ctx) ────────────────────────────
  {
    pattern: /hunyuan-large/i,
    contextWindow: 262144,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
  },
  // ── Hunyuan-T1 / Reasoner (reasoning, 256K ctx) ─────────
  {
    pattern: /hunyuan-t1|hunyuan.*reason/i,
    contextWindow: 262144,
    maxOutputTokens: 8192,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
  },
  // ── Hunyuan generic (32K ctx) ───────────────────────────
  {
    pattern: /hunyuan/i,
    contextWindow: 32768,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // ByteDance Seed 豆包
  // ═══════════════════════════════════════════════════════════

  // ── Seed 2.0 (262K ctx, 131K out, multimodal reasoning) ─
  {
    pattern: /seed-2/i,
    contextWindow: 262144,
    maxOutputTokens: 131072,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Seed 1.6 (262K ctx, 32K out) ────────────────────────
  {
    pattern: /seed-1\.6/i,
    contextWindow: 262144,
    maxOutputTokens: 32768,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Doubao 1.5 Pro (256K ctx, 12K out) ──────────────────
  {
    pattern: /doubao-?1\.5/i,
    contextWindow: 262144,
    maxOutputTokens: 12288,
    supportsVision: true,
    supportsToolCalls: true,
  },
  // ── Doubao generic (32K ctx) ────────────────────────────
  {
    pattern: /doubao/i,
    contextWindow: 32768,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Amazon Nova
  // ═══════════════════════════════════════════════════════════

  // ── Nova 2 Lite (1M ctx, 65535 out, reasoning) ──────────
  {
    pattern: /nova-2-lite/i,
    contextWindow: 1000000,
    maxOutputTokens: 65535,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
  },
  // ── Nova Premier (1M ctx, 32K out, no reasoning) ────────
  {
    pattern: /nova-premier/i,
    contextWindow: 1000000,
    maxOutputTokens: 32000,
    supportsVision: true,
    supportsToolCalls: true,
  },
  // ── Nova Pro / Lite (300K ctx) ──────────────────────────
  {
    pattern: /nova-pro|nova-lite/i,
    contextWindow: 300000,
    maxOutputTokens: 5120,
    supportsVision: true,
    supportsToolCalls: true,
  },
  // ── Nova Micro (128K ctx) ───────────────────────────────
  {
    pattern: /nova-micro/i,
    contextWindow: 128000,
    maxOutputTokens: 5120,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // NVIDIA Nemotron
  // ═══════════════════════════════════════════════════════════

  // ── Nemotron 3 Ultra / Super (1M ctx, reasoning) ────────
  {
    pattern: /nemotron-3-(ultra|super)/i,
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Nemotron 3 Nano Omni (256K ctx, 65K out, vision) ────
  // MUST come before /nemotron-3-nano/ to win first-match.
  {
    pattern: /nemotron-3-nano-omni/i,
    contextWindow: 256000,
    maxOutputTokens: 65536,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
  },
  // ── Nemotron 3 Nano (262K ctx, 228K out) ────────────────
  {
    pattern: /nemotron-3-nano/i,
    contextWindow: 262144,
    maxOutputTokens: 228000,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Nemotron Nano 12B VL (128K ctx, 128K out, vision) ───
  {
    pattern: /nemotron-nano.*vl/i,
    contextWindow: 128000,
    maxOutputTokens: 128000,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Xiaomi Mimo
  // ═══════════════════════════════════════════════════════════

  // ── Mimo v2.5-pro (1M ctx, 131K out, text-only, reasoning) ─
  // MUST come before /mimo-v2/ to win first-match.
  {
    pattern: /mimo-v2\.5-pro|mimo-v2-5-pro/i,
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mimo v2.5 (1M ctx, 131K out, vision + reasoning) ────
  {
    pattern: /mimo-v2/i,
    contextWindow: 1048576,
    maxOutputTokens: 131072,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Baidu Ernie 文心一言
  // ═══════════════════════════════════════════════════════════

  // ── Ernie 4.5 VL (131K ctx, 16K out, vision reasoning) ──
  {
    pattern: /ernie-4\.5/i,
    contextWindow: 131072,
    maxOutputTokens: 16000,
    supportsVision: true,
    supportsReasoning: true,
  },

  // ═══════════════════════════════════════════════════════════
  // 01.AI Yi 零一万物
  // ═══════════════════════════════════════════════════════════

  {
    pattern: /yi-lightning/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
  },
  {
    pattern: /yi-large/i,
    contextWindow: 32768,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
  },
  {
    pattern: /yi-vl/i,
    contextWindow: 32768,
    maxOutputTokens: 4096,
    supportsVision: true,
  },

  // ═══════════════════════════════════════════════════════════
  // iFlytek Spark 讯飞星火
  // ═══════════════════════════════════════════════════════════

  {
    pattern: /spark-?4|spark.*ultra/i,
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsToolCalls: true,
  },
  {
    pattern: /spark.*max/i,
    contextWindow: 32768,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
  },
  {
    pattern: /spark/i,
    contextWindow: 8192,
    maxOutputTokens: 4096,
  },

  // ═══════════════════════════════════════════════════════════
  // Microsoft Phi
  // ═══════════════════════════════════════════════════════════

  // ── Phi-4 (14B, 16K ctx) ────────────────────────────────
  {
    pattern: /phi-?4/i,
    contextWindow: 16384,
    maxOutputTokens: 16384,
    supportsJsonMode: true,
  },
  // ── Phi-3.5 / Phi-3 (128K Mini variant) ─────────────────
  {
    pattern: /phi-?3/i,
    contextWindow: 131072,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Cohere
  // ═══════════════════════════════════════════════════════════

  // ── Command A (256K ctx) ────────────────────────────────
  {
    pattern: /command-a/i,
    contextWindow: 256000,
    maxOutputTokens: 8192,
    supportsJsonMode: true,
  },
  // ── Command R+ (128K ctx, tool calls + JSON) ────────────
  {
    pattern: /command-r-plus/i,
    contextWindow: 128000,
    maxOutputTokens: 4000,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Command R (128K ctx, tool calls) ────────────────────
  {
    pattern: /command-r\b/i,
    contextWindow: 128000,
    maxOutputTokens: 4000,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Aya Expanse (128K ctx, multilingual) ────────────────
  {
    pattern: /aya-expanse/i,
    contextWindow: 131072,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
  },
  {
    pattern: /aya-?23/i,
    contextWindow: 32000,
    maxOutputTokens: 8192,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Perplexity Sonar (online search-augmented)
  // ═══════════════════════════════════════════════════════════

  // ── Sonar Pro / Sonar Pro Search (200K ctx, search, no JSON)
  {
    pattern: /sonar-pro/i,
    contextWindow: 200000,
    maxOutputTokens: 8000,
    supportsVision: true,
  },
  // ── Sonar Deep Research (128K ctx, no vision, reasoning) ─
  // MUST come before /sonar-reasoning/ to win first-match.
  {
    pattern: /sonar-deep-research/i,
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsReasoning: true,
  },
  // ── Sonar Reasoning (128K ctx, search + reasoning) ──────
  {
    pattern: /sonar-reasoning/i,
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
  },
  // ── Sonar (127K ctx, online search) ─────────────────────
  {
    pattern: /sonar/i,
    contextWindow: 127072,
    maxOutputTokens: 8192,
    supportsVision: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Reka
  // ═══════════════════════════════════════════════════════════

  // ── Reka Flash 3 (65K ctx, reasoning, no JSON) ──────────
  {
    pattern: /reka-flash/i,
    contextWindow: 65536,
    maxOutputTokens: 65536,
    supportsReasoning: true,
  },
  // ── Reka Edge (16K ctx, vision) ─────────────────────────
  {
    pattern: /reka-edge/i,
    contextWindow: 16384,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsReasoning: true,
    supportsToolCalls: true,
  },

  // ═══════════════════════════════════════════════════════════
  // Other notable models
  // ═══════════════════════════════════════════════════════════

  // ── xAI grok-latest alias (500K ctx) ────────────────────
  {
    pattern: /grok-latest/i,
    contextWindow: 500000,
    maxOutputTokens: 8192,
    supportsVision: true,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── NousResearch Hermes-4 (131K ctx, reasoning, no tools)
  {
    pattern: /hermes-4/i,
    contextWindow: 131072,
    supportsReasoning: true,
    supportsJsonMode: true,
  },
  // ── AI21 Jamba (256K ctx, 4K out) ────────────────────────
  {
    pattern: /jamba/i,
    contextWindow: 256000,
    maxOutputTokens: 4096,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── IBM Granite 4.1 (131K ctx, 131K out) ────────────────
  {
    pattern: /granite-4\.1/i,
    contextWindow: 131072,
    maxOutputTokens: 131072,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── IBM Granite 4.0 (131K ctx, 131K out, no tools) ──────
  {
    pattern: /granite-4\.0/i,
    contextWindow: 131000,
    maxOutputTokens: 131000,
    supportsJsonMode: true,
  },
  // ── AllenAI OLMo 3 (65K ctx, reasoning, no tools) ───────
  {
    pattern: /olmo-?3/i,
    contextWindow: 65536,
    maxOutputTokens: 65536,
    supportsReasoning: true,
    supportsJsonMode: true,
  },
  // ── NVIDIA Nemotron Nano 9b (128K ctx, reasoning) ───────
  // MUST come before /nemotron-nano.*vl/ to win first-match.
  {
    pattern: /nemotron-nano-9b/i,
    contextWindow: 128000,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Inception Mercury (128K ctx, 50K out, reasoning) ────
  {
    pattern: /mercury/i,
    contextWindow: 128000,
    maxOutputTokens: 50000,
    supportsReasoning: true,
    supportsReasoningEffort: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── DeepCogito Cogito (128K ctx, reasoning, no tools) ───
  {
    pattern: /cogito/i,
    contextWindow: 128000,
    supportsReasoning: true,
    supportsJsonMode: true,
  },
  // ── Kwaipilot Kat Coder (256K ctx, 80K out) ─────────────
  {
    pattern: /kat-coder/i,
    contextWindow: 256000,
    maxOutputTokens: 80000,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Mistral Voxtral (32K ctx, speech model) ─────────────
  {
    pattern: /voxtral/i,
    contextWindow: 32000,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
  // ── Upstage Solar Pro (128K ctx, reasoning) ─────────────
  {
    pattern: /solar/i,
    contextWindow: 128000,
    supportsReasoning: true,
    supportsToolCalls: true,
    supportsJsonMode: true,
  },
];

// ── Public API ──────────────────────────────────────────────

/**
 * Resolve a model name to its preset (first match wins).
 * Returns `undefined` if no preset matches.
 */
export function findModelPreset(name: string): ModelPreset | undefined {
  for (const preset of PRESETS) {
    if (preset.pattern.test(name)) return preset;
  }
  return undefined;
}

/**
 * Build a partial Model patch from a name by applying the matching
 * preset. Returns an empty object if no preset matches.
 * Omits the `pattern` field from the returned patch.
 */
export function applyModelPreset(name: string): Partial<Model> {
  const preset = findModelPreset(name);
  if (!preset) return {};
  // Strip the `pattern` field (it's a regex, not a Model property).
  const { pattern, ...rest } = preset;
  void pattern;
  return rest;
}

/**
 * Build a complete Model object with sensible defaults plus any
 * preset-derived fields. Used when adding a model from a fetched
 * list or manual input.
 */
export function buildModelFromName(name: string, id?: string): Model {
  const trimmed = name.trim();
  const preset = applyModelPreset(trimmed);
  return {
    id: id?.trim() || trimmed.toLowerCase().replace(/[^a-z0-9._:/-]+/g, '-').replace(/^-+|-+$/g, '') ||
      crypto.randomUUID?.() || Date.now().toString(36),
    name: trimmed,
    supportsVision: false,
    supportsReasoning: false,
    supportsReasoningEffort: false,
    supportsToolCalls: false,
    supportsJsonMode: false,
    ...preset,
  };
}
