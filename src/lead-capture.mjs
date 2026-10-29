// Campaign intake is independent of Meta advertising reporting and of the offer.
export const leadCaptureModes = ['facebook_instant_form', 'ghl_funnel_form'];
export function leadCaptureMode(value) {
  return leadCaptureModes.includes(value) ? value : null;
}
export function countsLeadFrom(mode, provider) {
  const selected = leadCaptureMode(mode);
  return selected === 'facebook_instant_form' && provider === 'meta_instant_forms'
    || selected === 'ghl_funnel_form' && provider === 'ghl';
}
// A CRM contact can also originate from a Meta instant form. Only the
// campaign's selected capture source may populate its lead count.
export function connectedDayProposal(provider, mode, item) {
  if (provider === 'meta') return {spend: item.spend};
  if (provider === 'ghl') return {
    ...(countsLeadFrom(mode, 'ghl') ? {leads: item.leads} : {}),
    appointments_due: item.appointments_due,
    attended: item.attended,
  };
  return {};
}
export function leadCaptureState(value) {
  const mode = leadCaptureMode(value);
  if (mode === 'facebook_instant_form') return {
    mode, label: 'Formulaire instantané Facebook', provider: 'meta_instant_forms',
    description: 'Les demandes viennent du formulaire Facebook. La Page, le formulaire et le droit leads_retrieval doivent être vérifiés avant tout import.',
    permission: 'leads_retrieval', connected: false,
  };
  if (mode === 'ghl_funnel_form') return {
    mode, label: 'Formulaire du funnel', provider: 'ghl',
    description: 'Les demandes arrivent dans GHL. Aucun droit Meta de récupération des leads n’est requis pour ce parcours. La lecture GHL et le bon compte restent à vérifier.',
    permission: null, connected: false,
  };
  return {
    mode: null, label: 'Source des demandes à confirmer', provider: null,
    description: 'Choisissez le type de formulaire de cette campagne avant de présenter un import comme disponible.',
    permission: null, connected: false,
  };
}
