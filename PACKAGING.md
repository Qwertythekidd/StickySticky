# Local Debian package

Build without installing: `./packaging/build-deb.sh 0.1.0`.

The package installs a desktop launcher at `/usr/bin/sticky-sticky`. It starts the loopback-only Python server, opens Chromium in its own app window, and stores notes under `${XDG_DATA_HOME:-~/.local/share}/sticky-sticky/notes.db`. Browser cache is under `${XDG_CACHE_HOME:-~/.cache}/sticky-sticky`. The existing project `notes.db` is never migrated automatically.

For a future migration, first copy the source database to the XDG target, run `PRAGMA integrity_check`, then verify the expected record count and IDs before switching the target into service. If the target already contains notes, stop and require an explicit merge/backup decision.
