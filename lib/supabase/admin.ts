import { createClient } from "@supabase/supabase-js";

function getServiceKey() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  return key;
}

export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, getServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
