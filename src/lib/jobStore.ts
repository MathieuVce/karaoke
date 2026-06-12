import { put, list, del } from "@vercel/blob";

export interface Job {
  status: "processing" | "done" | "error";
  message?: string;
  progress?: string;
  spaceJobId?: string; // job côté Space HF
  songId?: string;     // chanson de la bibliothèque à mettre à jour
  title?: string;
  artist?: string;
  updatedAt: number;
}

const TTL = 60 * 30; // 30 min
const jobPath = (id: string) => `karaoke-jobs/${id}.txt`;

const onVercel = !!process.env.VERCEL;
const useBlob = onVercel && !!process.env.BLOB_READ_WRITE_TOKEN;

const g = globalThis as unknown as { __karaokeJobs?: Map<string, { value: Job; expires: number }> };
const mem = g.__karaokeJobs ?? (g.__karaokeJobs = new Map());

export async function getJob(id: string): Promise<Job | null> {
  if (useBlob) {
    const { blobs } = await list({ prefix: jobPath(id), limit: 1 });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) return null;
    try { return JSON.parse(await res.text()) as Job; } catch { return null; }
  }
  const e = mem.get(id);
  if (!e || e.expires < Date.now()) { mem.delete(id); return null; }
  return e.value;
}

export async function setJob(id: string, value: Job): Promise<void> {
  if (useBlob) {
    await put(jobPath(id), JSON.stringify(value), {
      access: "public", contentType: "text/plain", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0,
    });
    return;
  }
  mem.set(id, { value, expires: Date.now() + TTL * 1000 });
}

export async function delJob(id: string): Promise<void> {
  if (useBlob) {
    const { blobs } = await list({ prefix: jobPath(id), limit: 1 });
    await Promise.all(blobs.map((b) => del(b.url)));
    return;
  }
  mem.delete(id);
}

export function genJobId(): string {
  return Math.random().toString(36).slice(2, 10);
}
