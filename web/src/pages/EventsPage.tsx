import React, { useEffect, useMemo, useState } from 'react'
import { Button, Calendar, Grid, Image, Segmented, Space, Table, Typography } from 'antd'
import type { CalendarProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import dayjs, { Dayjs } from 'dayjs'

type EventItem = any

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''
const { useBreakpoint } = Grid

function resolveImageUrl(url?: string) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE}${url}`
}

function formatDateKey(value: string | Date | Dayjs) {
  return dayjs(value).format('YYYY-MM-DD')
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const isDesktop = screens.lg
  const isMobile = !isDesktop

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/events`)
      const json = await res.json()
      setEvents(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventItem[]>()
    events.forEach((event) => {
      const key = event.eventDate ? formatDateKey(event.eventDate) : ''
      if (!key) return
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(event)
    })
    return map
  }, [events])

  const tableColumns = [
    {
      title: 'Photo',
      dataIndex: 'eventPhotoUrl',
      key: 'eventPhotoUrl',
      width: 90,
      render: (value: any) => value ? <Image src={resolveImageUrl(value)} alt="Event" width={56} height={56} style={{ objectFit: 'cover', borderRadius: 8 }} /> : 'N/A'
    },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Date',
      dataIndex: 'eventDate',
      key: 'eventDate',
      width: 140,
      render: (value: any) => value ? dayjs(value).format('YYYY-MM-DD') : ''
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (value: any) => value ? String(value).slice(0, 100) + (String(value).length > 100 ? '...' : '') : ''
    }
  ]

  const dateCellRender: CalendarProps<Dayjs>['cellRender'] = (current, info) => {
    if (info.type !== 'date') return info.originNode
    const key = current.format('YYYY-MM-DD')
    const dayEvents = eventsByDate.get(key) || []
    return (
      <div style={{ minHeight: 76, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {dayEvents.slice(0, 2).map((event) => (
            <Button
              key={event._id || event.id}
              type="link"
              size="small"
              style={{ padding: 0, height: 'auto', textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.2 }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                navigate(`/events/${event._id || event.id}`)
              }}
            >
              {event.name || 'Untitled event'}
            </Button>
          ))}
          {dayEvents.length > 2 ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>+{dayEvents.length - 2} more</Typography.Text> : null}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: isMobile ? 10 : 16, borderRadius: 8 }}>
      <div style={{ marginBottom: isMobile ? 8 : 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Space wrap>
          <Button type="primary" onClick={() => navigate('/events/new')}>New Event</Button>
          <Button onClick={load}>Refresh</Button>
        </Space>
        {isMobile ? (
          <Segmented
            value={viewMode}
            options={[
              { label: 'Calendar', value: 'calendar' },
              { label: 'List', value: 'list' }
            ]}
            onChange={(value) => setViewMode(value as 'calendar' | 'list')}
          />
        ) : null}
      </div>

      {isDesktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            <Typography.Title level={4} style={{ marginTop: 0 }}>Calendar</Typography.Title>
            <Calendar
              value={selectedDate}
              onSelect={(date) => setSelectedDate(date)}
              cellRender={dateCellRender}
            />
          </div>

          <div style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            <Typography.Title level={4} style={{ marginTop: 0 }}>All Events</Typography.Title>
            <Table
              dataSource={events}
              rowKey={(event: any) => event._id || event.id}
              loading={loading}
              columns={tableColumns as any}
              size="middle"
              pagination={{ pageSize: 8, showSizeChanger: false }}
              onRow={(record: any) => ({
                onClick: () => navigate(`/events/${record._id || record.id}`),
                style: { cursor: 'pointer' }
              })}
            />
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          {viewMode === 'calendar' ? (
            <Calendar
              value={selectedDate}
              onSelect={(date) => setSelectedDate(date)}
              cellRender={dateCellRender}
            />
          ) : (
            <Table
              dataSource={events}
              rowKey={(event: any) => event._id || event.id}
              loading={loading}
              columns={tableColumns as any}
              size="middle"
              pagination={{ pageSize: 8, showSizeChanger: false }}
              onRow={(record: any) => ({
                onClick: () => navigate(`/events/${record._id || record.id}`),
                style: { cursor: 'pointer' }
              })}
            />
          )}
        </div>
      )}
    </div>
  )
}
