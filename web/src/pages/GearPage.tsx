import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Table, Button, Modal, Form, Input, Space, message, Grid, Image, DatePicker, Select, Typography } from 'antd'
import { EditOutlined, DeleteOutlined, PictureOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { actionErrorMessage, ensureOk } from '../lib/apiClient'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

type Gear = any
type GearPageProps = {
  canWrite: boolean
  canDelete: boolean
}

export default function GearPage({ canWrite, canDelete }: GearPageProps) {
  const [gear, setGear] = useState<Gear[]>([])
  const [rigs, setRigs] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [rigNameById, setRigNameById] = useState<Record<string, string>>({})
  const [personNameById, setPersonNameById] = useState<Record<string, string>>({})
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
      credentials: 'include',
      body: formData
    })
    await ensureOk(res, 'Upload failed')
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
      message.error(actionErrorMessage(err, 'Image upload failed'))
    } finally {
      e.target.value = ''
      setUploadingImage(false)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const [gearRes, rigsRes, peopleRes] = await Promise.all([
        fetch(`${API_BASE}/api/gear`),
        fetch(`${API_BASE}/api/rigs`),
        fetch(`${API_BASE}/api/people`),
      ])
      await ensureOk(gearRes, 'Failed to load gear')
      await ensureOk(rigsRes, 'Failed to load rigs')
      await ensureOk(peopleRes, 'Failed to load people')

      const [gearJson, rigsJson, peopleJson] = await Promise.all([
        gearRes.json(),
        rigsRes.json(),
        peopleRes.json(),
      ])

      const nextRigNameById: Record<string, string> = {}
      rigsJson.forEach((r: any) => {
        nextRigNameById[String(r._id || r.id)] = String(r.name || '').trim() || 'Unnamed Rig'
      })

      const nextPersonNameById: Record<string, string> = {}
      peopleJson.forEach((p: any) => {
        nextPersonNameById[String(p._id || p.id)] = personName(p)
      })

      setGear(gearJson)
      setRigs(rigsJson)
      setPeople(peopleJson)
      setRigNameById(nextRigNameById)
      setPersonNameById(nextPersonNameById)
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
    form.setFieldsValue({ assignedRigId: null, assignedPersonId: null })
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
    try {
      const res = await fetch(`${API_BASE}/api/gear/${id}`, { method: 'DELETE', credentials: 'include' })
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
      const payload: any = { ...vals }
      if (payload.dateOfManufacture) payload.dateOfManufacture = payload.dateOfManufacture.toISOString()

      const normalizedRigId = normalizeId(payload.assignedRigId)
      const normalizedPersonId = normalizeId(payload.assignedPersonId)

      payload.assignedRigId = normalizedRigId
      payload.assignedPersonId = normalizedPersonId

      if (editing && editing._id && normalizedRigId && normalizeId(editing.assignedRigId) !== normalizedRigId) {
        const previousPerson = normalizeId(editing.assignedPersonId)
        const nextRig = rigs.find((r: any) => String(r._id || r.id) === normalizedRigId)
        const nextRigPerson = normalizeId(nextRig?.primaryUserId)
        if (previousPerson !== nextRigPerson) {
          const warningOk = confirm('Changing rig will automatically reassign the person to the rig primary user. Continue?')
          if (!warningOk) return
        }
      }

      if (normalizedRigId) {
        // Backend derives person from rig; person field is ignored when rig is selected.
        payload.assignedPersonId = null
      } else if (normalizedPersonId) {
        payload.assignedRigId = null
      } else {
        payload.assignedRigId = null
        payload.assignedPersonId = null
      }

      if (editing && editing._id) {
        const res = await fetch(`${API_BASE}/api/gear/${editing._id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        await ensureOk(res, 'Save failed')
      } else {
        const res = await fetch(`${API_BASE}/api/gear`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        await ensureOk(res, 'Save failed')
      }
      setVisible(false)
      load()
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Save failed'))
    }
  }

  const typeFilters = useMemo(() => {
    const values = Array.from(new Set(gear.map((g: any) => String(g.type || '').trim()).filter(Boolean)))
    return values.map((value) => ({ text: value, value }))
  }, [gear])

  const assignedFilters = useMemo(() => {
    const values = Array.from(new Set(gear.map((g: any) => assignmentDisplay(g, rigNameById, personNameById)).filter(Boolean)))
    return values.map((value) => ({ text: value, value }))
  }, [gear, rigNameById, personNameById])

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
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')),
    },
    {
      title: 'Serial Number',
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      sorter: (a: any, b: any) => String(a.serialNumber || '').localeCompare(String(b.serialNumber || '')),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      sorter: (a: any, b: any) => String(a.type || '').localeCompare(String(b.type || '')),
      filters: typeFilters,
      onFilter: (value: any, record: any) => String(record.type || '') === String(value),
    },
    {
      title: 'Assigned To',
      key: 'assignedTo',
      render: (_: any, r: any) => assignmentDisplay(r, rigNameById, personNameById),
      sorter: (a: any, b: any) => assignmentDisplay(a, rigNameById, personNameById).localeCompare(assignmentDisplay(b, rigNameById, personNameById)),
      filters: assignedFilters,
      onFilter: (value: any, record: any) => assignmentDisplay(record, rigNameById, personNameById) === String(value),
    },
    {
      title: 'Date of Manufacture',
      dataIndex: 'dateOfManufacture',
      key: 'dateOfManufacture',
      render: (v: any) => v ? dayjs(v).format('YYYY-MM-DD') : '',
      sorter: (a: any, b: any) => dayjs(a.dateOfManufacture || 0).valueOf() - dayjs(b.dateOfManufacture || 0).valueOf(),
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
          {canWrite ? <Button size={isMobile ? 'small' : 'middle'} onClick={() => openEdit(r)}>Edit</Button> : null}
          {canDelete ? <Button size={isMobile ? 'small' : 'middle'} danger onClick={() => remove(r._id)}>Delete</Button> : null}
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
          {canWrite ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>{isVerySmall ? null : 'Edit'}</Button> : null}
          {canDelete ? <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(r._id)}>{isVerySmall ? null : 'Del'}</Button> : null}
        </Space>
      )
    }
  ]

  const columns = isMobile ? mobileColumns : desktopColumns

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <div style={{ marginBottom: isMobile ? 8 : 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canWrite ? <Button size={isMobile ? 'small' : 'middle'} type="primary" onClick={openCreate}>New Gear</Button> : null}
        <Button size={isMobile ? 'small' : 'middle'} onClick={load}>Refresh</Button>
      </div>
      {isMobile ? (
        <div className="rt-mobile-card-list">
          {gear.map((g: any) => (
            <div key={g._id || g.id} className="rt-mobile-card-item">
              <div className="rt-mobile-card-title">{g.name || 'Unnamed Gear'}</div>
              <div className="rt-mobile-card-meta">Serial Number: {g.serialNumber || 'N/A'}</div>
              <div className="rt-mobile-card-meta">Type: {g.type || 'N/A'}</div>
              <div className="rt-mobile-card-meta">Assigned: {assignmentDisplay(g, rigNameById, personNameById)}</div>
              <div className="rt-mobile-card-meta">Date of Manufacture: {g.dateOfManufacture ? dayjs(g.dateOfManufacture).format('YYYY-MM-DD') : 'N/A'}</div>
              <div className="rt-mobile-card-meta">Notes: {g.notes ? String(g.notes).slice(0, 80) : 'N/A'}</div>
              {g.imageUrl ? (
                <div style={{ marginTop: 8 }}>
                  <Image src={resolveImageUrl(g.imageUrl)} alt="Gear" width={96} height={96} style={{ objectFit: 'cover', borderRadius: 8 }} />
                </div>
              ) : null}
              <div className="rt-mobile-card-actions">
                {canWrite ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(g)}>Edit</Button> : null}
                {canDelete ? <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(g._id)}>Delete</Button> : null}
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

      <Modal open={visible} onCancel={() => setVisible(false)} onOk={save} title={editing ? 'Edit Gear' : 'New Gear'} okButtonProps={{ disabled: !canWrite }}>
        <Form form={form} layout="vertical" disabled={!canWrite}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="serialNumber" label="Serial Number"><Input /></Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item noStyle shouldUpdate>
            {() => {
              const selectedRigId = normalizeId(form.getFieldValue('assignedRigId'))
              return (
                <>
                  <Form.Item name="assignedRigId" label="Assigned Rig">
                    <Select
                      showSearch
                      allowClear
                      placeholder="Assign to rig"
                      optionFilterProp="label"
                      options={rigs.map((r: any) => ({
                        value: String(r._id || r.id),
                        label: `${r.name || 'Unnamed Rig'}${r.primaryUserId ? ` (Primary: ${personNameById[String(r.primaryUserId)] || 'Unknown'})` : ''}`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item name="assignedPersonId" label="Assigned Person (Direct)">
                    <Select
                      showSearch
                      allowClear
                      placeholder="Assign directly to person"
                      optionFilterProp="label"
                      disabled={!!selectedRigId}
                      options={people.map((p: any) => ({
                        value: String(p._id || p.id),
                        label: personName(p),
                      }))}
                    />
                  </Form.Item>
                  {selectedRigId ? (
                    <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
                      This item is rig-assigned. Person assignment will auto-follow that rig's primary user.
                    </Typography.Paragraph>
                  ) : null}
                </>
              )
            }}
          </Form.Item>
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

function personName(p: any): string {
  const parts = [p.firstName, p.middleName, p.lastName]
    .filter(Boolean)
    .map((s: any) => String(s).trim())
    .filter(Boolean)
  return parts.join(' ') || 'Unnamed Person'
}

function normalizeId(value: any): string | null {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized || null
}

function assignmentDisplay(item: any, rigNameById: Record<string, string>, personNameById: Record<string, string>): string {
  if (item.assignedRigId) {
    const rigName = rigNameById[String(item.assignedRigId)] || 'Unknown Rig'
    const person = item.assignedPersonId ? (personNameById[String(item.assignedPersonId)] || 'Unknown Person') : 'No Person'
    return `Rig: ${rigName} / Person: ${person}`
  }
  if (item.assignedPersonId) {
    return `Person: ${personNameById[String(item.assignedPersonId)] || 'Unknown Person'}`
  }
  return 'Unassigned'
}
