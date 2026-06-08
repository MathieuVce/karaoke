import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string) => {
        // Extraire l'ID du fichier depuis le chemin
        const filename = pathname.split("/").pop() ?? "";
        const id = filename.split(".")[0];
        
        if (id) {
          // Rechercher si la chanson existe déjà (possède un fichier de métadonnées)
          const { blobs } = await list({ prefix: `karaoke/${id}.meta` });
          const songExists = blobs.length > 0;
          
          if (songExists) {
            // Si la chanson existe, la modification de ses fichiers nécessite un mot de passe
            if (!(await checkAuth())) {
              throw new Error("Non autorisé. Mot de passe requis pour modifier cette chanson.");
            }
          }
        }

        return {
          allowedContentTypes: [
            "audio/mpeg", "audio/mp3", "audio/mp4", "audio/ogg",
            "audio/wav", "audio/wave", "audio/x-wav", "audio/x-pn-wav",
            "audio/x-m4a", "audio/m4a", "audio/aac", "audio/flac", "audio/x-flac",
            "audio/webm", "audio/opus", "audio/3gpp", "video/mp4",
            "text/plain", "application/octet-stream", "application/json",
          ],
          maximumSizeInBytes: 150 * 1024 * 1024, // 150 MB
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

