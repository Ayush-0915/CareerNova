import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

let supabase: ReturnType<typeof createClient> | null = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
  // supabase remains null when not configured; caller should handle absence.
  supabase = null;
}

export async function insertReview(record: {
  resume_text?: string | null;
  result: unknown;
}) {
  if (!supabase) {
    throw new Error('Supabase not configured; set SUPABASE_URL and SUPABASE_SERVICE_KEY');
  }

  const payload = {
    resume_text: record.resume_text ?? null,
    result: record.result,
  };

  // `supabase-js` can infer table types from a generated types file; in this
  // lightweight repo we don't have those types, so cast to `any` to allow
  // inserting a plain object without a TypeScript error.
  const { data, error } = await supabase.from('reviews').insert([payload] as any).select();
  if (error) throw error;
  return data;
}

export { supabase };
