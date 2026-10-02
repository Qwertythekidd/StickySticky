#!/usr/bin/env python3
"""HTTP/SQLite backend for Sticky-Sticky."""
import json, math, os, sqlite3, uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
DATA = Path(os.environ.get("STICKY_STICKY_DATA_DIR", Path(os.environ.get("XDG_DATA_HOME", Path.home()/".local/share")) / "sticky-sticky"))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / "notes.db"
MAX_BODY = 1_000_000

def db(path=DB):
    c = sqlite3.connect(path); c.row_factory = sqlite3.Row
    c.executescript("""
    CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,color TEXT NOT NULL,stamp TEXT NOT NULL,x REAL NOT NULL,y REAL NOT NULL,done INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,deleted_at TEXT);
    CREATE TABLE IF NOT EXISTS board_settings(id INTEGER PRIMARY KEY CHECK(id=1),title TEXT NOT NULL DEFAULT '',subtitle TEXT NOT NULL DEFAULT '',width REAL NOT NULL DEFAULT 1600,height REAL NOT NULL DEFAULT 900,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS strokes(id TEXT PRIMARY KEY,points TEXT NOT NULL,color TEXT NOT NULL,width REAL NOT NULL,version INTEGER NOT NULL DEFAULT 1,deleted_at TEXT);
    """)
    c.execute("INSERT OR IGNORE INTO board_settings(id) VALUES(1)"); c.commit(); return c

def utc_now(): return datetime.now(timezone.utc).isoformat()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, db_path=DB, **kwargs): self.db_path = db_path; super().__init__(*args, directory=str(ROOT), **kwargs)
    def send_json(self, status, value):
        raw = json.dumps(value, separators=(",", ":")).encode(); self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY: self.send_json(413, {"error":"body_too_large"}); return None
        try: value = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, UnicodeDecodeError): self.send_json(400, {"error":"invalid_json"}); return None
        if not isinstance(value, dict): self.send_json(400, {"error":"object_required"}); return None
        return value
    def parts(self): return [p for p in urlparse(self.path).path.split("/") if p]
    def do_GET(self):
        p = self.parts(); c = db(self.db_path)
        if p == ["api","notes"]: out = [dict(r) for r in c.execute("SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY rowid")]
        elif p == ["api","board"]: out = dict(c.execute("SELECT title,subtitle,width,height,version FROM board_settings WHERE id=1").fetchone())
        elif p == ["api","strokes"]:
            out = [dict(r) for r in c.execute("SELECT * FROM strokes WHERE deleted_at IS NULL ORDER BY rowid")]
            for r in out: r["points"] = json.loads(r["points"])
        else: c.close(); return super().do_GET()
        c.close(); self.send_json(200, out)
    def do_POST(self):
        p = self.parts(); payload = self.read_body()
        if payload is None: return
        c = db(self.db_path)
        if p == ["api","notes"]:
            n = {"id":str(uuid.uuid4()),"title":"","body":"","color":"yellow","stamp":"✦","x":100,"y":100,"done":0,"version":1}
            n.update({k:payload[k] for k in n if k in payload and k not in {"id","version"}})
            c.execute("INSERT INTO notes(id,title,body,color,stamp,x,y,done,version) VALUES(?,?,?,?,?,?,?,?,?)", tuple(n.values())); c.commit(); out = dict(c.execute("SELECT * FROM notes WHERE id=?",(n["id"],)).fetchone()); self.send_json(201,out)
        elif p == ["api","strokes"]:
            if not isinstance(payload.get("points"), list): self.send_json(400,{"error":"points_required"})
            else:
                sid = payload.get("id",str(uuid.uuid4())); c.execute("INSERT INTO strokes(id,points,color,width) VALUES(?,?,?,?)",(sid,json.dumps(payload["points"]),payload.get("color","#000"),float(payload.get("width",2)))); c.commit(); out = dict(c.execute("SELECT * FROM strokes WHERE id=?",(sid,)).fetchone()); out["points"] = json.loads(out["points"]); self.send_json(201,out)
        else: self.send_error(404)
        c.close()
    def do_PUT(self):
        if self.parts() != ["api","board"]: self.send_error(404); return
        payload = self.read_body()
        if payload is None: return
        c = db(self.db_path); row = c.execute("SELECT * FROM board_settings WHERE id=1").fetchone()
        if payload.get("version") is not None and int(payload["version"]) != row["version"]: self.send_json(409,{"error":"conflict","current_version":row["version"]})
        else:
            vals = {k:payload[k] for k in ("title","subtitle","width","height") if k in payload}
            for key in ("width", "height"):
                if key in vals:
                    try: value = float(vals[key])
                    except (TypeError, ValueError): value = 0
                    if not math.isfinite(value) or value < 400 or value > 10000000:
                        self.send_json(400, {"error": f"invalid_{key}"}); c.close(); return
            if vals: c.execute("UPDATE board_settings SET " + ",".join(f"{k}=?" for k in vals) + ",version=version+1 WHERE id=1", (*vals.values(),)); c.commit()
            self.send_json(200,dict(c.execute("SELECT title,subtitle,width,height,version FROM board_settings WHERE id=1").fetchone()))
        c.close()
    def do_PATCH(self):
        p = self.parts(); payload = self.read_body()
        if payload is None: return
        if len(p) != 3 or p[:2] != ["api", p[1]] or p[1] not in {"notes","strokes"}: self.send_error(404); return
        table, item = p[1], p[2]; c = db(self.db_path); row = c.execute(f"SELECT * FROM {table} WHERE id=?",(item,)).fetchone()
        if row is None or (row["deleted_at"] is not None and not payload.get("restore")): self.send_error(404); c.close(); return
        if payload.get("version") is not None and int(payload["version"]) != row["version"]: self.send_json(409,{"error":"conflict","current_version":row["version"]}); c.close(); return
        allowed = {"title","body","color","stamp","x","y","done"} if table == "notes" else {"points","color","width"}; vals = {k:payload[k] for k in allowed if k in payload}
        if "points" in vals: vals["points"] = json.dumps(vals["points"])
        if payload.get("restore"): vals["deleted_at"] = None
        if vals: c.execute(f"UPDATE {table} SET " + ",".join(f"{k}=?" for k in vals) + ",version=version+1 WHERE id=?", (*vals.values(),item)); c.commit()
        out = dict(c.execute(f"SELECT * FROM {table} WHERE id=?",(item,)).fetchone());
        if table == "strokes": out["points"] = json.loads(out["points"])
        self.send_json(200,out); c.close()
    def do_DELETE(self):
        p = self.parts()
        if len(p) != 3 or p[:2] not in (["api","strokes"],["api","notes"]): self.send_error(404); return
        table = p[1]; c = db(self.db_path); row = c.execute(f"SELECT version FROM {table} WHERE id=? AND deleted_at IS NULL",(p[2],)).fetchone()
        if row is None: self.send_error(404); c.close(); return
        c.execute(f"UPDATE {table} SET deleted_at=?,version=version+1 WHERE id=?",(utc_now(),p[2])); c.commit(); self.send_json(200,{"deleted":p[2],"version":row["version"]+1}); c.close()

if __name__ == "__main__":
    db().close(); port = int(os.environ.get("STICKY_STICKY_PORT",8765)); print(f"Sticky-Sticky at http://127.0.0.1:{port}"); ThreadingHTTPServer(("127.0.0.1",port),Handler).serve_forever()
