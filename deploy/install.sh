#!/usr/bin/env bash
# One-time (and re-runnable) installer for Exam Aim on an existing server.
#
# Everything lives under /opt/exam-aim and runs as its own system user.
# The only files it adds outside that folder:
#   - one nginx site file for the sub-domain (nothing else in nginx is edited)
#   - two systemd units: exam-aim-update.service / exam-aim-update.timer
# It uses its own Node.js copy, so system Node/npm and other apps are untouched.
# Undo everything with: sudo bash deploy/uninstall.sh
#
# Usage (as root, from the cloned repo at /opt/exam-aim/app):
#   sudo bash deploy/install.sh --email you@example.com [--domain exam-aim.orbit-group.online] [--with-browser-deps]
set -euo pipefail

DOMAIN="exam-aim.orbit-group.online"
EMAIL=""
BROWSER_DEPS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --with-browser-deps) BROWSER_DEPS=1; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

BASE_DIR=/opt/exam-aim
APP="$BASE_DIR/app"
SVC_USER=examaim
NODE_VERSION=22.11.0
PW_VERSION=1.48.2
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mABORTED: %s\033[0m\nNothing outside %s was changed.\n' "$*" "$BASE_DIR"; exit 1; }

# ---------------- Pre-flight checks (no changes yet) ----------------
say "Pre-flight checks"
[ "$(id -u)" -eq 0 ] || die "run with sudo"
[ "$(cd "$(dirname "$0")/.." && pwd)" = "$APP" ] || die "clone the repo to $APP first (see deploy/DEPLOY.md)"
command -v systemctl >/dev/null || die "systemd is required"
command -v nginx >/dev/null || die "nginx is not installed. This script only adds a site to an existing nginx."
nginx -t >/dev/null 2>&1 || die "the current nginx config already fails 'nginx -t'. Fix that first; this script will not touch it."
NGINX_FILE=""
if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then
  NGINX_FILE="/etc/nginx/sites-available/$DOMAIN.conf"; NGINX_LINK="/etc/nginx/sites-enabled/$DOMAIN.conf"
elif [ -d /etc/nginx/conf.d ]; then
  NGINX_FILE="/etc/nginx/conf.d/$DOMAIN.conf"; NGINX_LINK=""
else
  die "could not find /etc/nginx/sites-available or /etc/nginx/conf.d"
fi
if [ ! -f "$NGINX_FILE" ] && nginx -T 2>/dev/null | grep -Eq "server_name[^;]*[[:space:]]${DOMAIN//./\\.}([[:space:];]|$)"; then
  die "$DOMAIN is already used by another nginx site"
fi
FREE_MB=$(df -Pm "$BASE_DIR" 2>/dev/null | awk 'NR==2{print $4}' || df -Pm /opt | awk 'NR==2{print $4}')
[ "${FREE_MB:-0}" -ge 1200 ] || die "need at least 1.2 GB free disk space (have ${FREE_MB} MB)"
case "$(uname -m)" in x86_64) NARCH=x64 ;; aarch64|arm64) NARCH=arm64 ;; *) die "unsupported CPU $(uname -m)" ;; esac
PUBLIC_IP=$(curl -fsS --max-time 5 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)
DNS_IP=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)
echo "Domain $DOMAIN → ${DNS_IP:-not resolving}; this server's public IP: ${PUBLIC_IP:-unknown}"

# ---------------- Isolated user, folders, Node ----------------
say "Creating service user and folders under $BASE_DIR"
id "$SVC_USER" >/dev/null 2>&1 || useradd --system --home-dir "$BASE_DIR" --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
mkdir -p "$BASE_DIR"/{releases,live-data,browsers}
printf 'DOMAIN=%s\n' "$DOMAIN" > "$BASE_DIR/exam-aim.env"
[ -f "$BASE_DIR/live-data/updates.json" ] || cp "$APP/data/updates.json" "$BASE_DIR/live-data/updates.json"
[ -f "$BASE_DIR/live-data/status.json" ] || { [ -f "$APP/data/status.json" ] && cp "$APP/data/status.json" "$BASE_DIR/live-data/"; } || true

if [ ! -x "$BASE_DIR/node/bin/node" ] || [ "$("$BASE_DIR/node/bin/node" -v)" != "v$NODE_VERSION" ]; then
  say "Installing private Node.js v$NODE_VERSION into $BASE_DIR/node (system Node untouched)"
  TMP=$(mktemp -d)
  TARBALL="node-v$NODE_VERSION-linux-$NARCH.tar.xz"
  curl -fsSLo "$TMP/$TARBALL" "https://nodejs.org/dist/v$NODE_VERSION/$TARBALL"
  curl -fsSLo "$TMP/SHASUMS256.txt" "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  (cd "$TMP" && grep " $TARBALL\$" SHASUMS256.txt | sha256sum -c -) || die "Node.js download checksum mismatch"
  rm -rf "$BASE_DIR/node" && mkdir -p "$BASE_DIR/node"
  tar -xJf "$TMP/$TARBALL" -C "$BASE_DIR/node" --strip-components=1
  rm -rf "$TMP"
fi
chown -R "$SVC_USER:$SVC_USER" "$BASE_DIR"
chmod 755 "$BASE_DIR"

as_svc() { sudo -u "$SVC_USER" env HOME="$BASE_DIR" PATH="$BASE_DIR/node/bin:/usr/bin:/bin" PLAYWRIGHT_BROWSERS_PATH="$BASE_DIR/browsers" npm_config_cache="$BASE_DIR/.npm" "$@"; }

say "Installing app dependencies"
cd "$APP"
as_svc npm ci --omit=dev --no-audit --no-fund
as_svc npm install --no-save --no-audit --no-fund "playwright@$PW_VERSION"
as_svc npx playwright install chromium
if [ "$BROWSER_DEPS" = 1 ]; then
  say "Installing Chromium's system libraries (apt; adds packages only)"
  PLAYWRIGHT_BROWSERS_PATH="$BASE_DIR/browsers" "$BASE_DIR/node/bin/node" "$APP/node_modules/playwright/cli.js" install-deps chromium
fi

say "First build"
as_svc bash "$APP/deploy/refresh.sh"

# ---------------- nginx site for the sub-domain only ----------------
say "Adding nginx site $NGINX_FILE"
sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s#__ROOT__#$BASE_DIR/current#g" "$APP/deploy/nginx-site.conf" > "$NGINX_FILE.new"
if [ -f "$NGINX_FILE" ] && grep -q "ssl_certificate" "$NGINX_FILE"; then
  echo "Existing HTTPS config found for $DOMAIN; keeping it."; rm -f "$NGINX_FILE.new"
else
  mv "$NGINX_FILE.new" "$NGINX_FILE"
  [ -n "$NGINX_LINK" ] && ln -sfn "$NGINX_FILE" "$NGINX_LINK"
fi
if ! nginx -t; then
  rm -f "$NGINX_FILE" ${NGINX_LINK:+"$NGINX_LINK"}
  die "nginx rejected the new site; it has been removed again and nginx was not reloaded"
fi
systemctl reload nginx   # graceful: existing connections and other sites keep running

# ---------------- HTTPS for this sub-domain only ----------------
if [ -n "$PUBLIC_IP" ] && [ "$DNS_IP" = "$PUBLIC_IP" ] && command -v certbot >/dev/null && [ -n "$EMAIL" ]; then
  if ! grep -q ssl_certificate "$NGINX_FILE"; then
    say "Requesting a Let's Encrypt certificate for $DOMAIN"
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring \
      || echo "certbot failed; the site still works on http://$DOMAIN. Re-run this script once fixed."
  fi
else
  echo "Skipping HTTPS for now. Needs: DNS A record $DOMAIN → ${PUBLIC_IP:-<server IP>}, certbot installed, and --email."
fi

# ---------------- Schedule: Mon/Wed/Fri 1:00 AM IST ----------------
say "Installing update timer"
SYSTEMD_VER=$(systemctl --version | awk 'NR==1{print $2}')
if [ "${SYSTEMD_VER:-0}" -ge 235 ]; then CAL="Mon,Wed,Fri *-*-* 01:00:00 Asia/Kolkata"; else CAL="Sun,Tue,Thu *-*-* 19:30:00 UTC"; fi
cat > /etc/systemd/system/exam-aim-update.service <<UNIT
[Unit]
Description=Exam Aim: collect latest exam updates and rebuild site
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$SVC_USER
Group=$SVC_USER
ExecStart=/usr/bin/env bash $APP/deploy/refresh.sh
TimeoutStartSec=45min
# Stay gentle with the other services on this server
Nice=10
IOSchedulingClass=idle
CPUQuota=60%
MemoryMax=1200M
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$BASE_DIR
UNIT
cat > /etc/systemd/system/exam-aim-update.timer <<UNIT
[Unit]
Description=Exam Aim updates every Monday, Wednesday and Friday at 1:00 AM IST

[Timer]
OnCalendar=$CAL
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now exam-aim-update.timer

say "Done"
echo "Site folder:  $BASE_DIR/current  →  $(readlink "$BASE_DIR/current")"
echo "nginx site:   $NGINX_FILE"
echo "Next update:  $(systemctl list-timers exam-aim-update.timer --no-legend | awk '{print $1, $2, $3, $4}')"
echo "Run now:      sudo systemctl start exam-aim-update.service ; logs: journalctl -u exam-aim-update -n 50"
echo "Open:         http://$DOMAIN  (https once the certificate is issued)"
