// Admin-only link checker: detects dead links and providers that refuse framing.
// The caller's JWT must belong to an admin (checked with public.is_admin()).
import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {framingAllowed} from '../_shared/framing.ts';
import {corsHeaders, env, json} from '../_shared/http.ts';

type LinkStatus = 'unchecked' | 'ok' | 'broken' | 'embed_blocked';
interface GameRow {
  id: string;
  slug: string;
  launch_mode: 'hosted' | 'embed' | 'external';
  launch_url: string;
}

const TIMEOUT_MS = 8000;
const UA = 'EulogeArcadeLinkChecker/1.0 (+catalog health check)';
const HOSTED_MARKER = 'name="euloge-arcade-game"';

/** Only public https hosts: no IP literals, no localhost (basic SSRF guard). */
function isSafePublicUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname;
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return false;
    return true;
  } catch {
    return false;
  }
}

async function check(game: GameRow, siteUrl: string | null): Promise<{status: LinkStatus; detail: string}> {
  let target = game.launch_url;
  if (game.launch_mode === 'hosted') {
    if (!siteUrl) return {status: 'unchecked', detail: 'PUBLIC_SITE_URL non configurée : jeu hébergé non vérifié.'};
    target = new URL(game.launch_url, siteUrl).href;
  } else if (!isSafePublicUrl(target)) {
    return {status: 'broken', detail: 'URL refusée (https public uniquement).'};
  }

  let res: Response;
  try {
    res = await fetch(target, {redirect: 'follow', headers: {'User-Agent': UA}, signal: AbortSignal.timeout(TIMEOUT_MS)});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Our own site being unreachable is a configuration issue, not a dead game.
    if (game.launch_mode === 'hosted') {
      return {status: 'unchecked', detail: `Site injoignable depuis la fonction (vérifier PUBLIC_SITE_URL) : ${msg}`.slice(0, 300)};
    }
    return {status: 'broken', detail: `Injoignable : ${msg}`.slice(0, 300)};
  }

  if ([401, 403, 429, 503].includes(res.status)) {
    await res.body?.cancel();
    return {status: 'unchecked', detail: `HTTP ${res.status} : le site bloque les vérifications automatiques, contrôle manuel conseillé.`};
  }
  if (res.status >= 400) {
    await res.body?.cancel();
    return {status: 'broken', detail: `HTTP ${res.status}`};
  }

  if (game.launch_mode === 'hosted') {
    const html = await res.text();
    return html.includes(HOSTED_MARKER)
      ? {status: 'ok', detail: `HTTP ${res.status}`}
      : {status: 'broken', detail: 'Fichiers du jeu absents (page de repli servie à la place).'};
  }
  await res.body?.cancel();
  if (game.launch_mode === 'embed') {
    const ourHost = siteUrl ? new URL(siteUrl).hostname : null;
    if (!framingAllowed(res.headers, ourHost)) {
      return {status: 'embed_blocked', detail: "L'éditeur refuse désormais l'intégration (X-Frame-Options / CSP)."};
    }
  }
  return {status: 'ok', detail: `HTTP ${res.status}`};
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  try {
    const supabaseUrl = env('SUPABASE_URL');
    const caller = createClient(supabaseUrl, env('SUPABASE_ANON_KEY'), {
      global: {headers: {Authorization: req.headers.get('Authorization') ?? ''}},
    });
    const {data: isAdmin, error: roleError} = await caller.rpc('is_admin');
    if (roleError || isAdmin !== true) return json({error: 'Forbidden'}, 403);

    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || null;
    const admin = createClient(supabaseUrl, env('SUPABASE_SERVICE_ROLE_KEY'));
    const {data: games, error} = await admin.from('games').select('id, slug, launch_mode, launch_url');
    if (error) throw error;

    const results: Array<{id: string; slug: string; status: LinkStatus; detail: string}> = [];
    const queue = [...(games as GameRow[])];
    const worker = async () => {
      for (let g = queue.shift(); g; g = queue.shift()) {
        const r = await check(g, siteUrl);
        results.push({id: g.id, slug: g.slug, ...r});
        await admin
          .from('games')
          .update({link_status: r.status, link_checked_at: new Date().toISOString(), link_check_detail: r.detail.slice(0, 500)})
          .eq('id', g.id);
      }
    };
    await Promise.all(Array.from({length: 4}, worker));
    return json({results});
  } catch (e) {
    console.error(e);
    return json({error: 'Internal error'}, 500);
  }
});
