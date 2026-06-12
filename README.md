# Karaoké

Application web de karaoké avec défilement de paroles synchronisées mot par mot, façon KaraFun.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Blob-000000?logo=vercel&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Demucs-009688?logo=fastapi&logoColor=white)

Lien démo: https://karaoke-ashy-iota.vercel.app

## Fonctionnalités

**Lecteur** : lecture MP3 avec paroles synchronisées mot par mot (format Enhanced LRC), défilement fluide, remplissage progressif de chaque mot et zoom adaptatif.

**Rechercher** : deux entrées complémentaires.
* Par paroles via LRCLIB (base communautaire gratuite) puis lecture sur une iframe YouTube calée dessus.
* Par vidéo YouTube : tu choisis une vidéo, l'app vérifie LRCLIB ; si aucune parole synchronisée n'existe, tu passes en synchronisation manuelle.
* Case « version instrumentale / karaoké » pour privilégier les vidéos sans voix originale.

**Bibliothèque** : stockage sur Vercel Blob. Deux types de chansons.
* Chanson audio : MP3 (plus stem voix et LRC optionnels), gros fichiers stockés sur Blob.
* Chanson YouTube : sauvegarde légère (identifiant vidéo plus LRC), aucun fichier audio.

**Créer** : synchronisation manuelle tap par mot avec compensation de latence.

**Éditer** : ajustement des timestamps ligne par ligne et mot par mot, décalage global, enregistrement direct sur le serveur.

**Écoute partagée** : génère un QR code et un lien. Les autres appareils affichent les paroles synchronisées en temps réel sur la position de l'hôte (audio ou vidéo YouTube). L'hôte garde le contrôle de la lecture.

**Séparation voix / instrumental** : pour une chanson audio, ajoute un stem voix (export Suno ou Demucs) et dose le volume de la voix d'aide avec un curseur dédié.

**Génération des paroles par IA** : sur tes propres fichiers audio uniquement, Groq Whisper transcrit l'audio (idéalement le stem voix) en LRC mot par mot.

**Synchronisation sur une vidéo YouTube** : pour les clips avec coupures, un mode resynchronisation re-cale chaque ligne sur la vidéo. Un réglage de décalage et un gel des paroles permettent l'alignement fin.

**Protection par mot de passe** : les actions sensibles (modification, suppression, sauvegarde serveur) sont protégées par un mot de passe admin.

## Format des paroles

Format Enhanced LRC avec timestamps par mot :

```
[ti:Titre]
[ar:Artiste]
[00:15.31]<00:15.31>Premier <00:15.83>mot <00:16.55>de <00:16.98>la ligne
```

## Architecture

| Couche | Rôle |
|--------|------|
| Next.js (frontend plus routes API) | Interface, proxys LRCLIB et YouTube, transcription Groq, sessions de partage |
| Vercel Blob | Fichiers lourds (MP3, voix, LRC) et état des sessions de partage |
| Backend FastAPI plus Demucs (dossier `backend/`) | Séparation voix / instrumental pour tes propres fichiers, déployable en Space Docker sur Hugging Face |
| LRCLIB | Paroles synchronisées communautaires |
| YouTube IFrame API | Lecture de la musique, sans téléchargement |
| Groq | Transcription Whisper |

## Démarrage local

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

Pour l'écoute partagée sur le réseau local, ouvre l'app via l'IP réseau (par exemple `http://192.168.1.25:3000`) affichée par Next au démarrage. Ajoute cette IP dans `allowedDevOrigins` de `next.config.ts` si Next bloque l'accès.

## Variables d'environnement

Copie `.env.example` vers `.env.local` et remplis les valeurs. À chaque modification, redémarre `npm run dev`.

| Variable | Rôle |
|----------|------|
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | Vercel Blob (ajoutés automatiquement en connectant un Blob Store) |
| `ADMIN_PASSWORD` | Mot de passe des actions sensibles |
| `GROQ_API_KEY` | Transcription IA (console.groq.com) |
| `YOUTUBE_API_KEY` | Recherche de vidéos (Google Cloud, API Data v3) |

Si le projet est relié à Vercel : `npx vercel env pull .env.local`.

## Déploiement Vercel

```bash
npx vercel --prod
```

La bibliothèque et l'écoute partagée nécessitent un Vercel Blob Store (Dashboard, Storage, Create, Blob). Définis les variables d'environnement dans le projet Vercel, puis redéploie.

## Backend de séparation (optionnel)

Le dossier `backend/` contient un service FastAPI plus Demucs (et Groq) déployable en Space Docker sur Hugging Face, attachable en sous module git. Il sépare un MP3 que tu possèdes en instrumental plus voix. Voir `backend/README.md`.

## Légalité

L'app ne télécharge jamais l'audio d'une vidéo YouTube (interdit par les CGU). La musique YouTube passe par l'iframe officielle. Les paroles viennent de LRCLIB, de ta saisie, ou de la transcription de tes propres fichiers. La génération IA ne s'applique qu'aux fichiers que tu possèdes.

## Stack

| Techno | Usage |
|--------|-------|
| [Next.js 16](https://nextjs.org/) | App Router, Turbopack, routes API |
| [React 19](https://react.dev/) | Interface |
| [TypeScript](https://www.typescriptlang.org/) | Typage |
| [Tailwind CSS 4](https://tailwindcss.com/) | Styles |
| [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) | Stockage |
| [FastAPI](https://fastapi.tiangolo.com/) plus [Demucs](https://github.com/facebookresearch/demucs) | Séparation audio |
| [Groq](https://groq.com/) | Transcription Whisper |
| [LRCLIB](https://lrclib.net/) | Paroles synchronisées |
