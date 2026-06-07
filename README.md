# Karaoké

Application web de karaoké avec défilement de paroles synchronisées mot par mot, construite avec Next.js.

## Fonctionnalités

- **Lecteur** — lecture MP3 avec paroles synchronisées mot par mot (format Enhanced LRC), défilement automatique style KaraFun
- **Bibliothèque** — stockage des chansons (MP3 + LRC) sur Vercel Blob, accessible depuis n'importe quel appareil
- **Créer** — synchronisation manuelle tap par mot avec compensation de latence configurable
- **Éditer** — édition des timestamps ligne par ligne, décalage global

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

## Déploiement Vercel

```bash
npx vercel --prod
```

### Stockage des chansons (Bibliothèque)

L'onglet Bibliothèque nécessite un **Vercel Blob Store** :

1. Dashboard Vercel → projet → **Storage** → **Create** → **Blob**
2. Connecter au projet → la variable `BLOB_READ_WRITE_TOKEN` est ajoutée automatiquement
3. Redéployer

## Stack

- [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
