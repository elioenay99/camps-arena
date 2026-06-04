import { createBrowserClient } from "@supabase/ssr"

import { env } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"

/**
 * Cliente Supabase para uso no browser (Client Components).
 * Usa as chaves públicas; sujeito às políticas de RLS.
 */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
