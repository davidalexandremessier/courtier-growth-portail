// Couche d'affichage V3 : réorganise l'écran déjà rendu, sans toucher aux données ni aux actions.
// Les boutons existants sont déplacés (pas recréés), donc leurs gestionnaires restent actifs.
const PAGES = [['follow', 'Suivi'], ['numbers', 'Chiffres'], ['meetings', 'Rencontres'], ['team', 'Équipe'], ['access', 'Accès']];
const tz = {timeZone: 'America/Toronto'};
const when = iso => {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return new Intl.DateTimeFormat('fr-CA', {weekday: 'long', day: 'numeric', month: 'long', ...tz}).format(d) + ', ' +
    new Intl.DateTimeFormat('fr-CA', {hour: 'numeric', minute: '2-digit', ...tz}).format(d);
};
const h1 = () => document.querySelector('#main h1')?.textContent?.trim() || '';

function currentPage() {
  const t = h1();
  if (t === 'Mes chiffres') return 'numbers';
  if (t === 'Rencontres' || document.querySelector('#main .detail-head')) return 'meetings';
  if (t === 'Accès et connexions') return 'access';
  if (document.querySelector('#main .broker')) return 'team';
  return 'follow';
}

// Dossier client (vue David) : la ligne de liens devient des onglets.
function pills() {
  const crumb = document.querySelector('#main p.crumb');
  if (!crumb || crumb.dataset.v3 || !crumb.querySelector('[data-act="page:agency"]')) return;
  crumb.dataset.v3 = '1';
  const back = crumb.querySelector('[data-act="page:agency"]');
  back.textContent = '‹ Clients à suivre';
  const nav = document.createElement('nav');
  nav.className = 'pills';
  nav.setAttribute('aria-label', 'Dossier client');
  const cur = currentPage();
  for (const [id, label] of PAGES) {
    const b = crumb.querySelector(`[data-act="page:${id}"]`);
    if (!b) continue;
    b.className = '';
    b.textContent = label;
    if (id === cur) b.setAttribute('aria-current', 'page');
    nav.append(b);
  }
  for (const s of crumb.querySelectorAll('span')) s.remove();
  crumb.after(nav);
}

// Clients à suivre : trois sections claires.
function groups() {
  if (h1() !== 'Clients à suivre') return;
  const card = document.querySelector('#main section.card > ul.list');
  if (!card || card.dataset.v3) return;
  card.dataset.v3 = '1';
  const rows = [...card.querySelectorAll(':scope > li.client-row')];
  const bucket = li => {
    const c = li.querySelector('.why .chip');
    if (c?.classList.contains('red')) return 0;
    if (c?.classList.contains('green') || /Activité seulement/.test(c?.textContent || '')) return 2;
    return 1;
  };
  const defs = [['Urgent', 'Bloqué ou en retard', 'red'], ['À surveiller', 'Signal ou chiffres à compléter', 'yellow'], ['Tout va bien', 'Repères atteints', 'green']];
  const host = card.closest('section.card');
  const frag = document.createDocumentFragment();
  defs.forEach(([title, sub, chip], i) => {
    const mine = rows.filter(r => bucket(r) === i);
    const sec = document.createElement('section');
    sec.className = 'card';
    sec.innerHTML = `<div class="section-head"><div><h2></h2><p class="muted small"></p></div><span class="chip ${chip}"></span></div>`;
    sec.querySelector('h2').textContent = title;
    sec.querySelector('p').textContent = sub;
    sec.querySelector('.chip').textContent = String(mine.length);
    if (mine.length) {
      const ul = document.createElement('ul');
      ul.className = 'list';
      ul.dataset.v3 = '1';
      for (const r of mine) {
        const n = r.querySelector('h2');
        if (n) { const h = document.createElement('h3'); h.textContent = n.textContent; n.replaceWith(h); }
        ul.append(r);
      }
      sec.append(ul);
    } else {
      sec.insertAdjacentHTML('beforeend', '<p class="empty">Aucun client.</p>');
    }
    frag.append(sec);
  });
  host.replaceWith(frag);
}

// Rencontres à associer : dates lisibles, une carte par rencontre.
function queue() {
  for (const s of document.querySelectorAll('#main details > summary')) {
    if (s.dataset.v3) continue;
    s.dataset.v3 = '1';
    s.textContent = s.textContent.replace(/\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:\d\d)/g, m => when(m));
  }
  for (const a of document.querySelectorAll('#main section.card > article')) {
    if (a.dataset.v3) continue;
    a.dataset.v3 = '1';
    a.classList.add('queue-item');
  }
}

function enhance() {
  try { pills(); groups(); queue(); } catch { /* l'affichage d'origine reste utilisable */ }
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const start = () => {
    const app = document.getElementById('app');
    if (!app) return;
    new MutationObserver(enhance).observe(app, {childList: true});
    enhance();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
