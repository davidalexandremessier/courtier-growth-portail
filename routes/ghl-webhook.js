import {handleBuyerWebhook} from '../server/ghl-buyer-webhook.mjs';

export default function handler(req, res){
 return handleBuyerWebhook(req, res);
}
