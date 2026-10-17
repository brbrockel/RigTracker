import React, { useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal, Popconfirm, Space, Table, Select, Typography, message, Grid, Tag } from 'antd'
import { smsHref } from '../lib/sms'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

type AppUser = {
  id: string
  email: string
  displayName: string
  roles: string[]
  isActive: boolean
  lastLoginAt: string | null
  loginCount: number
}

export default function SettingsPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [linkFor, setLinkFor] = useState<string | null>(null)
  const [linkInfo, setLinkInfo] = useState<{ link: string; email: string; expiresAt: string } | null>(null)
  const screens = useBreakpoint()
  const isMobile = !screens.md

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/users`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load users')
      setUsers(await res.json())
    } catch (err) {
      console.error(err)
      message.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const statusFilters = useMemo(() => ([
    { text: 'Active', value: 'active' },
    { text: 'Inactive', value: 'inactive' },
  ]), [])

  async function changeRole(userId: string, role: string) {
    setUpdatingId(userId)
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${userId}/role`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to update role')
      }
      const updated: AppUser = await res.json()
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      message.success(`${updated.displayName || updated.email} is now ${role}`)
    } catch (err: any) {
      console.error(err)
      message.error(err?.message || 'Failed to update role')
    } finally {
      setUpdatingId(null)
    }
  }

  async function addUser() {
    setAdding(true)
    try {
      const res = await fetch(`${API_BASE}/api/auth/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), role: newRole, displayName: newName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to add user')
      }
      const added: AppUser = await res.json()
      setUsers((prev) => [...prev, added])
      setNewEmail('')
      setNewName('')
      message.success(`Added ${added.email}. Use Sign-in link to send them a link.`)
    } catch (err: any) {
      message.error(err?.message || 'Failed to add user')
    } finally {
      setAdding(false)
    }
  }

  async function getLink(u: AppUser) {
    setLinkFor(u.id)
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${u.id}/link`, { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to make a sign-in link')
      setLinkInfo(data)
    } catch (err: any) {
      message.error(err?.message || 'Failed to make a sign-in link')
    } finally {
      setLinkFor(null)
    }
  }

  async function signOutEverywhere(u: AppUser) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/users/${u.id}/sign-out`, { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error()
      message.success(`${u.displayName || u.email} is signed out on every device`)
    } catch {
      message.error('Failed to sign out')
    }
  }

  const linkMessage = linkInfo
    ? `Your RigTracker sign-in link (works once, for 72 hours): ${linkInfo.link}`
    : ''

  const actionsColumn = {
    title: 'Actions',
    key: 'actions',
    render: (_: any, u: AppUser) => (
      <Space wrap size={4}>
        <Button size="small" loading={linkFor === u.id} disabled={!u.isActive} onClick={() => getLink(u)}>Sign-in link</Button>
        <Popconfirm title={`Sign ${u.displayName || u.email} out on every device?`} onConfirm={() => signOutEverywhere(u)}>
          <Button size="small">Sign out everywhere</Button>
        </Popconfirm>
      </Space>
    ),
  }

  const desktopColumns = [
    {
      title: 'Name',
      key: 'name',
      render: (_: any, u: AppUser) => (
        <span>{u.displayName || u.email}</span>
      ),
      sorter: (a: AppUser, b: AppUser) => String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || '')),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a: AppUser, b: AppUser) => String(a.email || '').localeCompare(String(b.email || '')),
    },
    {
      title: 'Role',
      key: 'role',
      width: 140,
      render: (_: any, u: AppUser) => {
        const currentRole = u.roles.includes('admin') ? 'admin' : 'user'
        return (
          <Select
            value={currentRole}
            size="small"
            style={{ width: 110 }}
            loading={updatingId === u.id}
            disabled={updatingId === u.id}
            onChange={(val) => changeRole(u.id, val)}
            options={[
              { value: 'user', label: 'User' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        )
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 90,
      render: (_: any, u: AppUser) =>
        u.isActive ? <Tag color="green">Active</Tag> : <Tag color="red">Inactive</Tag>,
      filters: statusFilters,
      onFilter: (value: any, record: AppUser) => String(value) === (record.isActive ? 'active' : 'inactive'),
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      render: (v: string | null) => v ? new Date(v).toLocaleString() : 'Never',
      sorter: (a: AppUser, b: AppUser) => {
        const av = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0
        const bv = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0
        return av - bv
      },
    },
    {
      title: 'Logins',
      dataIndex: 'loginCount',
      key: 'loginCount',
      width: 80,
      sorter: (a: AppUser, b: AppUser) => Number(a.loginCount || 0) - Number(b.loginCount || 0),
    },
    actionsColumn,
  ]

  const mobileColumns = [
    {
      title: 'User',
      key: 'user',
      render: (_: any, u: AppUser) => (
        <div>
          <div style={{ fontWeight: 500 }}>{u.displayName || u.email}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{u.email}</div>
        </div>
      ),
    },
    {
      title: 'Role',
      key: 'role',
      width: 120,
      render: (_: any, u: AppUser) => {
        const currentRole = u.roles.includes('admin') ? 'admin' : 'user'
        return (
          <Select
            value={currentRole}
            size="small"
            style={{ width: 100 }}
            loading={updatingId === u.id}
            disabled={updatingId === u.id}
            onChange={(val) => changeRole(u.id, val)}
            options={[
              { value: 'user', label: 'User' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        )
      },
    },
    actionsColumn,
  ]

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>User Management</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Only people added here can sign in. Add them, then use <strong>Sign-in link</strong> to text or email them a link. Each link works once and expires after 72 hours.
      </Typography.Paragraph>
      <Space.Compact direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%', maxWidth: 680, marginBottom: 16 }}>
        <Input
          placeholder="Name (optional)"
          aria-label="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={isMobile ? undefined : { maxWidth: 200 }}
        />
        <Input
          type="email"
          placeholder="name@example.com"
          aria-label="Email address to add"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onPressEnter={() => newEmail.trim() && addUser()}
        />
        <Select
          value={newRole}
          onChange={setNewRole}
          style={{ width: 110 }}
          aria-label="Role"
          options={[
            { value: 'user', label: 'User' },
            { value: 'admin', label: 'Admin' },
          ]}
        />
        <Button type="primary" loading={adding} disabled={!newEmail.trim()} onClick={addUser}>Add</Button>
      </Space.Compact>
      <Table
        className="rt-compact-table"
        dataSource={users}
        rowKey={(u) => u.id}
        loading={loading}
        columns={isMobile ? mobileColumns : desktopColumns}
        size={isMobile ? 'small' : 'middle'}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, showSizeChanger: false, size: 'default' }}
      />
      <Modal
        open={!!linkInfo}
        title={linkInfo ? `Sign-in link for ${linkInfo.email}` : ''}
        onCancel={() => setLinkInfo(null)}
        footer={<Button onClick={() => setLinkInfo(null)}>Done</Button>}
      >
        {linkInfo ? (
          <>
            <Typography.Paragraph type="secondary">
              Works once, until {new Date(linkInfo.expiresAt).toLocaleString()}. Anyone with the link can sign in as this person, so send it only to them.
            </Typography.Paragraph>
            <Input.TextArea value={linkInfo.link} readOnly autoSize aria-label="Sign-in link" onFocus={(e) => e.target.select()} />
            <Space wrap style={{ marginTop: 12 }}>
              <Button
                type="primary"
                onClick={() => navigator.clipboard.writeText(linkInfo.link).then(() => message.success('Link copied'), () => message.error('Copy failed; select the link and copy it'))}
              >
                Copy link
              </Button>
              <Button href={smsHref([], linkMessage)}>Text</Button>
              <Button href={`mailto:${encodeURIComponent(linkInfo.email)}?subject=${encodeURIComponent('Your RigTracker sign-in link')}&body=${encodeURIComponent(linkMessage)}`}>Email</Button>
            </Space>
          </>
        ) : null}
      </Modal>
    </div>
  )
}
