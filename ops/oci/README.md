# 아지트챗 (AzitChat) — OCI deployment

Existing shared host: `haze-oci-a1` (Ubuntu ARM64). Do not install Docker or
restart unrelated services. This application has its own `seollem` user,
`seollem-ai-lounge.service`, loopback port `18410`, and Nginx virtual host.

- URL: https://seollem.158.180.93.165.nip.io
- Releases: `/opt/seollem-ai-lounge/releases/<label>`
- Active release: `/opt/seollem-ai-lounge/current`
- Environment: `/etc/seollem-ai-lounge/app.env` (root:seollem 0640)
- SQLite database: `/var/lib/seollem-ai-lounge/seollem.sqlite` (WAL, transactional writes)
- Legacy JSON: imported once without overwriting the original
- Backups: `/var/backups/seollem-ai-lounge`, daily timer, 14 days
- TLS: Certbot webroot `/var/www/seollem-acme`

Gemini is configured in the server environment with the service-specific
`시니어 AI 챗` key; the key is never included in frontend files.
Model: `gemini-3.1-flash-lite` (override with `GEMINI_MODEL`).
The frontend persona catalog is exported by `server/scripts/sync-personas.cjs`
so all 1,250 displayed IDs resolve on the backend.
Chat is limited to 12 requests per minute per IP, guest creation to 10.
These are in-memory limits and reset when the process restarts.
Phone authentication uses the existing registered Aligo account and sender,
with service-specific environment settings. SMS text is branded 아지트챗.
The live environment uses `ALIGO_TESTMODE_YN=N`. Only the provider test-mode
request was exercised automatically; the user will verify real delivery.

Authenticated customer IDs are normalized phone numbers (`010` + eight digits).
Initial guest linking transfers server-held balance and rooms, awards 100 hearts
once, and revokes the old guest session. Returning phone logins restore the
existing balance and merge guest rooms without adding guest currency.
OTP challenges are HMAC-hashed, bound to the requesting session, valid for five
minutes, single-use, and limited to five guesses. Resend cooldown is 60 seconds,
phone limit five SMS/day and IP limit twenty/day (persisted across restarts).
Balances, bonuses and VIP status cannot be set by a frontend snapshot.
Chats are saved on the server before/after model generation; request IDs prevent
repeat charging. Additional UI conversation metadata is synchronized via an
authenticated endpoint. UI saves merge message IDs without discarding older
messages. Users can explicitly delete their own rooms.

Payment and paid-media integration remain unavailable (503); fake client-side
charges/VIP grants are disabled on hosted pages. Gift and recall prices come
from the server. No real payment is processed.

Run `node server/tests/accounts.cjs` for isolated account/SMS integration tests.
The mocked provider is loaded only by the test child process; production uses
the real Aligo URL and has no test bypass or fixed verification code.

Use `deploy.sh` to upload a new immutable release and switch the service after
local API checks. Nginx is validated before a graceful reload. The first run
issues a TLS certificate; later runs reuse it. The environment and database
persist between releases. To roll back, repoint `current` to the previous
release and restart only `seollem-ai-lounge.service`.

The first SQLite migration release must not be rolled back to JSON-only code
after real account writes. Use a SQLite-compatible release or restore the
verified database backup as part of a deliberate recovery.

## Production domain

Primary URL: https://azitchat.com (www redirects to apex).
Cloudflare DNS-only A records for apex/www point to 158.180.93.165.
`nginx-azitchat.conf` uses the apex/www Let's Encrypt certificate.
Dedicated `azitchat-certbot-renew.timer` renews this certificate only, twice daily.
`deploy.sh` retains this vhost and timer when the certificate exists.
The original nip.io address remains available for earlier browser sessions.
