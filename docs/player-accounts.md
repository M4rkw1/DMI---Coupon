# Optional player accounts

Players can enter as guests or sign in using an email link. Supabase stores and
refreshes the session in the same browser, so a new link is not needed for each
coupon. Signing out, clearing browser data, changing browser/device, or server
session policies can require another link. A home-screen app and Safari may use
separate storage; verify both on an iPhone before announcing availability.

Verified players set a name and optional department once. Subsequent submissions
read that identity from the server, ignoring name/department supplied by the
client. Only Admin → Player Accounts can update it. Corrections affect future
entries, not historic records. Guests can still type names freely; this feature
does not reserve names or prevent guest impersonation. No existing entries are
automatically claimed or linked to accounts.

## One-time setup before enabling

1. Run `migrations/20261112_player_profiles.sql` in the existing Supabase project's
   SQL editor. It adds a private profile table with RLS and removes all anon and
   authenticated direct access. The service role is only used by server routes.
2. Enable Supabase Email authentication and new email signups. Keep email
   verification enabled. Configure a production SMTP provider; Supabase's default
   test mail service may not deliver to ordinary players. Keep rate limits enabled.
3. Set the Supabase Site URL to the live app origin and allow the exact callback
   URL `https://dmi-coupon.vercel.app/account`. Add each trusted preview callback
   separately when testing. Keep the default magic-link email template pointing
   to Supabase's confirmation URL.
4. Vercel must have `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   and the existing server-only `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_KEY`.
   Never put the service-role key in a NEXT_PUBLIC variable.
5. After testing the migration and email delivery, set
   `NEXT_PUBLIC_PLAYER_ACCOUNTS_ENABLED=true` and rebuild. Leaving it unset hides
   sign-in and keeps guest entry working while setup is pending.
6. Test with two separate player accounts: initial verified login, saved details,
   reload/reopen, weekly coupon change, sign-out, invalid/expired link, admin name
   correction, and submitting with a deliberately altered name. Confirm the
   server still records the saved identity. Do not submit test predictions to a
   live prize coupon; use an isolated test coupon/database.

## Verification performed in this change

Automated checks cover guest compatibility, verified identity override,
invalid/unverified sessions, missing profiles, create-once identity, player/guest
PATCH rejection, administrator updates and no-store responses. The production
build passes. Real email delivery and live database migration require the setup
above; those have not been performed by the implementation checks.

The public state API never returns the profile table or email addresses. Tokens
are sent only in Authorization headers and are verified with Supabase getUser.
Profile names/departments are not stored in mutable auth user metadata.

## WhatsApp identification

New account profiles require a WhatsApp phone number including country code.
Numbers are normalised to international +digits format (8–15 digits); this checks
format only, not ownership or WhatsApp membership. The player and authenticated
admins can view the number. Only admins may change it after initial setup.
Numbers stay in the private profile table and are never copied to public entries,
leaderboards, archive snapshots or share images. Guest entry remains unchanged.
No WhatsApp messages are sent and no group membership is automated.

Run `migrations/20261112_player_profile_phone.sql` after the base profile migration
before deploying this update. Legacy profiles have a null phone until an admin
adds it; the account view directs those players to the admin.

Rollout status, 12 November 2026: base profile migration applied and privacy
permissions verified (RLS true, anon read false, authenticated update false).
Production Site URL and exact /account callback are saved. The phone migration
is also applied. iCloud SMTP settings have been saved by the owner. Preview
accounts are enabled for delivery and sign-in checks; production login remains
disabled until these checks pass.

## Admin annual league enrolment

In Admin → Player Accounts, load the profiles and tick “$100 annual payment received — enrol in the 2027 league”, then choose “Confirm payment & enrol”. This records a payment already received; it does not collect money. Players cannot enrol themselves.

The server reads the saved account name and department and links the annual member to its private user ID. If a member already exists, explicitly select that membership to retain its ID and finalised points. No automatic name matching or retrospective points are added. Weekly entries still require verification in Annual League. Payment corrections remain available in either admin section; use Reload if another session changes the league.

No database migration or new environment variable is needed. Account IDs and department stay out of public league responses, and phone numbers are not copied into league records.

Validation: 41 Node tests pass, production build passes, and the checkbox/status transition was checked in a local sample view without modifying real membership/payment records.

## Automatic annual entries and points

From this release onward, signed-in entries are saved with a separate private account link. Apply `migrations/20261113_annual_entry_links.sql` before deploying. Its service-only RPC commits the entry and link in one transaction. Guest entries use the existing submission path. Older entries have no trustworthy account link and are not inferred from names.

For published coupons assigned to calendar year 2027 and weeks 1–52, paid members' first signed-in entry is selected automatically (created_at, then entry ID). One entry counts per member each week. Eligibility is frozen at initial finalisation, so later enrolment/payment does not backfill points. All coupon entries determine winner/runner-up levels, including guests and additional entries, matching existing league scoring: +1 participation, +5 highest score, +2 next distinct score.

Reconciliation runs after submissions, result syncs, admin result/entry changes, before archiving, and when loading the annual league. Incomplete fixtures stay in draft. Once all are finished/void, points are stored. Changed results update automatic weeks, with revision checks and retries protecting concurrent admin edits. Failed updates retry on the next league load or event. This does not introduce a separate score-fetching schedule: the existing live-score sync still supplies match results.

Live/archive copies with the same fixture IDs count once; private links survive archiving. Multiple distinct coupons assigned to one calendar week require an admin to choose the source. Existing manual weeks are preserved. Reopening or saving a draft makes that week manual, preventing automation from undoing corrections; finish that week with the existing Finalise action. Guest/legacy entries can still be verified manually.

Validation: 50 Node tests and production build pass, including first-entry selection, completion/void rules, late payment eligibility, archive deduplication, result corrections, manual override, idempotence across JSON key ordering, and concurrent admin writes. Database submission/privacy checked inside a rolled-back transaction with no persisted test entry.
