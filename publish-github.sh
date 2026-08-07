#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="${1:-yosenov-patch-monitor}"
VISIBILITY="${2:-public}"

if ! command -v git >/dev/null 2>&1; then
  echo "Git belum terpasang." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) belum terpasang. Instal lalu jalankan: gh auth login" >&2
  exit 1
fi

cd "$(dirname "$0")"

if find . -type f \( \
  -iname 'service-account*.json' -o \
  -iname 'serviceAccount*.json' -o \
  -iname 'firebase-adminsdk*.json' -o \
  -iname '*-firebase-adminsdk-*.json' -o \
  -iname 'application_default_credentials.json' \
\) -print -quit | grep -q .; then
  echo "Ditemukan file service account. Proses dibatalkan." >&2
  exit 1
fi

[ -d .git ] || git init
git add .
if ! git diff --cached --quiet; then
  git commit -m "Initial commit: YOSENOV Patch Monitor"
fi
git branch -M main
gh repo create "$REPO_NAME" "--$VISIBILITY" --source . --remote origin --push

echo "Repository berhasil dibuat dan proyek telah diunggah."
