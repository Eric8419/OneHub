import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./WindowControls', () => ({ WindowControls: () => null }));

import { Header } from './Header';

describe('Header menu motion', () => {
  it('uses a top-right origin and motion for pointer interaction', async () => {
    const user = userEvent.setup();
    render(<Header title="Dashboard" />);

    await user.click(screen.getByRole('button', { name: 'U' }));
    const menu = screen.getByRole('menu');

    expect(menu).toHaveAttribute('data-open', 'true');
    expect(menu).toHaveAttribute('data-motion', 'true');
    expect(menu).toHaveStyle({
      transformOrigin: 'top right',
      transform: 'translateY(0) scale(1)',
    });
  });

  it.each(['Enter', ' '])('opens instantly with the %s key', async (key) => {
    const user = userEvent.setup();
    render(<Header title="Dashboard" />);

    const trigger = screen.getByRole('button', { name: 'U' });
    trigger.focus();
    await user.keyboard(key === ' ' ? ' ' : `{${key}}`);

    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('data-open', 'true');
    expect(menu).toHaveAttribute('data-motion', 'false');
    expect(menu).toHaveStyle({ transition: 'none' });
  });

  it('closes instantly with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Header title="Dashboard" />);

    const trigger = screen.getByRole('button', { name: 'U' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('data-open', 'false');
    expect(menu).toHaveAttribute('data-motion', 'false');
    expect(menu).toHaveStyle({ transition: 'none' });
    expect(trigger).toHaveFocus();
  });
});
