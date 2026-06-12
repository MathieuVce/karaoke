// Extrait l'ID d'une vidéo YouTube depuis une URL ou un ID brut
export function extractYtId(input: string): string | null {
  const m =
    input.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/) ||
    input.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}
