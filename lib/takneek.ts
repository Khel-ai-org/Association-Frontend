/*
   Coaches and players use the Takneek dashboard instead of /admin.
   Takneek is a separate app/origin and can't read this app's httpOnly session
   cookie, so we fetch a short-lived token (GET /user/scoring-token, 1h) and pass
   it in the URL fragment to Takneek's /auth/callback, which checks it against
   /user/me before starting its own session.
 */
export const TAKNEEK_ROLES = ["coach", "player"];

export const isTakneekRole = (role: string | null | undefined) => !!role && TAKNEEK_ROLES.includes(role);

export async function goToTakneek(): Promise<void> {
  const base = process.env.NEXT_PUBLIC_TAKNEEK_URL || "http://localhost:5173";
  const res = await fetch(`${process.env.NEXT_PUBLIC_Backend_URL}/user/scoring-token`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Could not get Takneek login token (${res.status})`);
  const { token } = await res.json();
  window.location.href = `${base}/auth/callback#token=${encodeURIComponent(token)}`;
}
