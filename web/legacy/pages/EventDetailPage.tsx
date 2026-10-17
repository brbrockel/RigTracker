import React, { useEffect, useRef, useState } from 'react'
import { Button, Form, Grid, Image, Input, DatePicker, message, Space, Typography } from 'antd'
import { DeleteOutlined, LeftOutlined, StarFilled, UploadOutlined, CameraOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { actionErrorMessage, ensureOk } from '../lib/apiClient'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

type EventItem = any
type EventDetailPageProps = {
  canWrite: boolean
  canDelete: boolean
}

function resolveImageUrl(url?: string) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE}${url}`
}

function isVideoUrl(url?: string) {
  if (!url) return false
  return /\.(mp4|mov|webm|m4v|avi|mkv|mpeg|mpg|3gp)$/i.test(url)
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

export default function EventDetailPage({ canWrite, canDelete }: EventDetailPageProps) {
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
      message.success(files.length > 1 ? 'Media uploaded' : 'Media item uploaded')
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Media upload failed'))
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
      if (!canWrite || saving) return
      setSaving(true)
      if (isNew) {
        const res = await fetch(`${API_BASE}/api/events`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        await ensureOk(res, 'Save failed')
        const created = await res.json()
        navigate(`/events/${created._id || created.id}`)
      } else {
        const res = await fetch(`${API_BASE}/api/events/${id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        await ensureOk(res, 'Save failed')
        await load()
        message.success('Event saved')
      }
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  async function removeEvent() {
    if (!canDelete || isNew) return
    const confirmed = confirm(`Delete event "${form.getFieldValue('name') || eventData?.name || 'Untitled event'}"?`)
    if (!confirmed) return
    const purgeMedia = confirm('Also delete associated media files from storage? Click OK to delete files, Cancel to keep files.')
    try {
      const query = purgeMedia ? '?purgeMedia=true' : ''
      const res = await fetch(`${API_BASE}/api/events/${id}${query}`, { method: 'DELETE', credentials: 'include' })
      await ensureOk(res, 'Delete failed')
      message.success(purgeMedia ? 'Event and media deleted' : 'Event deleted (media kept)')
      navigate('/events')
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Failed to delete event'))
    }
  }

  const heroUrl = eventPhotoUrl || photoUrls[0] || eventData?.eventPhotoUrl || ''
  const heroIsVideo = isVideoUrl(heroUrl)

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Button icon={<LeftOutlined />} onClick={() => navigate('/events')}>Back to Events</Button>
        <Space wrap>
          {!isNew && canDelete ? <Button danger onClick={removeEvent}>Delete Event</Button> : null}
          {canWrite ? <Button type="primary" onClick={save} loading={saving}>{isNew ? 'Create Event' : 'Save Event'}</Button> : null}
        </Space>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <Typography.Title level={4} style={{ marginTop: 0 }}>{isNew ? 'New Event' : 'Event Details'}</Typography.Title>
          {heroUrl ? (
            <div style={{ marginBottom: 16 }}>
              {heroIsVideo ? (
                <video
                  src={resolveImageUrl(heroUrl)}
                  controls
                  style={{ width: '100%', maxHeight: 360, borderRadius: 12, background: '#000' }}
                />
              ) : (
                <Image src={resolveImageUrl(heroUrl)} alt="Event hero" style={{ width: '100%', maxHeight: 360, objectFit: 'cover', borderRadius: 12 }} />
              )}
            </div>
          ) : null}
          <Form form={form} layout="vertical" initialValues={{ eventDate: dayjs() }} disabled={!canWrite}>
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
          <Typography.Title level={4} style={{ marginTop: 0 }}>Media Album</Typography.Title>
          <div style={{ marginBottom: 12 }}>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleGalleryPick}
              style={{ display: 'none' }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              onChange={handleCameraPick}
              style={{ display: 'none' }}
            />
            {canWrite ? (
              <Space wrap>
                <Button icon={<UploadOutlined />} onClick={() => galleryInputRef.current?.click()} loading={uploadingPhotos}>Upload Media</Button>
                <Button icon={<CameraOutlined />} onClick={() => cameraInputRef.current?.click()} loading={uploadingPhotos}>Capture Media</Button>
              </Space>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {photoUrls.length ? photoUrls.map((url) => {
              const selected = url === eventPhotoUrl
              const mediaIsVideo = isVideoUrl(url)
              return (
                <div key={url} style={{ border: selected ? '2px solid #1d4ed8' : '1px solid #d9d9d9', borderRadius: 12, padding: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
                    {mediaIsVideo ? (
                      <video
                        src={resolveImageUrl(url)}
                        controls
                        style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 10, background: '#000' }}
                      />
                    ) : (
                      <Image src={resolveImageUrl(url)} alt="Album item" width={92} height={92} style={{ objectFit: 'cover', borderRadius: 10 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <Typography.Text strong>{selected ? 'Selected as event media' : (mediaIsVideo ? 'Album video' : 'Album image')}</Typography.Text>
                      {canWrite ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Button size="small" type={selected ? 'primary' : 'default'} icon={<StarFilled />} onClick={() => setPrimaryPhoto(url)}>
                            {selected ? 'Primary Media' : 'Set as Primary'}
                          </Button>
                          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePhoto(url)}>Remove</Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            }) : <Typography.Text type="secondary">No media uploaded yet.</Typography.Text>}
          </div>
        </div>
      </div>
    </div>
  )
}
