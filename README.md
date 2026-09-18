CPGist
A CPG (Consumer Packaged Goods) AI analyst web app. Describe a retail-analytics task in plain English — e.g. "Analyze promo lift for Bold Snacks on QuickDash" — and CPGist runs the relevant SQL analysis, has an LLM agent (Gemini) interpret the request and call the right analysis tool(s), and renders charts plus a narrative insight in a chat UI, framed for whoever's asking (Category Manager, Trade, Supply Planning, or Exec), with a full "how I found this" source trace, an optional PDF export, and a background job that surfaces anomalies on its own instead of waiting to be asked.

All data is synthetic — generated for this demo, not real licensed syndicated data (Nielsen/Circana/SPINS equivalents), which is proprietary and expensive.

Positioning
CPGist targets India/Gulf/APAC CPG markets rather than US-only retail — the seed data covers Quick Commerce (Blinkit/Zepto/Instamart-style retailers) and General Trade alongside Modern Trade (Grocery, Club, Natural, C-Store), across North America, India, Gulf, and SEA regions, which US-focused tools like Sous don't model. That's the regional differentiation; the rest of what's built here is what turns "an LLM wrapper around a database" into something closer to an actual analyst:

An elasticity model that's actually fit, not guessed. get_forecast regresses real discount-depth-vs-lift data per category (verified at r ≈ 0.77–0.79 before it was ever built — see PHASE5_NOTES.md), not a hardcoded lookup table.
Real tenant isolation, not a UI-level filter. Every table is scoped by org_id and enforced by Postgres row-level security — verified by deliberately trying to break it (seeding a phantom second org and confirming it doesn't leak through), not by inspection. See PHASE6_NOTES.md.
Cross-brand context the agent actually uses. Before attributing a lift or share swing purely to a brand's own performance, the agent can pull sibling-brand cannibalization risk, competitive-set overlap, and grounded qualitative signal notes — and time-stamped competitor promo activity, not just structural relationships. See PHASE2_NOTES.md and PHASE7_NOTES.md.
Audience-aware framing at the prompt level, not just a UI label. The same underlying numbers get framed differently for a Category Manager vs. Trade vs. Supply Planning vs. an Exec — different lead metric, different recommendations, because the system prompt actually changes, not because a template wraps the same text. See PHASE3_NOTES.md.
Proactive, not just reactive. A daily background job detects non-promo velocity swings against a trailing baseline and surfaces them in a bell-icon feed unprompted — an analyst that's on shift even when nobody's chatting with it. See PHASE8_NOTES.md.
This is a from-scratch demo dataset built to exercise all of the above, not a claim about coverage of any real market — see "A known data-quality limitation" below for a real gap this rebuild found in its own synthetic data and chose not to paper over.

What's actually in here
Seven agent tools, callable by Gemini via function calling:

Tool	What it answers
get_brand_ranking	Rank brands in a category by $ sales / share
get_promo_lift_analysis	% unit lift during promo weeks vs. trailing baseline
get_channel_mix	A brand's % of sales by retailer channel
get_distribution_whitespace	Where a brand's ACV distribution lags the category average
get_forecast	Projected lift % and incremental $ for a hypothetical promo depth/duration
get_brand_context	Sibling brands, competitive set, grounded signal notes
get_competitive_signals	Time-stamped competitor promo activity
Plus: audience-framed narratives (4 personas + auto-detect), a What-If promo simulator with a live lift-vs-depth curve, a source-trace panel on every answer, thumbs up/down feedback logging, one-click PDF export, and the alerts feed described above.

Tech stack
Frontend: Next.js 14 (App Router) + Tailwind, deployed on Vercel
Backend: Next.js API routes / Vercel serverless functions, Vercel Cron
Database: Supabase (Postgres) with row-level security
Auth: Supabase Auth (email+password)
LLM: Google Gemini (function calling)
Charts: Recharts
Deck export: @react-pdf/renderer (server-rendered PDF, no headless browser)
Project layout
app/
  page.tsx                       Chat / What-If tab shell
  login/page.tsx                  Email+password sign-in/sign-up
  api/agent/route.ts               Gemini function-calling loop
  api/forecast/route.ts            Direct elasticity forecast (What-If sliders)
  api/feedback/route.ts            Logs thumbs up/down to insight_feedback
  api/export-pdf/route.tsx         Server-rendered PDF export
  api/alerts/route.ts               RLS-scoped read endpoint for the alerts feed
  api/cron/detect-anomalies/route.ts  Daily anomaly detection (Vercel Cron)
middleware.ts                     Session refresh + auth gate (exempts /api/cron/*)
vercel.json                       Cron schedule for detect-anomalies
components/
  ChatUI.tsx                       Chat shell: input, audience toggle, alerts bell, sign-out
  ChatMessageBubble.tsx            Renders narrative + chart + source trace + feedback
  Sidebar.tsx                      7 quick-start templates, one per tool
  WhatIfSimulator.tsx              Promo depth/duration sliders + lift curve
  AlertsFeed.tsx                   Bell icon + dropdown anomaly feed
  InsightChart.tsx / SourceTrace.tsx / FeedbackButtons.tsx / SignOutButton.tsx
lib/
  supabase.ts                      Session-aware (RLS-enforced) server client
  supabase-browser.ts               Browser client for the login page
  supabase-service.ts               Service-role client for the cron job (bypasses RLS)
  gemini-tools.ts                  Tool declarations, dispatcher, system prompt,
                                     audience framing + auto-detection
  types.ts                         Shared types (ChatMessage, Audience, ...)
  tools/                           One file per agent tool
    datasetClock.ts                 Anchors "recent window" logic to the dataset's
                                     own max date, not wall-clock time — read this
                                     before adding any new time-windowed query
  alerts/detectAnomalies.ts        Trailing-baseline velocity anomaly detector
supabase/
  schema.sql                       All tables + RLS policies (read top-to-bottom;
                                     each phase's additions are comment-labeled)
  views.sql                        Semantic layer: v_velocity, v_promo_lift,
                                     v_brand_share, v_distribution_gaps, v_channel_mix,
                                     v_channel_mix_summary (all security_invoker=true —
                                     see PHASE6_NOTES.md for why that's load-bearing)
scripts/
  generate_synthetic_data.py       Phase 1: core dataset (brands/retailers/products/
                                     sales_facts) — see the ACV caveat below before
                                     trusting acv_distribution for anything new
  generate_phase2_data.py          Phase 2: brand_relationships + signal_notes
                                     (needs an export of v_distribution_gaps first)
  generate_phase7_data.py          Phase 7: competitor_signals
PHASE1_NOTES.md ... PHASE8_NOTES.md  Detailed build log per phase: what changed,
                                     what was verified and how, bugs found, decisions
                                     flagged for review. Start here for the full story
                                     behind any file — this README is the summary.
Setup
Install dependencies

npm install
Create a Supabase project, then run supabase/schema.sql followed by supabase/views.sql in the SQL editor. schema.sql references auth.users (for the profile/org-provisioning trigger) — this only exists on an actual Supabase project, not a vanilla Postgres instance.

Generate and load the dataset — three scripts, in order, because each later one reads the previous one's output:

a. Core dataset

pip install faker numpy pandas --break-system-packages
cd scripts && python generate_synthetic_data.py
Writes brands.csv, retailers.csv, products.csv, sales_facts.csv. Load these four into Supabase (table editor's CSV import, or \copy with an explicit column list — see PHASE2_NOTES.md for why an explicit column list matters here).

b. Export v_distribution_gaps from Supabase (SQL editor → run select * from v_distribution_gaps → export as CSV, or psql's \copy (select * from v_distribution_gaps) to 'distribution_gaps_export.csv' csv header) into scripts/.

c. Knowledge-graph-lite layer

python generate_phase2_data.py
Reads the Phase 1 CSVs plus distribution_gaps_export.csv, writes brand_relationships.csv and signal_notes.csv. Load both (explicit column list, same reason as above).

d. Competitor signals

python generate_phase7_data.py
Reads the Phase 1 CSVs, writes competitor_signals.csv. Load it.

Get a Gemini API key at https://aistudio.google.com/apikey

Generate a CRON_SECRET (any random string — e.g. openssl rand -hex 32) for the anomaly-detection cron route.

Copy env vars

cp .env.local.example .env.local
and fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, and CRON_SECRET.

Run locally

npm run dev
Sign up for an account at /login (email+password). Required — every route is gated by middleware, so the app is unusable until at least one account exists. New sign-ups are auto-provisioned into the existing "Demo Org" that owns the dataset you just loaded.

Deploy: push to GitHub, import into Vercel, add the same env vars (including CRON_SECRET) in the Vercel dashboard — vercel.json's schedule picks up automatically once CRON_SECRET is set. Locally, you can trigger a detection run manually:

curl -H "Authorization: Bearer <your CRON_SECRET>" \
  http://localhost:3000/api/cron/detect-anomalies
Auth & multi-tenancy
Every table is scoped by org_id and protected by Postgres row-level security — an unauthenticated request (or a request for another org's data) gets zero rows back, not just a UI-level restriction. See supabase/schema.sql's "Phase 6" section for the orgs/profiles tables, the current_org_id() helper, and the RLS policies, and PHASE6_NOTES.md for how this was verified — including a real RLS-bypass bug found and fixed in the views (read that before assuming any future view you add is automatically safe: views need security_invoker = true or they silently run with the view owner's privileges instead of the querying user's).

Sign-up/sign-in is email+password — no magic-link flow, since that needs a configured email provider and an /auth/callback route this repo doesn't have. Password auth works out of the box on a fresh Supabase project.
Every new sign-up joins the shared Demo Org via a Postgres trigger on auth.users (handle_new_user() in schema.sql) — deliberate for a shared portfolio demo, not a template for real multi-tenant onboarding.
The elasticity model
get_forecast fits a least-squares regression (discount depth % → lift %) per category, using the real discount_depth_pct column on sales_facts/v_promo_lift — not a promo_type proxy (an earlier version did that; Phase 5 replaced it once real discount-depth data existed, after confirming per-category correlation of ~0.77–0.79 against a live Postgres instance). See lib/tools/getForecast.ts's comment for the fit scope and tradeoffs, and PHASE5_NOTES.md for the verification.

Proactive alerts
app/api/cron/detect-anomalies runs daily (vercel.json), aggregates sales_facts to (brand, retailer, week), fits a trailing 4-week non-promo baseline, and flags non-promo weeks where the swing exceeds a threshold picked from the real distribution of swings in this dataset (not guessed). Results land in the alerts table (RLS-scoped like everything else) and surface via the bell icon in ChatUI.tsx's header — a feed the user doesn't have to ask a chat question to see. Not wired into the chat agent itself (a separate feed, by design — see PHASE8_NOTES.md's decisions section for the tradeoff).

A known data-quality limitation
acv_distribution in the seed data doesn't actually behave like the "slow drift" generate_synthetic_data.py's own comments describe — a real per-(product, retailer) series can jump 50.8 → 35.5 → 53.3 → 83.0 across four consecutive weeks. Root cause: the generator draws acv_start/ acv_drift per-row across the whole dataset instead of once per series (see PHASE7_NOTES.md for the full diagnosis). This affects v_distribution_gaps, signal_notes' distribution_gap notes, and is why competitor_signals/alerts both deliberately ship without a distribution-based signal type — that data doesn't support one honestly yet. get_distribution_whitespace and the distribution_gap signal notes still work mechanically and are worth using to demo the pattern, but don't treat their specific numbers as meaningful until this is patched upstream (would require regenerating sales_facts.csv and re-verifying several exact numbers cited in PHASE1_NOTES.md through PHASE7_NOTES.md — a deliberate, contained follow-up, not something to fix quietly).

What's stubbed / left for you
Chart images aren't embedded in the PDF export (narrative + recommendations + source trace only) — app/api/export-pdf/route.tsx has a comment showing where to add a captured chart PNG.
The Gemini model is configured with AI_MODEL and falls back to gemini-1.5-flash when unset.
No live Vercel Cron trigger has been observed firing (verified the route's own logic locally instead — see PHASE8_NOTES.md). Worth confirming once deployed.
Alerts aren't referenced by the chat agent itself, only the separate bell-icon feed — see PHASE8_NOTES.md's decisions section if you want "by the way, there's an open alert on this brand" inside chat answers.
The ACV data-quality issue above.

## Current production hardening (CPGist AI)

The application now treats Supabase as the source of truth for dashboard data. The dashboard no longer renders fabricated business metrics or placeholder brand cards. CSV ingestion automatically detects common CPG columns and populates brand, retailer, and product dimensions before writing `sales_facts`.

### Analytics and AI

- Analytics retrieves the complete `sales_facts` result set in pages instead of silently using the first 1,000 rows.
- Brand comparison supports selecting up to four observed brands.
- Brand detail exposes sales, units, market share, period trend, category mix, and observed anomalies.
- The AI Analyst automatically uses the latest ready dataset when no dataset is explicitly selected.
- Groq receives server-computed evidence only.
- Each AI response gets a **deterministic grounding confidence** based on evidence-term overlap and exact numeric-claim matches. This is deliberately not presented as model accuracy: true accuracy requires a labeled evaluation benchmark.
- Saved analyses are persisted in `analyses`.

### Working operations

- CSV import and ingestion
- Dataset selection and real analytics
- Brand comparison and brand detail
- AI chat with Groq
- Saved analyses
- Report creation and CSV export
- Workflow creation and execution against a selected dataset
- Google Drive and Microsoft Graph OAuth start/callback routes
- Connector status endpoint

### Connector security

OAuth access and refresh tokens are encrypted with AES-256-GCM before being stored in `data_connections`. Set `CONNECTOR_ENCRYPTION_KEY` to a base64-encoded 32-byte secret (or a 64-character hex key).

Run the migrations in `supabase/migrations/` in order before using the protected connector/signal tables.
