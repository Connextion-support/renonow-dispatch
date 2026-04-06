# Dispatch Board — GHL + Supabase + Google Maps

A visual dispatch board that embeds in GoHighLevel as an iFrame. Drag-and-drop job routing, Google Maps with route optimization, and real-time GHL sync — all stored in Supabase.

**Zero local install required.** Everything runs in the cloud.

---

## Architecture

```
GoHighLevel (iFrame)
    │
    │  loads
    ▼
Vercel (hosts everything)
    ├── frontend/index.html  →  Dispatch Board UI
    └── backend/server.js    →  API proxy
            │
            ├──→ GHL API (appointments, contacts, users)
            ├──→ Supabase (dispatch assignments, crew, routes)
            └──→ Google Maps (geocoding)
```

**Where your keys live:**

| Key | Stored In | Purpose |
|-----|-----------|---------|
| GHL API Key | Vercel env vars | Talk to GoHighLevel |
| GHL Location ID | Vercel env vars | Your GHL sub-account |
| Google Maps Key | Vercel env vars | Map + routing + geocoding |
| Supabase URL | Vercel env vars | Your database |
| Supabase Key | Vercel env vars | Database access (service role) |

No keys are ever in the code. Vercel injects them at runtime.

---

## Setup (Cloud Only — No Local Install)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `dispatch-board`, pick a region, set a DB password
3. Once created, go to **SQL Editor** → **New Query**
4. Paste the entire contents of `sql/schema.sql` → **Run**
5. Go to **Settings → API** and copy:
   - **Project URL** (e.g. `https://abc123.supabase.co`)
   - **service_role key** (the secret one, NOT the anon key)

### Step 2: Upload Code to GitHub

1. Go to [github.com/new](https://github.com/new) → create repo `dispatch-board`
2. Click **"uploading an existing file"** link
3. Drag all the project files into the upload area:
   - `backend/server.js`
   - `frontend/index.html`
   - `sql/schema.sql`
   - `package.json`
   - `vercel.json`
   - `.gitignore`
   - `.env.example`
   - `README.md`
4. Commit directly to `main`

**Important:** Do NOT upload `.env` — only `.env.example`

### Step 3: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your `dispatch-board` GitHub repo
3. Vercel auto-detects the config. Click **Deploy**
4. After deploy, go to **Settings → Environment Variables**
5. Add these 5 variables:

| Name | Value |
|------|-------|
| `GHL_API_KEY` | Your GHL API v2 bearer token |
| `GHL_LOCATION_ID` | Your GHL location/sub-account ID |
| `GOOGLE_MAPS_KEY` | Your Google Maps API key |
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_KEY` | Your Supabase `service_role` key |
| `ALLOWED_ORIGINS` | `https://app.gohighlevel.com` |

6. Click **Redeploy** (Deployments tab → three dots → Redeploy)

### Step 4: Add to GHL as iFrame

1. In GHL → **Settings → Custom Menu Links**
2. **Add Custom Menu Link**
3. Name: `Dispatch Board`
4. URL: Your Vercel URL (e.g. `https://dispatch-board.vercel.app`)
5. Save → it appears in GHL's sidebar

**Done!** The dispatch board is live inside GHL.

---

## Getting Your API Keys

### GHL API Key

1. Log into GHL → **Settings → API Keys**
2. Create key with scopes: calendars (read/write), contacts (read/write), users (read)
3. Copy the Bearer token

### GHL Location ID

1. Log into your GHL sub-account
2. Look at the URL: `app.gohighlevel.com/location/XXXXXXXXXX/...`
3. That `XXXXXXXXXX` is your Location ID

### Google Maps Key

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create project → Enable APIs:
   - Maps JavaScript API
   - Directions API
   - Geocoding API
3. Create API Key → restrict to your Vercel domain

### Supabase Keys

1. In Supabase dashboard → **Settings → API**
2. Copy **Project URL** and **service_role** key (the secret one)

---

## What Gets Stored Where

| Data | Location | Why |
|------|----------|-----|
| Appointments | GHL (read-only) | Source of truth for scheduled jobs |
| Team members | GHL → synced to Supabase | Cached for fast loading, crew-specific fields added |
| Dispatch assignments | Supabase | Who's assigned where, status, zone, priority |
| Route history | Supabase | Saved optimized routes for reference |
| Sync logs | Supabase | Debug GHL connection issues |
| Zone boundaries | Supabase | Configurable service zones |

---

## Features

- **Map View** — Google Maps with dark theme, custom pins, zone polygons, traffic layer
- **Drag & Drop** — Drag job cards onto crew members to assign
- **Route Optimization** — Click "Optimize Route" for shortest driving path (Google Directions API)
- **Status Tracking** — Unassigned → Assigned → En Route → On Site → Completed
- **Crew Capacity** — Visual capacity bars, max job limits per crew member
- **GHL Auto-Sync** — Pulls appointments and users every 60 seconds
- **Supabase Persistence** — All assignments survive page refreshes and sync across devices
- **Zone Routing** — Geographic zones help match jobs to nearby crews
- **Search & Filter** — Find jobs by customer, address, ID, or type
- **GHL Contact Notes** — Auto-adds dispatch notes to GHL contact records

---

## Supabase Tables

### `dispatch_assignments`
Links GHL appointments to crew members with status, zone, priority, route order.

### `crew_members`
Cached GHL users with dispatch-specific fields (zone, max_jobs, color, crew_type).

### `route_history`
Saved optimized routes with distance, duration, stop order.

### `sync_log`
Tracks every GHL sync for debugging.

### `zone_config`
Editable zone boundaries (north/south/east/west polygons).

---

## API Endpoints

| Method | Endpoint | Source | Description |
|--------|----------|--------|-------------|
| GET | `/api/health` | Server | Health check |
| GET | `/api/config` | Server | Public config (maps key, HQ) |
| GET | `/api/appointments` | GHL | Today's appointments |
| GET | `/api/users` | GHL | Team members |
| GET | `/api/contacts/:id` | GHL | Contact details |
| POST | `/api/contacts/:id/notes` | GHL | Add dispatch note |
| GET | `/api/dispatch` | Supabase | All assignments |
| POST | `/api/dispatch` | Supabase | Create/upsert assignment |
| PUT | `/api/dispatch/:id` | Supabase | Update assignment |
| DELETE | `/api/dispatch/:id` | Supabase | Remove assignment |
| GET | `/api/crew` | Supabase | Crew members |
| POST | `/api/crew/sync` | GHL→Supabase | Sync users to crew table |
| POST | `/api/routes` | Supabase | Save optimized route |
| GET | `/api/zones` | Supabase | Zone boundaries |
| GET | `/api/geocode?address=...` | Google | Address → lat/lng |

---

## File Structure

```
dispatch-ghl-project/
├── backend/
│   └── server.js          # Express proxy (GHL + Supabase + CORS)
├── frontend/
│   └── index.html         # Dispatch board UI (single file)
├── sql/
│   └── schema.sql         # Supabase table definitions (run once)
├── .env.example           # Env var template
├── .gitignore
├── package.json           # Node dependencies
├── vercel.json            # Deployment config
└── README.md
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Map shows dots instead of Google Maps | Check `GOOGLE_MAPS_KEY` in Vercel env vars, enable Maps JS API |
| "Demo Mode" in sync badge | Backend can't reach GHL — check `GHL_API_KEY` in Vercel |
| Assignments don't persist | Check `SUPABASE_URL` and `SUPABASE_KEY` in Vercel |
| CORS error in browser console | Add your GHL domain to `ALLOWED_ORIGINS` |
| Blank iFrame in GHL | Ensure Vercel URL uses HTTPS |
| No appointments showing | Check GHL calendars have events today |
| "Sync Error" badge | Click it to retry; check Vercel function logs |
