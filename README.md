# M7.3 — PM/PIC XLSX Export Minimal Patch

This patch adds the PM/PIC XLSX export required by the SRS while preserving the existing M7.2 mode/filter dashboard.

## Files
- `app/reports/page.tsx` — adds the Export XLSX action and preserves active User/date/status filters.
- `app/api/reports/export/route.ts` — server-side authorized XLSX generation with 3 sheets: Summary, Survey History, Province x City.
- `package.json` — adds `exceljs`.

## Install
Run:

```bash
npm install
npm run dev
```

No Supabase migration is required.

## Security
The export route requires the PM/PIC role and runs server-side. It never exposes a service-role key in the browser.
