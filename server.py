#!/usr/bin/env python3
"""HTTP/SQLite backend for Sticky-Sticky."""
import json, math, os, sqlite3, uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
STATIC_ROOT = ROOT / "dist" if (ROOT / "dist" / "index.html").is_file() else ROOT
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
    CREATE TABLE IF NOT EXISTS scene_settings(id INTEGER PRIMARY KEY CHECK(id=1),preset TEXT NOT NULL DEFAULT 'window',frame_style TEXT NOT NULL DEFAULT 'paper',scene_width REAL NOT NULL DEFAULT 200000,scene_height REAL NOT NULL DEFAULT 150000,board_x REAL NOT NULL DEFAULT 9918,board_y REAL NOT NULL DEFAULT 7450,version INTEGER NOT NULL DEFAULT 1);
    """)
    if "cleared_at" not in {r[1] for r in c.execute("PRAGMA table_info(notes)").fetchall()}:
        c.execute("ALTER TABLE notes ADD COLUMN cleared_at TEXT")
    if "note_id" not in {r[1] for r in c.execute("PRAGMA table_info(strokes)").fetchall()}:
        c.execute("ALTER TABLE strokes ADD COLUMN note_id TEXT")
    c.execute("INSERT OR IGNORE INTO board_settings(id) VALUES(1)")
    scene_exists = c.execute("SELECT 1 FROM scene_settings WHERE id=1").fetchone()
    c.execute("INSERT OR IGNORE INTO scene_settings(id) VALUES(1)")
    b = c.execute("SELECT width,height FROM board_settings WHERE id=1").fetchone()
    if scene_exists is None:
        c.execute("UPDATE scene_settings SET scene_width=MAX(scene_width,?),scene_height=MAX(scene_height,?) WHERE id=1", (b[0] + 20000, b[1] + 20000))
    c.commit(); return c

def utc_now(): return datetime.now(timezone.utc).isoformat()

def _seg_dist(a, b, p):
    dx, dy = b[0]-a[0], b[1]-a[1]
    if dx == dy == 0: return math.hypot(p[0]-a[0], p[1]-a[1]), 0
    t = max(0, min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy)/(dx*dx+dy*dy)))
    q = (a[0]+t*dx, a[1]+t*dy)
    return math.hypot(p[0]-q[0], p[1]-q[1]), t

def erase_polyline(points, eraser, radius):
    """Return untouched polyline fragments after swept capsule erasing."""
    if len(points) < 2: return []
    out, cur = [], []
    def flush():
        nonlocal cur
        if len(cur) > 1: out.append(cur)
        cur = []
    for a, b in zip(points, points[1:]):
        da, ta = _seg_dist(a, b, eraser[0]); db, tb = _seg_dist(a, b, eraser[1])
        hit = min(da, db) <= radius or _seg_dist(eraser[0], eraser[1], a)[0] <= radius or _seg_dist(eraser[0], eraser[1], b)[0] <= radius
        if hit:
            flush()
        else:
            if not cur: cur = [a]
            cur.append(b)
    flush(); return out

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, db_path=DB, **kwargs): self.db_path = db_path; super().__init__(*args, directory=str(STATIC_ROOT), **kwargs)
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
        if p == ["api","notes"]: out = [dict(r) for r in c.execute("SELECT * FROM notes WHERE deleted_at IS NULL AND cleared_at IS NULL ORDER BY rowid")]
        elif p == ["api","trash"]: out = [dict(r) for r in c.execute("SELECT * FROM notes WHERE deleted_at IS NOT NULL AND cleared_at IS NULL ORDER BY rowid")]
        elif p == ["api","board"]: out = dict(c.execute("SELECT title,subtitle,width,height,version FROM board_settings WHERE id=1").fetchone())
        elif p == ["api","scene"]: out = dict(c.execute("SELECT preset,frame_style,scene_width,scene_height,board_x,board_y,version FROM scene_settings WHERE id=1").fetchone())
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
        elif p == ["api","strokes","batch"]:
            originals = payload.get("originals", []); fragments = payload.get("fragments", [])
            try:
                c.execute("BEGIN IMMEDIATE")
                for item in originals:
                    row = c.execute("SELECT version FROM strokes WHERE id=? AND deleted_at IS NULL", (item["id"],)).fetchone()
                    if row is None or int(item.get("version", row[0])) != row[0]: raise ValueError("conflict")
                now = utc_now()
                for item in originals: c.execute("UPDATE strokes SET deleted_at=?,version=version+1 WHERE id=?", (now,item["id"]))
                made=[]
                for item in fragments:
                    sid=item.get("id",str(uuid.uuid4())); note_id=item.get("note_id")
                    if note_id is not None and c.execute("SELECT 1 FROM notes WHERE id=?", (note_id,)).fetchone() is None: raise ValueError("invalid_note_id")
                    c.execute("INSERT INTO strokes(id,points,color,width,note_id) VALUES(?,?,?,?,?)",(sid,json.dumps(item["points"]),item["color"],float(item["width"]),note_id)); made.append(sid)
                c.commit(); self.send_json(201,{"fragments":[dict(c.execute("SELECT * FROM strokes WHERE id=?",(sid,)).fetchone()) for sid in made]})
            except ValueError as e: c.rollback(); self.send_json(409 if str(e)=="conflict" else 400,{"error":str(e)})
        elif p == ["api","strokes"]:
            if not isinstance(payload.get("points"), list): self.send_json(400,{"error":"points_required"})
            else:
                sid = payload.get("id",str(uuid.uuid4())); note_id = payload.get("note_id");
                if note_id is not None and c.execute("SELECT 1 FROM notes WHERE id=?", (note_id,)).fetchone() is None: self.send_json(400,{"error":"invalid_note_id"}); c.close(); return
                c.execute("INSERT INTO strokes(id,points,color,width,note_id) VALUES(?,?,?,?,?)",(sid,json.dumps(payload["points"]),payload.get("color","#000"),float(payload.get("width",2)),note_id)); c.commit(); out = dict(c.execute("SELECT * FROM strokes WHERE id=?",(sid,)).fetchone()); out["points"] = json.loads(out["points"]); self.send_json(201,out)
        else: self.send_error(404)
        c.close()
    def do_PUT(self):
        if self.parts() == ["api","scene"]: return self.put_scene()
        if self.parts() != ["api","board"]: self.send_error(404); return
        payload = self.read_body()
        if payload is None: return
        c = db(self.db_path); row = c.execute("SELECT * FROM board_settings WHERE id=1").fetchone(); scene = c.execute("SELECT * FROM scene_settings WHERE id=1").fetchone()
        if payload.get("version") is not None and int(payload["version"]) != row["version"]: self.send_json(409,{"error":"conflict","current_version":row["version"]})
        else:
            vals = {k:payload[k] for k in ("title","subtitle","width","height") if k in payload}
            for key in ("width", "height"):
                if key in vals:
                    try: value = float(vals[key])
                    except (TypeError, ValueError): value = 0
                    if not math.isfinite(value) or value < 400 or value > 10000000:
                        self.send_json(400, {"error": f"invalid_{key}"}); c.close(); return
            limits = {"width": scene["scene_width"] - scene["board_x"] - 1600, "height": scene["scene_height"] - scene["board_y"] - 1100}
            # Never shrink the board around active content; deleted rows are excluded.
            notes = c.execute("SELECT x,y FROM notes WHERE deleted_at IS NULL").fetchall()
            strokes = c.execute("SELECT points,width FROM strokes WHERE deleted_at IS NULL AND note_id IS NULL").fetchall()
            min_w = max([float(n[0]) + 235 + 36 for n in notes] or [400])
            min_h = max([float(n[1]) + 174 + 36 for n in notes] or [400])
            for s in strokes:
                pts = json.loads(s[0]); pad = float(s[1]) / 2 + 18
                if pts: min_w = max(min_w, max(float(p[0]) for p in pts) + pad); min_h = max(min_h, max(float(p[1]) for p in pts) + pad)
            for key, minimum in (("width", min_w), ("height", min_h)):
                if key in vals and float(vals[key]) < minimum:
                    self.send_json(400, {"error": f"board_{key}_clips_content", "min": minimum}); c.close(); return
            for key, limit in limits.items():
                if key in vals and float(vals[key]) > limit:
                    self.send_json(400, {"error": f"board_{key}_outside_scene", "max": limit}); c.close(); return
            if vals: c.execute("UPDATE board_settings SET " + ",".join(f"{k}=?" for k in vals) + ",version=version+1 WHERE id=1", (*vals.values(),)); c.commit()
            self.send_json(200,dict(c.execute("SELECT title,subtitle,width,height,version FROM board_settings WHERE id=1").fetchone()))
        c.close()
    def put_scene(self):
        payload = self.read_body()
        if payload is None: return
        c = db(self.db_path); row = c.execute("SELECT * FROM scene_settings WHERE id=1").fetchone()
        if payload.get("version") is not None and int(payload["version"]) != row["version"]:
            self.send_json(409,{"error":"conflict","current_version":row["version"]}); c.close(); return
        allowed = {"preset","frame_style","scene_width","scene_height","board_x","board_y"}
        vals = {k:payload[k] for k in allowed if k in payload}
        if vals.get("preset") not in (None,"window","sunset") or vals.get("frame_style") not in (None,"paper","wood","mint"):
            self.send_json(400,{"error":"invalid_scene_style"}); c.close(); return
        for key in ("scene_width","scene_height"):
            if key in vals and (not isinstance(vals[key],(int,float)) or not math.isfinite(vals[key]) or vals[key] < 1600 or vals[key] > 10000000):
                self.send_json(400,{"error":f"invalid_{key}"}); c.close(); return
        if vals.get("scene_width",row["scene_width"]) < row["board_x"] + 1600 or vals.get("scene_height",row["scene_height"]) < row["board_y"] + 1100:
            self.send_json(400,{"error":"scene_smaller_than_board"}); c.close(); return
        if vals:
            c.execute("UPDATE scene_settings SET " + ",".join(f"{k}=?" for k in vals) + ",version=version+1 WHERE id=1", (*vals.values(),)); c.commit()
        self.send_json(200,dict(c.execute("SELECT preset,frame_style,scene_width,scene_height,board_x,board_y,version FROM scene_settings WHERE id=1").fetchone())); c.close()
    def do_PATCH(self):
        p = self.parts(); payload = self.read_body()
        if payload is None: return
        if len(p) != 3 or p[:2] != ["api", p[1]] or p[1] not in {"notes","strokes"}: self.send_error(404); return
        table, item = p[1], p[2]; c = db(self.db_path); row = c.execute(f"SELECT * FROM {table} WHERE id=?",(item,)).fetchone()
        if row is None or (row["deleted_at"] is not None and not payload.get("restore")): self.send_error(404); c.close(); return
        if payload.get("version") is not None and int(payload["version"]) != row["version"]: self.send_json(409,{"error":"conflict","current_version":row["version"]}); c.close(); return
        allowed = {"title","body","color","stamp","x","y","done"} if table == "notes" else {"points","color","width"}; vals = {k:payload[k] for k in allowed if k in payload}
        if table == "notes" and payload.get("clear"): vals["cleared_at"] = utc_now()
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
