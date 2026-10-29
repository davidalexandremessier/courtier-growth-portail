// Une seule fonction serveur pour OAuth (limite Hobby de 12 fonctions).
import clientOAuth from '../server/oauth-client-handler.mjs';
import agencyOAuth from '../server/agency-oauth-handler.mjs';
import wisprMetadata from '../server/wispr-metadata-handler.mjs';
export default function handler(req,res){
 const url=new URL(req.url,'https://portal.invalid'),route=url.searchParams.get('route');
 if(route==='agency'||url.pathname.endsWith('/agency-oauth'))return agencyOAuth(req,res);
 if(route==='wispr-metadata'||url.pathname.endsWith('/wispr-client-metadata'))return wisprMetadata(req,res);
 return clientOAuth(req,res);
}
