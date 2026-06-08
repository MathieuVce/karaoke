import { put, list, del } from "@vercel/blob";
import { Redis } from "@upstash/redis";

export interface SessionAnchor {
  playing: boolean;
  offset: number; // currentTime (secondes) au moment de l'ancre
  at: number;     // Date.now() serveur au moment de l'ancre
}

export interface ShareSession {
  title: string;
  artist: string;
  lrc: string;
  hasWords: boolean;
  anchor: SessionAnchor;
}

const SESSION_TTL = 60 * 60 * 4; // 4 h
const sessionKey = (id: string) => `karaoke:session:${id}`;
const sessionPath = (id: string) => `karaoke-sessions/${id}.txt`;

// Priorité : Redis (si Upstash) → Vercel Blob (en prod sur Vercel) → mémoire (dev local)
// En dev local, le serveur est un seul process : la mémoire est partagée entre toutes les
// routes et tous les appareils du réseau → fiable, immédiat (pas de cohérence à terme).
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const onVercel = !!process.env.VERCEL;
const useBlob = onVercel && !!process.env.BLOB_READ_WRITE_TOKEN;

// Stocké sur globalThis pour survivre aux hot-reloads de Next en dev
const g = globalThis as unknown as { __karaokeSessions?: Map<string, { value: ShareSession; expires: number }> };
const mem = g.__karaokeSessions ?? (g.__karaokeSessions = new Map());

export async function getSession(id: string): Promise<ShareSession | null> {
  if (redis) return await redis.get<ShareSession>(sessionKey(id));

  if (useBlob) {
    const { blobs } = await list({ prefix: sessionPath(id), limit: 1 });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) return null;
    try { return JSON.parse(await res.text()) as ShareSession; } catch { return null; }
  }

  const e = mem.get(id);
  if (!e || e.expires < Date.now()) { mem.delete(id); return null; }
  return e.value;
}

export async function setSession(id: string, value: ShareSession): Promise<void> {
  if (redis) {
    await redis.set(sessionKey(id), value, { ex: SESSION_TTL });
    return;
  }

  if (useBlob) {
    // cacheControlMaxAge:0 → la lecture renvoie toujours l'état frais (pas de cache CDN figé)
    await put(sessionPath(id), JSON.stringify(value), {
      access: "public",
      contentType: "text/plain",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    return;
  }

  mem.set(id, { value, expires: Date.now() + SESSION_TTL * 1000 });
}

export async function deleteSession(id: string): Promise<void> {
  if (redis) { await redis.del(sessionKey(id)); return; }
  if (useBlob) {
    const { blobs } = await list({ prefix: sessionPath(id), limit: 1 });
    await Promise.all(blobs.map((b) => del(b.url)));
    return;
  }
  mem.delete(id);
}

export function genSessionId(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}
