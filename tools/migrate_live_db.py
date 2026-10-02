#!/usr/bin/env python3
"""Back up and initialize Sticky-Sticky scene settings; does not start services."""
import argparse
import datetime
import pathlib
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS scene_settings(
 id INTEGER PRIMARY KEY CHECK(id=1), preset TEXT NOT NULL DEFAULT 'window',
 frame_style TEXT NOT NULL DEFAULT 'paper', scene_width REAL NOT NULL DEFAULT 200000,
 scene_height REAL NOT NULL DEFAULT 150000, board_x REAL NOT NULL DEFAULT 9918,
 board_y REAL NOT NULL DEFAULT 7450, version INTEGER NOT NULL DEFAULT 1
)
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("db", type=pathlib.Path, nargs="?", default=pathlib.Path("notes.db"))
    ap.add_argument("--backup-dir", type=pathlib.Path, default=pathlib.Path("backups"))
    args = ap.parse_args()
    args.backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = args.backup_dir / f"notes-board-live-backup-{stamp}.db"
    src = sqlite3.connect(args.db)
    src.row_factory = sqlite3.Row
    dst = sqlite3.connect(backup)
    src.backup(dst); dst.close()
    before = {t: src.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in ("notes", "strokes", "board_settings")}
    src.execute(SCHEMA)
    existed = src.execute("SELECT 1 FROM scene_settings WHERE id=1").fetchone()
    src.execute("INSERT OR IGNORE INTO scene_settings(id) VALUES(1)")
    width, height = src.execute("SELECT width,height FROM board_settings WHERE id=1").fetchone()
    if existed is None:
        src.execute("UPDATE scene_settings SET scene_width=MAX(scene_width,?),scene_height=MAX(scene_height,?) WHERE id=1", (width + 20000, height + 20000))
    src.commit()
    after = {t: src.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in before}
    print(f"backup={backup}")
    print(f"integrity={src.execute('PRAGMA integrity_check').fetchone()[0]}")
    print(f"records_before={before} records_after={after}")
    print(f"scene={dict(src.execute('SELECT * FROM scene_settings').fetchone())}")
    print("Stop the currently running Sticky-Sticky backend manually, then relaunch it on its existing data path.")
    src.close()

if __name__ == "__main__": main()
