import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallHint, isIos } from '@/components/InstallHint';
import { listenForInstall } from '@/lib/install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const as = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
listenForInstall();

/** Chrome's install offer, as the browser fires it. */
function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(e);
  });
  return e;
}
const noOffer = () =>
  act(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });

beforeEach(() => {
  localStorage.clear();
  noOffer();
});
afterEach(() => localStorage.clear());

describe('add to Home Screen hint', () => {
  it('tells iPhone users how, until they dismiss it', async () => {
    as(IPHONE);
    const { unmount } = render(<InstallHint />);
    expect(screen.getByText('Add RigTracker to your Home Screen')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: "Don't show again" }));
    expect(screen.queryByText('Add RigTracker to your Home Screen')).not.toBeInTheDocument();
    unmount();
    render(<InstallHint />);
    expect(screen.queryByText('Add RigTracker to your Home Screen')).not.toBeInTheDocument();
  });

  it("gives Android the menu steps while Chrome hasn't offered to install", () => {
    as(ANDROID);
    noOffer();
    render(<InstallHint />);
    expect(screen.getByText('Add RigTracker to your Home screen')).toBeInTheDocument();
    expect(screen.getByText('Install app')).toBeInTheDocument();
  });

  it("offers an Install button with the browser's own dialog when it can", async () => {
    as(ANDROID);
    render(<InstallHint />);
    const e = offerInstall();
    expect(e.defaultPrevented).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(e.prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByText('Install RigTracker')).not.toBeInTheDocument());
  });

  it('shows Install on a computer too, and nothing there without an offer', () => {
    as(DESKTOP);
    noOffer();
    const { unmount } = render(<InstallHint />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    unmount();
    render(<InstallHint />);
    offerInstall();
    expect(screen.getByText('Install RigTracker')).toBeInTheDocument();
    noOffer();
    expect(screen.queryByText('Install RigTracker')).not.toBeInTheDocument();
  });

  it('recognises an iPad, which reports itself as a Mac with touch', () => {
    expect(
      isIos({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
        maxTouchPoints: 5,
      } as Navigator),
    ).toBe(true);
    expect(
      isIos({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
        maxTouchPoints: 0,
      } as Navigator),
    ).toBe(false);
  });
});
