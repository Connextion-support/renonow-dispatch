// ═══════════════════════════════════════════════════════════════
// DISPATCH BOARD — Backend Proxy Server (Supabase Edition)
// ═══════════════════════════════════════════════════════════════
//
// Express server that:
//   1. Proxies GHL API calls (keeps API key server-side)
//   2. Stores dispatch assignments in Supabase (not GHL Custom Objects)
//   3. Serves the dispatch board frontend
//   4. Handles CORS for GHL iFrame embedding
//
// ALL ENV VARS are set in Vercel dashboard (Settings → Environment Variables):
//
//   GHL_API_KEY        - GoHighLevel API v2 Bearer token
//   GHL_LOCATION_ID    - GHL sub-account / location ID
//   GOOGLE_MAPS_KEY    - Google Maps API key
//   SUPABASE_URL       - Your Supabase project URL
//   SUPABASE_KEY       - Supabase service_role key (NOT the anon key)
//   ALLOWED_ORIGINS    - Comma-separated iFrame origins
//   PORT               - Server port (default 3000)
//
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── Load env vars (locally from .env, on Vercel injected automatically) ──
if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config(); } catch {}
}

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config ──
const GHL_BASE       = 'https://services.leadconnectorhq.com';
const GHL_API_KEY    = process.env.GHL_API_KEY;
const GHL_LOCATION   = process.env.GHL_LOCATION_ID;
const GMAPS_KEY      = process.env.GOOGLE_MAPS_KEY;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_KEY;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ── Validation ──
const missing = [];
if (!GHL_API_KEY)   missing.push('GHL_API_KEY');
if (!GHL_LOCATION)  missing.push('GHL_LOCATION_ID');
if (!SUPABASE_URL)  missing.push('SUPABASE_URL');
if (!SUPABASE_KEY)  missing.push('SUPABASE_KEY');
if (missing.length > 0) {
  console.warn(`⚠️  Missing env vars: ${missing.join(', ')} — some features will be disabled`);
}

// ── Supabase client ──
const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// ── Middleware ──
app.use(express.json());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`Origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString().slice(11,19)}] ${req.method} ${req.path}`);
  next();
});


// ═══════════════════════════════════════
// GHL PROXY HELPER
// ═══════════════════════════════════════

async function ghlFetch(endpoint, options = {}) {
  const res = await fetch(`${GHL_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Version': '2021-07-28',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`GHL ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}


// ═══════════════════════════════════════
// HEALTH & CONFIG
// ═══════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ghl_configured: !!GHL_API_KEY,
    supabase_configured: !!supabase,
    maps_configured: !!GMAPS_KEY,
    location_id: GHL_LOCATION || null,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    googleMapsKey: GMAPS_KEY || null,
    locationId: GHL_LOCATION || null,
    mapCenter: { lat: 41.700, lng: -83.610 },
    mapZoom: 11,
    companyHQ: { lat: 41.757, lng: -83.572, label: 'HQ — Temperance' },
    syncIntervalMs: 60000,
    supabaseReady: !!supabase,
  });
});


// ═══════════════════════════════════════
// GHL → APPOINTMENTS
// ═══════════════════════════════════════

app.get('/api/appointments', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const data = await ghlFetch(
      `/calendars/events?locationId=${GHL_LOCATION}` +
      `&startTime=${date}T00:00:00Z&endTime=${date}T23:59:59Z`
    );
    res.json({ events: data.events || [] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/appointments/:id', async (req, res) => {
  try {
    const data = await ghlFetch(`/calendars/events/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put('/api/appointments/:id', async (req, res) => {
  try {
    const data = await ghlFetch(`/calendars/events/${req.params.id}`, {
      method: 'PUT',
      body: JSON.stringify({ locationId: GHL_LOCATION, ...req.body }),
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════
// GHL → CONTACTS
// ═══════════════════════════════════════

app.get('/api/contacts/:id', async (req, res) => {
  try {
    const data = await ghlFetch(`/contacts/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/contacts/:id/notes', async (req, res) => {
  try {
    const data = await ghlFetch(`/contacts/${req.params.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body: req.body.body }),
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════
// GHL → USERS (Team Members)
// ═══════════════════════════════════════

app.get('/api/users', async (req, res) => {
  try {
    const data = await ghlFetch(`/users/?locationId=${GHL_LOCATION}`);
    res.json({ users: data.users || [] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/calendars', async (req, res) => {
  try {
    const data = await ghlFetch(`/calendars/?locationId=${GHL_LOCATION}`);
    res.json({ calendars: data.calendars || [] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════
// SUPABASE → DISPATCH ASSIGNMENTS
// ═══════════════════════════════════════

// GET /api/dispatch — List all dispatch assignments
app.get('/api/dispatch', async (req, res) => {
  if (!supabase) return res.json({ records: [] });
  try {
    const { data, error } = await supabase
      .from('dispatch_assignments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ records: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dispatch/:appointmentId — Get assignment for a specific appointment
app.get('/api/dispatch/:appointmentId', async (req, res) => {
  if (!supabase) return res.json({ record: null });
  try {
    const { data, error } = await supabase
      .from('dispatch_assignments')
      .select('*')
      .eq('appointment_id', req.params.appointmentId)
      .maybeSingle();
    if (error) throw error;
    res.json({ record: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dispatch — Create or upsert a dispatch assignment
app.post('/api/dispatch', async (req, res) => {
  if (!supabase) return res.json({ success: false, reason: 'Supabase not configured' });
  try {
    const b = req.body;
    const record = {
      appointment_id:   b.appointmentId,
      assigned_to:      b.assignedTo || null,
      assigned_name:    b.assignedName || null,
      status:           b.status || 'assigned',
      job_type:         b.jobType || 'sales',
      zone:             b.zone || 'north',
      priority:         b.priority || 'medium',
      customer_name:    b.customerName || null,
      customer_address: b.customerAddress || null,
      lat:              b.lat || null,
      lng:              b.lng || null,
      scheduled_time:   b.scheduledTime || null,
      notes:            b.notes || null,
      ghl_contact_id:   b.ghlContactId || null,
      dispatched_at:    new Date().toISOString(),
      dispatched_by:    'dispatch_board',
    };

    // Upsert: if appointment_id exists, update it; otherwise insert
    const { data, error } = await supabase
      .from('dispatch_assignments')
      .upsert(record, { onConflict: 'appointment_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, record: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/dispatch/:id — Update by Supabase UUID
app.put('/api/dispatch/:id', async (req, res) => {
  if (!supabase) return res.json({ success: false });
  try {
    const { data, error } = await supabase
      .from('dispatch_assignments')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, record: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/dispatch/:id — Remove assignment
app.delete('/api/dispatch/:id', async (req, res) => {
  if (!supabase) return res.json({ success: false });
  try {
    const { error } = await supabase
      .from('dispatch_assignments')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════
// SUPABASE → CREW MEMBERS
// ═══════════════════════════════════════

app.get('/api/crew', async (req, res) => {
  if (!supabase) return res.json({ members: [] });
  try {
    const { data, error } = await supabase
      .from('crew_members')
      .select('*')
      .order('name');
    if (error) throw error;
    res.json({ members: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crew/sync — Sync GHL users → Supabase crew_members table
app.post('/api/crew/sync', async (req, res) => {
  if (!supabase || !GHL_API_KEY) return res.json({ synced: 0 });
  try {
    const ghlData = await ghlFetch(`/users/?locationId=${GHL_LOCATION}`);
    const users = ghlData.users || [];
    const COLORS = ['#3b82f6','#8b5cf6','#ef4444','#f59e0b','#10b981','#06b6d4','#ec4899','#f97316'];

    const records = users.map((u, i) => {
      const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
      const initials = ((u.firstName || '?')[0] + (u.lastName || '?')[0]).toUpperCase();
      const role = (u.role || '').toLowerCase();
      const type = (role.includes('install') || role.includes('tech')) ? 'install' : 'sales';
      return {
        id: u.id,
        name: name || 'Team Member',
        role: u.role || 'Team Member',
        crew_type: type,
        max_jobs: type === 'install' ? 3 : 6,
        color: COLORS[i % COLORS.length],
        avatar: initials,
        status: 'available',
        last_synced: new Date().toISOString(),
      };
    });

    if (records.length > 0) {
      const { error } = await supabase
        .from('crew_members')
        .upsert(records, { onConflict: 'id' });
      if (error) throw error;
    }

    res.json({ synced: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════
// SUPABASE → ROUTE HISTORY
// ═══════════════════════════════════════

app.post('/api/routes', async (req, res) => {
  if (!supabase) return res.json({ success: false });
  try {
    const { data, error } = await supabase
      .from('route_history')
      .insert({
        crew_id:        req.body.crewId,
        total_distance: req.body.totalDistance,
        total_duration: req.body.totalDuration,
        stop_count:     req.body.stopCount,
        stop_order:     req.body.stopOrder,
        optimized:      req.body.optimized || true,
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, route: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════
// SUPABASE → SYNC LOG
// ═══════════════════════════════════════

async function logSync(type, status, pulled = 0, pushed = 0, error = null, ms = 0) {
  if (!supabase) return;
  try {
    await supabase.from('sync_log').insert({
      sync_type: type, status, records_pulled: pulled,
      records_pushed: pushed, error_message: error, duration_ms: ms,
    });
  } catch {} // Non-critical
}


// ═══════════════════════════════════════
// SUPABASE → ZONE CONFIG
// ═══════════════════════════════════════

app.get('/api/zones', async (req, res) => {
  if (!supabase) return res.json({ zones: [] });
  try {
    const { data, error } = await supabase.from('zone_config').select('*');
    if (error) throw error;
    res.json({ zones: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════
// GEOCODING
// ═══════════════════════════════════════

app.get('/api/geocode', async (req, res) => {
  const address = req.query.address;
  if (!address) return res.status(400).json({ error: 'address required' });
  if (!GMAPS_KEY) return res.status(400).json({ error: 'GOOGLE_MAPS_KEY not set' });
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GMAPS_KEY}`);
    const data = await r.json();
    if (data.status === 'OK' && data.results.length > 0) {
      const loc = data.results[0].geometry.location;
      res.json({ lat: loc.lat, lng: loc.lng, formatted: data.results[0].formatted_address });
    } else {
      res.json({ lat: null, lng: null, error: data.status });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════
// WEBHOOKS — GHL real-time push
// ═══════════════════════════════════════

app.post('/api/webhooks/appointment', (req, res) => {
  console.log('[Webhook] Appointment:', req.body?.type, req.body?.id);
  // Future: push to WebSocket clients for real-time updates
  res.json({ received: true });
});


// ═══════════════════════════════════════
// CATCH-ALL → Serve frontend
// ═══════════════════════════════════════

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Dispatch Board running on port ${PORT}`);
  console.log(`   GHL:      ${GHL_API_KEY ? '✓' : '✗'} | Supabase: ${supabase ? '✓' : '✗'} | Maps: ${GMAPS_KEY ? '✓' : '✗'}`);
  console.log(`   Location: ${GHL_LOCATION || 'not set'}\n`);
});
