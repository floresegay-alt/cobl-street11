# COBL JSON automation

## Season stats (standings + player stats)

1. After each game, save the Live Stats export as JSON into the `games/` folder  
   Example names: `game-2027-01-30-black-vs-maroon.json`

2. Run:

```bash
python tools/build_season_stats.py games
```

3. Upload the generated **`season-stats.json`** to the GitHub repo root.

### Merge with existing totals

```bash
python tools/build_season_stats.py games --existing season-stats.json -o season-stats.json
```

### Also mark winners on the schedule

```bash
python tools/build_season_stats.py games --update-schedule --schedule schedule.json
```

Then upload both `season-stats.json` and `schedule.json`.

## Team auto-mapping

The script recognizes names like:
- Team 1 / Green / Team 1 - Green
- Purple / Banaag / Team 10
- Champs / Maroon / Team 11
- Redbulls → Team 6 - Red


## GitHub Actions (fully automated)

1. Upload these to your repo:
   - `.github/workflows/build-season-stats.yml`
   - `tools/build_season_stats.py`
   - empty `games/` folder (with `.gitkeep`)

2. After each game, upload the export into `games/` on GitHub  
   (web UI: Add file → Upload files, or `git add games && git push`)

3. Actions runs automatically and commits **`season-stats.json`**

4. Refresh Standings / Players on the site

Manual run: GitHub → Actions → **Build Season Stats** → Run workflow  
(optional: set `update_schedule` to true to write scores into `schedule.json`)
