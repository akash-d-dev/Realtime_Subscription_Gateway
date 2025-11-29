# 🚀 Realtime Subscription Gateway - Run Guide

This guide will help you get the project running with minimal effort.

## 1. Prerequisites

Since you don't have Docker or Redis installed locally, we will use free cloud services.

- **Node.js**: You already have this.
- **Redis**: We'll use [Upstash](https://upstash.com/) (Free, No credit card required).
- **Firebase**: We'll use [Firebase Console](https://console.firebase.google.com/).

## 2. Setup Steps

### Step 1: Install Dependencies

(Already done for you)

```bash
npm install
```

### Step 2: Configure Environment Variables

We have created a `.env` file for you. You just need to fill in the keys.

Open `.env` file in VS Code.

### Step 3: Get Redis Connection String

1. Go to [Upstash Console](https://console.upstash.com/).
2. Login/Sign up.
3. Create a new database (Name: `subscription-gateway`, Region: `US-East-1` or nearest).
4. Scroll down to "Connect to your database".
5. Copy the `REDIS_URL` (it looks like `rediss://default:xxxxx@...`).
6. Paste it into your `.env` file:
   ```env
   REDIS_URL=rediss://default:xxxxx@...
   ```
   (Comment out `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` if you use `REDIS_URL`)

### Step 4: Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Create a new project (or select existing).
3. Go to **Project Settings** (gear icon) -> **Service accounts**.
4. Click **Generate new private key**.
5. Open the downloaded JSON file.
6. Copy the values to your `.env` file:
   - `FIREBASE_PROJECT_ID`: from `project_id`
   - `FIREBASE_CLIENT_EMAIL`: from `client_email`
   - `FIREBASE_PRIVATE_KEY`: from `private_key` (Copy the whole string including `-----BEGIN PRIVATE KEY...`)

### Step 5: Start the Server

```bash
npm run dev
```

## 3. Verification

Once the server is running, you should see:

```
🚀 Realtime Subscription Gateway running on port 4000
```

You can verify it works by opening:

- Health Check: [http://localhost:4000/health](http://localhost:4000/health)
- GraphQL Playground: [http://localhost:4000/graphql](http://localhost:4000/graphql)

## 4. Troubleshooting

- **Redis Error**: Ensure `REDIS_URL` starts with `rediss://` (secure) if using Upstash.
- **Firebase Error**: Ensure the private key is pasted correctly with all `\n` characters or as a single line string.
