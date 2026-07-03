import React from 'react';

interface SectionTitleProps {
  children: React.ReactNode;
}

/** A section heading with bottom border, used in settings and detail panels. */
export const SectionTitle: React.FC<SectionTitleProps> = ({ children }) => (
  <h2
    style={{
      fontSize: 'var(--heading-xs-font-size)',
      fontWeight: 'var(--heading-xs-font-weight)',
      lineHeight: 'var(--heading-xs-line-height)',
      color: 'var(--text-default)',
      margin: '0 0 var(--spacer-20) 0',
      paddingBottom: 'var(--spacer-12)',
      borderBottom: '1px solid var(--border-neutral-l1)',
    }}
  >
    {children}
  </h2>
);