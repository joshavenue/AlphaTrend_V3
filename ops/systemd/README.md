# AlphaTrend V3 Systemd Templates

These files are templates for Hetzner. Install them manually after reviewing the
paths and schedules:

```bash
cp ops/systemd/*.service ops/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now alphatrend-web.service
systemctl enable --now alphatrend-db-backup.timer
systemctl enable --now alphatrend-provider-smoke.timer
systemctl enable --now alphatrend-demand-refresh.timer
systemctl enable --now alphatrend-theme-scan.timer
```

The templates assume:

```text
repo path: /srv/alphatrend
env file:  /srv/alphatrend/.env
node/npm:  available on PATH for non-interactive systemd services
```

Do not install the scheduled timers against Vercel production until the
production database decision is closed. Hetzner remains the verified job runtime.
