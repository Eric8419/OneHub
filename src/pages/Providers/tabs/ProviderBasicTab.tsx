import React, { useState } from 'react';
import { Dropdown } from '../../../components/ui/Dropdown';
import { Button } from '../../../components/ui/Button';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-overlay-l1)',
  color: 'var(--text-default)',
  font: 'inherit',
  fontSize: 'var(--body-base-font-size)',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--body-sm-font-size)',
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

const helpStyle: React.CSSProperties = {
  fontSize: 'var(--body-sm-font-size)',
  color: 'var(--text-tertiary)',
  marginTop: 6,
  lineHeight: 1.5,
};

interface ProviderBasicTabProps {
  apiBase: string;
  apiKey: string;
  apiKeyConfigured: boolean;
  apiFlavor: string;
  testStatus: 'connected' | 'configuring' | 'error' | 'testing' | 'idle';
  testMessage?: string;
  testTime?: string;
  testing: boolean;
  onApiBaseChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onApiFlavorChange: (v: string) => void;
  onTestConnection: () => void;
}

export const ProviderBasicTab: React.FC<ProviderBasicTabProps> = ({
  apiBase,
  apiKey,
  apiKeyConfigured,
  apiFlavor,
  testStatus,
  testMessage,
  testTime,
  testing,
  onApiBaseChange,
  onApiKeyChange,
  onApiFlavorChange,
  onTestConnection,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [keyCleared, setKeyCleared] = useState(false);

  const handleKeyFocus = () => {
    if (!keyCleared && apiKeyConfigured) {
      setShowKey(true);
    }
  };

  const handleKeyChange = (v: string) => {
    setKeyCleared(true);
    onApiKeyChange(v);
  };

  const flavorOptions = [
    { value: 'openai-compatible', label: 'OpenAI 兼容' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'responses', label: 'Responses API' },
  ];

  const statusColor = {
    connected: 'var(--status-success-default, #10b981)',
    error: 'var(--status-error-default, #ef4444)',
    testing: 'var(--text-secondary)',
    configuring: 'var(--text-tertiary)',
    idle: 'var(--text-tertiary)',
  }[testStatus];

  const statusText = {
    connected: '● 已连接',
    error: '● 连接失败',
    testing: '● 测试中...',
    configuring: '○ 未测试',
    idle: '○ 未测试',
  }[testStatus];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0', maxWidth: 520 }}>
      <div>
        <label style={labelStyle}>API Base URL</label>
        <input
          type="text"
          value={apiBase}
          onChange={(e) => onApiBaseChange(e.target.value)}
          placeholder="https://api.openai.com/v1"
          style={inputBaseStyle}
        />
        <div style={helpStyle}>填写完整 Base URL（含版本路径，如 /v1）</div>
      </div>

      <div>
        <label style={labelStyle}>API Key</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            onFocus={handleKeyFocus}
            placeholder={apiKeyConfigured && !keyCleared ? '••••••••••••（已设置，点击修改）' : 'sk-...'}
            style={{ ...inputBaseStyle, paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 28, height: 28,
              display: 'grid', placeItems: 'center',
              background: 'none', border: 'none', borderRadius: 6,
              cursor: 'pointer', color: 'var(--text-tertiary)',
            }}
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {apiKeyConfigured && keyCleared && (
          <div style={{ ...helpStyle, color: 'var(--status-warning-default, #f59e0b)' }}>
            ⚠ 原有 Key 已清空，保存后将使用新值
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>API 协议类型</label>
        <Dropdown
          options={flavorOptions}
          value={apiFlavor}
          onChange={onApiFlavorChange}
          placeholder="选择协议类型"
          size="sm"
        />
        <div style={helpStyle}>
          {apiFlavor === 'anthropic' ? '使用 Anthropic Messages API 格式' :
           apiFlavor === 'responses' ? '使用 OpenAI Responses API 格式' :
           '兼容 OpenAI Chat Completions 格式的接口'}
        </div>
      </div>

      <div style={{
        padding: 16,
        borderRadius: 10,
        background: 'var(--bg-overlay-l1)',
        border: '1px solid var(--border-neutral-l1)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 'var(--body-sm-font-size)', color: statusColor, fontWeight: 500 }}>{statusText}</span>
        {testTime && <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>{testTime}</span>}
        {testMessage && testStatus === 'error' && (
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--status-error-default, #ef4444)', marginLeft: 'auto', marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{testMessage}</span>
        )}
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          loading={testing}
          onClick={onTestConnection}
          style={{ marginLeft: 'auto' }}
        >
          测试连接
        </Button>
      </div>
    </div>
  );
};
