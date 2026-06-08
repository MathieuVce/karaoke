import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkAuth, createAdminSessionToken } from "@/lib/auth";

const ADMIN_SESSION_COOKIE = "admin_session";
const LEGACY_ADMIN_PASSWORD_COOKIE = "admin_password";

export async function GET() {
  const authenticated = await checkAuth();
  return NextResponse.json({ authenticated });
}

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json({ error: "ADMIN_PASSWORD n'est pas configuré" }, { status: 500 });
    }
    if (password === adminPassword) {
      const cookieStore = await cookies();
      const sessionToken = createAdminSessionToken(adminPassword);
      cookieStore.set(ADMIN_SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 1 week
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_SESSION_COOKIE);
    cookieStore.delete(LEGACY_ADMIN_PASSWORD_COOKIE);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
