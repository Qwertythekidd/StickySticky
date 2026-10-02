#!/usr/bin/env python3
import json, sqlite3, uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).parent; DB=ROOT/'notes.db'
def db():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
    c.execute('''create table if not exists notes(id text primary key,title text not null,body text not null,color text not null,stamp text not null,x real not null,y real not null,done integer not null default 0,version integer not null default 1,deleted_at text)'''); c.commit(); return c
class H(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT),**kw)
    def send_json(self,status,data):
        raw=json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_GET(self):
        if self.path=='/api/notes':
            c=db(); rows=[dict(r) for r in c.execute('select * from notes where deleted_at is null order by rowid')]; self.send_json(200,rows); c.close(); return
        super().do_GET()
    def do_POST(self):
        if self.path=='/api/notes':
            n=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0)))); n.setdefault('id',str(uuid.uuid4())); n.setdefault('version',1)
            c=db(); c.execute('insert into notes(id,title,body,color,stamp,x,y,done,version) values(?,?,?,?,?,?,?,?,?)',(n['id'],n.get('title',''),n.get('body',''),n.get('color','yellow'),n.get('stamp','✦'),n.get('x',100),n.get('y',100),int(n.get('done',0)),n['version'])); c.commit(); self.send_json(201,dict(c.execute('select * from notes where id=?',(n['id'],)).fetchone())); c.close(); return
        self.send_error(404)
    def do_PATCH(self):
        if not self.path.startswith('/api/notes/'): self.send_error(404); return
        nid=self.path.split('/')[-1]; n=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0)))); expected=n.pop('version',None); c=db(); row=c.execute('select version from notes where id=? and deleted_at is null',(nid,)).fetchone()
        if not row: self.send_error(404); return
        if expected is not None and int(expected)!=row['version']: self.send_json(409,{'error':'conflict','current_version':row['version']}); return
        allowed={k:v for k,v in n.items() if k in {'title','body','color','stamp','x','y','done'}}; sets=', '.join(f'{k}=?' for k in allowed); vals=list(allowed.values())+[nid,row['version']+1]; c.execute(f'update notes set {sets},version=? where id=?',(list(allowed.values())+[row['version']+1,nid])); c.commit(); self.send_json(200,dict(c.execute('select * from notes where id=?',(nid,)).fetchone())); c.close()
    def do_DELETE(self):
        if not self.path.startswith('/api/notes/'): self.send_error(404); return
        nid=self.path.split('/')[-1]; c=db(); c.execute("update notes set deleted_at=datetime('now'),version=version+1 where id=?",(nid,)); c.commit(); self.send_json(200,{'deleted':nid}); c.close()
if __name__=='__main__': db().close(); print('Cort board at http://127.0.0.1:8765'); ThreadingHTTPServer(('127.0.0.1',8765),H).serve_forever()
