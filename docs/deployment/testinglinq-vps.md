# TestingLinq VPS Deployment

## Target domains

- `sales.testinglinq.com` -> `sales-dashboard` on port `4200`
- `pm.testinglinq.com` -> `pm-dashboard` on port `4201`
- `api.testinglinq.com` -> backend services on ports `3001`, `3002`, `3003`

## `/srv` ka matlab

`/srv` Linux ka standard folder hota hai jahan live applications ya service data rakha jata hai. Is project ke liye recommended path:

```bash
/srv/sentra-core
```

## Production layout

```bash
/srv/sentra-core
├── .env.production
├── deploy/env/infra.prod.env
├── apps/frontend/sales-dashboard/.env.production
├── apps/frontend/pm-dashboard/.env.production
└── ...
```

## DNS

Har subdomain ka `A` record `198.177.123.224` par point kare:

- `sales.testinglinq.com`
- `pm.testinglinq.com`
- `api.testinglinq.com`

`portal.testinglinq.com` baad mein add kar sakte ho jab client portal ready ho.

## One-time server prep

```bash
mkdir -p /srv
cd /srv
git clone <your-repo-url> sentra-core
cd /srv/sentra-core
npm ci
```

## Env files

1. Root backend env:

```bash
cp .env.production.example .env.production
```

2. Sales frontend env:

```bash
cp apps/frontend/sales-dashboard/.env.production.example apps/frontend/sales-dashboard/.env.production
```

3. PM frontend env:

```bash
cp apps/frontend/pm-dashboard/.env.production.example apps/frontend/pm-dashboard/.env.production
```

4. Production Docker infra env:

```bash
cp deploy/env/infra.prod.env.example deploy/env/infra.prod.env
```

Uske baad values fill karo:

- Postgres / Mongo / Redis / RabbitMQ passwords
- JWT secrets
- Gmail OAuth
- Wasabi bucket credentials
- Bunny CDN hostname
- Authorize.net production ya sandbox keys

## Start production infra

```bash
docker compose --env-file deploy/env/infra.prod.env -f docker-compose.prod.yml up -d
```

Production compose intentionally `127.0.0.1` bind use karta hai, is liye DBs internet par expose nahi hongi.

## Database migrate

```bash
NODE_ENV=production npx prisma migrate deploy --schema=libs/backend/prisma-client/prisma/schema.prisma
```

## Build apps

```bash
NODE_ENV=production npx nx run-many --target=build --projects=core-service,comm-service,pm-service,sales-dashboard,pm-dashboard
```

## Start PM2

`pm2 startup` aap chala chuke ho, ab sirf processes start karke save karna hai:

```bash
pm2 start deploy/pm2/ecosystem.config.cjs
pm2 save
pm2 list
```

## Nginx

```bash
cp deploy/nginx/testinglinq.com.conf /etc/nginx/sites-available/testinglinq.com.conf
ln -s /etc/nginx/sites-available/testinglinq.com.conf /etc/nginx/sites-enabled/testinglinq.com.conf
nginx -t
systemctl reload nginx
```

## SSL

```bash
apt update
apt install -y certbot python3-certbot-nginx
certbot --nginx -d sales.testinglinq.com -d pm.testinglinq.com -d api.testinglinq.com
```

## Deploy update flow

```bash
cd /srv/sentra-core
git pull
npm ci
docker compose --env-file deploy/env/infra.prod.env -f docker-compose.prod.yml up -d
NODE_ENV=production npx prisma migrate deploy --schema=libs/backend/prisma-client/prisma/schema.prisma
NODE_ENV=production npx nx run-many --target=build --projects=core-service,comm-service,pm-service,sales-dashboard,pm-dashboard
pm2 restart all
pm2 save
```

## Dev vs prod separation

- Local/dev infra: `docker-compose.dev.yml` + `deploy/env/infra.dev.env`
- VPS/prod infra: `docker-compose.prod.yml` + `deploy/env/infra.prod.env`
- Backend runtime env: `.env.production`
- Frontend runtime/build env: app-level `.env.production`
- Live processes: `PM2`
- Public entrypoint: `nginx`

## Important note

Current repo `.env` mein real-looking secrets already maujood hain. Live jane se pehle Gmail, Wasabi, Authorize.net, Firebase aur JWT secrets rotate karna chahiye.
