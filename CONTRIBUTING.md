# Contributing to HyperTrader

Thanks for helping out! Bug reports, feature ideas and pull requests are all welcome.

## Getting set up

You need Node 22+ and, for the backend, the [Supabase CLI](https://supabase.com/docs/guides/local-development) with Docker.

```bash
npm install

# Run the backend locally: Postgres + the edge functions in supabase/functions
supabase start
supabase db reset            # applies supabase/migrations
supabase functions serve     # serves hyperliquid-proxy, get-fills, sync-fills, whale-tracker, get-sentiment

# Point the app at it: copy the API URL and anon key that `supabase start` printed
cp .env.example .env

npm run dev                  # http://localhost:8080
```

The edge functions only need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase provides automatically, both locally and when deployed.

## Making a change

1. Fork the repo and branch off `main`.
2. Keep pull requests focused: one fix or feature per PR.
3. Before opening the PR, make sure `npm run build` and `npm test` pass.
4. For UI changes, include a screenshot in the PR description.

## Reporting bugs

Open an issue with what you did, what you expected, and what happened. Include the wallet address if the bug only shows up for one trader (addresses are public on Hyperliquid).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
