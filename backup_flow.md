# Database Backup Flow — Wasabi

## What gets backed up
Each backup is a single `.tar.gz` file containing:
- **PostgreSQL** — full database dump (`pg_dump --format=custom`)
- **MongoDB** — full archive (`mongodump --gzip`)
- **Redis** — RDB snapshot (if `redis-cli` is available)

Backups go to:
```
sentra-assets-dev/system-backups/databases/live/2026-03-21T08-00-00-000Z.tar.gz
```

## Retention policy
- **7 backups kept** (7 days rolling window)
- After each upload, backups older than 7 days are **automatically deleted** from Wasabi
- So storage stays fixed: ~7 files at all times, no accumulation

To change retention, set `DB_BACKUP_RETENTION_DAYS=14` in `.env.live` (default is 7).

---

## One-time VPS setup

### Step 1 — Install required tools

```bash
# PostgreSQL client
sudo apt update && sudo apt install -y postgresql-client

# MongoDB tools (Ubuntu 22.04)
wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-100.9.4.deb
sudo dpkg -i mongodb-database-tools-ubuntu2204-x86_64-100.9.4.deb
rm mongodb-database-tools-ubuntu2204-x86_64-100.9.4.deb
```

### Step 2 — Test manually first

```bash
cd /home/sentra-live
node deploy/scripts/backup-databases.cjs live
```

Expected output:
```
Creating PostgreSQL backup for live...
Creating MongoDB backup for live...
Skipping Redis backup because redis-cli is not available.   ← ok if redis-cli missing
Compressing backup for live...
Uploading backup to Wasabi: sentra-assets-dev/system-backups/databases/live/...
Backup uploaded successfully: ...
No old backups to delete (retention: 7 days).
```

### Step 3 — Setup cron (daily at 8am)

```bash
crontab -e
```

Add this line:
```
0 8 * * * cd /home/sentra-live && /usr/bin/node deploy/scripts/backup-databases.cjs live >> /var/log/sentra-live-backup.log 2>&1
```

Save and exit. Verify cron is registered:
```bash
crontab -l
```

---

## Check backup logs anytime

```bash
tail -50 /var/log/sentra-live-backup.log
```

## Manual backup anytime

```bash
cd /home/sentra-live
node deploy/scripts/backup-databases.cjs live
```

---

## Storage math
- Average backup size: ~50–200 MB compressed (depends on DB size)
- 7 backups retained = ~350 MB–1.4 GB total on Wasabi
- Wasabi minimum charge is 1 TB so this is essentially free
