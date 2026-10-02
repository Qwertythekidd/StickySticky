# Sticky-Sticky

A simple, draggable notes board for tracking tasks and priorities.

Local-only sticky-note board. Start with `python3 server.py`, then open http://127.0.0.1:8765.

`notes.db` is SQLite and records include durable IDs, positions, version numbers, and recoverable deletion timestamps. The `/api/notes/:id` PATCH route rejects stale `version` values with HTTP 409, so task-mediated updates cannot silently overwrite a newer edit. The server binds only to loopback.
