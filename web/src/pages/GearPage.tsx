import React, { useEffect, useRef, useState } from 'react'
import { Table, Button, Modal, Form, Input, Space, message, Grid, Image, DatePicker } from 'antd'
import { EditOutlined, DeleteOutlined, PictureOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

type Gear = any

export default function GearPage() {
  const [gear, setGear] = useState<Gear[]>([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState<Gear | null>(null)
  const [form] = Form.useForm()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const isVerySmall = screens.xs === false
  const [uploadingImage, setUploadingImage] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  function resolveImageUrl(url?: string) {
    if (!url) return ''
    if (/^https?:\/\//i.test(url)) return url
    return `${API_BASE}${url}`
  }

  function uploadFolder() {
    const name = (form.getFieldValue('name') || 'uncategorized').toString().trim()
    return `gear/${name}`
  }

  async function uploadImageFile(file: File, folder: string) {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/uploads/image?folder=${encodeURIComponent(folder)}`, {
      method: 'POST',
      body: formData
    })
    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    return data.url as string
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const imageUrl = await uploadImageFile(file, uploadFolder())
      form.setFieldValue('imageUrl', imageUrl)
      message.success('Image uploaded')
    } catch (err) {
      console.error(err)
      message.error('Image upload failed')
    } finally {
      e.target.value = ''
      setUploadingImage(false)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/gear`)
      const j = await res.json()
      setGear(j)
    } catch (err) {
      console.error(err)
      message.error('Failed to load gear')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditing(null)
    form.resetFields()
    setVisible(true)
  }

  function openEdit(item: Gear) {
    setEditing(item)
    const copy = { ...item }
    if (copy.dateOfManufacture) copy.dateOfManufacture = dayjs(copy.dateOfManufacture)
    form.setFieldsValue(copy)
    setVisible(true)
  }

  async function remove(id: string) {
    if (!confirm('Delete gear item?')) return
    await fetch(`${API_BASE}/api/gear/${id}`, { method: 'DELETE' })
    load()
  }

  async function save() {
    try {
      const vals = await form.validateFields()
      const payload = { ...vals }
      if (payload.dateOfManufacture) payload.dateOfManufacture = payload.dateOfManufacture.toISOString()
      if (editing && editing._id) {
        await fetch(`${API_BASE}/api/gear/${editing._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      } else {
        await fetch(`${API_BASE}/api/gear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      }
      setVisible(false)
      load()
    } catch (err) {
      console.error(err)
      message.error('Save failed')
    }
  }

  const desktopColumns = [
    {
      title: 'Image',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 72,
      render: (v: any) => v
        ? <Image src={resolveImageUrl(v)} alt="Gear" width={56} height={56} style={{ objectFit: 'cover', borderRadius: 8, display: 'block' }} />
        : <div style={{ width: 56, height: 56, borderRadius: 8, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf' }}><PictureOutlined style={{ fontSize: 24 }} /></div>
    },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Serial Number', dataIndex: 'serialNumber', key: 'serialNumber' },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    {
      title: 'Date of Manufacture',
      dataIndex: 'dateOfManufacture',
      key: 'dateOfManufacture',
      render: (v: any) => v ? dayjs(v).format('YYYY-MM-DD') : ''
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      render: (t: any) => t ? String(t).slice(0, 120) + (String(t).length > 120 ? '...' : '') : ''
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 170,
      render: (_: any, r: any) => (
        <Space>
          <Button size={isMobile ? 'small' : 'middle'} onClick={() => openEdit(r)}>Edit</Button>
          <Button size={isMobile ? 'small' : 'middle'} danger onClick={() => remove(r._id)}>Delete</Button>
        </Space>
      )
    }
  ]

  const mobileColumns = [
    {
      title: 'Gear',
      key: 'gear',
      render: (_: any, r: any) => (
        <Space>
          {r.imageUrl ? <Image src={resolveImageUrl(r.imageUrl)} alt="Gear" width={36} height={36} style={{ objectFit: 'cover', borderRadius: 6 }} /> : null}
          <span>{r.name || 'Unnamed'}</span>
        </Space>
      )
    },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 100, ellipsis: true },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: any, r: any) => (
        <Space size={0}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>{isVerySmall ? null : 'Edit'}</Button>
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(r._id)}>{isVerySmall ? null : 'Del'}</Button>
        </Space>
      )
    }
  ]

  const columns = isMobile ? mobileColumns : desktopColumns

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <div style={{ marginBottom: isMobile ? 8 : 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size={isMobile ? 'small' : 'middle'} type="primary" onClick={openCreate}>New Gear</Button>
        <Button size={isMobile ? 'small' : 'middle'} onClick={load}>Refresh</Button>
      </div>
      {isMobile ? (
        <div className="rt-mobile-card-list">
          {gear.map((g: any) => (
            <div key={g._id || g.id} className="rt-mobile-card-item">
              <div className="rt-mobile-card-title">{g.name || 'Unnamed Gear'}</div>
              <div className="rt-mobile-card-meta">Serial Number: {g.serialNumber || 'N/A'}</div>
              <div className="rt-mobile-card-meta">Type: {g.type || 'N/A'}</div>
              <div className="rt-mobile-card-meta">Date of Manufacture: {g.dateOfManufacture ? dayjs(g.dateOfManufacture).format('YYYY-MM-DD') : 'N/A'}</div>
              <div className="rt-mobile-card-meta">Notes: {g.notes ? String(g.notes).slice(0, 80) : 'N/A'}</div>
              {g.imageUrl ? (
                <div style={{ marginTop: 8 }}>
                  <Image src={resolveImageUrl(g.imageUrl)} alt="Gear" width={96} height={96} style={{ objectFit: 'cover', borderRadius: 8 }} />
                </div>
              ) : null}
              <div className="rt-mobile-card-actions">
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(g)}>Edit</Button>
                <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(g._id)}>Delete</Button>
              </div>
            </div>
          ))}
          {!loading && gear.length === 0 && <div className="rt-mobile-empty">No gear found.</div>}
        </div>
      ) : (
        <Table
          className={isVerySmall ? 'rt-compact-table rt-ultra-compact-table' : 'rt-compact-table'}
          dataSource={gear}
          rowKey={(g: any) => g._id || g.id}
          columns={columns}
          loading={loading}
          size={isMobile ? 'small' : 'middle'}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 10, showSizeChanger: false, size: 'default' }}
        />
      )}

      <Modal open={visible} onCancel={() => setVisible(false)} onOk={save} title={editing ? 'Edit Gear' : 'New Gear'}>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="serialNumber" label="Serial Number"><Input /></Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="dateOfManufacture" label="Date of Manufacture"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="notes" label="Notes" rules={[{ max: 1000, message: 'Notes can be up to 1000 characters' }]}>
            <Input.TextArea rows={4} maxLength={1000} showCount />
          </Form.Item>
          <Form.Item name="imageUrl" hidden><Input /></Form.Item>
          <Form.Item noStyle shouldUpdate>
            {() => {
              const currentImage = form.getFieldValue('imageUrl')
              return (
                <Form.Item label="Image">
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImagePick}
                    style={{ display: 'none' }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleImagePick}
                    style={{ display: 'none' }}
                  />
                  <Space wrap>
                    <Button onClick={() => galleryInputRef.current?.click()} loading={uploadingImage}>Upload From Device</Button>
                    <Button onClick={() => cameraInputRef.current?.click()} loading={uploadingImage}>Take Photo</Button>
                    <Button
                      onClick={() => form.setFieldValue('imageUrl', null)}
                      disabled={!currentImage || uploadingImage}
                    >
                      Remove Image
                    </Button>
                  </Space>
                  {currentImage ? (
                    <div style={{ marginTop: 10 }}>
                      <Image src={resolveImageUrl(currentImage)} alt="Gear preview" width={120} height={120} style={{ objectFit: 'cover', borderRadius: 8 }} />
                    </div>
                  ) : null}
                </Form.Item>
              )
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
