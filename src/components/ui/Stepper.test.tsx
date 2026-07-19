import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const motionPreference = vi.hoisted(() => ({ reduced: false }));

vi.mock('motion/react', async () => {
  const ReactModule = await import('react');

  const MotionDiv = ReactModule.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & {
      animate?: string;
      custom?: unknown;
      exit?: string;
      initial?: string | boolean;
      transition?: unknown;
      variants?: Record<string, unknown>;
    }
  >(({ animate: _animate, custom, exit: _exit, initial, transition, variants, ...props }, ref) => {
    const initialVariant = typeof initial === 'string' ? variants?.[initial] : undefined;
    const initialStyle =
      typeof initialVariant === 'function'
        ? initialVariant(custom)
        : (initialVariant as { transform?: string } | undefined);

    return (
      <div
        {...props}
        ref={ref}
        data-initial-transform={initialStyle?.transform}
        data-transition={JSON.stringify(transition)}
      />
    );
  });
  MotionDiv.displayName = 'MotionDiv';

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: MotionDiv },
    useReducedMotion: () => motionPreference.reduced,
  };
});

import { Step, Stepper } from './Stepper';

function renderStepper() {
  return render(
    <Stepper>
      <Step>First step</Step>
      <Step>Second step</Step>
    </Stepper>,
  );
}

describe('Stepper motion', () => {
  beforeEach(() => {
    motionPreference.reduced = false;
  });

  it('enters from the right on Next and from the left on Back', async () => {
    const user = userEvent.setup();
    renderStepper();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Second step').parentElement).toHaveAttribute('data-initial-transform', 'translateX(100%)');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('First step').parentElement).toHaveAttribute('data-initial-transform', 'translateX(-100%)');
  });

  it('uses an opacity-only transition when reduced motion is requested', async () => {
    motionPreference.reduced = true;
    const user = userEvent.setup();
    renderStepper();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const content = screen.getByText('Second step').parentElement;

    expect(content).toHaveAttribute('data-initial-transform', 'translateX(0%)');
    expect(content).toHaveAttribute('data-transition', JSON.stringify({ duration: 0.2, ease: 'easeOut' }));
  });
});
