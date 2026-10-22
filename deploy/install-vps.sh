#!/usr/bin/env bash
# Installe ou met à jour MMS sur un VPS Ubuntu (OVH) : Node.js, nginx, HTTPS, pare-feu, démarrage automatique.
# Lancé par envoyer-vps.bat depuis le PC, ou à la main :  sudo bash deploy/install-vps.sh /tmp/mms.tgz
# Les données du serveur (comptes, tableaux de bord, veilles, sessions) ne sont jamais écrasées par une mise à jour.
set -euo pipefail

ARCHIVE="${1:-/tmp/mms.tgz}"
APP=/opt/mms
HOSTNAME_VPS="${MMS_DOMAIN:-$(hostname -f 2>/dev/null || hostname)}"
PORT=8788

[ "$(id -u)" = 0 ] || { echo "Lancer avec sudo"; exit 1; }
[ -f "$ARCHIVE" ] || { echo "Archive introuvable : $ARCHIVE"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== 1/7 Paquets système"
apt-get update -q
apt-get install -y -q nginx curl ca-certificates ufw rsync certbot python3-certbot-nginx >/dev/null
timedatectl set-timezone Africa/Tunis || true

echo "== 2/7 Node.js (version 20 ou plus)"
major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0; }
if [ "$(major)" -lt 20 ] 2>/dev/null || ! command -v node >/dev/null; then
  CANDIDATE=$(apt-cache policy nodejs | awk '/Candidate/ {print $2}' | sed -E 's/^([0-9]+:)?([0-9]+).*/\2/')
  if [ -n "$CANDIDATE" ] && [ "$CANDIDATE" -ge 20 ] 2>/dev/null; then
    apt-get install -y -q nodejs npm >/dev/null
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -q nodejs >/dev/null
  fi
fi
echo "Node $(node -v), npm $(npm -v)"

echo "== 3/7 Utilisateur et fichiers"
id mms &>/dev/null || useradd --system --create-home --home-dir /var/lib/mms --shell /usr/sbin/nologin mms
# La veille radio, si elle est installée sur ce serveur, est lisible par MMS
getent group mosaique >/dev/null && usermod -aG mosaique mms
mkdir -p "$APP"
TMP=$(mktemp -d)
tar -xzf "$ARCHIVE" -C "$TMP"
rsync -a --delete --exclude data/ --exclude .env --exclude node_modules/ --exclude dist/ "$TMP/" "$APP/"
mkdir -p "$APP/data/libye"
# Fichiers de données envoyés depuis le PC : copiés seulement s'ils n'existent pas encore sur le serveur
if [ -d "$TMP/data" ]; then
  for f in users.json dashboards.json watches.json; do
    [ -f "$TMP/data/$f" ] && [ ! -f "$APP/data/$f" ] && cp "$TMP/data/$f" "$APP/data/$f"
  done
  [ -d "$TMP/data/libye" ] && rsync -a --ignore-existing "$TMP/data/libye/" "$APP/data/libye/"
fi
# .env : celui du PC à la première installation, puis celui du serveur est conservé
if [ ! -f "$APP/.env" ]; then
  if [ -f "$TMP/.env" ]; then cp "$TMP/.env" "$APP/.env"; else cp "$APP/.env.example" "$APP/.env"; fi
fi
setenv() { grep -q "^$1=" "$APP/.env" && sed -i "s#^$1=.*#$1=$2#" "$APP/.env" || echo "$1=$2" >> "$APP/.env"; }
setenv MMS_PORT "$PORT"
setenv MMS_HOST 127.0.0.1
setenv MMS_DEMO 0  # pas de données d'exemple en production
[ -d /opt/mosaique-radio/data ] && setenv MOSAIQUE_DATA_DIR /opt/mosaique-radio/data
rm -rf "$TMP"
chown -R mms:mms "$APP"
chmod 600 "$APP/.env"
chmod 700 "$APP/data"

echo "== 4/7 Dépendances et compilation du site (1 à 3 minutes)"
cd "$APP"
# npm ci si le fichier de verrouillage est à jour, sinon npm install (qui le remet à jour)
sudo -u mms -H npm ci --no-audit --no-fund --loglevel=error 2>/dev/null || sudo -u mms -H npm install --no-audit --no-fund --loglevel=error
sudo -u mms -H npm run build --silent

echo "== 5/7 Service MMS (redémarre tout seul)"
cat > /etc/systemd/system/mms.service <<UNIT
[Unit]
Description=MMS - plateforme de veille
After=network-online.target
Wants=network-online.target

[Service]
User=mms
WorkingDirectory=$APP
Environment=NODE_ENV=production
ExecStart=/usr/bin/env node server/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable mms >/dev/null 2>&1
systemctl restart mms

echo "== 6/7 nginx et pare-feu"
# IPv6 seulement si la machine l'a (OVH : oui)
LISTEN6=""
[ -s /proc/net/if_inet6 ] && LISTEN6="listen [::]:80 default_server;"
cat > /etc/nginx/sites-available/mms <<NGINX
server {
    listen 80 default_server;
    $LISTEN6
    server_name $HOSTNAME_VPS _;
    client_max_body_size 2m;
    server_tokens off;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options SAMEORIGIN always;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/mms /etc/nginx/sites-enabled/mms
rm -f /etc/nginx/sites-enabled/default
nginx -t -q
systemctl reload nginx || systemctl restart nginx
# SSH (22) toujours ouvert avant d'activer le pare-feu, pour ne jamais perdre l'accès
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null || echo "Pare-feu non activé (ufw indisponible)"

echo "== 7/7 Certificat HTTPS (Let's Encrypt)"
# www.<domaine> est ajouté au certificat seulement s'il pointe déjà vers ce serveur
MY_IP=$(curl -4 -fs --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')
NAMES=(-d "$HOSTNAME_VPS")
if [[ "$HOSTNAME_VPS" != www.* ]] && getent ahostsv4 "www.$HOSTNAME_VPS" | awk '{print $1}' | grep -qx "$MY_IP"; then
  NAMES+=(-d "www.$HOSTNAME_VPS")
  sed -i "s/server_name $HOSTNAME_VPS _;/server_name $HOSTNAME_VPS www.$HOSTNAME_VPS _;/" /etc/nginx/sites-available/mms
  systemctl reload nginx
fi
if ! getent ahostsv4 "$HOSTNAME_VPS" | awk '{print $1}' | grep -qx "$MY_IP"; then
  echo "Le nom $HOSTNAME_VPS ne pointe pas encore vers ce serveur ($MY_IP) : vérifiez l'enregistrement A de la zone DNS, puis relancez."
  setenv PUBLIC_URL "http://$MY_IP"
elif certbot --nginx "${NAMES[@]}" --cert-name "$HOSTNAME_VPS" --expand --non-interactive --agree-tos --register-unsafely-without-email --redirect >/dev/null 2>&1; then
  echo "HTTPS activé pour $HOSTNAME_VPS."
  setenv PUBLIC_URL "https://$HOSTNAME_VPS"
else
  echo "HTTPS non obtenu pour $HOSTNAME_VPS (le site reste en HTTP). Journal : sudo tail -n 30 /var/log/letsencrypt/letsencrypt.log"
  setenv PUBLIC_URL "http://$HOSTNAME_VPS"
fi
systemctl restart mms

sleep 2
if curl -fs -o /dev/null "http://127.0.0.1:$PORT/api/auth/me" -w '' 2>/dev/null || [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/api/auth/me)" = 401 ]; then
  echo
  echo "MMS est en ligne : $(grep '^PUBLIC_URL=' "$APP/.env" | cut -d= -f2-)"
  echo "Comptes : sudo -u mms node $APP/server/users.js list"
else
  echo "MMS ne répond pas. Journal : sudo journalctl -u mms -n 50"
  exit 1
fi
