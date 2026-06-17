import React, { useEffect, useState } from 'react'
import { Table, Select, Typography, message, Grid, Tag } from 'antd'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

type AppUser = {
  id: string
  email: string
  displayName: string
  pictureUrl?: string
  roles: string[]
  isActive: boolean
  lastLoginAt: string | null
  loginCount: number
}

export default function SettingsPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
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

  const desktopColumns = [
    {
      title: 'Name',
      key: 'name',
      render: (_: any, u: AppUser) => (
        <span>{u.displayName || u.email}</span>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
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
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      render: (v: string | null) => v ? new Date(v).toLocaleString() : 'Never',
    },
    {
      title: 'Logins',
      dataIndex: 'loginCount',
      key: 'loginCount',
      width: 80,
    },
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
  ]

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>User Management</Typography.Title>
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
    </div>
  )
}
