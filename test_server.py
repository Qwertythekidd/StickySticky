import json, tempfile, threading, unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path
import server

class BackendTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); path = Path(self.tmp.name) / 'notes.db'
        c = server.db(path); c.execute("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?)", ('legacy','Old','kept','blue','✦',4,5,0,7,None)); c.commit(); c.close()
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), lambda *a, **kw: server.Handler(*a, db_path=path, **kw)); self.thread = threading.Thread(target=self.http.serve_forever, daemon=True); self.thread.start(); self.conn = HTTPConnection(*self.http.server_address)
    def tearDown(self): self.http.shutdown(); self.http.server_close(); self.tmp.cleanup()
    def request(self, method, path, body=None):
        raw = None if body is None else json.dumps(body)
        self.conn.request(method, path, raw, {'Content-Type':'application/json'} if raw else {})
        r = self.conn.getresponse(); return r.status, json.loads(r.read())
    def test_board_and_notes_preserved(self):
        status, notes = self.request('GET','/api/notes'); self.assertEqual(status,200); self.assertEqual(notes[0]['version'],7)
        status, board = self.request('PUT','/api/board', {'title':'Plan','subtitle':'Week','width':1200,'height':700,'version':1}); self.assertEqual(status,200); self.assertEqual(board['width'],1200)
        self.assertEqual(self.request('GET','/api/board')[1]['title'],'Plan')
    def test_stroke_lifecycle_and_conflict(self):
        status, stroke = self.request('POST','/api/strokes', {'points':[[1,2],[3,4]],'color':'red','width':4}); self.assertEqual(status,201); sid=stroke['id']
        self.assertEqual(self.request('PATCH',f'/api/strokes/{sid}', {'points':[[9,9]],'version':1})[1]['version'],2)
        self.assertEqual(self.request('PATCH',f'/api/strokes/{sid}', {'version':1})[0],409)
        self.assertEqual(self.request('DELETE',f'/api/strokes/{sid}')[0],200); self.assertEqual(self.request('GET','/api/strokes')[1],[])
        self.assertEqual(self.request('PATCH',f'/api/strokes/{sid}', {'restore':True,'version':3})[0],200); self.assertEqual(len(self.request('GET','/api/strokes')[1]),1)
    def test_scene_defaults_persist_conflict_and_validation(self):
        self.request('PUT','/api/board', {'width':160000,'height':110000,'version':1})
        status, scene = self.request('GET','/api/scene'); self.assertEqual(status,200); self.assertGreaterEqual(scene['scene_width'],160000); self.assertGreaterEqual(scene['scene_height'],110000)
        payload = {'preset':'sunset','frame_style':'wood','scene_width':220000,'scene_height':170000,'board_x':30000,'board_y':30000,'version':scene['version']}
        self.assertEqual(self.request('PUT','/api/scene',payload)[0],200); fresh=self.request('GET','/api/scene')[1]; self.assertEqual(fresh['preset'],'sunset')
        self.assertEqual(self.request('PUT','/api/scene',{'preset':'window','version':scene['version']})[0],409)
        self.assertEqual(self.request('PUT','/api/scene',{'scene_width':float('inf'),'version':fresh['version']})[0],400)
        self.assertEqual(self.request('PUT','/api/scene',{'scene_width':1000,'version':fresh['version']})[0],400)

if __name__ == '__main__': unittest.main()
