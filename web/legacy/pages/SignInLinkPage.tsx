import React, { useEffect, useState } from 'react'
import { Alert, Button, Typography } from 'antd'

const API_BASE = (window as any).__RIGTRACKER_API_BASE || (import.meta as any).env?.VITE_API_BASE || ''

type SignedIn = { id: string; email: string; displayName: string; roles: string[] }

function tokenFromHash(): string {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') || ''
}

async function post(path: string, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || 'This sign-in link is not valid')
  return data
}

/**
 * Opened from a sign-in link (/sign-in#token=...). Opening the page doesn't use the link up,
 * so a phone previewing it can't spoil it; pressing Sign in does.
 */
export default function SignInLinkPage({ onSignedIn }: { onSignedIn: (user: SignedIn) => void }) {
  const [token] = useState(tokenFromHash)
  const [who, setWho] = useState<{ email: string; displayName: string } | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('This page needs the full sign-in link. Ask an admin for a new one.')
      setChecking(false)
      return
    }
    post('/api/auth/link/check', token)
      .then(setWho)
      .catch((err) => setError(err.message))
      .finally(() => setChecking(false))
  }, [token])

  async function signIn() {
    setSigningIn(true)
    try {
      const data = await post('/api/auth/link/redeem', token)
      // Drop the token from the address bar and history.
      window.history.replaceState(null, '', '/')
      onSignedIn(data.user)
    } catch (err: any) {
      setError(err.message)
      setSigningIn(false)
    }
  }

  return (
    <div className="rt-home-card">
      <Typography.Title level={3} style={{ marginTop: 0 }}>Sign in to RigTracker</Typography.Title>
      {checking ? <Typography.Text>Checking your link…</Typography.Text> : null}
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {who ? (
        <>
          <Typography.Paragraph>
            Signing in as <strong>{who.displayName ? `${who.displayName} (${who.email})` : who.email}</strong>.
            The link works once.
          </Typography.Paragraph>
          <Button type="primary" loading={signingIn} onClick={signIn}>Sign in</Button>
        </>
      ) : null}
    </div>
  )
}
