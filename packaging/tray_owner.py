#!/usr/bin/env python3
import atexit, fcntl, os, signal, socket, subprocess, sys
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
while True:
 s=socket.socket();
 try: s.bind(("127.0.0.1",port)); s.close(); break
 except OSError: s.close(); port+=1
env={**os.environ,"STICKY_STICKY_PORT":str(port),"STICKY_STICKY_DATA_DIR":data}
server=subprocess.Popen([sys.executable,"-u",str(ROOT/"server.py")],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
browser=None
def open_board(_=None):
 global browser
 if browser and browser.poll() is None: return
 chrome=os.environ.get("STICKY_STICKY_BROWSER") or next((p for p in ("brave-browser","chromium","chromium-browser") if __import__('shutil').which(p)),None)
 if not chrome: return
 browser=subprocess.Popen([chrome,"--class=sticky-sticky","--name=sticky-sticky",f"--app=http://127.0.0.1:{port}/",f"--user-data-dir={cache/'browser'}"])
def quit_app(_=None):
 if browser and browser.poll() is None: browser.terminate()
 try: browser.wait(timeout=5)
 except Exception: pass
 server.terminate(); Gtk.main_quit()
atexit.register(lambda: server.poll() is None and server.terminate())
indicator=AyatanaAppIndicator3.Indicator.new("sticky-sticky","sticky-sticky",AyatanaAppIndicator3.IndicatorCategory.APPLICATION_STATUS); indicator.set_status(AyatanaAppIndicator3.IndicatorStatus.ACTIVE); indicator.set_menu((lambda m:(m.append((lambda a:(a.connect("activate",open_board),a)[1])(Gtk.MenuItem(label="Open board"))),m.append((lambda a:(a.connect("activate",quit_app),a)[1])(Gtk.MenuItem(label="Quit"))),m.show_all(),m)[1])(Gtk.Menu()))
open_board(); Gtk.main()
