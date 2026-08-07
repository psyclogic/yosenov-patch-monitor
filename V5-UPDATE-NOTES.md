# YOSENOV V5 — Staged Laptop Sync

- Scanning Steam folders no longer adds every detected game to Firestore.
- Games already present in the YOSENOV library are matched by Steam App ID and their local build is updated automatically.
- Games not already in the library stay only in browser memory as scan candidates.
- New candidates can be added individually by clicking their title or Add to library.
- Multiple candidates can be selected and added together.
- Refreshing or clearing scan results discards candidates that were not added.
- Deleting a game from YOSENOV will not cause it to be re-added automatically on the next laptop scan.
