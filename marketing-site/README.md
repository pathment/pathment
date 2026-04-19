# Pathment Marketing Site

This app powers the public marketing experience for Pathment on the apex domain.

## Goal

- `pathment.me` and `www.pathment.me` -> this app
- `devweekends.pathment.me` (and other tenant subdomains) -> product app (`client-interface`)
- `api-<tenant>.pathment.me` -> backend on DigitalOcean

## Local development

1. Install dependencies:

```bash
cd marketing-site
npm install
```

2. Run development server:

```bash
npm run dev
```

3. Open `http://localhost:3000`.

## Vercel setup

Create a dedicated Vercel project for this folder:

- Project root directory: `marketing-site`
- Framework preset: Next.js
- Build command: `next build`
- Output directory: `.next` (default)

Add domains to this project:

- `pathment.me`
- `www.pathment.me`

Do not add tenant app subdomains here.

## DNS mapping strategy

Use this split so marketing and product remain independent:

- Apex and `www` records -> Vercel marketing project
- Tenant app records (for example `devweekends.pathment.me`) -> product Vercel project
- API records (for example `api-devweekends.pathment.me`) -> DigitalOcean droplet / Nginx

## Deployment sanity checks

1. `https://pathment.me` shows the landing page from this folder.
2. `https://devweekends.pathment.me` still opens the tenant app.
3. `https://api-devweekends.pathment.me/api/health` returns healthy response.
4. No host resolves to the default Nginx welcome page.
