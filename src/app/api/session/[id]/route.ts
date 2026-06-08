import { NextResponse } from "next/server";
import { getSession, setSession, deleteSession, type SessionAnchor } from "@/lib/sessionStore";

// Follower : récupère l'état courant + l'heure serveur (synchro d'horloge)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Session introuvable ou expirée" }, { status: 404 });
  return NextResponse.json({ session, serverNow: Date.now() }, {
    headers: { "Cache-Control": "no-store" },
  });
}

// Hôte : met à jour l'ancre de lecture (play/pause/seek + heartbeat)
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const { playing, offset } = await request.json();
    const session = await getSession(id);
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    const anchor: SessionAnchor = { playing: !!playing, offset: Number(offset) || 0, at: Date.now() };
    await setSession(id, { ...session, anchor });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Termine la session (nettoyage)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteSession(id);
  return NextResponse.json({ ok: true });
}
