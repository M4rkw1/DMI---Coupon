import { supabaseAdmin, isAdmin } from '../../lib/supabase';
import { createProfileHandler } from '../../lib/playerProfileApi.mjs';
export default createProfileHandler({ supabaseAdmin, isAdmin });
