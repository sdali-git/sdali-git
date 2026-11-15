#!/usr/bin/env bash
# Removes everything install.sh added. Other sites and services are not touched.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
DOMAIN=$( . /opt/exam-aim/exam-aim.env 2>/dev/null; echo "${DOMAIN:-exam-aim.orbit-group.online}")
systemctl disable --now exam-aim-update.timer 2>/dev/null || true
rm -f /etc/systemd/system/exam-aim-update.{service,timer}
systemctl daemon-reload
rm -f "/etc/nginx/sites-enabled/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/conf.d/$DOMAIN.conf"
nginx -t && systemctl reload nginx
echo "Removed the timer and nginx site. To also delete files and the service user run:"
echo "  sudo rm -rf /opt/exam-aim && sudo userdel examaim"
echo "  sudo certbot delete --cert-name $DOMAIN   # if a certificate was issued"
