# Sticky-Sticky

A simple, draggable notes board for tracking tasks and priorities.

Local-only sticky-note board. Start with `python3 server.py`, then open http://127.0.0.1:8765.

`notes.db` is SQLite and records include durable IDs, positions, version numbers, and recoverable deletion timestamps. The `/api/notes/:id` PATCH route rejects stale `version` values with HTTP 409, so task-mediated updates cannot silently overwrite a newer edit. The server binds only to loopback.
# Staging inbox

External clients can stage a note without inventing board coordinates:

```sh
python3 tools/sticky-stage.py --server http://127.0.0.1:8765 --title "Next idea" --body "Explore this" --color blue
```

Use an explicit `--server` target. Port `8765` is the development-server default; the installed launcher chooses an available loopback port, so installed clients should use the launcher’s configured `STICKY_STICKY_PORT` or a separately managed server URL rather than guessing `8765`.

The application polls `GET /api/staged-notes`, and placement uses `PATCH /api/staged-notes/:id` with `{ "place": true, "x": ..., "y": ..., "version": ... }`. Placement is version-checked and removes the staged item only after creating the placed note.
