const SUPABASE_URL      = 'https://wosgbrafpbigmbhhodov.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indvc2dicmFmcGJpZ21iaGhvZG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMzgxNTksImV4cCI6MjEwOTcxNDE1OX0.KZ17Pgpaz7POXZ5K606Gb4obPOiw7TGMOLrYUvQg1NE';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
    storageKey: 'ussh_admin_auth',
  },
});

const ADMIN_EMAIL_DOMAIN = 'skyone.vn';
const REMEMBER_KEY       = 'ussh_remember_login';
const EMP_SESSION_KEY    = 'ussh_emp_session';
const EMP_SESSION_TTL    = 7 * 24 * 60 * 60 * 1000;
const PHOTO_BUCKET       = 'attendance-photos';

let currentEmployee         = null;
let currentEmployeePassword = null;
let currentAdminEmail       = null;
let currentTodayRecord      = null;
let pendingPhotoBlob        = null;
let pendingPhotoAction      = null; // 'checkin' | 'checkout'