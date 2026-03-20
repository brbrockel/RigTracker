import React, { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, Select, message } from 'antd'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import isEmail from 'validator/lib/isEmail'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''

export default function PeoplePage() {
  const [people, setPeople] = useState<any[]>([])
  const [country] = useState('US')
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form] = Form.useForm()

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
    await fetch(`${API_BASE}/api/people/${id}`, { method: 'DELETE' })
    load()
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
        await fetch(`${API_BASE}/api/people/${editing._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals) })
      } else {
        await fetch(`${API_BASE}/api/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals) })
      }
      setVisible(false)
      load()
    } catch (err) {
      console.error(err)
      message.error('Save failed')
    }
  }

  const columns = [
    { title: 'First', dataIndex: 'firstName', key: 'firstName' },
    { title: 'Middle', dataIndex: 'middleName', key: 'middleName' },
    { title: 'Last', dataIndex: 'lastName', key: 'lastName' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', render: (v: any) => formatPhoneForDisplay(v) },
    { title: 'Actions', key: 'actions', render: (_: any, p: any) => (
      <span>
        <Button onClick={() => openEdit(p)} style={{ marginRight: 8 }}>Edit</Button>
        <Button danger onClick={() => remove(p._id)}>Delete</Button>
      </span>
    ) }
  ]

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: 16, borderRadius: 8 }}>
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={openCreate} style={{ marginRight: 8 }}>New Person</Button>
        <Button onClick={load}>Refresh</Button>
      </div>
      <Table dataSource={people} rowKey={(p:any) => p._id || p.id} columns={columns} loading={loading} />

      <Modal open={visible} onCancel={() => setVisible(false)} onOk={save} title={editing ? 'Edit Person' : 'New Person'}>
        <Form form={form} layout="vertical">
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
