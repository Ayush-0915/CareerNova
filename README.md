# CareerNova

A small web app to extract text from PDFs and gather reviews (frontend built with Vite + React + TypeScript).

## Features

- Upload PDF files and extract text client-side using `pdfjs-dist` (see `src/lib/pdfExtract.ts`).
- Simple review submission API under `api/review.ts` (serverless function). Optional Supabase integration for persistence.
- Built with Vite, React, TypeScript and Tailwind CSS.

## Tech stack

- Vite
- React 18 + TypeScript
- Tailwind CSS + PostCSS
- pdfjs-dist for PDF parsing
- Optional: Supabase for persisting reviews

## Requirements

- Node.js 18+ (recommended)
- npm (or yarn/pnpm) to install packages
- Optional: a Supabase project and service role key if you want server-side persistence

## Setup

1. Clone the repository.
2. Copy environment variables:

```bash
cp .env.example .env
# then edit `.env` to add your keys (do NOT commit real secrets)
```

3. Install dependencies:

```bash
npm install
```

4. Run the dev server:

```bash
npm run dev
# open http://localhost:5173/
```

5. Build for production:

```bash
npm run build
```

6. Preview production build locally:

```bash
npm run preview
```

## Environment variables

All available example variables are in `.env.example`:

- `GEMINI_API_KEY` — API key for the LLM (if used).
- `SUPABASE_URL` — optional Supabase project URL.
- `SUPABASE_SERVICE_KEY` — optional service role key (server-only). Keep secret.

Notes:

- Use `vercel dev` to run serverless functions locally; it reads `.env` automatically.
- To store reviewed resumes in Supabase, create the `public.reviews` table using [supabase/migrations/20260531_create_reviews.sql](supabase/migrations/20260531_create_reviews.sql).

## Project structure (high level)

Below is a more detailed layout of the repository and a short description for important files.

```
Careernova/
├─ api/                     # serverless endpoints (Vercel functions)
│  ├─ review.ts             # POST endpoint to accept/save reviews
│  └─ supabaseClient.ts     # optional Supabase client wrapper
├─ src/                     # frontend app
│  ├─ main.tsx              # React app bootstrap
│  ├─ App.tsx               # root component and routes/state
│  ├─ index.css             # Tailwind + base styles
│  └─ components/
│     ├─ UploadZone.tsx     # drag/drop or file picker UI for PDFs
│     ├─ ResultView.tsx     # shows extracted text / results
│     └─ LoadingState.tsx   # UI for loading/processing states
├─ lib/                     # utility libraries
│  ├─ pdfExtract.ts         # PDF parsing using `pdfjs-dist`
│  └─ types.ts              # shared TypeScript types/interfaces
├─ public/                  # static assets (if present)
├─ index.html               # Vite HTML entry
├─ vite.config.ts           # Vite configuration
├─ tailwind.config.js       # Tailwind configuration
├─ postcss.config.js        # PostCSS configuration
├─ package.json             # scripts & dependencies
└─ .env.example             # example environment variables
```

Notes:

- The `api/` folder contains serverless functions compatible with `vercel dev` and Vercel deployments.
- `lib/pdfExtract.ts` performs client-side PDF extraction; move heavy processing to server if needed for large files.
- Keep secrets out of the repo — use `.env` or Vercel environment settings for production keys.
- Resume review results are stored in Supabase only when the `public.reviews` table exists and `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are configured.

## Known issues / tips

- `package.json` currently contains a duplicate `dependencies` key which triggers a warning from the tooling. Resolve by merging the duplicate blocks into one `dependencies` object.

## Contributing

- Open an issue or submit a PR. Keep changes focused and run the app locally to verify.

## License

- (add a license if desired)
