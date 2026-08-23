/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredSupabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseUrl = configuredSupabaseUrl || "https://placeholder.supabase.co";
const supabaseKey = configuredSupabaseKey || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseKey);
export const isSupabaseConfigured = Boolean(
  configuredSupabaseUrl && configuredSupabaseKey,
);
