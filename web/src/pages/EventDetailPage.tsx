import React, { useEffect, useRef, useState } from 'react'
import { Button, Form, Grid, Image, Input, DatePicker, message, Space, Typography } from 'antd'
import { DeleteOutlined, LeftOutlined, StarFilled, UploadOutlined, CameraOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

type EventItem = any

function resolveImageUrl(url?: string) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE}${url}`
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

export default function EventDetailPage() {
  const { id = 'new' } = useParams()
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [eventData, setEventData] = useState<EventItem | null>(null)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [eventPhotoUrl, setEventPhotoUrl] = useState<string>('')
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const [form] = Form.useForm()

  const isNew = id === 'new'

  async function load() {
    setLoading(true)
    try {
      if (isNew) {
        setEventData(null)
        setPhotoUrls([])
        setEventPhotoUrl('')
        form.resetFields()
        form.setFieldsValue({ eventDate: dayjs() })
      } else {
        const res = await fetch(`${API_BASE}/api/events/${id}`)
        const json = await res.json()
        setEventData(json)
        const urls = Array.isArray(json.photoUrls) ? json.photoUrls : []
        const primary = json.eventPhotoUrl || urls[0] || ''
        setPhotoUrls(urls)
        setEventPhotoUrl(primary)
        form.setFieldsValue({
          name: json.name,
          eventDate: json.eventDate ? dayjs(json.eventDate) : undefined,
          description: json.description
        })
      }
    } catch (err) {
      console.error(err)
      message.error('Failed to load event')
      navigate('/events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  async function addPhotos(files: File[]) {
    if (!files.length) return
    setUploadingPhotos(true)
    try {
      const eventName = (form.getFieldValue('name') || 'uncategorized').toString().trim()
      const folder = `events/${eventName}`
      const uploaded = await Promise.all(files.map((file) => uploadImageFile(file, folder)))
      setPhotoUrls((current) => {
        const next = [...current]
        uploaded.forEach((url) => {
          if (!next.includes(url)) next.push(url)
        })
        if (!eventPhotoUrl && uploaded[0]) {
          setEventPhotoUrl(uploaded[0])
        }
        return next
      })
      message.success('Photo uploaded')
    } catch (err) {
      console.error(err)
      message.error('Photo upload failed')
    } finally {
      setUploadingPhotos(false)
    }
  }

  async function handleGalleryPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    await addPhotos(files)
  }

  async function handleCameraPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    await addPhotos(files)
  }

  function removePhoto(url: string) {
    setPhotoUrls((current) => current.filter((item) => item !== url))
    setEventPhotoUrl((current) => current === url ? '' : current)
  }

  function setPrimaryPhoto(url: string) {
    setEventPhotoUrl(url)
    if (!photoUrls.includes(url)) {
      setPhotoUrls((current) => [...current, url])
    }
  }

  async function save() {
    try {
      const vals = await form.validateFields()
      const payload = {
        ...vals,
        eventDate: vals.eventDate ? vals.eventDate.toISOString() : undefined,
        photoUrls,
        eventPhotoUrl: eventPhotoUrl || photoUrls[0] || ''
      }
      if (saving) return
      setSaving(true)
      if (isNew) {
        const res = await fetch(`${API_BASE}/api/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const created = await res.json()
        navigate(`/events/${created._id || created.id}`)
      } else {
        await fetch(`${API_BASE}/api/events/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        await load()
        message.success('Event saved')
      }
    } catch (err) {
      console.error(err)
      message.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const heroUrl = eventPhotoUrl || photoUrls[0] || eventData?.eventPhotoUrl || ''

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={<LeftOutlined />} onClick={() => navigate('/events')}>Back to Events</Button>
        <Space wrap>
          <Button type="primary" onClick={save} loading={saving}>{isNew ? 'Create Event' : 'Save Event'}</Button>
        </Space>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <Typography.Title level={4} style={{ marginTop: 0 }}>{isNew ? 'New Event' : 'Event Details'}</Typography.Title>
          {heroUrl ? (
            <div style={{ marginBottom: 16 }}>
              <Image src={resolveImageUrl(heroUrl)} alt="Event hero" style={{ width: '100%', maxHeight: 360, objectFit: 'cover', borderRadius: 12 }} />
            </div>
          ) : null}
          <Form form={form} layout="vertical" initialValues={{ eventDate: dayjs() }}>
            <Form.Item name="name" label="Event Name" rules={[{ required: true, message: 'Event name is required' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="eventDate" label="Date" rules={[{ required: true, message: 'Date is required' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <Input.TextArea rows={5} />
            </Form.Item>
          </Form>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <Typography.Title level={4} style={{ marginTop: 0 }}>Photo Album</Typography.Title>
          <div style={{ marginBottom: 12 }}>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleGalleryPick}
              style={{ display: 'none' }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraPick}
              style={{ display: 'none' }}
            />
            <Space wrap>
              <Button icon={<UploadOutlined />} onClick={() => galleryInputRef.current?.click()} loading={uploadingPhotos}>Upload Photos</Button>
              <Button icon={<CameraOutlined />} onClick={() => cameraInputRef.current?.click()} loading={uploadingPhotos}>Take Photo</Button>
            </Space>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {photoUrls.length ? photoUrls.map((url) => {
              const selected = url === eventPhotoUrl
              return (
                <div key={url} style={{ border: selected ? '2px solid #1d4ed8' : '1px solid #d9d9d9', borderRadius: 12, padding: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
                    <Image src={resolveImageUrl(url)} alt="Album item" width={92} height={92} style={{ objectFit: 'cover', borderRadius: 10 }} />
                    <div style={{ flex: 1 }}>
                      <Typography.Text strong>{selected ? 'Selected as event photo' : 'Album image'}</Typography.Text>
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button size="small" type={selected ? 'primary' : 'default'} icon={<StarFilled />} onClick={() => setPrimaryPhoto(url)}>
                          {selected ? 'Primary Photo' : 'Set as Primary'}
                        </Button>
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePhoto(url)}>Remove</Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }) : <Typography.Text type="secondary">No photos uploaded yet.</Typography.Text>}
          </div>
        </div>
      </div>
    </div>
  )
}
