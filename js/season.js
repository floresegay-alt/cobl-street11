/* js/season.js — season MVP + Rookie races */
(function (global) {
  'use strict';
  function blank(){ return { gp:0, min:0, pts:0, reb:0, ast:0, stl:0, blk:0, eff:0 }; }

  function tallyPlayers(games){
    const map = new Map();
    for (const g of games){
      if (g.status !== 'final') continue;
      for (const p of g.boxScore || []){
        const key = `${p.team}::${p.number}`;
        if (!map.has(key)) map.set(key, {
          team: p.team, number: p.number, name: p.name,
          isRookie: !!p.isRookie, ...blank()
        });
        const row = map.get(key);
        row.name = p.name;
        row.isRookie = row.isRookie || !!p.isRookie;
        row.gp++;  row.min += p.min||0;  row.pts += p.pts||0;
        row.reb += p.reb||0; row.ast += p.ast||0;
        row.stl += p.stl||0; row.blk += p.blk||0;
        row.eff += p.eff||0;
      }
    }
    return [...map.values()];
  }

  function rank(rows){
    return rows.slice().sort((a,b) =>
      b.eff - a.eff || b.pts - a.pts || b.reb - a.reb || a.name.localeCompare(b.name));
  }

  function races(games){
    const all = tallyPlayers(games);
    return { mvp: rank(all), rookies: rank(all.filter(p => p.isRookie)) };
  }

  global.SeasonRaces = { races, tallyPlayers, rank };
})(window);
