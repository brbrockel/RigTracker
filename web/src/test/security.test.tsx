import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { asUser, mockApi, renderAt } from './render';

const security = (over: Record<string, unknown> = {}) => ({
  hasPassword: true,
  passwordChangedAt: '2026-10-10T12:00:00.000Z',
  totpEnabled: false,
  recoveryCodesLeft: null,
  totpAvailable: true,
  ...over,
});
const ok = (body: unknown) => () => ({ status: 201, body });
const body = (init: RequestInit | undefined) => JSON.parse(String(init?.body ?? '{}'));
const health = () => ({ status: 200, body: { ok: true, version: '2.0.0-beta.1' } });

describe('Account → Security', () => {
  it('changes the password with the current one, and says the other devices are signed out', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      'GET /api/health': health,
      'GET /api/auth/security': () => ({ status: 200, body: security() }),
      'POST /api/auth/password': ok({ ok: true }),
    });
    const user = userEvent.setup();
    renderAt('/account');
    await user.type(await screen.findByLabelText('Current password'), 'old password here');
    await user.type(screen.getByLabelText('New password'), 'plum tractor sideways');
    await user.type(screen.getByLabelText('Type it again'), 'plum tractor sideways');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText(/Your other devices are signed out/)).toBeInTheDocument();
    const call = calls.find((c) => c.key === 'POST /api/auth/password')!;
    expect(body(call.init)).toEqual({
      current: 'old password here',
      password: 'plum tractor sideways',
    });
    expect((call.init?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
    expect(screen.getByText('RigTracker 2.0.0-beta.1')).toBeInTheDocument();
  });

  it('sets up an authenticator: QR code and key, a code, then recovery codes shown once', async () => {
    let on = false;
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      'GET /api/health': health,
      'GET /api/auth/security': () => ({
        status: 200,
        body: security(on ? { totpEnabled: true, recoveryCodesLeft: 8 } : {}),
      }),
      'POST /api/auth/totp/start': ok({
        secret: 'JBSWY3DPEHPK3PXP',
        url: 'otpauth://totp/RigTracker%3Abrian%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=RigTracker',
      }),
      'POST /api/auth/totp/enable': () => {
        on = true;
        return ok({ recoveryCodes: ['abcd-efgh', 'jkmn-pqrs'] })();
      },
    });
    const user = userEvent.setup();
    renderAt('/account');
    await user.click(await screen.findByRole('button', { name: 'Set up authenticator' }));
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(
      await screen.findByRole('img', { name: 'QR code for your authenticator app' }),
    ).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/));
    await user.type(screen.getByLabelText('Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('abcd-efgh')).toBeInTheDocument();
    expect(await screen.findByText(/8 recovery codes left/)).toBeInTheDocument();
    const call = calls.find((c) => c.key === 'POST /api/auth/totp/enable')!;
    expect(body(call.init)).toEqual({ code: '123456' });
  });

  it('turns the authenticator off or makes new recovery codes with the password', async () => {
    const calls = mockApi({
      'GET /api/auth/me': asUser,
      'GET /api/health': health,
      'GET /api/auth/security': () => ({
        status: 200,
        body: security({ totpEnabled: true, recoveryCodesLeft: 3 }),
      }),
      'POST /api/auth/totp/recovery-codes': ok({ recoveryCodes: ['wxyz-2345'] }),
      'POST /api/auth/totp/disable': () => ({
        status: 400,
        body: { message: 'Your password is not right.' },
      }),
    });
    const user = userEvent.setup();
    renderAt('/account');
    expect(await screen.findByText(/3 recovery codes left/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your password'), 'plum tractor sideways');
    await user.click(screen.getByRole('button', { name: /New recovery codes/ }));
    expect(await screen.findByText('wxyz-2345')).toBeInTheDocument();
    expect(body(calls.find((c) => c.key === 'POST /api/auth/totp/recovery-codes')!.init)).toEqual({
      password: 'plum tractor sideways',
    });

    await user.type(screen.getByLabelText('Your password'), 'wrong one');
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(await screen.findByText('Your password is not right.')).toBeInTheDocument();
  });

  it('asks someone without a password to set one before an authenticator', async () => {
    mockApi({
      'GET /api/auth/me': asUser,
      'GET /api/health': health,
      'GET /api/auth/security': () => ({ status: 200, body: security({ hasPassword: false }) }),
    });
    renderAt('/account');
    expect(await screen.findByText('Set a password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Set up authenticator' })).toBeDisabled(),
    );
  });
});
