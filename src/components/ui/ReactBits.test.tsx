import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AnimatedContent } from './ReactBits';

describe('AnimatedContent', () => {
  it('renders the chosen intrinsic element', () => {
    render(<AnimatedContent as="section">Proxy</AnimatedContent>);
    expect(screen.getByText('Proxy').tagName).toBe('SECTION');
  });
});
