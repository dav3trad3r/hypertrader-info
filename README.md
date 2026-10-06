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
