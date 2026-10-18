# Deployment record — 2026-10-18 (Asia/Seoul)

- Public URL: https://seollem.158.180.93.165.nip.io
- SSH alias: haze-oci-a1
- Active release: /opt/seollem-ai-lounge/releases/20261018T110322Z-064014a
- Service: seollem-ai-lounge.service, enabled and active
- Listener: 127.0.0.1:18410
- HTTPS certificate issued successfully; Certbot automatic renewal configured.
- Local check: `node ops/oci/smoke.cjs` passed.
- Public HTTPS: page, API client, avatar and health returned 200.
- Server source and database paths returned 404.
- Browser: page rendered, message sent, built-in response displayed, 46.3 hearts shown.
- Existing Nginx, BizSaju, AEAEA and Pupube production services remained active.
- Gemini 3.8 Flash connected using the service-specific key from the user-opened AI Studio page. Secret stored only in /etc/seollem-ai-lounge/app.env.
- Live API test on p_0001 returned isAiGenerated=true. Browser test on a generated persona returned a relevant dinner recommendation.
- All 1,250 frontend persona IDs synchronized to the backend; per-IP request limits and input bounds verified.
- SMS subsequently configured as recorded below; payment integration remains pending.
- Local deployment changes are on branch deploy/oci; no GitHub push performed.

## Phone accounts and persistence — 2026-10-18 20:00 KST

- Real Aligo adapter configured with the existing registered sender. Provider test-mode Y returned result_code=1/success_cnt=1 without sending SMS. Live app uses test-mode N; the user will perform the actual receipt check.
- Phone number after normalization is the customer ID. First verified guest migration transfers balance/history and awards 100 hearts once. Returning logins preserve the existing balance and restore rooms across devices.
- SQLite migrated existing JSON users without replacing the original file. Chats, balances, request receipts, OTP hashes and ledger entries survive process restarts.
- Hosted fake SMS, client currency grants, VIP toggle and fake payment are removed/blocked. Gift/recall debits use server prices.
- Local and OCI integration checks passed: migration, OTP lifecycle/session binding, guest/account isolation, repeat-bonus prevention, wallet forgery rejection, chat receipts, server restart recovery and ledger balance reconciliation.
- Public HTTPS test verified server-held conversation context and repeat-request charge protection; two real Gemini turns persisted a balance of 42.6.
- Backup timer active, first backup verified successfully. Existing shared services remained active.
- No real customer phone was used for testing; all automatic account OTP tests ran against an isolated mocked provider and synthetic numbers.

Final phone-account deployment: 20261018T110322Z-064014a. Public login CTA and SMS form verified in the browser.

## AzitChat rebrand — 2026-10-18

Release: 20261018T112937Z-064014a. User-facing branding unified as 아지트챗 (AzitChat), with 아지트 대화방 as the room-list heading. Updated HTML titles, search/share metadata, business/service notices, package names, offline reference page, SMS brand label and public backend service label. Existing account/storage identifiers and deployment paths remain compatible. Local/OCI account tests passed; public HTML/package checks and browser verification passed. Domain purchase/connection remains a separate pending step.

## Custom domain — 2026-10-18

- Primary URL: https://azitchat.com
- Active application release: 20261018T120150Z-064014a.
- User completed Cloudflare purchase. Apex and www A records point to 158.180.93.165, DNS only.
- Publicly trusted certificate covers apex/www, expires 2027-01-16; dedicated azitchat-certbot-renew.timer checks only this certificate twice daily without changing other projects' renewal schedules.
- HTTP and www redirect to https://azitchat.com preserving paths/query strings.
- Same backend and SQLite database; allowed origins include new domains and the original nip.io address.
- Canonical and Open Graph URL updated. Future deployment preserves custom-domain nginx and certificate renewal configuration.
- Public health/CORS/TLS/redirect checks and new-origin browser phone-auth UI passed. Local and OCI account persistence tests passed.
- Domain auto-renewal remains OFF as set by the user. No real SMS receipt was tested; the user will verify on the site.

New-domain live browser check: real AI reply succeeded; refreshing restored the saved conversation and 46.3-heart balance. Real SMS receipt remains for user testing. Certificate renewal service completed successfully and its timer is active.

## Gemini 3.1 Flash-Lite — 2026-10-18

- Switched configured production model and source/example defaults to `gemini-3.1-flash-lite` at the user's request.
- Release: 20261018T121000Z-aa5967a. Existing LOW thinking configuration is supported and passed a real provider preflight.
- Verified the running process has GEMINI_MODEL=gemini-3.1-flash-lite.
- Public API returned a real Korean AI response; chat and 46.3-heart remaining balance persisted after one message.
- Heart pricing remains 3.7 per successful chat turn. Local smoke and local/OCI account integration checks passed.
