# Active domain: azitchat.com

2026-10-18: User purchased azitchat.com through Cloudflare Registrar.

- Website: https://azitchat.com
- www.azitchat.com redirects to the apex over HTTPS.
- Cloudflare authoritative DNS: miles.ns.cloudflare.com, treasure.ns.cloudflare.com.
- Apex and www A records: 158.180.93.165, DNS only (origin TLS).
- Dedicated nginx vhost: /etc/nginx/sites-available/azitchat.
- Let's Encrypt certificate covers apex and www; dedicated azitchat-certbot-renew.timer runs twice daily, and renewal reloads nginx after syntax check.
- Existing nip.io address remains available for existing sessions.
- ALLOWED_ORIGINS includes both new origins and the existing nip.io origin.
- The application uses the same persistent SQLite database and phone accounts on both domains.
- Browser guest sessions are origin-specific; verified accounts can sign in with the same phone number.
- Domain auto-renewal is currently OFF in Cloudflare; left at the user's setting.

Deployment retains the custom-domain nginx configuration via ops/oci/deploy.sh.
