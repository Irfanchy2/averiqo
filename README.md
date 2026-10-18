# Averiqo marketing site

Next.js 15 (App Router) + Tailwind CSS 4.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Home: hero, product screens, core features, a section per module, mobile, pricing, testimonials, FAQ, final CTA |
| `/pricing` | Pricing with monthly/yearly toggle |
| `/signup` → `/checkout` → `/create-company` → `/onboarding` → `/dashboard` | Sign-up funnel |
| `/login` | Log in |
| `/demo` | Shown for "View Live Demo" until `NEXT_PUBLIC_DEMO_URL` is set |

## Screenshots

Drop real screenshots into `public/screenshots/` (see the README there). Until a
slot has a file, a coded UI preview labelled "Preview · sample data" is shown.

## Pricing

All prices, features, trial length and the yearly discount live in
`config/pricing.json` and are read through `getPricing()` in `lib/pricing.ts`.
To manage pricing from Averiqo admin/settings, expose the same JSON shape
from the backend and set `PRICING_API_URL`.

`yearlyMonthsCharged: 10` means yearly = 10 × monthly (2 months free).

## Funnel and integrations

See `.env.example`. With no environment variables set, the whole funnel
works in demo mode. Set `AVERIQO_API_URL` to save accounts and companies,
`STRIPE_SECRET_KEY` to take real payments, and `NEXT_PUBLIC_APP_URL` to hand
the customer over to the real dashboard.

## Content rules

No customer counts, uptime figures, ratings or testimonials are invented.
Testimonials and legal pages are clearly marked placeholders. Replace them
only with real, verified content.
