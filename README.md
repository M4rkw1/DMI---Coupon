# DMI Coupon — Vercel + Supabase build

This is the first real hosted version: public entry page, Old School print page, leaderboard, admin settings, dynamic fixtures, TSV import, payment tracking, released entries, and PNG downloads.

## 1) Supabase setup
1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase_schema.sql`.
4. Copy your Project URL and Service Role key.

## 2) Vercel setup
Add these Environment Variables in Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSCODE` e.g. `DMI2026`
- `API_FOOTBALL_KEY` optional, only needed for API-Football live score sync

## 3) Local test
```bash
npm install
npm run dev
```

Create `.env.local`:
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_PASSCODE=DMI2026
```

## 4) Deploy
Upload/import this folder into Vercel, or push it to GitHub and import the repo.

## Notes
- QR codes are currently image URLs, so upload the QR images somewhere public first, or use Supabase Storage later.
- Manual score entry remains the fallback for all fixtures.
- Live score sync uses API-Football when `API_FOOTBALL_KEY` is set and fixtures have an API fixture ID.
- Fixture import supports `Home TAB Away TAB Kick-off TAB API Fixture ID`. The final API ID column is optional.
