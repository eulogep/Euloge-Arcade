// Deletes the calling user's account. All personal rows cascade (FK on delete cascade);
// avatar files are removed from storage first.
import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {corsHeaders, env, json} from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (req.method !== 'POST') return json({error: 'Method not allowed'}, 405);

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({error: 'Unauthorized'}, 401);
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const {data, error} = await admin.auth.getUser(token);
    if (error || !data.user) return json({error: 'Unauthorized'}, 401);
    const userId = data.user.id;

    const {data: files} = await admin.storage.from('avatars').list(userId, {limit: 1000});
    if (files?.length) {
      await admin.storage.from('avatars').remove(files.map((f) => `${userId}/${f.name}`));
    }
    const {error: delError} = await admin.auth.admin.deleteUser(userId);
    if (delError) throw delError;
    return json({deleted: true});
  } catch (e) {
    console.error(e);
    return json({error: 'Internal error'}, 500);
  }
});
