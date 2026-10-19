import { createClient } from '@supabase/supabase-js';

const cfg = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
const url = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith('PEGA') ? cfg.SUPABASE_URL : import.meta.env.VITE_SUPABASE_URL;
const key = cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith('PEGA') ? cfg.SUPABASE_ANON_KEY : import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && key);
export const supabase = configurado ? createClient(url, key) : null;
