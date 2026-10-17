import React, { useEffect, useMemo, useState } from 'react'
import { Button, Descriptions, List, Select, Space, Tag, Typography, message } from 'antd'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actionErrorMessage, ensureOk } from '../lib/apiClient'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''

type RigDetailPageProps = {
  canWrite: boolean
}

export default function RigDetailPage({ canWrite }: RigDetailPageProps) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rig, setRig] = useState<any | null>(null)
  const [gear, setGear] = useState<any[]>([])
  const [selectedGearId, setSelectedGearId] = useState<string | undefined>(undefined)
  const [peopleById, setPeopleById] = useState<Record<string, string>>({})
  const [rigNameById, setRigNameById] = useState<Record<string, string>>({})

  const assignedGear = useMemo(() => {
    if (!id) return []
    return gear.filter((g: any) => String(g.assignedRigId || '') === id)
  }, [gear, id])

  const availableOptions = useMemo(() => {
    return gear.map((g: any) => {
      const gid = String(g._id || g.id)
      const assignment = assignmentLabel(g, rigNameById, peopleById)
      return {
        label: `${g.name || 'Unnamed Gear'}${assignment ? ` - ${assignment}` : ''}`,
        value: gid,
      }
    })
  }, [gear, peopleById, rigNameById])

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const [rigRes, gearRes, peopleRes, rigsRes] = await Promise.all([
        fetch(`${API_BASE}/api/rigs/${id}`),
        fetch(`${API_BASE}/api/gear`),
        fetch(`${API_BASE}/api/people`),
        fetch(`${API_BASE}/api/rigs`),
      ])
      await ensureOk(rigRes, 'Failed to load rig')
      await ensureOk(gearRes, 'Failed to load gear')
      await ensureOk(peopleRes, 'Failed to load people')
      await ensureOk(rigsRes, 'Failed to load rigs')

      const [rigJson, gearJson, peopleJson, rigsJson] = await Promise.all([
        rigRes.json(),
        gearRes.json(),
        peopleRes.json(),
        rigsRes.json(),
      ])

      const nextPeopleById: Record<string, string> = {}
      peopleJson.forEach((p: any) => {
        const pid = String(p._id || p.id)
        nextPeopleById[pid] = personName(p)
      })

      const nextRigNameById: Record<string, string> = {}
      rigsJson.forEach((r: any) => {
        const rid = String(r._id || r.id)
        nextRigNameById[rid] = String(r.name || '').trim() || 'Unnamed Rig'
      })

      setRig(rigJson)
      setGear(gearJson)
      setPeopleById(nextPeopleById)
      setRigNameById(nextRigNameById)
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Failed to load rig details'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  async function assignGearToRig() {
    if (!id || !selectedGearId) return
    const target = gear.find((g: any) => String(g._id || g.id) === selectedGearId)
    if (!target) return

    if (target.assignedRigId && String(target.assignedRigId) !== id) {
      const ok = confirm('This gear is assigned to another rig. Reassign it to this rig?')
      if (!ok) return
    }

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/gear/${selectedGearId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedRigId: id }),
      })
      await ensureOk(res, 'Failed to assign gear')
      message.success('Gear assigned to rig')
      setSelectedGearId(undefined)
      await load()
    } catch (err) {
      console.error(err)
      message.error(actionErrorMessage(err, 'Failed to assign gear'))
    } finally {
      setSaving(false)
    }
  }

  async function unassignGearFromRig(gearId: string) {
    const ok = confirm('Unassign this gear from this rig?')
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
        <Typography.Text>Rig id is missing.</Typography.Text>
      </div>
    )
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.95)', padding: 16, borderRadius: 8 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate('/rigs')}>Back to Rigs</Button>
        <Button onClick={load} loading={loading}>Refresh</Button>
      </Space>

      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Rig Details
      </Typography.Title>

      {rig ? (
        <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Name">{rig.name || 'Unnamed Rig'}</Descriptions.Item>
          <Descriptions.Item label="Number">{rig.number || 'N/A'}</Descriptions.Item>
          <Descriptions.Item label="Primary User">
            {rig.primaryUserId ? (peopleById[String(rig.primaryUserId)] || 'Unknown Person') : 'Unassigned'}
          </Descriptions.Item>
          <Descriptions.Item label="Notes">{rig.notes || 'N/A'}</Descriptions.Item>
        </Descriptions>
      ) : null}

      <Typography.Title level={5}>Assigned Gear</Typography.Title>
      {rig?.primaryUserId ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: -6 }}>
          Gear assigned to this rig is automatically tied to {peopleById[String(rig.primaryUserId)] || 'the rig primary user'}.
        </Typography.Paragraph>
      ) : (
        <Typography.Paragraph type="secondary" style={{ marginTop: -6 }}>
          This rig has no primary user, so rig-assigned gear will remain person-unassigned.
        </Typography.Paragraph>
      )}

      <Space style={{ width: '100%', marginBottom: 12 }} direction="vertical">
        <Select
          style={{ minWidth: 320 }}
          showSearch
          allowClear
          value={selectedGearId}
          onChange={(v) => setSelectedGearId(v)}
          placeholder="Select gear to assign"
          options={availableOptions}
          optionFilterProp="label"
          disabled={!canWrite || saving}
        />
        <Button type="primary" onClick={assignGearToRig} disabled={!canWrite || !selectedGearId || saving} loading={saving}>
          Assign To This Rig
        </Button>
      </Space>

      <List
        bordered
        loading={loading}
        dataSource={assignedGear}
        locale={{ emptyText: 'No gear currently assigned to this rig.' }}
        renderItem={(g: any) => {
          const gid = String(g._id || g.id)
          const personTag = g.assignedPersonId ? (peopleById[String(g.assignedPersonId)] || 'Unknown Person') : 'No Person'
          return (
            <List.Item
              actions={[
                <Link key="gear-link" to="/gear">View In Gear</Link>,
                canWrite ? (
                  <Button key="unassign" danger size="small" onClick={() => unassignGearFromRig(gid)} loading={saving}>
                    Unassign
                  </Button>
                ) : null,
              ].filter(Boolean)}
            >
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{g.name || 'Unnamed Gear'}</Typography.Text>
                <Space size={6}>
                  <Tag color="blue">Rig: {rig?.name || 'Unnamed Rig'}</Tag>
                  <Tag color="cyan">Person: {personTag}</Tag>
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

function assignmentLabel(g: any, rigNameById: Record<string, string>, peopleById: Record<string, string>): string {
  if (g.assignedRigId) {
    const rig = rigNameById[String(g.assignedRigId)] || 'Unknown Rig'
    const person = g.assignedPersonId ? (peopleById[String(g.assignedPersonId)] || 'Unknown Person') : 'No Person'
    return `Rig: ${rig} / Person: ${person}`
  }
  if (g.assignedPersonId) {
    const person = peopleById[String(g.assignedPersonId)] || 'Unknown Person'
    return `Person: ${person}`
  }
  return 'Unassigned'
}
