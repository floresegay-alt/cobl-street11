#!/usr/bin/env python3
"""
COBL Season Stats Builder (automated)

Usage:
  python build_season_stats.py                  # reads ./games/*.json
  python build_season_stats.py path/to/folder   # custom folder
  python build_season_stats.py game1.json game2.json

Outputs:
  season-stats.json   (upload to GitHub repo root)

Optional:
  --update-schedule   also write scores into schedule.json when matchup matches
  --schedule path     path to schedule.json (default: ./schedule.json)
"""

import argparse
import json
import re
import sys
from pathlib import Path

TEAM_ALIASES = {
    1: ["team 1", "green", "team 1 - green", "team1"],
    2: ["team 2", "black", "team 2 - black", "team2"],
    3: ["team 3", "white", "team 3 - white", "team3"],
    4: ["team 4", "blue", "team 4 - blue", "team4"],
    5: ["team 5", "orange", "team 5 - orange", "team5"],
    6: ["team 6", "red", "team 6 - red", "team6", "redbulls", "red bulls"],
    7: ["team 7", "gold", "team 7 - gold", "gold/yellow", "team7"],
    8: ["team 8", "gray", "grey", "team 8 - gray", "team8"],
    9: ["team 9", "teal", "team 9 - teal", "team9"],
    10: ["team 10", "purple", "banaag", "team 10 - purple", "team purple", "team10"],
    11: ["team 11", "maroon", "champs", "team 11 - maroon", "team11"],
}

OFFICIAL = {
    1: "Team 1 - Green",
    2: "Team 2 - Black",
    3: "Team 3 - White",
    4: "Team 4 - Blue",
    5: "Team 5 - Orange",
    6: "Team 6 - Red",
    7: "Team 7 - Gold",
    8: "Team 8 - Gray",
    9: "Team 9 - Teal",
    10: "Team 10 - Purple",
    11: "Team 11 - Maroon",
}


def pts(p):
    return p.get("fgm2", 0) * 2 + p.get("fgm3", 0) * 3 + p.get("ftm", 0) + (p.get("manualPts") or 0)


def reb(p):
    return p.get("oreb", 0) + p.get("dreb", 0)


def eff(p):
    return (
        pts(p)
        + reb(p)
        + p.get("ast", 0)
        + p.get("stl", 0)
        + p.get("blk", 0)
        - ((p.get("fga2", 0) + p.get("fga3", 0)) - (p.get("fgm2", 0) + p.get("fgm3", 0)))
        - (p.get("fta", 0) - p.get("ftm", 0))
        - p.get("to", 0)
    )


def resolve_team(name: str):
    if not name:
        return None
    n = name.strip().lower()
    m = re.search(r"team\s*(\d+)", n)
    if m:
        tid = int(m.group(1))
        if 1 <= tid <= 11:
            return tid
    for tid, aliases in TEAM_ALIASES.items():
        for a in aliases:
            if a in n or n in a:
                return tid
    return None


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def is_game_data(j):
    return isinstance(j, dict) and "teams" in j and "A" in j["teams"] and "B" in j["teams"]


def is_season_stats(j):
    return isinstance(j, dict) and "games" in j and isinstance(j["games"], list)


def game_from_data(j, file_name=""):
    rows = []
    scores = {}
    team_ids = {}
    for side in ("A", "B"):
        t = j["teams"][side]
        name = t.get("name") or side
        tid = resolve_team(name)
        team_label = f"Team {tid}" if tid else name
        team_ids[side] = tid
        total = 0
        for p in t.get("players") or []:
            p_pts = pts(p)
            total += p_pts
            used = (p.get("secondsPlayed") or 0) > 0 or (
                p_pts + reb(p) + p.get("ast", 0) + p.get("stl", 0) + p.get("blk", 0) + p.get("to", 0) > 0
            )
            if not used:
                continue
            rows.append(
                {
                    "team": team_label,
                    "num": str(p.get("num", "")),
                    "name": p.get("name") or "",
                    "pts": p_pts,
                    "reb": reb(p),
                    "ast": p.get("ast", 0),
                    "stl": p.get("stl", 0),
                    "eff": eff(p),
                    "min": int((p.get("secondsPlayed") or 0) // 60),
                }
            )
        scores[side] = total

    id_str = f"{j['teams']['A'].get('name','A')} vs {j['teams']['B'].get('name','B')} {scores['A']}-{scores['B']}"
    return {
        "id": id_str,
        "rows": rows,
        "scoreA": scores["A"],
        "scoreB": scores["B"],
        "teamA": team_ids.get("A"),
        "teamB": team_ids.get("B"),
        "nameA": j["teams"]["A"].get("name"),
        "nameB": j["teams"]["B"].get("name"),
        "source": file_name,
    }


def collect_files(paths):
    files = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            files.extend(sorted(path.glob("*.json")))
        elif path.is_file():
            files.append(path)
    return files


def main():
    ap = argparse.ArgumentParser(description="Build season-stats.json from game-data files")
    ap.add_argument("inputs", nargs="*", default=["games"], help="game-data JSON files or folders")
    ap.add_argument("-o", "--output", default="season-stats.json", help="output path")
    ap.add_argument("--existing", default=None, help="existing season-stats.json to merge into")
    ap.add_argument("--update-schedule", action="store_true", help="write scores into schedule.json")
    ap.add_argument("--schedule", default="schedule.json", help="schedule.json path")
    args = ap.parse_args()

    files = collect_files(args.inputs)
    if not files:
        print("No JSON files found. Put game-data files in ./games/ or pass paths.", file=sys.stderr)
        sys.exit(1)

    games_by_id = {}

    existing_path = Path(args.existing) if args.existing else Path(args.output)
    if existing_path.is_file():
        try:
            prev = load_json(existing_path)
            if is_season_stats(prev):
                for g in prev["games"]:
                    games_by_id[g["id"]] = g
                print(f"Loaded {len(prev['games'])} existing game(s) from {existing_path}")
        except Exception as e:
            print(f"Warning: could not read existing {existing_path}: {e}")

    added = 0
    skipped = 0
    for path in files:
        try:
            j = load_json(path)
        except Exception as e:
            print(f"Skip {path.name}: invalid JSON ({e})")
            skipped += 1
            continue

        if is_season_stats(j):
            for g in j["games"]:
                games_by_id[g["id"]] = g
            print(f"Merged season file {path.name}: {len(j['games'])} game(s)")
            continue

        if not is_game_data(j):
            print(f"Skip {path.name}: not game-data or season-stats format")
            skipped += 1
            continue

        g = game_from_data(j, path.name)
        out_game = {"id": g["id"], "rows": g["rows"]}
        out_game["_meta"] = {
            "scoreA": g["scoreA"],
            "scoreB": g["scoreB"],
            "teamA": g["teamA"],
            "teamB": g["teamB"],
            "nameA": g["nameA"],
            "nameB": g["nameB"],
        }
        games_by_id[g["id"]] = out_game
        mapped = f"Team {g['teamA']}" if g["teamA"] else g["nameA"]
        mapped_b = f"Team {g['teamB']}" if g["teamB"] else g["nameB"]
        print(f"OK  {path.name}: {mapped} {g['scoreA']} - {g['scoreB']} {mapped_b}  ({len(g['rows'])} players)")
        added += 1

    out_games = []
    for g in games_by_id.values():
        out_games.append({"id": g["id"], "rows": g["rows"]})

    out_path = Path(args.output)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump({"games": out_games}, f, indent=2)
    print(f"\nWrote {out_path} with {len(out_games)} game(s) ({added} new/updated, {skipped} skipped)")
    print("Upload this file to your GitHub repo root as season-stats.json")

    if args.update_schedule:
        sched_path = Path(args.schedule)
        if not sched_path.is_file():
            print(f"No schedule at {sched_path}; skip schedule update")
            return
        sched = load_json(sched_path)
        updated = 0
        for g in games_by_id.values():
            meta = g.get("_meta") or {}
            ta, tb = meta.get("teamA"), meta.get("teamB")
            sa, sb = meta.get("scoreA"), meta.get("scoreB")
            if not ta or not tb or sa is None:
                continue
            for sg in sched.get("games", []):
                if sg.get("teamA") == ta and sg.get("teamB") == tb and sg.get("status") == "Scheduled":
                    sg["scoreA"] = sa
                    sg["scoreB"] = sb
                    sg["status"] = "Final"
                    sg["winner"] = OFFICIAL[ta] if sa > sb else (OFFICIAL[tb] if sb > sa else "Draw")
                    updated += 1
                    break
                if sg.get("teamA") == tb and sg.get("teamB") == ta and sg.get("status") == "Scheduled":
                    sg["scoreA"] = sb
                    sg["scoreB"] = sa
                    sg["status"] = "Final"
                    sg["winner"] = OFFICIAL[tb] if sb > sa else (OFFICIAL[ta] if sa > sb else "Draw")
                    updated += 1
                    break
        with sched_path.open("w", encoding="utf-8") as f:
            json.dump(sched, f, indent=2)
        print(f"Updated {updated} schedule row(s) in {sched_path}")


if __name__ == "__main__":
    main()
