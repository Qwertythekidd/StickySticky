#!/usr/bin/env python3
import atexit, fcntl, os, signal, socket, subprocess, sys, time, shutil
from pathlib import Path
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("AyatanaAppIndicator3", "0.1")
from gi.repository import Gtk, AyatanaAppIndicator3

ROOT=Path(os.environ.get("STICKY_STICKY_APP_ROOT","/usr/lib/sticky-sticky")); cache=Path(os.environ.get("XDG_CACHE_HOME",Path.home()/".cache"))/"sticky-sticky"; cache.mkdir(parents=True,exist_ok=True)
lock=open(cache/"instance.lock","w");
try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError: sys.exit("Sticky-Sticky is already running")
port=int(os.environ.get("STICKY_STICKY_PORT","8765")); data=os.environ.get("STICKY_STICKY_DATA_DIR",str(Path(os.environ.get("XDG_DATA_HOME",Path.home()/".local/share"))/"sticky-sticky")); os.makedirs(data,exist_ok=True)
config=os.environ.get("STICKY_STICKY_NATIVE_CONFIG",str(Path(os.environ.get("XDG_CONFIG_HOME",Path.home()/".config"))/"sticky-sticky"/"native.json"))
while True:
 s=socket.socket();
 try: s.bind(("127.0.0.1",port)); s.close(); break
 except OSError: s.close(); port+=1
env={**os.environ,"STICKY_STICKY_PORT":str(port),"STICKY_STICKY_DATA_DIR":data,"STICKY_STICKY_NATIVE_CONFIG":config}
if not (ROOT/"server.py").is_file():
    raise SystemExit(f"Sticky-Sticky app root is missing server.py: {ROOT}")
server=subprocess.Popen([sys.executable,"-u",str(ROOT/"server.py")],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
def server_ready():
    for _ in range(50):
        if server.poll() is not None:
            err=server.stderr.read().decode(errors="replace").strip()
            raise SystemExit(f"Sticky-Sticky backend exited during startup: {err[-500:]}")
        try:
            with socket.create_connection(("127.0.0.1",port),timeout=.1): return
        except OSError: time.sleep(.1)
    server.terminate(); raise SystemExit(f"Sticky-Sticky backend did not become ready on 127.0.0.1:{port}")
server_ready()
browser=None
def open_board(_=None):
 global browser
 if browser and browser.poll() is None: return
 chrome=os.environ.get("STICKY_STICKY_BROWSER") or next((p for p in ("brave-browser","chromium","chromium-browser") if shutil.which(p)),None)
 if not chrome: return
 browser=subprocess.Popen([chrome,"--class=sticky-sticky","--name=sticky-sticky",f"--app=http://127.0.0.1:{port}/",f"--user-data-dir={cache/'browser'}"])
def quit_app(_=None):
 if browser and browser.poll() is None: browser.terminate()
 try: browser.wait(timeout=5)
 except Exception: pass
 server.terminate(); Gtk.main_quit()
def cleanup():
    if server.poll() is None:
        server.terminate()
        try: server.wait(timeout=3)
        except subprocess.TimeoutExpired: server.kill(); server.wait(timeout=3)
atexit.register(cleanup)
indicator=AyatanaAppIndicator3.Indicator.new("sticky-sticky","sticky-sticky",AyatanaAppIndicator3.IndicatorCategory.APPLICATION_STATUS)
indicator.set_status(AyatanaAppIndicator3.IndicatorStatus.ACTIVE)
menu=Gtk.Menu()
open_item=Gtk.MenuItem(label="Open board"); open_item.connect("activate",open_board); menu.append(open_item)
quit_item=Gtk.MenuItem(label="Quit"); quit_item.connect("activate",quit_app); menu.append(quit_item)
menu.show_all()
indicator.set_menu(menu)
open_board(); Gtk.main()
