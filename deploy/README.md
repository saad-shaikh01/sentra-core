# Dual Environment Deployment

This repo now supports two parallel environments on the same VPS:

- `testing` on `*.testinglinq.com`
- `live` on `*.sentracoresystems.com`

Keep `/home/sentra-core` as the testing checkout.
Run production from a separate git worktree at `/home/sentra-live`.

## Branches

- `testing` branch -> `testinglinq.com`
- `main` branch -> `sentracoresystems.com`

## Files

- `.env.testing.example`
- `.env.live.example`
- `deploy/env/infra.testing.env.example`
- `deploy/env/infra.live.env.example`
- `docker-compose.testing.yml`
- `docker-compose.live.yml`
- `deploy/pm2/ecosystem.testing.config.cjs`
- `deploy/pm2/ecosystem.live.config.cjs`
- `deploy/nginx/testinglinq.com.conf`
- `deploy/nginx/sentracoresystems.com.conf`

## First-Time VPS Setup

### 1. Prepare the testing branch

```bash
cd /home/sentra-core
git fetch origin
git checkout -b testing
git push -u origin testing
```

If the branch already exists:

```bash
cd /home/sentra-core
git fetch origin
git checkout testing
git pull origin testing
```

### 2. Create the live worktree

Do this only after `/home/sentra-core` is on the `testing` branch:

```bash
cd /home/sentra-core
git fetch origin
git worktree add /home/sentra-live main
```

### 3. Env files are already included in the repo

These files are tracked and ready for direct deploy:

- `/home/sentra-core/.env.testing`
- `/home/sentra-core/deploy/env/infra.testing.env`
- `/home/sentra-live/.env.live`
- `/home/sentra-live/deploy/env/infra.live.env`

### 4. Install Nginx site configs

```bash
sudo cp /home/sentra-core/deploy/nginx/testinglinq.com.conf /etc/nginx/sites-available/testinglinq.com.conf
sudo cp /home/sentra-live/deploy/nginx/sentracoresystems.com.conf /etc/nginx/sites-available/sentracoresystems.com.conf

sudo ln -sf /etc/nginx/sites-available/testinglinq.com.conf /etc/nginx/sites-enabled/testinglinq.com.conf
sudo ln -sf /etc/nginx/sites-available/sentracoresystems.com.conf /etc/nginx/sites-enabled/sentracoresystems.com.conf

sudo nginx -t
sudo systemctl reload nginx
```

### 5. Install SSL certificates

```bash
sudo certbot --nginx -d testinglinq.com -d sales.testinglinq.com -d pm.testinglinq.com -d hrms.testinglinq.com -d api.testinglinq.com
sudo certbot --nginx -d sentracoresystems.com -d sales.sentracoresystems.com -d pm2.sentracoresystems.com -d hrms.sentracoresystems.com -d api.sentracoresystems.com
```

## Deploy Commands

### Testing

```bash
cd /home/sentra-core
git pull origin testing
bash deploy/scripts/deploy-testing.sh
```

### Live

```bash
cd /home/sentra-live
git pull origin main
bash deploy/scripts/deploy-live.sh
```

## PM2 Checks

```bash
pm2 ls
pm2 logs core-service-testing
pm2 logs core-service-live
```

## Database Backups To Wasabi

Install the required dump tools on the VPS first:

```bash
sudo apt update
sudo apt install -y postgresql-client redis-tools
```

Install MongoDB database tools from MongoDB's official package source if `mongodump` is not already available.

Manual backup commands:

```bash
cd /home/sentra-core
node deploy/scripts/backup-databases.cjs testing
```

```bash
cd /home/sentra-live
node deploy/scripts/backup-databases.cjs live
```

Example cron entries:

```bash
0 2 * * * cd /home/sentra-core && /usr/bin/node deploy/scripts/backup-databases.cjs testing >> /var/log/sentra-testing-backup.log 2>&1
30 2 * * * cd /home/sentra-live && /usr/bin/node deploy/scripts/backup-databases.cjs live >> /var/log/sentra-live-backup.log 2>&1
```

## Notes

- Both environments use different localhost ports.
- Both environments use different Docker container names and volumes.
- Keep testing and live databases separate.
- `client-portal` is not included because it is not part of the current PM2/Nginx production flow.
