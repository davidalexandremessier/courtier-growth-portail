// Reversible release configuration. Re-enabling the UI never enables a send:
// the API/provider guard remains closed and no historical queue is replayed.
export const portalFeatures=Object.freeze({davidMessages:false,backgroundStats:false,sourceStatsWrites:false});
export function davidMessageAccess(){return portalFeatures.davidMessages===true}
