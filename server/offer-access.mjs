import {hasCapability} from '../src/entitlements.mjs';
import {CallError,must} from './calls.mjs';
export async function requireClientCapability(db,clientId,capability){const client=must(await db.from('clients').select('id,offer').eq('id',clientId).single());if(!client||typeof client.offer!=='string'||!client.offer.trim()||!hasCapability(client.offer,capability))throw new CallError('Cet accès ne fait pas partie de l’offre attribuée au dossier.',403);return client}
