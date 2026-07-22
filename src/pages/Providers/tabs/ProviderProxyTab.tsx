import React from 'react';
import { Switch } from '../../../components/ui/Switch';

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  height: 34,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-overlay-l1)',
  color: 'var(--text-default)',
  font: 'inherit',
  fontSize: 'var(--body-base-font-size)',
  outline: 'none',
  boxSizing: 'border-box',
};

interface ProviderProxyTabProps {
  proxyEnabled: boolean;
  proxyUrl: string;
  onProxyEnabledChange: (v: boolean) => void;
  onProxyUrlChange: (v: string) => void;
}

export const ProviderProxyTab: React.FC<ProviderProxyTabProps> = ({
  proxyEnabled,
  proxyUrl,
  onProxyEnabledChange,
  onProxyUrlChange,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 'var(--body-base-font-size)' }}>使用独立代理</div>
          <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)', marginTop: 2 }}>
            为该提供商单独配置 HTTP/SOCKS 代理
          </div>
        </div>
        <Switch checked={proxyEnabled} onChange={onProxyEnabledChange} />
      </div>

      {proxyEnabled && (
        <div>
          <label style={{ display: 'block', fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)', marginBottom: 6 }}>
            代理地址
          </label>
          <input
            type="text"
            value={proxyUrl}
            onChange={(e) => onProxyUrlChange(e.target.value)}
            placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
            style={inputBaseStyle}
          />
        </div>
      )}
    </div>
  );
};
