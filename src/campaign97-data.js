import {campaign97Tables} from './campaign97.mjs';
const missing=new Set(['42P01','PGRST205','42883','PGRST202']);
export async function loadOfferReadiness(sb){const r=await sb.rpc('portal_offer_schema');if(r.error){if(missing.has(r.error.code))return false;throw r.error}return r.data===1}
export async function loadCampaign97(sb,ready){const out={campaign97_available:false,...Object.fromEntries(campaign97Tables.map(t=>[t,[]]))};if(!ready)return out;for(const t of campaign97Tables){for(let n=0;;n+=1000){const r=await sb.from(t).select('*').order('id').range(n,n+999);if(r.error)throw r.error;out[t].push(...r.data);if(r.data.length<1000)break}}out.campaign97_available=true;return out}
