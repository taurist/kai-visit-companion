# Visit Companion

Mobile-first appointment companion for a family visit. The public repo contains the generic app shell only. Visit-specific content is loaded from a URL fragment or Supabase room.

## Local development

```bash
npm install
npm run dev
```

## Same-Wi-Fi local sync

Run the app and the local sync server:

```bash
npm run dev
npm run sync:local
```

Open the app with:

```text
#room=<room-id>&key=<room-key>&localSync=1
```

This only works while the laptop is awake and both phones can reach the laptop on the same network.

## Shared sync

The app supports Supabase-backed shared state through RPC functions. Apply `supabase/schema.sql` in a Supabase project, then open the app with:

```text
#room=<unguessable-room-id>&key=<unguessable-room-key>
```

The Supabase URL and anon key can be provided through the Notes screen or through these hash params:

```text
#room=...&key=...&supabaseUrl=...&supabaseAnonKey=...
```

If Supabase is not configured, the app keeps working in local-only mode with browser storage.

## Privacy

GitHub Pages is public static hosting. Do not commit full names, dates of birth, portal screenshots, addresses, doctor names, or other sensitive identifiers to this repository.
