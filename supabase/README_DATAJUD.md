# DataJud (CNJ) — Edge Function (MVP)

This project uses a Supabase Edge Function to query DataJud **on-demand** by CNJ process number.

## Why Edge Function
- Keeps DataJud calls off the frontend
- Enables rate limiting / caching later
- Centralizes secrets (DATAJUD_API_KEY)

## Deploy
You need Supabase CLI + access token.

```bash
npm i -g supabase
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>

# Set env vars for the function (optional)
supabase secrets set DATAJUD_BASE_URL="https://api-publica.datajud.cnj.jus.br"
# DataJud public key (from CNJ wiki). It can rotate.
# Header format: Authorization: APIKey <key>
# Store ONLY the key value (without "APIKey ")
# supabase secrets set DATAJUD_API_KEY="..."

supabase functions deploy datajud-last-movement
```

## Call from frontend
POST:
`https://<projectRef>.supabase.co/functions/v1/datajud-last-movement`

Body:
```json
{ "process_number": "0000000-00.0000.0.00.0000" }
```

Use Supabase session token in `Authorization: Bearer <access_token>`.

## Notes
- DataJud response shape may vary. Adjust extraction in `index.ts` once we confirm exact payload.
