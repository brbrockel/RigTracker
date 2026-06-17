import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Layout, Button, Typography, Menu, Grid, Space, message } from 'antd'
import {
  GithubOutlined,
  DashboardOutlined,
  TeamOutlined,
  ToolOutlined,
  InboxOutlined,
  CalendarOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons'
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'

const RigsPage = lazy(() => import('./pages/RigsPage'))
const PeoplePage = lazy(() => import('./pages/PeoplePage'))
const GearPage = lazy(() => import('./pages/GearPage'))
const EventsPage = lazy(() => import('./pages/EventsPage'))
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'))
const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''

// Static assets are served from /img (web/public/img)
const logo = '/img/logo1.jpg'
const skydiver = '/img/skydiver.jpg'

const { Header, Content, Sider } = Layout
const { useBreakpoint } = Grid

function HomePage() {
  return (
    <div className="rt-home-card rt-home-dashboard-card">
      <Typography.Title level={3} style={{ marginTop: 0 }}>Welcome to RigTracker</Typography.Title>
      <Typography.Paragraph style={{ marginBottom: 8 }}>
        Use the sidebar to manage rigs and people records.
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        This layout uses route-based navigation so pages can be bookmarked and shared.
      </Typography.Paragraph>
      <img src={skydiver} className="rt-home-inline-image" alt="Skydiver" />
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

type AuthUser = {
  id: string
  email: string
  displayName: string
  roles: string[]
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  const menuItems = useMemo(() => [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/people', icon: <TeamOutlined />, label: 'People' },
    { key: '/rigs', icon: <ToolOutlined />, label: 'Rigs' },
    { key: '/gear', icon: <InboxOutlined />, label: 'Gear' },
    { key: '/events', icon: <CalendarOutlined />, label: 'Events' },
    { key: '/settings', icon: <SettingOutlined />, label: 'Settings' }
  ], [])

  const selectedMenuKey =
    menuItems.find((item) => location.pathname === item.key || location.pathname.startsWith(`${item.key}/`))?.key || '/'

  const isMobile = !screens.lg
  const siderCollapsed = isMobile ? !mobileOpen : desktopCollapsed

  async function loadAuthState() {
    setLoadingAuth(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
      if (!res.ok) {
        setAuthUser(null)
        return
      }
      const data = await res.json()
      setAuthUser(data?.authenticated ? data.user : null)
    } catch (err) {
      setAuthUser(null)
    } finally {
      setLoadingAuth(false)
    }
  }

  useEffect(() => {
    loadAuthState()
  }, [])

  async function logout() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error('Logout failed')
      setAuthUser(null)
      message.success('Signed out')
    } catch (err) {
      console.error(err)
      message.error('Failed to sign out')
    }
  }

  function startGoogleLogin() {
    window.location.href = `${API_BASE}/api/auth/google`
  }

  return (
    <Layout className="rt-app-shell" style={{ minHeight: '100vh' }}>
      <Sider
        width={244}
        collapsedWidth={isMobile ? 0 : 76}
        collapsed={siderCollapsed}
        onCollapse={(next) => {
          if (isMobile) {
            setMobileOpen(!next)
            return
          }
          setDesktopCollapsed(next)
        }}
        breakpoint="lg"
        theme="light"
        className="rt-sider"
      >
        <div className="rt-brand">
          <img src={logo} style={{ height: 36, width: 36, borderRadius: 8 }} alt="logo" />
          {!siderCollapsed && <Typography.Title level={5} style={{ margin: 0, color: '#1b2a41' }}>RigTracker</Typography.Title>}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          items={menuItems}
          onClick={({ key }) => {
            navigate(key)
            if (isMobile) {
              setMobileOpen(false)
            }
          }}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header className="rt-header">
          <div className="rt-header-left">
            <Button
              type="text"
              icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => {
                if (isMobile) {
                  setMobileOpen((v) => !v)
                  return
                }
                setDesktopCollapsed((v) => !v)
              }}
              aria-label="Toggle sidebar"
            />
            <Typography.Text className="rt-header-title">Operations Console</Typography.Text>
          </div>
          <Space>
            {!loadingAuth ? (
              <Typography.Text type="secondary">
                {authUser ? `Signed in: ${authUser.displayName || authUser.email}` : 'Guest mode'}
              </Typography.Text>
            ) : null}
            {authUser ? (
              <Button onClick={logout}>Sign Out</Button>
            ) : (
              <Button type="primary" onClick={startGoogleLogin}>Sign In with Google</Button>
            )}
            <Button href="https://github.com/brbrockel/RigTracker" target="_blank" rel="noopener noreferrer" icon={<GithubOutlined />}>
              GitHub
            </Button>
          </Space>
        </Header>

        <Content style={{ padding: 20 }}>
          <Suspense fallback={<div className="rt-home-card"><Typography.Text>Loading page...</Typography.Text></div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/rigs" element={<RigsPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/gear" element={<GearPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/settings" element={<PlaceholderPage title="Settings" summary="Settings is staged as a placeholder for system-level configuration workflows." />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  )
}
