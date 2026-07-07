import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Table, Button, Modal, Form, Input, DatePicker, Space, Select, message, Grid, Image } from 'antd'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { Link, useNavigate } from 'react-router-dom'
import { actionErrorMessage, ensureOk } from '../lib/apiClient'

type Rig = any
type RigsPageProps = {
  canWrite: boolean
  canDelete: boolean
}

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

export default function RigsPage({ canWrite, canDelete }: RigsPageProps) {
  const navigate = useNavigate()
  const [rigs, setRigs] = useState<Rig[]>([])
  const [people, setPeople] = useState<Record<string,string>>({})
  const [peopleList, setPeopleList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [editing, setEditing] = useState<Rig | null>(null)
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const isVerySmall = screens.xs === false
  const [uploadingImage, setUploadingImage] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  const [form] = Form.useForm()

  function resolveImageUrl(url?: string) {
    if (!url) return ''
    if (/^https?:\/\//i.test(url)) return url
    return `${API_BASE}${url}`
  }

  function uploadFolder() {
    const name = (form.getFieldValue('name') || 'uncategorized').toString().trim()
    return `rigs/${name}`
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
    try {
      const res = await fetch(`${API_BASE}/api/rigs/${id}`, { method: 'DELETE', credentials: 'include' })
      await ensureOk(res, 'Delete failed')
      load()
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Delete failed'))
    }
  }

  async function save() {
    const vals = await form.validateFields()
    const payload = { ...vals }
    if (payload.lastPacked) payload.lastPacked = payload.lastPacked.toISOString()
    if (payload.repackDue) payload.repackDue = payload.repackDue.toISOString()
    try {
      if (editing && editing._id) {
        const res = await fetch(`${API_BASE}/api/rigs/${editing._id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        await ensureOk(res, 'Save failed')
      } else {
        const res = await fetch(`${API_BASE}/api/rigs`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        await ensureOk(res, 'Save failed')
      }
      setVisible(false)
      load()
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Save failed'))
    }
  }

  const assignedFilterOptions = useMemo(() => {
    const names = Array.from(new Set(rigs.map((r: any) => (people[r.primaryUserId] || 'Unassigned')).filter(Boolean)))
    return names.map((name) => ({ text: name, value: name }))
  }, [rigs, people])

  const numberFilterOptions = useMemo(() => {
    const values = Array.from(new Set(rigs.map((r: any) => String(r.number || '').trim()).filter(Boolean)))
    return values.map((value) => ({ text: value, value }))
  }, [rigs])

  const containerFilterOptions = useMemo(() => {
    const values = Array.from(new Set(rigs.map((r: any) => String(r.container || '').trim()).filter(Boolean)))
    return values.map((value) => ({ text: value, value }))
  }, [rigs])

  const aadTypeFilterOptions = useMemo(() => {
    const values = Array.from(new Set(rigs.map((r: any) => String(r.aadType || '').trim()).filter(Boolean)))
    return values.map((value) => ({ text: value, value }))
  }, [rigs])

  const desktopColumns = [
    {
      title: 'Image',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 90,
      render: (v: any) => v ? <Image src={resolveImageUrl(v)} alt="Rig" width={56} height={56} style={{ objectFit: 'cover', borderRadius: 8 }} /> : 'N/A'
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (_: any, r: any) => <Link to={`/rigs/${r._id || r.id}`}>{r.name || 'Unnamed Rig'}</Link>,
      sorter: (a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')),
    },
    {
      title: 'Number',
      dataIndex: 'number',
      key: 'number',
      sorter: (a: any, b: any) => String(a.number || '').localeCompare(String(b.number || '')),
      filters: numberFilterOptions,
      onFilter: (value: any, record: any) => String(record.number || '') === String(value),
    },
    {
      title: 'Container',
      dataIndex: 'container',
      key: 'container',
      sorter: (a: any, b: any) => String(a.container || '').localeCompare(String(b.container || '')),
      filters: containerFilterOptions,
      onFilter: (value: any, record: any) => String(record.container || '') === String(value),
    },
    { title: 'Container Serial', dataIndex: 'containerSerialNumber', key: 'containerSerialNumber' },
    {
      title: 'Assigned',
      key: 'assigned',
      render: (_: any, r: any) => people[r.primaryUserId] || '',
      sorter: (a: any, b: any) => String(people[a.primaryUserId] || 'Unassigned').localeCompare(String(people[b.primaryUserId] || 'Unassigned')),
      filters: assignedFilterOptions,
      onFilter: (value: any, record: any) => String(people[record.primaryUserId] || 'Unassigned') === String(value),
    },
    {
      title: 'Last Packed',
      dataIndex: 'lastPacked',
      key: 'lastPacked',
      render: (v: any) => v ? dayjs(v).format('YYYY-MM-DD') : '',
      sorter: (a: any, b: any) => dayjs(a.lastPacked || 0).valueOf() - dayjs(b.lastPacked || 0).valueOf(),
    },
    {
      title: 'Repack Due',
      dataIndex: 'repackDue',
      key: 'repackDue',
      render: (v: any) => v ? dayjs(v).format('YYYY-MM-DD') : '',
      sorter: (a: any, b: any) => dayjs(a.repackDue || 0).valueOf() - dayjs(b.repackDue || 0).valueOf(),
    },
    {
      title: 'AAD Type',
      dataIndex: 'aadType',
      key: 'aadType',
      sorter: (a: any, b: any) => String(a.aadType || '').localeCompare(String(b.aadType || '')),
      filters: aadTypeFilterOptions,
      onFilter: (value: any, record: any) => String(record.aadType || '') === String(value),
    },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', render: (t: any) => t ? String(t).slice(0, 80) + (String(t).length > 80 ? '…' : '') : '' },
    ...(canWrite || canDelete ? [{ title: 'Actions', key: 'actions', width: 170, render: (_: any, r: any) => (
      <Space>
        {canWrite ? <Button size={isMobile ? 'small' : 'middle'} onClick={() => openEdit(r)}>Edit</Button> : null}
        {canDelete ? <Button size={isMobile ? 'small' : 'middle'} danger onClick={() => remove(r._id)}>Delete</Button> : null}
      </Space>
    ) }] : [])
  ]

  const mobileColumns = [
    { title: 'Rig', dataIndex: 'name', key: 'name', width: 110, ellipsis: true },
    { title: 'Assigned', key: 'assigned', width: 110, ellipsis: true, render: (_: any, r: any) => people[r.primaryUserId] || 'Unassigned' },
    { title: 'Due', dataIndex: 'repackDue', key: 'repackDue', width: 96, render: (v: any) => v ? dayjs(v).format('MM-DD-YY') : 'N/A' },
    ...(canWrite || canDelete ? [{ title: 'Actions', key: 'actions', width: 80, render: (_: any, r: any) => (
      <Space size={0}>
        {canWrite ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>{isVerySmall ? null : 'Edit'}</Button> : null}
        {canDelete ? <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(r._id)}>{isVerySmall ? null : 'Del'}</Button> : null}
      </Space>
    ) }] : [])
  ]

  const columns = isMobile ? mobileColumns : desktopColumns

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <div style={{ marginBottom: isMobile ? 8 : 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canWrite ? <Button size={isMobile ? 'small' : 'middle'} type="primary" onClick={openCreate}>New Rig</Button> : null}
        <Button size={isMobile ? 'small' : 'middle'} onClick={load}>Refresh</Button>
      </div>
      {isMobile ? (
        <div className="rt-mobile-card-list">
          {rigs.map((r: any) => (
            <div key={r._id || r.id} className="rt-mobile-card-item">
              <div className="rt-mobile-card-title">{r.name || 'Unnamed Rig'}</div>
              {r.imageUrl ? (
                <div style={{ marginTop: 8 }}>
                  <Image src={resolveImageUrl(r.imageUrl)} alt="Rig" width={96} height={96} style={{ objectFit: 'cover', borderRadius: 8 }} />
                </div>
              ) : null}
              <div className="rt-mobile-card-meta">Assigned: {people[r.primaryUserId] || 'Unassigned'}</div>
              <div className="rt-mobile-card-meta">Repack Due: {r.repackDue ? dayjs(r.repackDue).format('YYYY-MM-DD') : 'N/A'}</div>
              <div className="rt-mobile-card-actions">
                <Button size="small" onClick={() => navigate(`/rigs/${r._id || r.id}`)}>View</Button>
                {canWrite ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button> : null}
                {canDelete ? <Button size="small" icon={<DeleteOutlined />} danger onClick={() => remove(r._id)}>Delete</Button> : null}
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

      <Modal open={visible} title={editing ? 'Edit Rig' : 'New Rig'} onCancel={() => setVisible(false)} onOk={save} okButtonProps={{ disabled: !canWrite }}>
        <Form form={form} layout="vertical" disabled={!canWrite}>
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
                      <Image src={resolveImageUrl(currentImage)} alt="Rig preview" width={120} height={120} style={{ objectFit: 'cover', borderRadius: 8 }} />
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
