const fs = require('fs');

function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  const src = fs.readFileSync(path, 'utf8');
  const lines = src.split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    out[key] = rawValue.replace(/^['\"]|['\"]$/g, '');
  }
  return out;
}

async function main() {
  const env = loadEnv('.env');
  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(2);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const marker = `__SUPABASE_TEST__${Date.now()}`;
  const payload = { resume_text: marker, result: { ok: true } };

  const inserted = await supabase.from('reviews').insert([payload]).select();
  if (inserted.error) throw inserted.error;
  console.log('inserted', Array.isArray(inserted.data) ? inserted.data.length : 0);

  const deleted = await supabase.from('reviews').delete().eq('resume_text', marker).select();
  if (deleted.error) throw deleted.error;
  console.log('deleted', Array.isArray(deleted.data) ? deleted.data.length : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
