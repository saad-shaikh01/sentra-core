# Firebase Setup Guide — Sentra Core Push Notifications

## Step 1 — Create Firebase Project

1. Go to https://console.firebase.google.com
2. Click **"Add project"**
3. Name it: `sentra-core` (or `sentra-core-prod`)
4. Disable Google Analytics (not needed)
5. Click **"Create project"**

---

## Step 2 — Add a Web App

1. In your project dashboard, click the **Web icon `</>`**
2. App nickname: `sales-dashboard`
3. Do NOT enable Firebase Hosting
4. Click **"Register app"**
5. You'll see `firebaseConfig` — **copy these values**:

```js
const firebaseConfig = {
  apiKey: "...",           → NEXT_PUBLIC_FIREBASE_API_KEY
  authDomain: "...",       → NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  projectId: "...",        → NEXT_PUBLIC_FIREBASE_PROJECT_ID
  storageBucket: "...",    → NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "...",→ NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  appId: "...",            → NEXT_PUBLIC_FIREBASE_APP_ID
};
```

---

## Step 3 — Enable Cloud Messaging

1. Project Settings (gear icon) → **Cloud Messaging** tab
2. Scroll to **"Web Push certificates"**
3. Click **"Generate key pair"**
4. Copy the key → `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

---

## Step 4 — Generate Service Account (for backend)

1. Project Settings → **Service accounts** tab
2. Click **"Generate new private key"**
3. Download the JSON file
4. Extract these values from the JSON:

```json
{
  "project_id":   "...",  → FIREBASE_PROJECT_ID
  "client_email": "...",  → FIREBASE_CLIENT_EMAIL
  "private_key":  "...",  → FIREBASE_PRIVATE_KEY
}
```

> `private_key` is a multiline string. In `.env` file write it as one line with `\n` instead of actual newlines.
> Example: `FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n`

---

## Step 5 — Fill env values

### `.env.testing`
```env
# Backend (Firebase Admin SDK)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n

# Frontend (Firebase Web SDK)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789000
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789000:web:xxxxxxxxxxxx
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BxxxxxxxxxxxxVAPID_KEY_HERE
```

### `.env.live` — same values (same Firebase project can serve both, or create separate project for live)

---

## Step 6 — Deploy

After filling env values, deploy script automatically:
1. Injects Firebase config into service worker via `generate-firebase-sw.cjs`
2. Next.js bakes `NEXT_PUBLIC_*` vars into the frontend build

```bash
# Testing
cd /home/sentra-core
git pull origin testing
bash deploy/scripts/deploy-testing.sh

# Live
cd /home/sentra-live
git pull origin main
bash deploy/scripts/deploy-live.sh
```

---

## Verify it's working

After deploy, open browser → login → browser will ask for notification permission.

Check backend logs to confirm FCM initialized:
```bash
pm2 logs core-service-testing --lines 20 --nostream | grep -i firebase
# Should show: Firebase Admin SDK initialized
```

Check frontend: open DevTools → Application → Service Workers → `firebase-messaging-sw.js` should be registered.

---

## Required env vars summary

| Variable | Where | Source |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Backend | Service account JSON |
| `FIREBASE_CLIENT_EMAIL` | Backend | Service account JSON |
| `FIREBASE_PRIVATE_KEY` | Backend | Service account JSON |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Frontend | Web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Frontend | Web app config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Frontend | Web app config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Frontend | Web app config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Frontend | Web app config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Frontend | Web app config |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Frontend | Cloud Messaging → Web Push certificates |
