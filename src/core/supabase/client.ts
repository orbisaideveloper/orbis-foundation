import { createClient } from '@supabase/supabase-js';

// Environment variables থেকে Supabase Credentials নেওয়া হচ্ছে
// প্রোডাকশনে আপনার .env ফাইল থেকে এগুলো লোড হবে
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseKey);
