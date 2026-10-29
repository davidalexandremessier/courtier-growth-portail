export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const configured=!!(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY);
 res.status(200).json({url:process.env.SUPABASE_URL||'',key:process.env.SUPABASE_PUBLISHABLE_KEY||'',emailRecoveryEnabled:configured,configured});
}
