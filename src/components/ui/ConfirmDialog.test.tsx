import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// @ts-expect-error Node types are not included in the browser application's tsconfig.
import { readFileSync } from 'node:fs';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

const styles = readFileSync('src/index.css', 'utf8');

interface PendingAnimation {
  finished: Promise<void>;
  finish: () => void;
}

let pendingAnimations: PendingAnimation[] = [];
let originalGetAnimations: typeof HTMLElement.prototype.getAnimations | undefined;

function createPendingAnimation(): PendingAnimation {
  let finish = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });

  return { finished, finish };
}

async function finishExitAnimations() {
  const animations = [...pendingAnimations];
  await act(async () => {
    animations.forEach((animation) => animation.finish());
    await Promise.resolve();
  });
}

function Harness({ onCancel = vi.fn() }: { onCancel?: () => void }) {
  const [open, setOpen] = React.useState(true);

  return (
    <>
      <button data-testid="reopen" onClick={() => setOpen(true)}>
        重新打开
      </button>
      <ConfirmDialog
        open={open}
        title="确认操作"
        message="此操作无法撤销"
        onConfirm={() => setOpen(false)}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
      />
    </>
  );
}

describe('ConfirmDialog motion', () => {
  beforeEach(() => {
    pendingAnimations = [];
    originalGetAnimations = HTMLElement.prototype.getAnimations;
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
      configurable: true,
      value(this: HTMLElement) {
        if (!this.hasAttribute('data-exiting')) return [];

        const animation = createPendingAnimation();
        pendingAnimations.push(animation);
        return [animation];
      },
    });
  });

  afterEach(() => {
    if (originalGetAnimations) {
      Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
        configurable: true,
        value: originalGetAnimations,
      });
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations;
    }
  });

  it('opens with lifecycle classes and no inline keyframe animation', () => {
    render(<Harness />);

    const dialog = screen.getByRole('dialog').closest('.ds-confirm-dialog');
    const overlay = dialog?.closest('.ds-confirm-overlay');

    expect(dialog).toBeInTheDocument();
    expect(overlay).toBeInTheDocument();
    expect(dialog).not.toHaveStyle({ animation: expect.any(String) });
    expect(overlay).not.toHaveStyle({ animation: expect.any(String) });
  });

  it('keeps the dialog mounted while cancel exits, then unmounts after both transitions finish', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '取消' }));

    const dialog = screen.getByRole('dialog').closest('.ds-confirm-dialog');
    const overlay = dialog?.closest('.ds-confirm-overlay');
    expect(dialog).toHaveAttribute('data-exiting');
    expect(overlay).toHaveAttribute('data-exiting');

    await finishExitAnimations();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['Escape', 'overlay'])('uses the same exit lifecycle for %s dismissal', async (method) => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<Harness onCancel={onCancel} />);

    const dialog = screen.getByRole('dialog').closest('.ds-confirm-dialog');
    const overlay = dialog?.closest('.ds-confirm-overlay');
    if (!overlay) throw new Error('Expected confirmation overlay');

    if (method === 'Escape') {
      await user.keyboard('{Escape}');
    } else {
      await user.pointer([
        { keys: '[MouseLeft>]', target: overlay },
        { keys: '[/MouseLeft]', target: overlay },
      ]);
    }

    expect(onCancel).toHaveBeenCalledOnce();
    expect(overlay).toHaveAttribute('data-exiting');
    await finishExitAnimations();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reverses an interrupted exit without allowing stale animations to unmount it', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByRole('dialog').closest('.ds-confirm-dialog')).toHaveAttribute('data-exiting');

    fireEvent.click(screen.getByTestId('reopen'));
    expect(screen.getByRole('dialog').closest('.ds-confirm-dialog')).not.toHaveAttribute('data-exiting');

    await finishExitAnimations();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('defines exact enter/exit timing and opacity-only reduced motion', () => {
    expect(styles).toContain('opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)');
    expect(styles).toContain('transform 200ms cubic-bezier(0.23, 1, 0.32, 1)');
    expect(styles).toContain('.ds-confirm-overlay[data-exiting] {\n  transition-duration: 160ms;');
    expect(styles).toContain('.ds-confirm-dialog[data-exiting] {\n  transition-duration: 160ms;');

    const reducedMotionStyles = styles.slice(styles.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducedMotionStyles).toMatch(
      /\.ds-confirm-overlay,\s*\.ds-confirm-dialog\s*{\s*transition: opacity 200ms ease !important;/,
    );
    expect(reducedMotionStyles).toMatch(
      /\.ds-confirm-dialog,\s*\.ds-confirm-dialog\[data-entering\],\s*\.ds-confirm-dialog\[data-exiting\]\s*{\s*transform: none !important;/,
    );
  });
});
