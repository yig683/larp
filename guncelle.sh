#!/usr/bin/env bash
# macOS / Linux güncelleyici. Windows için guncelle.bat.
set -e
cd "$(dirname "$0")"
git pull --ff-only
npm install --no-audit --no-fund
echo "Güncellendi. ./baslat.sh ile oyunu açabilirsiniz (istemci otomatik yeniden derlenir)."
