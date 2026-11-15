# Deploy Exam Aim on the existing EC2 server

Target: **https://exam-aim.orbit-group.online** on `ubuntu@54.252.203.146` (instance "Work Orbit").

DNS is already set up. Route 53 has `exam-aim.orbit-group.online → A 54.252.203.146`.

## What the installer changes (and what it doesn't)

| Added | Where |
| --- | --- |
| Code, Node.js runtime, browser, data, builds | `/opt/exam-aim/` only |
| System user `examaim` (no login shell) | runs the updater |
| One nginx site file | `/etc/nginx/sites-available/exam-aim.orbit-group.online.conf` (+ symlink in `sites-enabled`) |
| HTTPS certificate for this sub-domain only | via `certbot --nginx -d exam-aim.orbit-group.online` |
| Timer: Mon/Wed/Fri 1:00 AM IST | `exam-aim-update.service` / `.timer` |

- Other nginx sites, the system Node/npm, PHP, databases and other apps are **not touched**.
- nginx is checked with `nginx -t` before and after the change. If the check fails, the new file is removed and nginx is not reloaded. Reloads are graceful, so no downtime for other sites.
- The updater runs at low priority with CPU and memory limits (60% CPU, 1.2 GB) so it can't slow the other sites.
- Every step is re-runnable. `sudo bash deploy/uninstall.sh` removes it all.

## Steps (about 5 minutes)

```bash
ssh ubuntu@54.252.203.146

# 1. Read-only deploy key so the server can pull the private repo
ssh-keygen -t ed25519 -N "" -f ~/.ssh/exam_aim_deploy -C "exam-aim-server"
cat ~/.ssh/exam_aim_deploy.pub
#    → GitHub: sdali9019/exam-aim → Settings → Deploy keys → Add deploy key
#      (paste it, leave "Allow write access" UNticked)

# 2. Clone into its own folder
sudo mkdir -p /opt/exam-aim
sudo GIT_SSH_COMMAND="ssh -i $HOME/.ssh/exam_aim_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
  git clone git@github.com:sdali9019/exam-aim.git /opt/exam-aim/app
sudo git config --global --add safe.directory /opt/exam-aim/app

# 3. Install (replace the email; used only for Let's Encrypt expiry notices)
cd /opt/exam-aim/app
sudo bash deploy/install.sh --email you@example.com
```

If the first update run reports that Chromium can't start (SSC, SBI, RBI and CAT need it), install its system libraries once and re-run. This adds apt packages only:

```bash
sudo bash deploy/install.sh --email you@example.com --with-browser-deps
```

## Day-to-day

```bash
systemctl list-timers exam-aim-update.timer        # next scheduled run
sudo systemctl start exam-aim-update.service       # refresh right now
journalctl -u exam-aim-update -n 80 --no-pager     # logs of the last run
```

Deploy new code after a push to GitHub:

```bash
cd /opt/exam-aim/app
sudo GIT_SSH_COMMAND="ssh -i $HOME/.ssh/exam_aim_deploy -o IdentitiesOnly=yes" git pull
sudo bash deploy/install.sh --email you@example.com
```

Roll back to the previous build:

```bash
ls -1dt /opt/exam-aim/releases/*/
sudo -u examaim ln -sfn /opt/exam-aim/releases/<older-folder> /opt/exam-aim/current
```
