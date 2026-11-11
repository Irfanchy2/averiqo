# TradePilot AI — web terminal

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + TradingView Lightweight Charts 5.

```bash
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000 (needs the quant service on :8000)
npm run lint && npx tsc --noEmit && npm run build
```

All REST calls go through `src/app/api/[...path]/route.ts`, a same-origin proxy that adds the
quant-service bearer token server-side. See the repository root README for the full picture.
