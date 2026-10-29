export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Méthode non permise.'});
 const appUrl=process.env.APP_URL;
 if(!appUrl||!req.headers.origin||req.headers.origin!==new URL(appUrl).origin)return res.status(403).json({error:'Origine non autorisée.'});
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!token)return res.status(401).json({error:'Connexion requise.'});
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY)return res.status(503).json({error:'Portail non configuré.'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const response=await fetch(process.env.SUPABASE_URL+'/functions/v1/portal-access',{method:'POST',headers:{'Content-Type':'application/json',apikey:process.env.SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token},body:JSON.stringify({action:'invite',clientId:body?.clientId,memberId:body?.memberId,memberEmail:body?.memberEmail,mode:body?.mode==='recovery'?'recovery':'invite',redirectTo:appUrl+'/'})});
  return res.status(response.status).json(await response.json());
 }catch{return res.status(502).json({error:'Service d’invitation indisponible.'})}
}
