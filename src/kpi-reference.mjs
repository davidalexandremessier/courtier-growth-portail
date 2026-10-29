// Décision David du 19 octobre 2026 : PB13 v1.2 fait autorité pour ces deux repères.
// Les observations et versions de règles déjà enregistrées restent historiques.
export const kpiReference = Object.freeze({
  version: 'PB13 v1.2 · 2026-10-19',
  approved_on: '2026-10-19',
  document: '13. PLAYBOOK - KPI Troubleshooting',
  document_id: '1p09jkivmIlKoq8nETOseP8493qKjz52FrPAFlcI2g3k',
  sha256: 'b4da5b9365adee551da70fe79c054393260759f0208a937af4c720a7387d305d',
  booking: Object.freeze({low: .15, high: .25, numerator: 'découvertes réservées, automatiques et manuelles', denominator: 'leads distincts', location: 'partie 3, lignes 201–203'}),
  discovery_show: Object.freeze({low: .85, numerator: 'découvertes tenues', denominator: 'découvertes réservées arrivées à échéance avec issue connue', location: 'partie 3, lignes 204–206'})
});
