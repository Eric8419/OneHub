import React from 'react';
import { ModalOverlay, Modal, Dialog } from 'react-aria-components';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  variant = 'default',
  onConfirm,
  onCancel,
}) => {
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}
      isDismissable
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-overlay-l4)',
        animation: 'fadeIn var(--transition-fast, 0.12s) ease',
      }}
    >
      <Modal
        style={{
          background: 'var(--bg-base-default)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-12)',
          width: '100%',
          maxWidth: 360,
          overflow: 'hidden',
          color: 'var(--text-default)',
          boxShadow:
            '0 24px 64px color-mix(in srgb, var(--text-default) 14%, transparent), 0 4px 16px color-mix(in srgb, var(--text-default) 8%, transparent)',
          animation: 'scaleIn var(--transition-normal, 0.2s) ease',
        }}
      >
        <Dialog aria-label={title} style={{ outline: 'none', padding: 0 }}>
          <div style={{ padding: 'var(--spacer-20) var(--spacer-20) var(--spacer-12)' }}>
            <div
              style={{
                fontSize: 'var(--heading-sm-font-size)',
                fontWeight: 'var(--heading-sm-font-weight)',
                lineHeight: 'var(--heading-sm-line-height)',
                color: variant === 'danger' ? 'var(--status-error-default)' : 'var(--text-default)',
                marginBottom: 'var(--spacer-8)',
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 'var(--body-base-font-size)',
                color: 'var(--text-secondary)',
                lineHeight: 'var(--body-base-line-height)',
              }}
            >
              {message}
            </div>
          </div>
          <div
            style={{
              padding: 'var(--spacer-8) var(--spacer-20) var(--spacer-12)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--spacer-8)',
            }}
          >
            <button
              onClick={onCancel}
              autoFocus={variant === 'danger'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--spacer-6)',
                height: 28,
                padding: '0 var(--spacer-12)',
                borderRadius: 'var(--radius-8)',
                border: '1px solid var(--border-neutral-l1)',
                cursor: 'pointer',
                background: 'transparent',
                color: 'var(--text-default)',
                fontSize: 'var(--body-base-strong-font-size)',
                fontWeight: 'var(--body-base-strong-font-weight)',
                fontFamily: 'inherit',
                transition: 'background var(--transition-fast, 0.12s) ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-overlay-l1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              autoFocus={variant !== 'danger'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--spacer-6)',
                height: 28,
                padding: '0 var(--spacer-12)',
                borderRadius: 'var(--radius-8)',
                border: 'none',
                cursor: 'pointer',
                background: variant === 'danger' ? 'var(--status-error-default)' : 'var(--bg-brand)',
                color: 'var(--text-onbrand)',
                fontSize: 'var(--body-base-strong-font-size)',
                fontWeight: 'var(--body-base-strong-font-weight)',
                fontFamily: 'inherit',
                transition: 'background var(--transition-fast, 0.12s) ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  variant === 'danger' ? 'var(--status-error-hover)' : 'var(--bg-brand-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  variant === 'danger' ? 'var(--status-error-default)' : 'var(--bg-brand)';
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
};
