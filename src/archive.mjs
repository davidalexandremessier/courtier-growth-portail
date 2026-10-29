const nameKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// A title may suggest a dossier, never assign it or expose a transcript to a client.
export function suggestedClient(source,clients){if(source.client_id)return null;const title=nameKey(source.title);if(!title||title.split(' ').length<2)return null;const candidates=clients.filter(c=>nameKey(c.name)===title);return candidates.length===1?candidates[0]:null}
