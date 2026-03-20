import React, { useState } from 'react'
import { Layout, Button, Typography } from 'antd'
import { GithubOutlined } from '@ant-design/icons'
import RigsPage from './pages/RigsPage'
import PeoplePage from './pages/PeoplePage'

// Static assets are served from /img (web/public/img)
const logo = '/img/logo1.jpg'
const bg = '/img/background.jpg'

const { Header, Content } = Layout

export default function App() {
  const [page, setPage] = useState<'home' | 'rigs' | 'people'>('home')

  return (
    <Layout style={{ minHeight: '100vh', backgroundImage: `url(${bg})`, backgroundSize: 'cover' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src={logo} style={{ height: 40 }} alt="logo" />
        <Typography.Title level={3} style={{ color: '#fff', margin: 0 }}>RigTracker</Typography.Title>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <Button type={page === 'home' ? 'primary' : 'default'} onClick={() => setPage('home')} style={{ marginRight: 8 }}>Home</Button>
          <Button type={page === 'rigs' ? 'primary' : 'default'} onClick={() => setPage('rigs')} style={{ marginRight: 8 }}>Rigs</Button>
          <Button type={page === 'people' ? 'primary' : 'default'} onClick={() => setPage('people')}>People</Button>
          <Button href="https://github.com/brbrockel/RigTracker" target="_blank" rel="noopener noreferrer" icon={<GithubOutlined />} style={{ marginLeft: 12 }}>
            View on GitHub
          </Button>
        </div>
      </Header>
      <Content style={{ padding: 24 }}>
        {page === 'home' && <div style={{ padding: 24, background: 'rgba(255,255,255,0.9)', borderRadius: 8 }}>
          <Typography.Title level={4}>Welcome to RigTracker</Typography.Title>
          <p>Use the Rigs and People pages to manage equipment and allocations.</p>
        </div>}
        {page === 'rigs' && <RigsPage />}
        {page === 'people' && <PeoplePage />}
      </Content>
    </Layout>
  )
}
