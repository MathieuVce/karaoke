import { NextResponse } from "next/server";
import os from "os";
import { setSession, genSessionId, type ShareSession } from "@/lib/sessionStore";

// Première adresse IPv4 du réseau local (pour le partage en dev sur le même Wi-Fi)
function lanIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

function baseUrl(request: Request): string {
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  // En local (localhost), remplace par l'IP réseau pour que les autres appareils puissent se connecter
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) {
    const ip = lanIp();
    if (ip) {
      const port = host.includes(":") ? host.split(":")[1] : "3000";
      return `http://${ip}:${port}`;
    }
  }
  return `${proto}://${host}`;
}

// Crée une session d'écoute partagée
export async function POST(request: Request) {
  try {
    const { title, artist, lrc, hasWords } = await request.json();
    const id = genSessionId();
    const session: ShareSession = {
      title: title ?? "",
      artist: artist ?? "",
      lrc: lrc ?? "",
      hasWords: !!hasWords,
      anchor: { playing: false, offset: 0, at: Date.now() },
    };
    await setSession(id, session);
    return NextResponse.json({ id, shareUrl: `${baseUrl(request)}/share/${id}` });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
