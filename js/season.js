/* js/app.js — shared loader + standings */



async function fetchJson(url){
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function loadGames(){
  const byId = new Map();

  let rookies = [];
  try {
    const r = await fetchJson(ROOKIES_URL);
    if (r && Array.isArray(r.rookies)) rookies = r.rookies;
  } catch {}

  try {
    const master = await fetchJson(DATA_URL);
    if (Array.isArray(master)) master.forEach(g => { if (g?.id) byId.set(g.id, g); });
  } catch {}

  try {
    const manifest = await fetchJson(INCOMING_URL);
    if (Array.isArray(manifest)){
      const files = await Promise.all(manifest.map(f => fetchJson('data/incoming/' + f).catch(() => null)));
      for (const raw of files){
        if (!raw) continue;
        let game;
        try { game = window.LiveStatsAdapter.adapt(raw, { rookies }); }
        catch (e) { console.warn('Bad export:', e.message); continue; }
        if (game?.id) byId.set(game.id, game);
      }
    }
  } catch {}

  return [...byId.values()];
}

function computeStandings(games){
  const table = {};
  games.filter(g => g.status === 'final').forEach(g => {
    for (const team of [g.home, g.away]) table[team] ??= { team, wins:0, losses:0, pf:0, pa:0, gp:0 };
    const homeWon = g.homeScore > g.awayScore;
    table[g.home].gp++; table[g.away].gp++;
    table[g.home].wins   += homeWon ? 1 : 0;
    table[g.home].losses += homeWon ? 0 : 1;
    table[g.away].wins   += homeWon ? 0 : 1;
    table[g.away].losses += homeWon ? 1 : 0;
    table[g.home].pf += g.homeScore; table[g.home].pa += g.awayScore;
    table[g.away].pf += g.awayScore; table[g.away].pa += g.homeScore;
  });
  return Object.values(table).map(t => ({
    ...t, diff: t.pf - t.pa, winPct: t.gp ? t.wins / t.gp : 0
  })).sort((a,b) => b.winPct - a.winPct || b.diff - a.diff || b.pf - a.pf);
}

function fmtDate(iso){
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
