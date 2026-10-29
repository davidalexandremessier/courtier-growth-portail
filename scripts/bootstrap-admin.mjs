// Set up the first administrator by creating their account in Supabase Auth first.
// Pass only the admin email as the argument. Secrets stay in environment variables.
import {createClient} from '@supabase/supabase-js';
try{process.loadEnvFile('.env.local')}catch{}
const email=process.argv[2]?.trim().toLowerCase();
if(!email||!email.includes('@'))throw Error('Usage : node scripts/bootstrap-admin.mjs courriel-administrateur');
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data,error}=await db.from('profiles').select('id,email').eq('email',email).single();
if(error||!data)throw Error('Crée d’abord ce compte dans Supabase Auth. Aucun administrateur ajouté.');
const result=await db.from('app_admins').upsert({user_id:data.id});if(result.error)throw result.error;
console.log('Accès administrateur attribué.');
