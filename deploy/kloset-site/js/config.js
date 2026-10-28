// Connect Kloset to your Supabase project (see SETUP.md).
// Find both values in Supabase: Project Settings -> API Keys / Data API.
// The public (anon / publishable) key is meant to be used in the browser;
// your data is protected by the rules in supabase/schema.sql.
// NEVER put the "service_role" or "secret" key here.
//
// While these still say YOUR_..., the site runs in demo mode and only
// saves data in the current browser.
window.KLOSET_CONFIG = {
  supabaseUrl: "https://lvatlkpspizleqtxpoky.supabase.co",
  supabaseKey: "sb_publishable_omqGlxPebrBeAeZEHXDyvg_W99J2dNe",    // the "anon public" or "publishable" key
};
