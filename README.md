# HyperTrader

**Track your Hyperliquid trading performance with real-time analytics.**

🌐 **Live**: [hypertrader.info](https://hypertrader.info)

## Features

- 📅 **PnL Calendar** — Visual daily profit/loss heatmap with drill-down to individual trades
- 📊 **Live Positions** — Real-time perpetual and spot positions including HIP-3 assets (xyz: stock perps)
- 📈 **Performance Summary** — Total PnL, win rate, best/worst days, largest trades
- 🏆 **Top Assets** — Asset-by-asset breakdown with win rates and average PnL
- 📆 **Weekly Breakdown** — Week-over-week performance tracking
- 🔄 **Market Filtering** — Toggle between Perps, Spot, or All markets
- 📤 **Shareable Cards** — Export your PnL summary as an image

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Supabase Edge Functions (`supabase/functions`)
- **Hosting**: Railway
- **Data**: Hyperliquid API
- **Charts**: Recharts

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Browser       │────▶│  Edge Function Proxy │────▶│  Hyperliquid    │
│   (React App)   │◀────│  - Rate limiting     │◀────│  API            │
│                 │     │  - Request queue     │     │                 │
│                 │     │  - Response caching  │     │                 │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
```

### Scalability

The app uses an edge function proxy that provides:

- **30-second response caching** — Duplicate requests served from cache
- **Rate limiting** — 30 requests/minute per address
- **Request queuing** — 100ms minimum between Hyperliquid API calls
- **Graceful fallback** — Falls back to direct API if proxy unavailable

## Local Development

```bash
# Install dependencies
npm install

# Copy env and fill in the Supabase project values (see CONTRIBUTING.md to run Supabase locally)
cp .env.example .env

# Start dev server (http://localhost:8080)
npm run dev
```

## Environment Variables

Set these in `.env` locally and as service variables on Railway. They are read at build time, so a Railway redeploy is needed after changing them:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## API Endpoints

### Hyperliquid Proxy

`POST /functions/v1/hyperliquid-proxy`

Proxies requests to Hyperliquid API with caching and rate limiting.

**Request:**
```json
{
  "type": "userFillsByTime",
  "user": "0x...",
  "startTime": 1234567890000,
  "endTime": 1234567890000
}
```

**Response Headers:**
- `X-Cache: HIT` — Served from cache
- `X-Cache: MISS` — Fresh from Hyperliquid

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to run the full stack locally and open a pull request.

## License

[MIT](LICENSE)

## Venue filters

Besides Hyperliquid's own perps and spot, the Tracker recognises two venues that
trade for the same address, each shown as an extra market filter only when the
address has activity there:

- **bskts** (bskts.xyz): index baskets executed as batched Hyperliquid perp orders.
  Identified by the client order id each order carries; positions are rebuilt per
  basket from the account's fills (`src/lib/bskts.ts`).
- **Papertrade** (papertrade.xyz): synthetic perps settled on HyperEVM, so nothing
  appears in Hyperliquid fills. Closed positions come from Papertrade's query API
  via a small read-only CORS proxy (`workers/papertrade-proxy`, a Cloudflare Worker
  routed at `hypertrader.info/api/papertrade/*`) and are mapped onto the fill
  pipeline (`src/lib/papertrade.ts`). Set `VITE_PAPERTRADE_API` to point a build at
  a different proxy.

## Serving and edge

- `Caddyfile` (repo root) replaces Railpack's default: hashed `/assets/*` are cached for a
  year, `index.html` is never cached, and scanner probes (`/.env`, `/@fs`, `*.php`, `wp-*`)
  get a 404 instead of the SPA fallback.
- `workers/scanner-block`: a Cloudflare Worker routed on the same probe paths so they are
  answered at the edge and never reach the origin.
- `workers/papertrade-proxy`: see Venue filters above.
