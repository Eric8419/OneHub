import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let _toastId = 0;
let _setToasts: ((fn: (prev: Toast[]) => Toast[]) => void) | null = null;

const normalInitial = {
  opacity: 0,
  transform: 'translateY(100%) scale(0.97)',
};

const settled = {
  opacity: 1,
  transform: 'translateY(0%) scale(1)',
};

const reducedHidden = {
  opacity: 0,
  transform: 'translateY(0%) scale(1)',
};

const toastTransition = {
  duration: 0.2,
  ease: [0.23, 1, 0.32, 1] as const,
};

export function toast(message: string, type: ToastType = 'info') {
  const id = ++_toastId;
  _setToasts?.((prev) => [...prev, { id, message, type }]);
  setTimeout(() => {
    _setToasts?.((prev) => prev.filter((t) => t.id !== id));
  }, 3000);
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const shouldReduceMotion = useReducedMotion();
  _setToasts = useCallback(setToasts, []);

  const bgMap: Record<ToastType, string> = {
    success: 'var(--status-success-default)',
    error: 'var(--status-error-default)',
    info: 'var(--text-default)',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="ds-notif ds-notif--simple"
            initial={shouldReduceMotion ? reducedHidden : normalInitial}
            animate={settled}
            exit={shouldReduceMotion ? reducedHidden : normalInitial}
            transition={toastTransition}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-8)',
              padding: 'var(--spacer-8) var(--spacer-12)',
              background: bgMap[t.type],
              borderRadius: 'var(--radius-8)',
              color: '#fff',
              fontSize: 'var(--body-md-font-size)',
              lineHeight: 'var(--body-md-line-height)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              minWidth: 200,
              pointerEvents: 'auto',
            }}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              aria-label="关闭通知"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                padding: 2,
              }}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
