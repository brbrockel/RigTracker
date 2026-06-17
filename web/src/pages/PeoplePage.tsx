import React, { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, message, Grid, Space } from 'antd'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import isEmail from 'validator/lib/isEmail'
import { actionErrorMessage, ensureOk } from '../lib/apiClient'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

type PeoplePageProps = {
  canWrite: boolean
  canDelete: boolean
}

export default function PeoplePage({ canWrite, canDelete }: PeoplePageProps) {
  const [people, setPeople] = useState<any[]>([])
  const [country] = useState('US')
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form] = Form.useForm()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const isVerySmall = screens.xs === false

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/people`)
      const j = await res.json()
      setPeople(j)
    } catch (err) {
      console.error(err)
      message.error('Failed to load people')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openCreate() { setEditing(null); form.resetFields(); setVisible(true) }
  function openEdit(p: any) { setEditing(p); form.setFieldsValue(p); setVisible(true) }

  function formatPhoneForDisplay(phone?: string) {
    if (!phone) return ''
    try {
      const pn = parsePhoneNumberFromString(String(phone))
      return pn ? pn.formatInternational() : String(phone)
    } catch (err) {
      return String(phone)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete person?')) return
    try {
      const res = await fetch(`${API_BASE}/api/people/${id}`, { method: 'DELETE', credentials: 'include' })
      await ensureOk(res, 'Delete failed')
      load()
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Delete failed'))
    }
  }

  async function save() {
    try {
      const vals = await form.validateFields()
      // normalize email and phone before sending
      if (vals.email) vals.email = String(vals.email).trim().toLowerCase()
      if (vals.phone) {
        const pn = parsePhoneNumberFromString(String(vals.phone), vals.country || country)
        if (!pn || !pn.isValid()) throw new Error('Invalid phone')
        vals.phone = pn.format('E.164')
      }
      if (editing && editing._id) {
        const res = await fetch(`${API_BASE}/api/people/${editing._id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals) })
        await ensureOk(res, 'Save failed')
      } else {
        const res = await fetch(`${API_BASE}/api/people`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals) })
        await ensureOk(res, 'Save failed')
      }
      setVisible(false)
      load()
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Save failed'))
    }
  }

  const desktopColumns = [
    { title: 'First', dataIndex: 'firstName', key: 'firstName' },
    { title: 'Middle', dataIndex: 'middleName', key: 'middleName' },
    { title: 'Last', dataIndex: 'lastName', key: 'lastName' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', render: (v: any) => formatPhoneForDisplay(v) },
    ...(canWrite || canDelete ? [{
      title: 'Actions', key: 'actions', width: 170, render: (_: any, p: any) => (
      <Space>
        {canWrite ? <Button size={isMobile ? 'small' : 'middle'} onClick={() => openEdit(p)}>Edit</Button> : null}
        {canDelete ? <Button size={isMobile ? 'small' : 'middle'} danger onClick={() => remove(p._id)}>Delete</Button> : null}
      </Space>
    ) }] : [])
  ]

  const mobileColumns = [
    {
      title: 'Name',
      key: 'name',
      width: 130,
      render: (_: any, p: any) => [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ').trim() || 'Unnamed'
    },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 122, ellipsis: true, render: (v: any) => formatPhoneForDisplay(v) || 'N/A' },
    ...(canWrite || canDelete ? [{ title: 'Actions', key: 'actions', width: 80, render: (_: any, p: any) => (
      <Space size={0}>
        {canWrite ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)}>{isVerySmall ? null : 'Edit'}</Button> : null}
        {canDelete ? <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(p._id)}>{isVerySmall ? null : 'Del'}</Button> : null}
      </Space>
    ) }] : [])
  ]

  const columns = isMobile ? mobileColumns : desktopColumns

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <div style={{ marginBottom: isMobile ? 8 : 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canWrite ? <Button size={isMobile ? 'small' : 'middle'} type="primary" onClick={openCreate}>New Person</Button> : null}
        <Button size={isMobile ? 'small' : 'middle'} onClick={load}>Refresh</Button>
      </div>
      {isMobile ? (
        <div className="rt-mobile-card-list">
          {people.map((p: any) => (
            <div key={p._id || p.id} className="rt-mobile-card-item">
              <div className="rt-mobile-card-title">{[p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ').trim() || 'Unnamed'}</div>
              <div className="rt-mobile-card-meta">Phone: {formatPhoneForDisplay(p.phone) || 'N/A'}</div>
              <div className="rt-mobile-card-meta">Email: {p.email || 'N/A'}</div>
              <div className="rt-mobile-card-actions">
                {canWrite ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)}>Edit</Button> : null}
                {canDelete ? <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(p._id)}>Delete</Button> : null}
              </div>
            </div>
          ))}
          {!loading && people.length === 0 && <div className="rt-mobile-empty">No people found.</div>}
        </div>
      ) : (
        <Table
          className={isVerySmall ? 'rt-compact-table rt-ultra-compact-table' : 'rt-compact-table'}
          dataSource={people}
          rowKey={(p:any) => p._id || p.id}
          columns={columns}
          loading={loading}
          size={isMobile ? 'small' : 'middle'}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, showSizeChanger: false, size: 'default' }}
        />
      )}

      <Modal open={visible} onCancel={() => setVisible(false)} onOk={save} title={editing ? 'Edit Person' : 'New Person'} okButtonProps={{ disabled: !canWrite }}>
        <Form form={form} layout="vertical" disabled={!canWrite}>
          <Form.Item name="firstName" label="First name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="middleName" label="Middle name"><Input /></Form.Item>
          <Form.Item name="lastName" label="Last name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ validator: (_: any, val: string) => !val || isEmail(String(val)) ? Promise.resolve() : Promise.reject('Enter a valid email') }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone" rules={[{ validator: (_: any, val: string) => {
            if (!val) return Promise.resolve()
            try {
              const pn = parsePhoneNumberFromString(String(val))
              return pn && pn.isValid() ? Promise.resolve() : Promise.reject('Enter a valid phone number')
            } catch (err) {
              return Promise.reject('Enter a valid phone number')
            }
          } }]}>
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country" initialValue={country}>
            <Select showSearch optionFilterProp="children" defaultValue={country} filterOption={(input, option) => String(option?.children).toLowerCase().includes(String(input).toLowerCase())}>
              <Select.Option value="US">United States</Select.Option>
              <Select.Option value="CA">Canada</Select.Option>
              <Select.Option value="GB">United Kingdom</Select.Option>
              <Select.Option value="AU">Australia</Select.Option>
              <Select.Option value="DE">Germany</Select.Option>
              <Select.Option value="FR">France</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
