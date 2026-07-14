import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '../ui';
import { isMac, useWindowFilled } from './WindowControls';

const pageTitles: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/providers': 'API 供应商',
  '/models': '模型配置',
  '/settings': '应用设置',
};

export const Shell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const activeKey = pathSegments[0] || 'dashboard';
  const rootPath = pathSegments[0] ? `/${pathSegments[0]}` : '/';
  const pageTitle = pageTitles[location.pathname] || pageTitles[rootPath] || 'Melody Hub';
  const mainRef = useRef<HTMLElement>(null);
  const windowFilled = useWindowFilled();

  // Scroll to top on route change
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div
      className="ds-shell"
      style={{
        display: 'flex',
        width: '100%',
        height: '100vh',
        background: 'var(--bg-base-default)',
        color: 'var(--text-default)',
        fontFamily: 'var(--body-base-font-family)',
        fontSize: 'var(--body-base-font-size)',
        lineHeight: 'var(--body-base-line-height)',
        ['--sidebar-width' as string]: '220px',
        position: 'relative',
        // macOS transparent window needs rounded corners; disable when maximized/fullscreen.
        // Windows keeps sharp corners in all states.
        borderRadius: isMac && !windowFilled ? 10 : 0,
        overflow: 'hidden',
      }}
    >
      {/* Subtle background grain texture */}
      <div
        className="ds-shell__grain"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          opacity: 0.035,
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 512 512\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />
      {/* Subtle radial gradient accent */}
      <div
        className="ds-shell__accent"
        style={{
          position: 'absolute',
          top: '-50%',
          right: '-20%',
          width: '60%',
          height: '60%',
          zIndex: 0,
          pointerEvents: 'none',
          opacity: 0.04,
          background: 'radial-gradient(ellipse at center, var(--bg-brand) 0%, transparent 70%)',
        }}
      />

      <Sidebar activeKey={activeKey} onNavigate={navigate} />
      <div
        className="ds-shell__content"
        style={{
          flex: 'none',
          marginLeft: 'var(--sidebar-width, 220px)',
          width: 'calc(100% - var(--sidebar-width, 220px))',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          background: 'transparent', /* Let grain show through */
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Header title={pageTitle} />
        <main
          ref={mainRef}
          className="ds-shell__main"
          style={{
            flex: 1,
            minHeight: 0,
            padding: 'var(--spacer-24)',
            overflowY: 'auto',
            scrollbarGutter: 'stable',
          }}
          key={location.pathname}
        >
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
};