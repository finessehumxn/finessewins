import { createClient } from "@supabase/supabase-js"

// Configured via Vite env vars (frontend/.env). If they're absent (local dev
// with no Supabase), we run in "no-auth" mode: the client is null and the
// backend also has auth disabled, so the app still works end-to-end.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const authEnabled = Boolean(url && anonKey)

export const supabase = authEnabled
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
