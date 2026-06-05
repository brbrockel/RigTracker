import React, { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, DatePicker, Space, Select, message, Grid } from 'antd'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

type Rig = any

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

export default function RigsPage() {
  const [rigs, setRigs] = useState<Rig[]>([])
  const [people, setPeople] = useState<Record<string,string>>({})
  const [peopleList, setPeopleList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState<Rig | null>(null)
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const isVerySmall = screens.xs === false

  const [form] = Form.useForm()

  async function load() {
    setLoading(true)
    try {
      const [rRes, pRes] = await Promise.all([fetch(`${API_BASE}/api/rigs`), fetch(`${API_BASE}/api/people`)])
      const rJson = await rRes.json()
      const pJson = await pRes.json()
      const pMap: Record<string,string> = {}
      const pList: any[] = []
      pJson.forEach((p: any) => {
        const id = p._id || p.id
        const parts = [p.firstName, p.middleName, p.lastName].filter(Boolean).map((s: string) => String(s).trim())
        const name = parts.join(' ').trim()
        pMap[id] = name
        pList.push({ id, name })
      })
      setPeople(pMap)
      setPeopleList(pList)
      setRigs(rJson)
    } catch (err) {
      console.error(err)
      message.error('Failed to load rigs')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openCreate() { setEditing(null); form.resetFields(); setVisible(true) }

  function openEdit(r: Rig) {
    setEditing(r)
    const copy = { ...r }
    if (copy.lastPacked) copy.lastPacked = dayjs(copy.lastPacked)
    if (copy.repackDue) copy.repackDue = dayjs(copy.repackDue)
    form.setFieldsValue(copy)
    setVisible(true)
  }

  async function remove(id: string) {
    if (!confirm('Delete rig?')) return
    await fetch(`${API_BASE}/api/rigs/${id}`, { method: 'DELETE' })
    load()
  }

  async function save() {
    const vals = await form.validateFields()
    const payload = { ...vals }
    if (payload.lastPacked) payload.lastPacked = payload.lastPacked.toISOString()
    if (payload.repackDue) payload.repackDue = payload.repackDue.toISOString()
    try {
      if (editing && editing._id) {
        await fetch(`${API_BASE}/api/rigs/${editing._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        await fetch(`${API_BASE}/api/rigs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      setVisible(false)
      load()
    } catch (err) {
      console.error(err)
      message.error('Save failed')
    }
  }

  const desktopColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Number', dataIndex: 'number', key: 'number' },
    { title: 'Container', dataIndex: 'container', key: 'container' },
    { title: 'Container Serial', dataIndex: 'containerSerialNumber', key: 'containerSerialNumber' },
    { title: 'Assigned', key: 'assigned', render: (_: any, r: any) => people[r.primaryUserId] || '' },
    { title: 'Last Packed', dataIndex: 'lastPacked', key: 'lastPacked', render: (v: any) => v ? dayjs(v).format('YYYY-MM-DD') : '' },
    { title: 'Repack Due', dataIndex: 'repackDue', key: 'repackDue', render: (v: any) => v ? dayjs(v).format('YYYY-MM-DD') : '' },
    { title: 'AAD Type', dataIndex: 'aadType', key: 'aadType' },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', render: (t: any) => t ? String(t).slice(0, 80) + (String(t).length > 80 ? '…' : '') : '' },
    { title: 'Actions', key: 'actions', width: 170, render: (_: any, r: any) => (
      <Space>
        <Button size={isMobile ? 'small' : 'middle'} onClick={() => openEdit(r)}>Edit</Button>
        <Button size={isMobile ? 'small' : 'middle'} danger onClick={() => remove(r._id)}>Delete</Button>
      </Space>
    ) }
  ]

  const mobileColumns = [
    { title: 'Rig', dataIndex: 'name', key: 'name', width: 110, ellipsis: true },
    { title: 'Assigned', key: 'assigned', width: 110, ellipsis: true, render: (_: any, r: any) => people[r.primaryUserId] || 'Unassigned' },
    { title: 'Due', dataIndex: 'repackDue', key: 'repackDue', width: 96, render: (v: any) => v ? dayjs(v).format('MM-DD-YY') : 'N/A' },
    { title: 'Actions', key: 'actions', width: 80, render: (_: any, r: any) => (
      <Space size={0}>
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>{isVerySmall ? null : 'Edit'}</Button>
        <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(r._id)}>{isVerySmall ? null : 'Del'}</Button>
      </Space>
    ) }
  ]

  const columns = isMobile ? mobileColumns : desktopColumns

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <div style={{ marginBottom: isMobile ? 8 : 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size={isMobile ? 'small' : 'middle'} type="primary" onClick={openCreate}>New Rig</Button>
        <Button size={isMobile ? 'small' : 'middle'} onClick={load}>Refresh</Button>
      </div>
      {isMobile ? (
        <div className="rt-mobile-card-list">
          {rigs.map((r: any) => (
            <div key={r._id || r.id} className="rt-mobile-card-item">
              <div className="rt-mobile-card-title">{r.name || 'Unnamed Rig'}</div>
              <div className="rt-mobile-card-meta">Assigned: {people[r.primaryUserId] || 'Unassigned'}</div>
              <div className="rt-mobile-card-meta">Repack Due: {r.repackDue ? dayjs(r.repackDue).format('YYYY-MM-DD') : 'N/A'}</div>
              <div className="rt-mobile-card-actions">
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
                <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(r._id)}>Delete</Button>
              </div>
            </div>
          ))}
          {!loading && rigs.length === 0 && <div className="rt-mobile-empty">No rigs found.</div>}
        </div>
      ) : (
        <Table
          className={isVerySmall ? 'rt-compact-table rt-ultra-compact-table' : 'rt-compact-table'}
          dataSource={rigs}
          rowKey={(r:any) => r._id || r.id}
          loading={loading}
          columns={columns}
          size={isMobile ? 'small' : 'middle'}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, showSizeChanger: false, size: 'default' }}
        />
      )}

      <Modal open={visible} title={editing ? 'Edit Rig' : 'New Rig'} onCancel={() => setVisible(false)} onOk={save}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="number" label="Number"><Input /></Form.Item>
          <Form.Item name="container" label="Container"><Input /></Form.Item>
          <Form.Item name="containerSerialNumber" label="Container Serial"><Input /></Form.Item>
          <Form.Item name="primaryUserId" label="Assigned">
            <Select showSearch allowClear placeholder="Select person" optionFilterProp="children" filterOption={(input, option) => {
              return String(option?.children).toLowerCase().includes(String(input).toLowerCase())
            }}>
              {peopleList.map(p => (
                <Select.Option key={p.id} value={p.id}>{String(p.name).trim()}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="lastPacked" label="Last Packed"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="repackDue" label="Repack Due"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="aadType" label="AAD Type"><Input /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
