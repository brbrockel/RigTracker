import React, { useEffect, useState } from 'react'
import { Table, Select, Typography, Tag, Grid, Space } from 'antd'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

type AuditEntry = {
  _id: string
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  resource: string
  resourceId: string
  resourceName?: string
  userEmail?: string
  userDisplayName?: string
  createdAt: string
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
}

const RESOURCE_OPTIONS = [
  { value: '', label: 'All resources' },
  { value: 'gear', label: 'Gear' },
  { value: 'rigs', label: 'Rigs' },
  { value: 'people', label: 'People' },
  { value: 'events', label: 'Events' },
]

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'CREATE', label: 'Create' },
  { value: 'UPDATE', label: 'Update' },
  { value: 'DELETE', label: 'Delete' },
]

const PAGE_SIZE = 50

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [resource, setResource] = useState('')
  const [action, setAction] = useState('')
  const screens = useBreakpoint()
  const isMobile = !screens.md

  async function load(p: number, res: string, act: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) })
      if (res) params.set('resource', res)
      if (act) params.set('action', act)
      const resp = await fetch(`${API_BASE}/api/audit?${params}`, { credentials: 'include' })
      if (!resp.ok) throw new Error('Failed to load audit log')
      const data = await resp.json()
      setLogs(data.logs)
      setTotal(data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(page, resource, action) }, [page, resource, action])

  function handleResourceChange(val: string) { setResource(val); setPage(1) }
  function handleActionChange(val: string) { setAction(val); setPage(1) }

  const desktopColumns = [
    {
      title: 'When',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 90,
      render: (v: string) => <Tag color={ACTION_COLORS[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: 'Resource',
      dataIndex: 'resource',
      key: 'resource',
      width: 100,
      render: (v: string) => v.charAt(0).toUpperCase() + v.slice(1),
    },
    {
      title: 'Name / ID',
      key: 'target',
      render: (_: any, r: AuditEntry) => r.resourceName || r.resourceId,
    },
    {
      title: 'By',
      key: 'by',
      render: (_: any, r: AuditEntry) => r.userDisplayName || r.userEmail || 'Unknown',
    },
  ]

  const mobileColumns = [
    {
      title: 'When',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 110,
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 80,
      render: (v: string) => <Tag color={ACTION_COLORS[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: 'Resource',
      key: 'target',
      render: (_: any, r: AuditEntry) => (
        <div>
          <div style={{ fontSize: 12, color: '#888' }}>{r.resource}</div>
          <div>{r.resourceName || r.resourceId}</div>
        </div>
      ),
    },
  ]

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>Audit Log</Typography.Title>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          value={resource}
          onChange={handleResourceChange}
          options={RESOURCE_OPTIONS}
          style={{ width: 150 }}
          size="small"
        />
        <Select
          value={action}
          onChange={handleActionChange}
          options={ACTION_OPTIONS}
          style={{ width: 130 }}
          size="small"
        />
      </Space>
      <Table
        className="rt-compact-table"
        dataSource={logs}
        rowKey={(r) => r._id}
        loading={loading}
        columns={isMobile ? mobileColumns : desktopColumns}
        size={isMobile ? 'small' : 'middle'}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          size: 'default',
          onChange: (p) => setPage(p),
        }}
      />
    </div>
  )
}
