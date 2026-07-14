/// <reference types="vite/client" />

import type { CSSProperties } from 'react';

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag';
  }
}

