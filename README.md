# Karaoké

Application web de karaoké avec défilement de paroles synchronisées mot par mot, façon KaraFun.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Blob-000000?logo=vercel&logoColor=white)
![Turbopack](https://img.shields.io/badge/Turbopack-enabled-EF4444?logo=turbopack&logoColor=white)

## Fonctionnalités

**Lecteur** : lecture MP3 avec paroles synchronisées mot par mot (format Enhanced LRC), défilement fluide et remplissage progressif de chaque mot.

**Bibliothèque** : stockage des chansons (MP3, LRC, stem voix) sur Vercel Blob, accessible depuis n'importe quel appareil.

**Créer** : synchronisation manuelle tap par mot avec compensation de latence.

**Éditer** : ajustement des timestamps ligne par ligne et mot par mot, décalage global, enregistrement direct sur le serveur.

**Écoute partagée** : génère un QR code et un lien pour afficher les paroles synchronisées sur plusieurs appareils en même temps (l'hôte garde le contrôle de la lecture).

**Séparation voix / instrumental** : ajoute un stem voix (export Suno) pour doser le volume de la voix d'aide grâce à un curseur dédié.

## Format des paroles

L'app utilise le format **Enhanced LRC** avec timestamps par mot :

```
[ti:Titre]
[ar:Artiste]
[00:15.31]<00:15.31>Premier <00:15.83>mot <00:16.55>de <00:16.98>la ligne
```

## Démarrage local

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

Pour l'écoute partagée sur le réseau local, ouvre l'app via l'IP réseau (ex. `http://192.168.1.25:3000`) affichée par Next au démarrage.

## Déploiement Vercel

```bash
npx vercel --prod
```

### Stockage des chansons

La bibliothèque et l'écoute partagée utilisent un **Vercel Blob Store** :

1. Dashboard Vercel, projet, **Storage**, **Create**, **Blob**
2. Connecter au projet : la variable `BLOB_READ_WRITE_TOKEN` est ajoutée automatiquement
3. Redéployer

## Stack

| Techno | Usage |
|--------|-------|
| [Next.js 16](https://nextjs.org/) | App Router, Turbopack, routes API |
| [React 19](https://react.dev/) | Interface |
| [TypeScript](https://www.typescriptlang.org/) | Typage |
| [Tailwind CSS 4](https://tailwindcss.com/) | Styles |
| [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) | Stockage audio, LRC, sessions partagées |
