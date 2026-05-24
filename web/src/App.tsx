import React, { Suspense, lazy, useMemo, useState } from 'react'
import { Layout, Button, Typography, Menu, Grid } from 'antd'
import {
  GithubOutlined,
  DashboardOutlined,
  TeamOutlined,
  ToolOutlined,
  InboxOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons'
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'

const RigsPage = lazy(() => import('./pages/RigsPage'))
const PeoplePage = lazy(() => import('./pages/PeoplePage'))

// Static assets are served from /img (web/public/img)
const logo = '/img/logo1.jpg'
const skydiver = '/img/skydiver.jpg'

const { Header, Content, Sider } = Layout
const { useBreakpoint } = Grid

function HomePage() {
  return (
    <div className="rt-home-card">
      <Typography.Title level={3} style={{ marginTop: 0 }}>Welcome to RigTracker</Typography.Title>
      <Typography.Paragraph style={{ marginBottom: 8 }}>
        Use the sidebar to manage rigs and people records.
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        This layout uses route-based navigation so pages can be bookmarked and shared.
      </Typography.Paragraph>
    </div>
  )
}

function PlaceholderPage({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="rt-home-card">
      <Typography.Title level={4} style={{ marginTop: 0 }}>{title}</Typography.Title>
      <Typography.Paragraph style={{ marginBottom: 0 }}>{summary}</Typography.Paragraph>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const [collapsed, setCollapsed] = useState(false)

  const menuItems = useMemo(() => [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/rigs', icon: <ToolOutlined />, label: 'Rigs' },
    { key: '/people', icon: <TeamOutlined />, label: 'People' },
    { key: '/packs', icon: <InboxOutlined />, label: 'Packs' },
    { key: '/settings', icon: <SettingOutlined />, label: 'Settings' }
  ], [])

  const selectedMenuKey =
    menuItems.find((item) => location.pathname === item.key || location.pathname.startsWith(`${item.key}/`))?.key || '/'

  const isMobile = !screens.lg

  return (
    <Layout className="rt-app-shell" style={{ minHeight: '100vh' }}>
      <Sider
        width={244}
        collapsedWidth={isMobile ? 0 : 76}
        collapsed={isMobile ? true : collapsed}
        onCollapse={(next) => setCollapsed(next)}
        breakpoint="lg"
        theme="light"
        className="rt-sider"
      >
        <div className="rt-brand">
          <img src={logo} style={{ height: 36, width: 36, borderRadius: 8 }} alt="logo" />
          <Typography.Title level={5} style={{ margin: 0, color: '#1b2a41' }}>RigTracker</Typography.Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
        <div className="rt-sider-footer-image-wrap">
          <div
            className="rt-sider-footer-image"
            role="img"
            aria-label="Skydiver"
            style={{ backgroundImage: `url(${skydiver})` }}
          />
        </div>
      </Sider>

      <Layout>
        <Header className="rt-header">
          <div className="rt-header-left">
            {!isMobile && (
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((v) => !v)}
                aria-label="Toggle sidebar"
              />
            )}
            <Typography.Text className="rt-header-title">Operations Console</Typography.Text>
          </div>
          <Button href="https://github.com/brbrockel/RigTracker" target="_blank" rel="noopener noreferrer" icon={<GithubOutlined />}>
            GitHub
          </Button>
        </Header>

        <Content style={{ padding: 20 }}>
          <Suspense fallback={<div className="rt-home-card"><Typography.Text>Loading page...</Typography.Text></div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/rigs" element={<RigsPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/packs" element={<PlaceholderPage title="Packs" summary="Packs navigation is ready. Add the dedicated page when the UI spec is finalized." />} />
              <Route path="/settings" element={<PlaceholderPage title="Settings" summary="Settings is staged as a placeholder for system-level configuration workflows." />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  )
}
