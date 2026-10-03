#!/usr/bin/env python3
"""Stage notes without coordinates: python tools/sticky-stage.py --server http://127.0.0.1:8765 --title ... --body ..."""
import argparse, json, urllib.request
p=argparse.ArgumentParser(); p.add_argument('--server',required=True); p.add_argument('--title',default=''); p.add_argument('--body',default=''); p.add_argument('--color',default='yellow'); a=p.parse_args()
data=json.dumps({'title':a.title,'body':a.body,'color':a.color}).encode(); req=urllib.request.Request(a.server.rstrip('/')+'/api/staged-notes',data=data,headers={'Content-Type':'application/json'},method='POST')
with urllib.request.urlopen(req) as r: print(r.read().decode())
