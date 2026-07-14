import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

const isMac = (() => {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
})();

function useMaximized() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => win.isMaximized().then(setMaximized));
    return () => { unlisten.then(fn => fn()); };
  }, []);
  return maximized;
}

// Whether the window currently fills the screen (maximized or fullscreen).
// Used to disable rounded corners when the window has no visible borders.
export function useWindowFilled() {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    const check = async () => {
      try {
        const [m, f] = await Promise.all([win.isMaximized(), win.isFullscreen()]);
        setFilled(m || f);
      } catch {
        /* Tauri API may be unavailable in browser */
      }
    };
    check();
    const unlisten = win.onResized(check);
    return () => { unlisten.then(fn => fn()); };
  }, []);
  return filled;
}

// ── Windows / Linux style ──────────────────────────────────

const WinBtn: React.FC<{
  onClick: () => void;
  ariaLabel: string;
  hoverColor: string;
  hoverText?: string;
  children: React.ReactNode;
}> = ({ onClick, ariaLabel, hoverColor, hoverText, children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 46,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        background: hovered ? hoverColor : 'transparent',
        color: hovered && hoverText ? hoverText : 'var(--text-secondary)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.08s ease, color 0.08s ease',
      }}
    >
      {children}
    </button>
  );
};

const WinControls: React.FC = () => {
  const maximized = useMaximized();

  const handleClick = (action: 'close' | 'minimize' | 'maximize') => {
    const win = getCurrentWindow();
    if (action === 'close') win.close();
    else if (action === 'minimize') win.minimize();
    else win.toggleMaximize();
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '100%',
      }}
    >
      <WinBtn onClick={() => handleClick('minimize')} ariaLabel="最小化" hoverColor="var(--bg-overlay-l2)">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 5H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </WinBtn>
      <WinBtn onClick={() => handleClick('maximize')} ariaLabel="最大化" hoverColor="var(--bg-overlay-l2)">
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1.5" y="3" width="5" height="5" stroke="currentColor" strokeWidth="1.1" fill="none" />
            <path d="M3.5 3V1.5H8.5V6.5H7" stroke="currentColor" strokeWidth="1.1" fill="none" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1.1" fill="none" />
          </svg>
        )}
      </WinBtn>
      <WinBtn
        onClick={() => handleClick('close')}
        ariaLabel="关闭"
        hoverColor="#E81123"
        hoverText="#FFFFFF"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </WinBtn>
    </div>
  );
};

// ── Export ─────────────────────────────────────────────────
// macOS uses native traffic lights via titleBarStyle: "Overlay".
// Only Windows/Linux need custom window controls.

export const WindowControls: React.FC = () => {
  // On macOS, native traffic lights are rendered by the system.
  if (isMac) return null;
  return <WinControls />;
};

export { isMac };
