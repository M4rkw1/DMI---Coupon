# RIG Coupon — Vercel + Supabase build

This is the first real hosted version: public entry page, Old School print page, leaderboard, admin settings, dynamic fixtures, TSV import, payment tracking, released entries, and PNG downloads.

## 1) Supabase setup
1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase_schema.sql`.
4. Copy your Project URL, anon public key, and Service Role key.

## 2) Vercel setup
Add these Environment Variables in Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASS` e.g. `DMI2026`
- `API_FOOTBALL_KEY` optional, only needed for API-Football live score sync

## 3) Local test
```bash
npm install
npm run dev
```

Create `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_PASS=DMI2026
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Do not expose it with a
`NEXT_PUBLIC_` prefix.

## 4) Deploy
Upload/import this folder into Vercel, or push it to GitHub and import the repo.

## Notes
- QR codes are currently image URLs, so upload the QR images somewhere public first, or use Supabase Storage later.
- Manual score entry remains the fallback for all fixtures.
- Live score sync uses API-Football when `API_FOOTBALL_KEY` is set and fixtures have an API fixture ID.
- Fixture import supports `Home TAB Away TAB Kick-off TAB API Fixture ID`. The final API ID column is optional.

## Fixture image export
In Admin, preview the TSV fixtures, then open **Share Images → Export Fixtures Image**. Choose **Full fixtures** or a dated **Day 1 / Day 2 / …** option and press **Download Fixtures PNG**. The image uses the current preview, including badges and removed rows, without saving or replacing fixtures. Dates and kick-off times use Europe/London; undated fixtures have a separate TBC option. Missing or failed badge images use team initials.

## Mobile player app

The normal `/` route now adapts to phones, tablets and desktop. Players get Home,
Coupon, Table and History navigation. The More menu contains Print coupon, Add to
home screen and Admin. Existing scoring, releases, archives and admin APIs are unchanged.

Unsubmitted drafts are stored per coupon week in this browser's local storage.
A draft is **not an entry**; players must submit while entries are open. A successful
submission clears the draft. This is not account-based or cross-device storage.
History displays the existing public archived coupons; this repository does not yet
contain the email-login and personal-history implementation mentioned in the shared chat.

### Installation and offline behaviour

Deploy over HTTPS. The manifest provides a standalone home-screen app and PNG icons.
On iOS, open the site in Safari and choose Share → Add to Home Screen. Supported
Android browsers offer installation through their menu or the app's More menu.
The service worker is registered only in production, so test with `npm run build`
then `npm run start`. It caches only `/offline.html`; API responses, player entries,
admin pages and scores are never stored in its cache. An internet connection is
required to submit predictions or refresh results.

### Validation

- Production build: `npm run build`.
- Service-worker cache boundary: `node --test tests/service-worker.test.cjs`.
- Check phone widths of 320 and 390 pixels, tablet width of 820 pixels, and desktop.
- Check navigation, draft reload (including 0–0), submission failure/success, history,
  and the Print/Admin menu. Use an isolated fake API for submission checks.
- A real deployment still needs the existing Supabase environment variables above.
  No database migration is required for this interface update.

## Admin sections
Admin controls are grouped into Coupon Setup, Fixtures, Results, Entries & Payments, Share Images, and History. The coupon-week selector stays visible above the tabs. Switching sections keeps drafts and fixture previews in memory; saving and autosave behave as before. Use Left/Right arrows, Home, or End on the tab bar for keyboard navigation.
