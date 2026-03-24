# Live Deploy Guide — sentracoresystems.com

## Prerequisites
- DNS records added for:
  - `sales.sentracoresystems.com` → VPS IP
  - `api.sentracoresystems.com` → VPS IP
- `pm2.sentracoresystems.com` → VPS IP
- Wait for DNS propagation (5–30 min), verify with: `ping sales.sentracoresystems.com`

---

## Step 1 — Push latest code to main branch
Do this on your local machine before anything else.

```bash
git add .
git commit -m "your message"
git push origin main
```

---

## Step 2 — Create git worktree on VPS (one-time only)

```bash
cd /home/sentra-core
git fetch origin
git worktree add /home/sentra-live main
```

> If `/home/sentra-live` already exists, run `rm -rf /home/sentra-live` first.

---

## Step 3 — Run deploy script

```bash
cd /home/sentra-live
chmod +x deploy/scripts/deploy-env.sh deploy/scripts/deploy-live.sh
bash deploy/scripts/deploy-live.sh
```

This automatically does:
- Docker infra up (Postgres, Redis, Mongo)
- `npm ci`
- `prisma generate`
- `prisma migrate deploy`
- `pm2 startOrReload` (starts all live processes with `-live` suffix)
- `pm2 save`

---

## Step 4 — Install nginx config

```bash
sudo cp /home/sentra-live/deploy/nginx/sentracoresystems.com.conf /etc/nginx/sites-available/sentracoresystems.com.conf
sudo ln -sf /etc/nginx/sites-available/sentracoresystems.com.conf /etc/nginx/sites-enabled/sentracoresystems.com.conf
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 5 — SSL certificate

```bash
sudo certbot --nginx -d sentracoresystems.com -d sales.sentracoresystems.com -d api.sentracoresystems.com -d pm2.sentracoresystems.com
```

---

## Step 6 — Verify

```bash
# All live processes should be online
pm2 ls | grep live

# Check logs if any errors
pm2 logs core-service-live --lines 50
pm2 logs sales-dashboard-live --lines 50
```

---

## Future deploys (after first setup)

Next time just:

```bash
cd /home/sentra-live
git pull origin main
bash deploy/scripts/deploy-live.sh
```

---

## Port reference

| Service            | Port  |
|--------------------|-------|
| core-service       | 3101  |
| comm-service       | 3102  |
| pm-service         | 3103  |
| hrms-service       | 3104  |
| sales-dashboard    | 4300  |
| pm-dashboard       | 4301  |
| hrms-dashboard     | 4302  |
