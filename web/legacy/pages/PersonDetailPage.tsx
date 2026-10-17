import React, { useEffect, useMemo, useState } from 'react'
import { Button, Descriptions, List, Select, Space, Tag, Typography, message } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actionErrorMessage, ensureOk } from '../lib/apiClient'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''

type PersonDetailPageProps = {
  canWrite: boolean
}

export default function PersonDetailPage({ canWrite }: PersonDetailPageProps) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [person, setPerson] = useState<any | null>(null)
  const [rigs, setRigs] = useState<any[]>([])
  const [gear, setGear] = useState<any[]>([])
  const [selectedGearId, setSelectedGearId] = useState<string | undefined>(undefined)
  const [rigNameById, setRigNameById] = useState<Record<string, string>>({})

  const personAssignedGear = useMemo(() => {
    if (!id) return []
    return gear.filter((g: any) => String(g.assignedPersonId || '') === id)
  }, [gear, id])

  const personRigs = useMemo(() => {
    if (!id) return []
    return rigs.filter((r: any) => String(r.primaryUserId || '') === id)
  }, [rigs, id])

  const availableOptions = useMemo(() => {
    return gear.map((g: any) => {
      const gid = String(g._id || g.id)
      return {
        label: `${g.name || 'Unnamed Gear'} - ${assignmentLabel(g, rigNameById)}`,
        value: gid,
      }
    })
  }, [gear, rigNameById])

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const [personRes, rigsRes, gearRes] = await Promise.all([
        fetch(`${API_BASE}/api/people/${id}`),
        fetch(`${API_BASE}/api/rigs`),
        fetch(`${API_BASE}/api/gear`),
      ])
      await ensureOk(personRes, 'Failed to load person')
      await ensureOk(rigsRes, 'Failed to load rigs')
      await ensureOk(gearRes, 'Failed to load gear')

      const [personJson, rigsJson, gearJson] = await Promise.all([
        personRes.json(),
        rigsRes.json(),
        gearRes.json(),
      ])

      const nextRigNames: Record<string, string> = {}
      rigsJson.forEach((r: any) => {
        nextRigNames[String(r._id || r.id)] = String(r.name || '').trim() || 'Unnamed Rig'
      })

      setPerson(personJson)
      setRigs(rigsJson)
      setRigNameById(nextRigNames)
      setGear(gearJson)
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Failed to load person details'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  async function assignGearToPersonOnly() {
    if (!id || !selectedGearId) return
    const target = gear.find((g: any) => String(g._id || g.id) === selectedGearId)
    if (!target) return

    if (target.assignedRigId) {
      const ok = confirm('This gear is currently tied to a rig. Assigning directly to this person will remove the rig assignment. Continue?')
      if (!ok) return
    }

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/gear/${selectedGearId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedRigId: null, assignedPersonId: id }),
      })
      await ensureOk(res, 'Failed to assign gear')
      message.success('Gear assigned to person')
      setSelectedGearId(undefined)
      await load()
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Failed to assign gear'))
    } finally {
      setSaving(false)
    }
  }

  async function unassignGear(gearId: string) {
    const ok = confirm('Unassign this gear from this person?')
    if (!ok) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/gear/${gearId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedRigId: null, assignedPersonId: null }),
      })
      await ensureOk(res, 'Failed to unassign gear')
      message.success('Gear unassigned')
      await load()
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Failed to unassign gear'))
    } finally {
      setSaving(false)
    }
  }

  if (!id) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.95)', padding: 16, borderRadius: 8 }}>
        <Typography.Text>Person id is missing.</Typography.Text>
      </div>
    )
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: 16, borderRadius: 8 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate('/people')}>Back to People</Button>
        <Button onClick={load} loading={loading}>Refresh</Button>
      </Space>

      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Person Details
      </Typography.Title>

      {person ? (
        <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Name">{personName(person)}</Descriptions.Item>
          <Descriptions.Item label="Email">{person.email || 'N/A'}</Descriptions.Item>
          <Descriptions.Item label="Phone">{person.phone || 'N/A'}</Descriptions.Item>
        </Descriptions>
      ) : null}

      <Typography.Title level={5}>Rigs Assigned To This Person</Typography.Title>
      <List
        bordered
        style={{ marginBottom: 16 }}
        loading={loading}
        dataSource={personRigs}
        locale={{ emptyText: 'No rigs currently assigned to this person.' }}
        renderItem={(r: any) => (
          <List.Item>
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{r.name || 'Unnamed Rig'}</Typography.Text>
              <Typography.Text type="secondary">Rig Number: {r.number || 'N/A'}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />

      <Typography.Title level={5}>Gear Assigned To This Person</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginTop: -6 }}>
        This list includes person-only assignments and gear tied through rigs where this person is the rig primary user.
      </Typography.Paragraph>

      <Space style={{ width: '100%', marginBottom: 12 }} direction="vertical">
        <Select
          style={{ minWidth: 320 }}
          showSearch
          allowClear
          value={selectedGearId}
          onChange={(v) => setSelectedGearId(v)}
          placeholder="Select gear to assign directly to this person"
          options={availableOptions}
          optionFilterProp="label"
          disabled={!canWrite || saving}
        />
        <Button type="primary" onClick={assignGearToPersonOnly} disabled={!canWrite || !selectedGearId || saving} loading={saving}>
          Assign Directly To This Person
        </Button>
      </Space>

      <List
        bordered
        loading={loading}
        dataSource={personAssignedGear}
        locale={{ emptyText: 'No gear currently assigned to this person.' }}
        renderItem={(g: any) => {
          const gid = String(g._id || g.id)
          const viaRig = g.assignedRigId ? (rigNameById[String(g.assignedRigId)] || 'Unknown Rig') : ''
          return (
            <List.Item
              actions={[
                <Link key="gear-link" to="/gear">View In Gear</Link>,
                canWrite ? (
                  <Button key="unassign" danger size="small" onClick={() => unassignGear(gid)} loading={saving}>
                    Unassign
                  </Button>
                ) : null,
              ].filter(Boolean)}
            >
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{g.name || 'Unnamed Gear'}</Typography.Text>
                <Space size={6}>
                  {viaRig ? <Tag color="blue">Via Rig: {viaRig}</Tag> : <Tag color="green">Direct Person Assignment</Tag>}
                  {g.type ? <Tag>{String(g.type)}</Tag> : null}
                </Space>
              </Space>
            </List.Item>
          )
        }}
      />
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

function assignmentLabel(g: any, rigNameById: Record<string, string>): string {
  if (g.assignedRigId) {
    return `Rig: ${rigNameById[String(g.assignedRigId)] || 'Unknown Rig'}`
  }
  if (g.assignedPersonId) {
    return 'Person-assigned'
  }
  return 'Unassigned'
}
