/**
 * When the Association site runs inside the Video Upload desktop app, hand it the login token.
 *
 * The login cookie is httpOnly, so the app's other pages (video list, player, ...) can't read it,
 * and they used to depend on a separate token that only the old login page refreshed — which then
 * expired after 7 days. The app's preload script exposes `window.electron.setAuthToken`; calling
 * it after login keeps those pages on the same, current login. Pass nothing to clear it on logout.
 * In a normal browser `window.electron` doesn't exist and this does nothing.
 */
export function shareTokenWithDesktopApp(token?: string | null): void {
  try {
    (window as any).electron?.setAuthToken?.(token || "");
  } catch {
    // never let this get in the way of logging in or out
  }
}
