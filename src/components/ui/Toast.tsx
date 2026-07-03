import { useState, useCallback } from 'react';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let _toastId = 0;
let _setToasts: ((fn: (prev: Toast[]) => Toast[]) => void) | null = null;

export function toast(message: string, type: ToastType = 'info') {
  const id = ++_toastId;
  _setToasts?.(prev => [...prev, { id, message, type }]);
  setTimeout(() => {
    _setToasts?.(prev => prev.filter(t => t.id !== id));
  }, 3000);
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  _setToasts = useCallback(setToasts, []);

  if (toasts.length === 0) return null;

  const bgMap: Record<ToastType, string> = {
    success: 'var(--status-success-default)',
    error: 'var(--status-error-default)',
    info: 'var(--text-default)',
  };

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {toasts.map(t => (
        <div key={t.id} className="ds-notif ds-notif--simple" style={{
          display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)',
          padding: 'var(--spacer-8) var(--spacer-12)',
          background: bgMap[t.type],
          borderRadius: 'var(--radius-8)',
          color: '#fff',
          fontSize: 'var(--body-md-font-size)',
          lineHeight: 'var(--body-md-line-height)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          minWidth: 200,
        }}>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} style={{
            background: 'transparent', border: 'none', color: '#fff',
            cursor: 'pointer', display: 'flex', padding: 2,
          }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};