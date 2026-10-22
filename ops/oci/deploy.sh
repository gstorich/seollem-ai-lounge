#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
release="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
bash ops/build-styles.sh
node server/scripts/sync-personas.cjs
node ops/oci/smoke.cjs
node server/tests/idle-followup.cjs
node server/tests/wellbeing.cjs
node server/tests/wellbeing-api.cjs
node server/tests/accounts.cjs
node server/tests/storage-archive.cjs
node server/tests/message-delivery.cjs
node server/tests/background-recovery.cjs
node server/tests/system-messages.cjs
node server/tests/gift-reaction.cjs
node server/tests/gift-ui.cjs
node server/tests/reply-recovery.cjs
node server/tests/operations.cjs
node server/tests/ai-reports.cjs
node server/tests/analytics.cjs
node server/tests/advertising.cjs
node server/tests/funnel-insights.cjs
node server/tests/ad-funnel.cjs
node server/tests/ad-browser.cjs
node server/tests/matching.cjs
node server/tests/inicis.cjs
node server/tests/commerce.cjs
node server/tests/commerce-events.cjs
node server/tests/adult-test-access.cjs
node server/tests/content-access.cjs
node server/tests/content-access-ui.cjs
node server/tests/legal.cjs
node server/tests/heart-expiry.cjs
node server/tests/llm-completion.cjs
node server/tests/chat-timing.cjs
node server/tests/chat-voice.cjs
node server/tests/character-behavior.cjs
node server/tests/character-studio.cjs
node server/tests/conversation-context.cjs
node server/tests/chat-input-understanding.cjs
node server/tests/proactive.cjs
node server/tests/notifications.cjs
node server/tests/address-context.cjs
node server/tests/conversations.cjs
node server/tests/matching-bandit.cjs
node server/tests/device-account.cjs
node server/tests/seo.cjs
node server/tests/acquisition.cjs
node server/tests/llm-edge-cases.cjs
host=haze-oci-a1
incoming="/tmp/seollem-$release"
ssh "$host" "test ! -e '$incoming' && mkdir -m 0755 '$incoming'"
rsync -az --exclude=.git --exclude=node_modules --exclude=.env --exclude=data ./ "$host:$incoming/"
ssh "$host" sudo bash -s -- "$incoming" "$release" <<'REMOTE'
set -euo pipefail
incoming="$1"
release="/opt/seollem-ai-lounge/releases/$2"
nginx -t
test ! -e "$release"
command -v node
command -v certbot
if ! id seollem >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/seollem-ai-lounge --shell /usr/sbin/nologin seollem
fi
install -d -m 0755 /opt/seollem-ai-lounge/releases /var/www/seollem-acme
install -d -o root -g seollem -m 0750 /etc/seollem-ai-lounge
install -d -o seollem -g seollem -m 0700 /var/lib/seollem-ai-lounge
if [ ! -e /etc/seollem-ai-lounge/app.env ]; then
  python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('/etc/seollem-ai-lounge/app.env')
p.write_text('NODE_ENV=production\nHOST=127.0.0.1\nPORT=18410\nALLOWED_ORIGINS=https://azitchat.com,https://www.azitchat.com,https://seollem.158.180.93.165.nip.io\nDATABASE_FILE=/var/lib/seollem-ai-lounge/seollem.json\nJWT_SECRET='+secrets.token_hex(48)+'\n')
PY
  chown root:seollem /etc/seollem-ai-lounge/app.env
  chmod 0640 /etc/seollem-ai-lounge/app.env
fi
mv "$incoming" "$release"
chown -R seollem:seollem "$release"
runuser -u seollem -- sh -c 'cd "$1/server" && npm ci --omit=dev --cache /var/lib/seollem-ai-lounge/npm-cache' sh "$release"
runuser -u seollem -- sh -c 'cd "$1" && node server/tests/accounts.cjs && node server/tests/storage-archive.cjs && node server/tests/message-delivery.cjs && node server/tests/system-messages.cjs && node server/tests/gift-reaction.cjs && node server/tests/gift-ui.cjs && node server/tests/reply-recovery.cjs && node server/tests/operations.cjs && node server/tests/ai-reports.cjs && node server/tests/analytics.cjs && node server/tests/advertising.cjs && node server/tests/funnel-insights.cjs && node server/tests/ad-funnel.cjs && node server/tests/ad-browser.cjs && node server/tests/matching.cjs && node server/tests/inicis.cjs && node server/tests/commerce.cjs && node server/tests/commerce-events.cjs && node server/tests/adult-test-access.cjs && node server/tests/content-access.cjs && node server/tests/content-access-ui.cjs && node server/tests/legal.cjs && node server/tests/heart-expiry.cjs && node server/tests/llm-completion.cjs && node server/tests/chat-timing.cjs && node server/tests/chat-voice.cjs && node server/tests/character-behavior.cjs && node server/tests/character-studio.cjs && node server/tests/conversation-context.cjs && node server/tests/proactive.cjs && node server/tests/notifications.cjs && node server/tests/address-context.cjs && node server/tests/conversations.cjs && node server/tests/matching-bandit.cjs && node server/tests/seo.cjs && node server/tests/device-account.cjs && node server/tests/acquisition.cjs && node server/tests/llm-edge-cases.cjs' sh "$release"
install -d -m 0700 /var/backups/seollem-ai-lounge
if [ -f /var/lib/seollem-ai-lounge/seollem.json ]; then
  cp -n /var/lib/seollem-ai-lounge/seollem.json /var/backups/seollem-ai-lounge/pre-sqlite.json
  chmod 0600 /var/backups/seollem-ai-lounge/pre-sqlite.json
fi
python3 "$release/ops/oci/backup.py"
# Persistent VAPID identity; never rotate at release time or print private keys.
node - "$release" <<'NODE'
const fs=require('node:fs'),root=process.argv[2],file='/etc/seollem-ai-lounge/app.env';
const env=require(root+'/server/node_modules/dotenv').parse(fs.readFileSync(file));
if(!env.VAPID_PUBLIC_KEY&&!env.VAPID_PRIVATE_KEY){
  const keys=require(root+'/server/node_modules/web-push').generateVAPIDKeys();
  fs.appendFileSync(file,'\nVAPID_PUBLIC_KEY='+keys.publicKey+'\nVAPID_PRIVATE_KEY='+keys.privateKey+'\n');
}else if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)throw Error('Incomplete VAPID identity');
NODE
chown -R root:root "$release"
chmod -R go-w "$release"
previous="$(readlink -f /opt/seollem-ai-lounge/current || true)"
rollback() {
  if [ -n "$previous" ] && [ -d "$previous" ]; then
    ln -sfn "$previous" /opt/seollem-ai-lounge/current
    systemctl restart seollem-ai-lounge.service
  else
    systemctl stop seollem-ai-lounge.service || true
  fi
}
trap rollback ERR
ln -sfn "$release" /opt/seollem-ai-lounge/current
install -m 0644 "$release/ops/oci/seollem-ai-lounge.service" /etc/systemd/system/seollem-ai-lounge.service
install -m 0644 "$release/ops/oci/seollem-backup.service" /etc/systemd/system/seollem-backup.service
install -m 0644 "$release/ops/oci/seollem-backup.timer" /etc/systemd/system/seollem-backup.timer
install -d -o root -g adm -m 0750 /var/log/azitchat
install -m 0644 "$release/ops/oci/azitchat-logrotate" /etc/logrotate.d/azitchat
logrotate -d /etc/logrotate.d/azitchat
systemctl daemon-reload
systemctl enable seollem-ai-lounge.service
systemctl restart seollem-ai-lounge.service
ready=false
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:18410/api/health; then ready=true; break; fi
  sleep 1
done
"$ready"
if [ ! -e /etc/nginx/sites-available/seollem-ai-lounge ]; then
  install -m 0644 "$release/ops/oci/nginx-http.conf" /etc/nginx/sites-available/seollem-ai-lounge
  ln -s /etc/nginx/sites-available/seollem-ai-lounge /etc/nginx/sites-enabled/seollem-ai-lounge
  nginx -t
  systemctl reload nginx
fi
if [ ! -f /etc/letsencrypt/live/seollem.158.180.93.165.nip.io/fullchain.pem ]; then
  certbot certonly --webroot -w /var/www/seollem-acme \
    -d seollem.158.180.93.165.nip.io --non-interactive --agree-tos \
    --register-unsafely-without-email \
    --deploy-hook 'nginx -t && systemctl reload nginx'
fi
cp /etc/nginx/sites-available/seollem-ai-lounge /etc/nginx/sites-available/seollem-ai-lounge.previous
install -m 0644 "$release/ops/oci/nginx.conf" /etc/nginx/sites-available/seollem-ai-lounge
if ! nginx -t; then
  cp /etc/nginx/sites-available/seollem-ai-lounge.previous /etc/nginx/sites-available/seollem-ai-lounge
  false
fi
if [ -f /etc/letsencrypt/live/azitchat.com/fullchain.pem ]; then
  install -m 0644 "$release/ops/oci/azitchat-certbot-renew.service" /etc/systemd/system/azitchat-certbot-renew.service
  install -m 0644 "$release/ops/oci/azitchat-certbot-renew.timer" /etc/systemd/system/azitchat-certbot-renew.timer
  systemctl daemon-reload
  systemctl enable --now azitchat-certbot-renew.timer
  cp /etc/nginx/sites-available/azitchat /etc/nginx/sites-available/azitchat.previous
  install -m 0644 "$release/ops/oci/nginx-azitchat.conf" /etc/nginx/sites-available/azitchat
  if ! nginx -t; then
    cp /etc/nginx/sites-available/azitchat.previous /etc/nginx/sites-available/azitchat
    false
  fi
fi
systemctl reload nginx
curl -fsS https://seollem.158.180.93.165.nip.io/api/health
if [ -f /etc/seollem-ai-lounge/storage.env ]; then
  install -m 0644 "$release/ops/oci/seollem-archive.service" /etc/systemd/system/seollem-archive.service
  install -m 0644 "$release/ops/oci/seollem-archive.timer" /etc/systemd/system/seollem-archive.timer
  systemctl daemon-reload
  systemctl enable --now seollem-archive.timer
fi
systemctl enable --now seollem-backup.timer
systemctl start seollem-backup.service
trap - ERR
printf '\nDeployed release: %s\n' "$release"
REMOTE
