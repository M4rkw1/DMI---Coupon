import { supabaseAdmin, isAdmin } from '../../lib/supabase';
import { createAnnualLeagueHandler } from '../../lib/annualLeagueApi.mjs';

export default createAnnualLeagueHandler({supabaseAdmin,isAdmin});
