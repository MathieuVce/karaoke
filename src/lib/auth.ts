import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_SESSION_COOKIE = "admin_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function signSession(expirySeconds: number, secret: string): string {
  return createHmac("sha256", secret).update(String(expirySeconds)).digest("base64url");
}

export function createAdminSessionToken(secret: string, now = Date.now()): string {
  const expirySeconds = Math.floor(now / 1000) + ADMIN_SESSION_TTL_SECONDS;
  return `${expirySeconds}.${signSession(expirySeconds, secret)}`;
}

export function verifyAdminSessionToken(token: string, secret: string, now = Date.now()): boolean {
  const [expiryPart, signature] = token.split(".");
  const expirySeconds = Number(expiryPart);
  if (!Number.isInteger(expirySeconds) || expirySeconds <= Math.floor(now / 1000)) return false;

  const expectedSignature = signSession(expirySeconds, secret);
  if (signature.length !== expectedSignature.length) return false;

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

export async function checkAuth(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!sessionToken) return false;
  return verifyAdminSessionToken(sessionToken, adminPassword);
}
