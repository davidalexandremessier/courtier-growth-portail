// Public OAuth metadata only; no credentials or private data.
export default function handler(req,res){
 if(req.method!=='GET')return res.status(405).end();
 let origin;try{const u=new URL(process.env.APP_URL);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin}catch{return res.status(503).json({error:'Configuration indisponible.'})}
 res.setHeader('Cache-Control','public, max-age=300');
 return res.status(200).json({client_id:origin+'/api/wispr-client-metadata',client_name:'Courtier Growth — Rencontres administrateur',client_uri:origin,redirect_uris:[origin+'/api/agency-oauth?callback=wispr'],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'});
}
