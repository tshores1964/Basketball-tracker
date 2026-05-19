const SUPABASE_URL = "https://zpetypwibsyjdserzhnu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZXR5cHdpYnN5amRzZXJ6aG51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMzgzNzcsImV4cCI6MjA5NDcxNDM3N30.xIoVqgBeHYLLXEHJ__ONijx-eNGyFh08CDrkukBs050";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: {
    headers: {
      'X-Client-Info': 'basketball-tracker'
    }
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});
