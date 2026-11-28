/* js/livestats-adapter.js
   Converts a COBL x Street 11 live-stats export (game-data.json)
   into the website's game schema. Joins rookies by fuzzy name match.
*/
(function (global) {
  'use strict';

  const ROOKIE_ALIASES = {
    "TRAVEL":   "Travel Zi Han",
    "PARAGAS":  "Paragas Ramil De Guzman",
    "PADILLA":  "Jude Padilla",
    "SOMBILLO": "Glenn Sombillo"
  };

  function normalizeName(s){
    return String(s || '')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function makeRookieMatcher(rookieNames, aliases){
    const list = (rookieNames || []).map(normalizeName);
    const set  = new Set(list);
    const alias = {};
    for (const [short, full] of Object.entries(aliases || {})){
      alias[normalizeName(short)] = normalizeName(full);
    }
    return function isRookie(name){
      const n = normalizeName(name);
      if (!n) return false;
      if (alias[n] && set.has(alias[n])) return true;
      if (set.has(n)) return true;
      const tokens = n.split(' ');
      if (tokens.length === 1){
        const hits = list.filter(r => r.split(' ').includes(tokens[0]));
        if (hits.length === 1) return true;
      }
      return list.some(r => r.startsWith(n + ' ') || r.endsWith(' ' + n) || r.includes(' ' + n + ' '));
    };
  }

  function num(v){ return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
  function playerPts(p){ return num(p.fgm2)*2 + num(p.fgm3)*3 + num(p.ftm) + num(p.manualPts); }
  function playerReb(p){ return num(p.oreb) + num(p.dreb); }
  function playerEff(p){
    const pts = playerPts(p);
    const reb = playerReb(p);
    const fga = num(p.fga2) + num(p.fga3);
    const fgm = num(p.fgm2) + num(p.fgm3);
    const miss = (fga - fgm) + (num(p.fta) - num(p.ftm));
    return pts + reb + num(p.ast) + num(p.stl) + num(p.blk) - miss - num(p.to);
  }
  function teamTotals(team){
    let pts=0, reb=0, ast=0, fga=0, fgm=0;
    for (const p of team.players || []){
      pts += playerPts(p);
      reb += playerReb(p);
      ast += num(p.ast);
      fga += num(p.fga2) + num(p.fga3);
      fgm += num(p.fgm2) + num(p.fgm3);
    }
    return { pts, reb, ast, fgPct: fga ? +((fgm / fga) * 100).toFixed(1) : 0 };
  }

  function slug(s){
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function adapt(raw, opts = {}){
    if (!raw || !raw.teams || !raw.teams.A || !raw.teams.B){
      throw new Error('Not a live-stats export: missing teams.A / teams.B');
    }
    const isRookie = makeRookieMatcher(opts.rookies || [], opts.aliases || ROOKIE_ALIASES);

    const home = raw.teams.A, away = raw.teams.B;
    const H = teamTotals(home), Aw = teamTotals(away);

    const meta = {
      date:   opts.meta?.date   ?? raw.meta?.date   ?? new Date().toISOString().slice(0,10),
      time:   opts.meta?.time   ?? raw.meta?.time   ?? '',
      venue:  opts.meta?.venue  ?? raw.meta?.venue  ?? 'Street 11 Court',
      season: opts.meta?.season ?? raw.meta?.season ?? 3
    };

    const boxScore = [];
    const pushPlayers = (team, teamName) => {
      for (const p of team.players || []){
        const played = num(p.secondsPlayed) > 0
                    || playerPts(p) > 0
                    || playerReb(p) + num(p.ast) + num(p.stl) + num(p.blk) + num(p.to) > 0;
        if (!played) continue;
        boxScore.push({
          team: teamName, number: p.num, name: p.name,
          min: +(num(p.secondsPlayed) / 60).toFixed(1),
          pts: playerPts(p), reb: playerReb(p), ast: num(p.ast),
          stl: num(p.stl) || null, blk: num(p.blk) || null,
          eff: playerEff(p), isRookie: isRookie(p.name)
        });
      }
    };
    pushPlayers(home, home.name);
    pushPlayers(away, away.name);

    const winnerName = H.pts >= Aw.pts ? home.name : away.name;
    const candidates = boxScore.filter(p => p.team === winnerName);
    const pogRow = (candidates.length ? candidates : boxScore)
      .slice().sort((a, b) => b.eff - a.eff || b.pts - a.pts)[0] || null;

    const playerOfTheGame = pogRow ? {
      team: pogRow.team, number: pogRow.number, name: pogRow.name,
      line: { min: pogRow.min, pts: pogRow.pts, reb: pogRow.reb, ast: pogRow.ast, eff: pogRow.eff },
      isRookie: pogRow.isRookie
    } : null;

    const teamStats = {
      [home.name]: { fgPct: H.fgPct,  reb: H.reb,  ast: H.ast  },
      [away.name]: { fgPct: Aw.fgPct, reb: Aw.reb, ast: Aw.ast }
    };

    const id = opts.meta?.id || `${meta.date}-${slug(home.name)}-vs-${slug(away.name)}`;
    const recap = opts.recap ?? raw.meta?.recap ?? buildRecap({
      homeName: home.name, awayName: away.name,
      homeScore: H.pts, awayScore: Aw.pts,
      date: meta.date, pog: playerOfTheGame,
      homeTotals: H, awayTotals: Aw
    });

    return {
      id, date: meta.date, time: meta.time, venue: meta.venue, season: meta.season,
      home: home.name, away: away.name,
      homeScore: H.pts, awayScore: Aw.pts,
      status: 'final', playerOfTheGame, teamStats, boxScore, recap
    };
  }

  function buildRecap({ homeName, awayName, homeScore, awayScore, date, pog, homeTotals, awayTotals }){
    const d = new Date(date + 'T00:00:00').toLocaleDateString('en-US',
      { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    const winner = homeScore >= awayScore ? homeName : awayName;
    const loser  = homeScore >= awayScore ? awayName : homeName;
    const hi = Math.max(homeScore, awayScore), lo = Math.min(homeScore, awayScore);
    let s = `${winner} took down ${loser} ${hi}-${lo} with a ${hi - lo}-point margin on ${d}.`;
    if (pog){
      s += ` ${pog.name} led with ${pog.line.pts} points, ${pog.line.reb} rebounds, and ${pog.line.ast} assists (${pog.line.eff} EFF).`;
    }
    s += ` As a team, ${homeName} shot ${homeTotals.fgPct}% with ${homeTotals.reb} rebounds and ${homeTotals.ast} assists; ` +
         `${awayName} answered at ${awayTotals.fgPct}%, ${awayTotals.reb} boards, and ${awayTotals.ast} assists.`;
    return s;
  }

  global.LiveStatsAdapter = {
    adapt, playerPts, playerReb, playerEff, teamTotals,
    makeRookieMatcher, normalizeName, ROOKIE_ALIASES
  };
})(window);