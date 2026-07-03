import React from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '../ui';

const pageTitles: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/models': '模型配置',
  '/settings': '应用设置',
};

export const Shell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const activeKey = location.pathname.replace('/', '') || 'dashboard';
  const pageTitle = pageTitles[location.pathname] || 'Melody Hub';

  return (
    <div
      className="ds-shell"
      style={{
        display: 'flex',
        width: '100%',
        minHeight: '100vh',
        background: 'var(--bg-base-default)',
        color: 'var(--text-default)',
        fontFamily: 'var(--body-base-font-family)',
        fontSize: 'var(--body-base-font-size)',
        lineHeight: 'var(--body-base-line-height)',
      }}
    >
      <Sidebar activeKey={activeKey} onNavigate={navigate} />
      <div
        className="ds-shell__content"
        style={{
          flex: '1 0 auto',
          marginLeft: 220,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          background: 'var(--bg-base-default)',
        }}
      >
        <Header title={pageTitle} />
        <main
          className="ds-shell__main"
          style={{
            flex: '1 0 auto',
            padding: 'var(--spacer-24)',
            overflowY: 'auto',
          }}
        >
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
};