# M7.3 Vercel TypeScript Build Fix

Minimal patch for Vercel `npm run build` TypeScript failures.

Replace only:
- `app/reports/page.tsx`
- `app/api/reports/export/route.ts`
- `app/api/surveys/[id]/photos/route.ts`

Fixes:
- implicit `any` callbacks from untyped Supabase RPC/master-data results;
- missing `province_id` inference on city rows;
- unknown error/message values passed to `jsonError`.

No database migration and no business-logic change.
