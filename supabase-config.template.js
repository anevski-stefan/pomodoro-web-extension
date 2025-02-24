// Supabase configuration template
const supabaseClient = window.supabase.createClient(
    'YOUR_SUPABASE_URL',
    'YOUR_SUPABASE_ANON_KEY'
);
window.supabase = supabaseClient; 