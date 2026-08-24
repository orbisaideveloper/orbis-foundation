/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredSupabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configuredAdminEmail = import.meta.env.VITE_ADMIN_EMAIL?.trim();
const supabaseUrl = configuredSupabaseUrl || "https://placeholder.supabase.co";
const supabaseKey = configuredSupabaseKey || "placeholder-anon-key";

export const REQUIRED_ADMIN_EMAIL = "orbisaideveloper@gmail.com";
export const adminEmail =
  configuredAdminEmail === REQUIRED_ADMIN_EMAIL ? REQUIRED_ADMIN_EMAIL : null;

export const supabase = createClient(supabaseUrl, supabaseKey);
export const isSupabaseConfigured = Boolean(
  configuredSupabaseUrl && configuredSupabaseKey,
);
export const isAdminAuthConfigured = Boolean(
  isSupabaseConfigured && adminEmail,
);
