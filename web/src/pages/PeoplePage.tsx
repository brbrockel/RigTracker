import React, { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Input, message } from 'antd'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''

export default function PeoplePage() {
  const [people, setPeople] = useState<any[]>([])
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

  async function remove(id: string) {
    if (!confirm('Delete person?')) return
    await fetch(`/api/people/${id}`, { method: 'DELETE' })
    load()
  }

  async function save() {
    try {
      const vals = await form.validateFields()
      if (editing && editing._id) {
        await fetch(`/api/people/${editing._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals) })
      } else {
        await fetch('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals) })
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
    { title: 'Last', dataIndex: 'lastName', key: 'lastName' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
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
          <Form.Item name="email" label="Email"><Input /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
