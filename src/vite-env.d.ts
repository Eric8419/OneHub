/// <reference types="vite/client" />

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { CSSProperties } from 'react';

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag';
  }
}

