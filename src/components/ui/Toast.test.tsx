import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer, toast } from './Toast';

const motionPreference = vi.hoisted(() => ({ shouldReduce: false }));

vi.mock('motion/react', async () => {
  const React = await import('react');
  type MotionProps = React.HTMLAttributes<HTMLDivElement> & {
    initial?: React.CSSProperties;
    animate?: React.CSSProperties;
    exit?: React.CSSProperties;
    transition?: unknown;
  };

  const MotionDiv = React.forwardRef<HTMLDivElement, MotionProps>(
    ({ initial, animate, exit, transition, style, ...props }, ref) => (
      <div
        ref={ref}
        data-motion-initial={JSON.stringify(initial)}
        data-motion-animate={JSON.stringify(animate)}
        data-motion-exit={JSON.stringify(exit)}
        data-motion-transition={JSON.stringify(transition)}
        style={{ ...style, ...initial }}
        {...props}
      />
    ),
  );

  const AnimatePresence = ({ children }: { children: React.ReactNode }) => {
    const nextChildren = React.Children.toArray(children) as React.ReactElement[];
    const nextKeys = nextChildren.map((child) => child.key).join('|');
    const [rendered, setRendered] = React.useState(nextChildren);

    React.useEffect(() => {
      setRendered((previous) => {
        const nextKeySet = new Set(nextChildren.map((child) => child.key));
        const exiting = previous.filter((child) => !nextKeySet.has(child.key));

        if (exiting.length > 0) {
          const exitingKeys = new Set(exiting.map((child) => child.key));
          setTimeout(() => {
            setRendered((current) => current.filter((child) => !exitingKeys.has(child.key)));
          }, 200);
        }

        return [...nextChildren, ...exiting];
      });
    }, [nextKeys]);

    return <>{rendered}</>;
  };

  return {
    motion: { div: MotionDiv },
    AnimatePresence,
    useReducedMotion: () => motionPreference.shouldReduce,
  };
});

function setReducedMotion(matches: boolean) {
  motionPreference.shouldReduce = matches;
}

async function advanceTimers(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows a toast after toast is called', () => {
    render(<ToastContainer />);

    act(() => toast('连接成功', 'success'));

    expect(screen.getByText('连接成功')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByText('连接成功').parentElement).toHaveStyle({
      pointerEvents: 'auto',
    });
    expect(screen.getByText('连接成功').parentElement).toHaveAttribute(
      'data-motion-initial',
      JSON.stringify({ opacity: 0, transform: 'translateY(100%) scale(0.97)' }),
    );
    expect(screen.getByText('连接成功').parentElement).toHaveAttribute(
      'data-motion-exit',
      JSON.stringify({ opacity: 0, transform: 'translateY(100%) scale(0.97)' }),
    );
    expect(screen.getByText('连接成功').parentElement).toHaveAttribute(
      'data-motion-transition',
      JSON.stringify({ duration: 0.2, ease: [0.23, 1, 0.32, 1] }),
    );
  });

  it('starts automatic removal after 3000ms and completes after the exit', async () => {
    render(<ToastContainer />);
    act(() => toast('自动关闭'));

    await advanceTimers(2999);
    expect(screen.getByText('自动关闭')).toBeInTheDocument();

    await advanceTimers(1);
    expect(screen.getByText('自动关闭')).toBeInTheDocument();

    await advanceTimers(200);
    expect(screen.queryByText('自动关闭')).not.toBeInTheDocument();
  });

  it('uses the same exit lifecycle when manually closed', async () => {
    render(<ToastContainer />);
    act(() => toast('手动关闭'));

    fireEvent.click(screen.getByRole('button', { name: '关闭通知' }));
    expect(screen.getByText('手动关闭')).toBeInTheDocument();

    await advanceTimers(200);
    expect(screen.queryByText('手动关闭')).not.toBeInTheDocument();
  });

  it('keeps rapidly added toasts independently keyed', async () => {
    render(<ToastContainer />);
    act(() => {
      toast('第一条');
      toast('第二条');
    });

    expect(screen.getByText('第一条')).toBeInTheDocument();
    expect(screen.getByText('第二条')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '关闭通知' })[0]);
    await advanceTimers(200);
    expect(screen.queryByText('第一条')).not.toBeInTheDocument();
    expect(screen.getByText('第二条')).toBeInTheDocument();
  });

  it('removes translation and scaling from the reduced-motion hidden state', () => {
    setReducedMotion(true);
    render(<ToastContainer />);

    act(() => toast('减少动态'));

    expect(screen.getByText('减少动态').parentElement).toHaveStyle({
      opacity: '0',
      transform: 'translateY(0%) scale(1)',
    });
    expect(screen.getByText('减少动态').parentElement).toHaveAttribute(
      'data-motion-exit',
      JSON.stringify({ opacity: 0, transform: 'translateY(0%) scale(1)' }),
    );
  });
});
