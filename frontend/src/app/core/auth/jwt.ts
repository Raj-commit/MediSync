// Reads the expiry (`exp`, in seconds) from a JWT without verifying it. Only the
// server can verify a token, this just lets the app drop one that is clearly old.
export function isTokenExpired(token: string, nowMs: number = Date.now()): boolean {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const { exp } = JSON.parse(json) as { exp?: unknown };
    return typeof exp === 'number' && exp * 1000 <= nowMs;
  } catch {
    return false;
  }
}
