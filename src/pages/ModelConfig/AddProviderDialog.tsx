import { useState, useEffect, useRef, useMemo } from 'react';
import { useProviderStore } from '../../store/providerStore';
import { Stepper } from '../../components/ui/Stepper';
import { AnimatedContent, toast, Dropdown } from '../../components/ui';
import type { DropdownOption } from '../../components/ui';
import { ProviderForm } from './ProviderForm';
import type { Model } from '../../types/provider';
import { invoke } from '@tauri-apps/api/core';
import { X, ArrowLeft, ArrowRight, Check, Loader2, RefreshCw, Download, Plus } from 'lucide-react';

interface AddProviderDialogProps {
  open: boolean;
  onClose: () => void;
}

const API_FLAVOR_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
];

interface ProviderProfileEntry {
  id: string;
  label: string;
  baseUrl: string;
  flavor: string;
}

interface RemoteModelEntry {
  id: string;
  name: string;
}

interface FetchModelsResult {
  success: boolean;
  models: RemoteModelEntry[];
  message: string;
}

// Fallback profile list used when the Tauri command is unavailable
// (e.g. running in a plain browser during development). Mirrors the
// backend `PROFILES` registry in adapter.rs — kept in sync manually
// since the frontend can't import Rust constants. The backend remains
// the single source of truth at runtime; this only ensures the
// dropdown is never empty.
const FALLBACK_PROFILES: ProviderProfileEntry[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', flavor: 'openai' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', flavor: 'anthropic' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', flavor: 'openai-compatible' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', flavor: 'openai-compatible' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', flavor: 'openai-compatible' },
  { id: 'xai', label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', flavor: 'openai-compatible' },
  { id: 'togetherai', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', flavor: 'openai-compatible' },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    flavor: 'openai-compatible',
  },
  { id: 'cerebras', label: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', flavor: 'openai-compatible' },
  { id: 'deepinfra', label: 'Deep Infra', baseUrl: 'https://api.deepinfra.com/v1/openai', flavor: 'openai-compatible' },
  { id: 'baseten', label: 'Baseten', baseUrl: 'https://inference.baseten.co/v1', flavor: 'openai-compatible' },
  { id: 'mistral', label: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', flavor: 'openai-compatible' },
  { id: 'cohere', label: 'Cohere', baseUrl: 'https://api.cohere.ai/v1', flavor: 'openai-compatible' },
  { id: 'perplexity', label: 'Perplexity', baseUrl: 'https://api.perplexity.ai', flavor: 'openai-compatible' },
  { id: 'nvidia', label: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', flavor: 'openai-compatible' },
  {
    id: 'alibaba',
    label: 'Alibaba (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    flavor: 'openai-compatible',
  },
  { id: 'venice', label: 'Venice AI', baseUrl: 'https://api.venice.ai/api/v1', flavor: 'openai-compatible' },
  { id: '302ai', label: '302.AI', baseUrl: 'https://api.302.ai/v1', flavor: 'openai-compatible' },
  { id: 'moonshot', label: 'Moonshot AI (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', flavor: 'openai-compatible' },
  { id: 'minimax', label: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', flavor: 'openai-compatible' },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    flavor: 'openai-compatible',
  },
  { id: 'zai', label: 'Z.AI', baseUrl: 'https://api.z.ai/api/paas/v4', flavor: 'openai-compatible' },
  { id: 'ionet', label: 'IO.NET', baseUrl: 'https://api.intelligence.io.solutions/v1', flavor: 'openai-compatible' },
  {
    id: 'nebius',
    label: 'Nebius Token Factory',
    baseUrl: 'https://api.studio.nebius.ai/v1',
    flavor: 'openai-compatible',
  },
  { id: 'cortecs', label: 'Cortecs', baseUrl: 'https://api.cortecs.ai/v1', flavor: 'openai-compatible' },
  { id: 'stackit', label: 'STACKIT', baseUrl: 'https://api.openai.stackit.tech/v1', flavor: 'openai-compatible' },
  {
    id: 'ovhcloud',
    label: 'OVHcloud AI Endpoints',
    baseUrl: 'https://endpoints.ai.eu.ovhcloud.com/v1',
    flavor: 'openai-compatible',
  },
  { id: 'scaleway', label: 'Scaleway', baseUrl: 'https://api.scaleway.ai/ai-apis/v1', flavor: 'openai-compatible' },
  { id: 'helicone', label: 'Helicone', baseUrl: 'https://ai-gateway.helicone.ai', flavor: 'openai-compatible' },
  { id: 'frogbot', label: 'FrogBot', baseUrl: 'https://api.frogbot.ai/v1', flavor: 'openai-compatible' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://127.0.0.1:11434/v1', flavor: 'openai-compatible' },
  { id: 'ollama-cloud', label: 'Ollama Cloud', baseUrl: 'https://api.olama.cloud/v1', flavor: 'openai-compatible' },
  { id: 'lmstudio', label: 'LM Studio (local)', baseUrl: 'http://127.0.0.1:1234/v1', flavor: 'openai-compatible' },
  { id: 'llamacpp', label: 'llama.cpp (local)', baseUrl: 'http://127.0.0.1:8080/v1', flavor: 'openai-compatible' },
  { id: 'vllm', label: 'vLLM (local)', baseUrl: 'http://127.0.0.1:8000/v1', flavor: 'openai-compatible' },
  { id: 'atomic-chat', label: 'Atomic Chat (local)', baseUrl: 'http://127.0.0.1:1337/v1', flavor: 'openai-compatible' },
  {
    id: 'amazon-bedrock',
    label: 'Amazon Bedrock',
    baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    flavor: 'openai-compatible',
  },
  {
    id: 'azure-openai',
    label: 'Azure OpenAI',
    baseUrl: 'https://RESOURCE_NAME.openai.azure.com',
    flavor: 'openai-compatible',
  },
  {
    id: 'azure-cognitive-services',
    label: 'Azure Cognitive Services',
    baseUrl: 'https://RESOURCE_NAME.cognitiveservices.azure.com',
    flavor: 'openai-compatible',
  },
  {
    id: 'google-vertex',
    label: 'Google Vertex AI',
    baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1',
    flavor: 'openai-compatible',
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    baseUrl: 'https://api.githubcopilot.com',
    flavor: 'openai-compatible',
  },
  { id: 'gitlab-duo', label: 'GitLab Duo', baseUrl: 'https://cloud.gitlab.com/ai/v1', flavor: 'openai-compatible' },
  {
    id: 'sap-ai-core',
    label: 'SAP AI Core',
    baseUrl: 'https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2',
    flavor: 'openai-compatible',
  },
  {
    id: 'cloudflare-ai-gateway',
    label: 'Cloudflare AI Gateway',
    baseUrl: 'https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/GATEWAY_ID',
    flavor: 'openai-compatible',
  },
  {
    id: 'vercel-ai-gateway',
    label: 'Vercel AI Gateway',
    baseUrl: 'https://ai-gateway.vercel.sh/v1',
    flavor: 'openai-compatible',
  },
  { id: 'zenmux', label: 'ZenMux', baseUrl: 'https://api.zenmux.ai/v1', flavor: 'openai-compatible' },
  { id: 'opencode-zen', label: 'OpenCode Zen', baseUrl: 'https://zen.opencode.ai/v1', flavor: 'openai-compatible' },
];

const STEPS = [
  { label: '选择类型', description: '选择提供商类型' },
  { label: '填写凭据', description: '输入 API 地址和密钥' },
  { label: '添加模型', description: '拉取或手动添加模型' },
  { label: '测试连接', description: '验证配置是否可用' },
  { label: '完成', description: '完成配置' },
];

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : e ? String(e) : fallback);

const modelIdFromName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, '-')
    .replace(/^-+|-+$/g, '') ||
  crypto.randomUUID?.() ||
  Date.now().toString(36);

const makeModel = (name: string, id?: string): Model => ({
  id: id?.trim() || modelIdFromName(name),
  name: name.trim(),
  supportsVision: false,
  supportsReasoning: false,
  supportsReasoningEffort: false,
});

export const AddProviderDialog: React.FC<AddProviderDialogProps> = ({ open, onClose }) => {
  const addProvider = useProviderStore((s) => s.addProvider);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiFlavor, setApiFlavor] = useState('openai');
  const [models, setModels] = useState<Model[]>([]);
  const [remoteModels, setRemoteModels] = useState<RemoteModelEntry[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchMessage, setModelFetchMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [nameError, setNameError] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(false);
  const [apiBaseError, setApiBaseError] = useState(false);
  // Load curated provider profiles from the backend so users can
  // pick a known provider instead of typing a base URL. Falls back
  // to a bundled list when the Tauri command is unavailable (e.g.
  // running in a plain browser during development).
  const [profiles, setProfiles] = useState<ProviderProfileEntry[]>(FALLBACK_PROFILES);
  const [selectedProfile, setSelectedProfile] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    invoke<ProviderProfileEntry[]>('list_provider_profiles')
      .then(setProfiles)
      .catch(() => {
        /* keep FALLBACK_PROFILES already in state */
      });
  }, [open]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    setTimeout(() => nameInputRef.current?.focus(), 50);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose, step]);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStep(0);
      setName('');
      setApiBase('');
      setApiKey('');
      setApiFlavor('openai');
      setModels([]);
      setRemoteModels([]);
      setFetchingModels(false);
      setModelFetchMessage('');
      setSaving(false);
      setTesting(false);
      setTestResult('idle');
      setTestMessage('');
      setSelectedProfile('');
      setNameError(false);
      setApiKeyError(false);
      setApiBaseError(false);
    }
  }, [open]);

  // When a curated profile is selected, auto-fill name/baseURL/flavor.
  // The user can still override any field afterwards.
  const handleProfileChange = (profileId: string) => {
    setSelectedProfile(profileId);
    if (profileId === 'custom') return;
    const p = profiles.find((x) => x.id === profileId);
    if (p) {
      setName((prev) => prev.trim() || p.label);
      setApiBase(p.baseUrl);
      setApiFlavor(p.flavor);
      setApiBaseError(false);
    }
  };

  // Build grouped dropdown options from the profile list. The group
  // is inferred from the profile id — keeps the fallback list and
  // backend list in sync without an extra field.
  const profileOptions: DropdownOption[] = useMemo(() => {
    const groupOf = (id: string): string => {
      if (id === 'openai' || id === 'anthropic') return '原生协议';
      if (['ollama', 'ollama-cloud', 'lmstudio', 'llamacpp', 'vllm', 'atomic-chat'].includes(id)) return '本地运行时';
      if (
        [
          'amazon-bedrock',
          'azure-openai',
          'azure-cognitive-services',
          'google-vertex',
          'github-copilot',
          'gitlab-duo',
          'sap-ai-core',
          'cloudflare-ai-gateway',
          'vercel-ai-gateway',
          'zenmux',
          'opencode-zen',
        ].includes(id)
      )
        return '云平台';
      return 'OpenAI 兼容';
    };
    const opts: DropdownOption[] = profiles.map((p) => ({
      value: p.id,
      label: p.label,
      group: groupOf(p.id),
    }));
    // "自定义" goes last, ungrouped.
    opts.push({ value: 'custom', label: '自定义' });
    return opts;
  }, [profiles]);

  if (!open) return null;

  // ─── Validation per step ──────────────────────────────────

  const canProceedFromStep0 = name.trim().length > 0;
  const canProceedFromStep1 = apiBase.trim().length > 0 && apiKey.trim().length > 0;
  const canProceedFromStep3 = testResult === 'success';

  const handleNext = () => {
    if (step === 0) {
      if (!name.trim()) {
        setNameError(true);
        nameInputRef.current?.focus();
        return;
      }
      setNameError(false);
    }
    if (step === 1) {
      let valid = true;
      if (!apiBase.trim()) {
        setApiBaseError(true);
        valid = false;
      }
      if (!apiKey.trim()) {
        setApiKeyError(true);
        valid = false;
      }
      if (!valid) return;
      setApiBaseError(false);
      setApiKeyError(false);
    }
    if (step === 3 && !canProceedFromStep3) {
      toast('请先完成连接测试', 'error');
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  // ─── Model Setup ─────────────────────────────────────────

  const addModel = (model: Model) => {
    const cleanName = model.name.trim();
    if (!cleanName) return;
    setModels((prev) => {
      const exists = prev.some((m) => m.name.toLowerCase() === cleanName.toLowerCase() || m.id === model.id);
      if (exists) {
        toast(`模型「${cleanName}」已在列表中`, 'info');
        return prev;
      }
      return [...prev, { ...model, name: cleanName }];
    });
  };

  const handleFetchModels = async () => {
    if (!apiBase.trim() || !apiKey.trim()) {
      toast('请先填写 API Base URL 和 API Key', 'error');
      return;
    }
    setFetchingModels(true);
    setModelFetchMessage('');
    try {
      const result = await invoke<FetchModelsResult>('fetch_provider_models', {
        flavor: apiFlavor,
        apiBase,
        apiKey,
      });
      setRemoteModels(result.models ?? []);
      setModelFetchMessage(result.message);
      toast(result.message, result.success ? 'success' : 'info');
    } catch (e: unknown) {
      const message = errorMessage(e, '拉取模型失败');
      setModelFetchMessage(message);
      toast(message, 'error');
    } finally {
      setFetchingModels(false);
    }
  };

  // ─── Test Connection ──────────────────────────────────────

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult('idle');
    setTestMessage('');
    try {
      // Real connection test: the backend sends a lightweight
      // request (GET /models for OpenAI-family, a 1-token POST
      // /messages ping for Anthropic) and returns a classified
      // result with a structured ProxyError on failure.
      const result = await invoke<{
        success: boolean;
        modelCount?: number;
        error?: { kind: string; message: string };
        message: string;
      }>('test_provider_connection', {
        flavor: apiFlavor,
        apiBase,
        apiKey,
      });
      if (result.success) {
        setTestResult('success');
        setTestMessage(result.message);
        toast(result.message, 'success');
      } else {
        setTestResult('fail');
        setTestMessage(result.message);
        toast(result.message, 'error');
      }
    } catch (e: unknown) {
      setTestResult('fail');
      setTestMessage(errorMessage(e, '连接测试失败'));
      toast(errorMessage(e, '连接测试失败'), 'error');
    } finally {
      setTesting(false);
    }
  };

  // ─── Final Submit ─────────────────────────────────────────

  const handleFinish = async () => {
    setSaving(true);
    const configuredModels = models
      .map((model) => ({ ...model, name: model.name.trim(), id: model.id || modelIdFromName(model.name) }))
      .filter((model) => model.name);

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    try {
      await addProvider({
        id,
        name: name.trim(),
        apiBase: apiBase.trim() || `https://api.${id}.com/v1`,
        apiKey: apiKey.trim(),
        apiFlavor,
        status: testResult === 'success' ? 'connected' : 'configuring',
        models: configuredModels,
      });
      toast('提供商已添加', 'success');
      onClose();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '添加失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  const inputBaseStyle = {
    height: 36,
    padding: '0 var(--spacer-12)' as const,
    borderRadius: 'var(--radius-8)',
    border: '1px solid var(--border-neutral-l1)',
    background: 'var(--bg-base-default)',
    color: 'var(--text-default)',
    fontSize: 'var(--body-base-font-size)',
    outline: 'none' as const,
    width: '100%' as const,
    boxSizing: 'border-box' as const,
    transition: 'border-color var(--transition-fast, 0.12s) ease',
  };

  const fieldStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--spacer-6)',
  };

  const labelStyle = {
    color: 'var(--text-default)',
    fontSize: 'var(--body-base-font-size)',
    fontWeight: 'var(--font-weight-medium)' as const,
  };

  const stepBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--spacer-6)',
    height: 32,
    padding: '0 var(--spacer-16)',
    borderRadius: 'var(--radius-8)',
    cursor: 'pointer',
    fontSize: 'var(--body-base-font-size)',
    fontWeight: 'var(--font-weight-medium)' as const,
    fontFamily: 'inherit' as const,
    border: 'none',
    transition: 'background var(--transition-fast, 0.12s) ease, opacity var(--transition-fast, 0.12s) ease',
  };

  return (
    <div
      className="ds-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-overlay-l4)',
        animation: 'fadeIn var(--transition-fast, 0.12s) ease',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ds-dialog"
        style={{
          background: 'var(--bg-base-default)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-12)',
          width: '100%',
          maxWidth: 760,
          overflow: 'hidden',
          color: 'var(--text-default)',
          boxShadow:
            '0 24px 64px color-mix(in srgb, var(--text-default) 14%, transparent), 0 4px 16px color-mix(in srgb, var(--text-default) 8%, transparent)',
          animation: 'scaleIn var(--transition-normal, 0.2s) ease',
        }}
      >
        {/* ── Header ───────────────────────────────────────── */}
        <div
          className="ds-dialog__head"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--spacer-16) var(--spacer-20) var(--spacer-12)',
            borderBottom: '1px solid var(--border-neutral-l1)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-4)' }}>
            <span
              className="ds-dialog__title"
              style={{
                fontSize: 'var(--heading-sm-font-size)',
                lineHeight: 'var(--heading-sm-line-height)',
                fontWeight: 'var(--heading-sm-font-weight)',
                color: 'var(--text-default)',
              }}
            >
              添加提供商
            </span>
            <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
              {STEPS[step].description}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--icon-secondary)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-8)',
              transition: 'background var(--transition-fast, 0.12s) ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-overlay-l1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Stepper ──────────────────────────────────────── */}
        <div style={{ padding: 'var(--spacer-16) var(--spacer-20) var(--spacer-12)' }}>
          <Stepper steps={STEPS} activeStep={step} />
        </div>

        {/* ── Step Content ─────────────────────────────────── */}
        <div style={{ padding: '0 var(--spacer-20) var(--spacer-16)', minHeight: 300 }}>
          {/* Step 0: Choose Type */}
          {step === 0 && (
            <AnimatedContent key="step-0" duration={250} distance={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-16)' }}>
                {/* Curated profile picker — auto-fills name/baseURL/flavor */}
                <div style={fieldStyle}>
                  <label style={labelStyle}>快速选择</label>
                  <Dropdown
                    options={profileOptions}
                    value={selectedProfile}
                    onChange={handleProfileChange}
                    placeholder="— 选择预设提供商 —"
                    searchable
                    maxItems={8}
                  />
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    选择预设可自动填充地址和协议；选「自定义」手动填写
                  </span>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>
                    提供商名称 <span style={{ color: 'var(--status-error-default)' }}>*</span>
                  </label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    placeholder="例如: OpenAI, Anthropic, DeepSeek"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (nameError) setNameError(false);
                    }}
                    style={{
                      ...inputBaseStyle,
                      borderColor: nameError ? 'var(--status-error-default)' : 'var(--border-neutral-l1)',
                    }}
                  />
                  {nameError && (
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--status-error-default)' }}>
                      请输入提供商名称
                    </span>
                  )}
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    输入一个可识别的名称，用于在列表中区分不同的 AI 服务提供商
                  </span>
                </div>
              </div>
            </AnimatedContent>
          )}

          {/* Step 1: Credentials */}
          {step === 1 && (
            <AnimatedContent key="step-1" duration={250} distance={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-16)' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>
                    API Base URL <span style={{ color: 'var(--status-error-default)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="完整地址，含 /v1，如 https://api.openai.com/v1"
                    value={apiBase}
                    onChange={(e) => {
                      setApiBase(e.target.value);
                      if (apiBaseError) setApiBaseError(false);
                    }}
                    style={{
                      ...inputBaseStyle,
                      borderColor: apiBaseError ? 'var(--status-error-default)' : 'var(--border-neutral-l1)',
                    }}
                  />
                  {apiBaseError && (
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--status-error-default)' }}>
                      请输入有效的 API Base URL
                    </span>
                  )}
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    填写完整 Base URL（含版本路径，如 /v1）。系统不会自动补全 /v1，无版本路径的接口直接填到根域名即可。
                  </span>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>
                    API Key <span style={{ color: 'var(--status-error-default)' }}>*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      if (apiKeyError) setApiKeyError(false);
                    }}
                    style={{
                      ...inputBaseStyle,
                      borderColor: apiKeyError ? 'var(--status-error-default)' : 'var(--border-neutral-l1)',
                    }}
                  />
                  {apiKeyError && (
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--status-error-default)' }}>
                      请输入 API Key
                    </span>
                  )}
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>API 协议类型</label>
                  <Dropdown options={API_FLAVOR_OPTIONS} value={apiFlavor} onChange={setApiFlavor} size="sm" />
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    选择适配协议，Anthropic API 需选 Anthropic
                  </span>
                </div>
              </div>
            </AnimatedContent>
          )}

          {/* Step 2: Models */}
          {step === 2 && (
            <AnimatedContent key="step-2" duration={250} distance={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
                {/* Fetch models */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--spacer-8)',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--spacer-12)',
                    border: '1px solid var(--border-neutral-l1)',
                    borderRadius: 'var(--radius-8)',
                    background: 'var(--bg-base-secondary)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                    <span
                      style={{
                        fontSize: 'var(--body-sm-font-size)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--text-default)',
                      }}
                    >
                      从接口拉取模型
                    </span>
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                      OpenAI 兼容接口会请求 /models；不支持列表接口时仍可手动添加
                    </span>
                  </div>
                  <button
                    onClick={handleFetchModels}
                    disabled={fetchingModels}
                    style={{
                      ...stepBtnStyle,
                      background: 'var(--bg-base-default)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-neutral-l1)',
                      height: 32,
                      opacity: fetchingModels ? 0.7 : 1,
                    }}
                  >
                    {fetchingModels ? (
                      <>
                        <Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> 拉取中
                      </>
                    ) : (
                      <>
                        <Download size={14} /> 拉取模型
                      </>
                    )}
                  </button>
                </div>

                {modelFetchMessage && (
                  <div
                    style={{
                      padding: 'var(--spacer-8) var(--spacer-12)',
                      borderRadius: 'var(--radius-6)',
                      background:
                        remoteModels.length > 0 ? 'var(--status-success-surface-l1)' : 'var(--status-alert-surface-l1)',
                      color: remoteModels.length > 0 ? 'var(--status-success-default)' : 'var(--status-alert-default)',
                      fontSize: 'var(--body-sm-font-size)',
                    }}
                  >
                    {modelFetchMessage}
                  </div>
                )}

                {remoteModels.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                        接口返回的模型
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          remoteModels.forEach((remote) => addModel(makeModel(remote.name || remote.id, remote.id)))
                        }
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text-brand)',
                          cursor: 'pointer',
                          fontSize: 'var(--body-sm-font-size)',
                          fontFamily: 'inherit',
                        }}
                      >
                        全部加入
                      </button>
                    </div>
                    <div
                      className="ds-scroll"
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 'var(--spacer-6)',
                        maxHeight: 92,
                        overflowY: 'auto',
                        paddingRight: 'var(--spacer-4)',
                      }}
                    >
                      {remoteModels.map((remote) => {
                        const displayName = remote.name || remote.id;
                        const added = models.some((model) => model.id === remote.id || model.name === displayName);
                        return (
                          <button
                            key={remote.id}
                            type="button"
                            onClick={() => addModel(makeModel(displayName, remote.id))}
                            disabled={added}
                            title={added ? '已加入' : '加入模型列表'}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 'var(--spacer-4)',
                              minHeight: 28,
                              padding: '0 var(--spacer-10)',
                              borderRadius: 'var(--radius-8)',
                              border: added ? '1px solid var(--border-neutral-l1)' : '1px solid var(--border-brand)',
                              background: added ? 'var(--bg-overlay-l1)' : 'var(--bg-base-default)',
                              color: added ? 'var(--text-tertiary)' : 'var(--text-brand)',
                              cursor: added ? 'default' : 'pointer',
                              fontSize: 'var(--body-sm-font-size)',
                              fontFamily: 'var(--font-family-mono)',
                            }}
                          >
                            {added ? <Check size={12} /> : <Plus size={12} />}
                            {displayName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <ProviderForm
                  values={{ name, apiBase, apiKey, apiFlavor, models }}
                  onChange={(v) => setModels(v.models)}
                  showCredentials={false}
                  showActions={false}
                />
              </div>
            </AnimatedContent>
          )}

          {/* Step 3: Test Connection */}
          {step === 3 && (
            <AnimatedContent key="step-3" duration={250} distance={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-16)' }}>
                <div
                  style={{
                    padding: 'var(--spacer-16)',
                    borderRadius: 'var(--radius-8)',
                    background: 'var(--bg-base-secondary)',
                    border: '1px solid var(--border-neutral-l1)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacer-4)',
                      marginBottom: 'var(--spacer-12)',
                    }}
                  >
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}
                    >
                      <span style={{ color: 'var(--text-tertiary)' }}>提供商</span>
                      <span style={{ color: 'var(--text-default)' }}>{name}</span>
                    </div>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}
                    >
                      <span style={{ color: 'var(--text-tertiary)' }}>API Base</span>
                      <span
                        style={{
                          color: 'var(--text-secondary)',
                          fontFamily: 'var(--font-family-mono)',
                          fontSize: 'var(--body-xs-font-size)',
                        }}
                      >
                        {apiBase}
                      </span>
                    </div>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}
                    >
                      <span style={{ color: 'var(--text-tertiary)' }}>协议</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {API_FLAVOR_OPTIONS.find((o) => o.value === apiFlavor)?.label}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    style={{
                      ...stepBtnStyle,
                      background: testResult === 'success' ? 'var(--status-success-default)' : 'var(--bg-brand)',
                      color: 'var(--text-onbrand)',
                      opacity: testing ? 0.7 : 1,
                      width: '100%',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                      if (!testing && testResult !== 'success')
                        e.currentTarget.style.background = 'var(--bg-brand-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!testing)
                        e.currentTarget.style.background =
                          testResult === 'success' ? 'var(--status-success-default)' : 'var(--bg-brand)';
                    }}
                  >
                    {testing ? (
                      <>
                        <Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite' }} /> 测试中...
                      </>
                    ) : testResult === 'success' ? (
                      <>
                        <Check size={16} /> 连接成功
                      </>
                    ) : testResult === 'fail' ? (
                      <>
                        <RefreshCw size={16} /> 重新测试
                      </>
                    ) : (
                      <>
                        <ArrowRight size={16} /> 测试连接
                      </>
                    )}
                  </button>

                  {testResult === 'success' && (
                    <div
                      style={{
                        marginTop: 'var(--spacer-8)',
                        padding: 'var(--spacer-8) var(--spacer-12)',
                        borderRadius: 'var(--radius-6)',
                        background: 'var(--status-success-surface-l1)',
                        color: 'var(--status-success-default)',
                        fontSize: 'var(--body-sm-font-size)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacer-6)',
                      }}
                    >
                      <Check size={14} />
                      {testMessage || '配置有效，可以正常使用'}
                    </div>
                  )}

                  {testResult === 'fail' && (
                    <div
                      style={{
                        marginTop: 'var(--spacer-8)',
                        padding: 'var(--spacer-8) var(--spacer-12)',
                        borderRadius: 'var(--radius-6)',
                        background: 'var(--status-error-surface-l1)',
                        color: 'var(--status-error-default)',
                        fontSize: 'var(--body-sm-font-size)',
                      }}
                    >
                      {testMessage || '连接失败，请检查 API Base URL 和 API Key 是否正确'}
                    </div>
                  )}
                </div>

                <span
                  style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', textAlign: 'center' }}
                >
                  测试连接将通过选定的 API Base 发送一个轻量请求以验证配置
                </span>
              </div>
            </AnimatedContent>
          )}

          {/* Step 4: Complete */}
          {step === 4 && (
            <AnimatedContent key="step-4" duration={250} distance={6}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--spacer-16)',
                  alignItems: 'center',
                  padding: 'var(--spacer-16) 0',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--status-success-surface-l1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={28} strokeWidth={3} style={{ color: 'var(--status-success-default)' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 'var(--heading-sm-font-size)',
                      fontWeight: 'var(--font-weight-strong)',
                      marginBottom: 'var(--spacer-4)',
                    }}
                  >
                    连接已验证
                  </div>
                  <div style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-tertiary)' }}>
                    提供商「{name}」已通过连接测试，点击下方按钮完成添加
                  </div>
                </div>

                <div
                  style={{
                    width: '100%',
                    padding: 'var(--spacer-12)',
                    borderRadius: 'var(--radius-8)',
                    background: 'var(--bg-base-secondary)',
                    border: '1px solid var(--border-neutral-l1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacer-4)',
                    fontSize: 'var(--body-sm-font-size)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>提供商</span>
                    <span style={{ color: 'var(--text-default)' }}>{name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>API Base</span>
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-family-mono)',
                        fontSize: 'var(--body-xs-font-size)',
                      }}
                    >
                      {apiBase}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>模型数量</span>
                    <span style={{ color: 'var(--text-default)' }}>{models.length || '未配置'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>连接状态</span>
                    <span
                      style={{
                        color:
                          testResult === 'success' ? 'var(--status-success-default)' : 'var(--status-alert-default)',
                      }}
                    >
                      {testResult === 'success' ? '已连接' : '未测试'}
                    </span>
                  </div>
                </div>
              </div>
            </AnimatedContent>
          )}
        </div>

        {/* ── Footer Navigation ────────────────────────────── */}
        <div
          className="ds-dialog__foot"
          style={{
            padding: 'var(--spacer-12) var(--spacer-20)',
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--border-neutral-l1)',
          }}
        >
          {/* Left: Back */}
          {step > 0 ? (
            <button
              onClick={handleBack}
              style={{
                ...stepBtnStyle,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-neutral-l1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-overlay-l1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <ArrowLeft size={14} />
              返回
            </button>
          ) : (
            <div /> /* Spacer */
          )}

          {/* Right: Next / Finish */}
          {step < STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={
                step === 0
                  ? !canProceedFromStep0
                  : step === 1
                    ? !canProceedFromStep1
                    : step === 3
                      ? !canProceedFromStep3
                      : false
              }
              style={{
                ...stepBtnStyle,
                background:
                  (step === 0 && !canProceedFromStep0) ||
                  (step === 1 && !canProceedFromStep1) ||
                  (step === 3 && !canProceedFromStep3)
                    ? 'var(--bg-brand-disabled)'
                    : 'var(--bg-brand)',
                color: 'var(--text-onbrand)',
                opacity:
                  (step === 0 && !canProceedFromStep0) ||
                  (step === 1 && !canProceedFromStep1) ||
                  (step === 3 && !canProceedFromStep3)
                    ? 0.6
                    : 1,
                cursor:
                  (step === 0 && !canProceedFromStep0) ||
                  (step === 1 && !canProceedFromStep1) ||
                  (step === 3 && !canProceedFromStep3)
                    ? 'not-allowed'
                    : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (
                  (step === 0 && canProceedFromStep0) ||
                  (step === 1 && canProceedFromStep1) ||
                  (step === 3 && canProceedFromStep3) ||
                  (step !== 0 && step !== 1 && step !== 3)
                ) {
                  e.currentTarget.style.background = 'var(--bg-brand-hover)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  (step === 0 && !canProceedFromStep0) ||
                  (step === 1 && !canProceedFromStep1) ||
                  (step === 3 && !canProceedFromStep3)
                    ? 'var(--bg-brand-disabled)'
                    : 'var(--bg-brand)';
              }}
            >
              下一步
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              style={{
                ...stepBtnStyle,
                background: 'var(--bg-brand)',
                color: 'var(--text-onbrand)',
                opacity: saving ? 0.6 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!saving) e.currentTarget.style.background = 'var(--bg-brand-hover)';
              }}
              onMouseLeave={(e) => {
                if (!saving) e.currentTarget.style.background = 'var(--bg-brand)';
              }}
            >
              {saving ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite' }} /> 添加中...
                </>
              ) : (
                <>
                  完成添加 <Check size={14} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
