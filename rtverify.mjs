import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
  .map(l=>{const i=l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const sb  = createClient(env.NEXT_PUBLIC_SUPABASE_URL, anon);
await sb.auth.signInWithPassword({ email:'fabriziomendezalberti@gmail.com', password:'fafalasia1' });

let checkIns = 0, badges = 0;
await new Promise(res => {
  sb.channel('rt-verify')
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'check_ins' },   () => { checkIns++; })
    .on('postgres_changes', { event:'DELETE', schema:'public', table:'check_ins' },   () => { checkIns++; })
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'member_badges' },() => { badges++; })
    .subscribe(s => { if (s === 'SUBSCRIBED') res(); });
});
console.log('subscribed. inserting probe check-in...');

const { data: ins, error } = await svc.from('check_ins')
  .insert({ member_id: 7, class_name: 'RT VERIFY (auto-deleted)', class_date: '2026-08-07', source: 'admin' })
  .select('id').single();
if (error) { console.log('insert failed:', error.message); process.exit(1); }

await new Promise(r => setTimeout(r, 6000));
console.log('INSERT events:', checkIns);

await svc.from('check_ins').delete().eq('id', ins.id);
await new Promise(r => setTimeout(r, 5000));
console.log('after delete, total check_ins events:', checkIns);

// Confirm the probe row is gone, so the feed isn't left with test data.
const { count } = await svc.from('check_ins').select('*', { count:'exact', head:true })
  .eq('class_name', 'RT VERIFY (auto-deleted)');
console.log('probe rows remaining:', count);
console.log(checkIns >= 2 ? '\n=> REALTIME WORKS (insert + delete both delivered)' : '\n=> still not delivering');
process.exit(0);
