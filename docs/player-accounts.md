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
Production Site URL and exact /account callback are saved. Email delivery is not
yet configured; login remains disabled pending SMTP setup and end-to-end checks.
