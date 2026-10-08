#!/usr/bin/env bash
# macOS / Linux başlatıcı. Windows için baslat.bat.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı. https://nodejs.org adresinden LTS sürümünü kurun, sonra tekrar çalıştırın."
  exit 1
fi
if ! node -e "process.exit(Number(process.versions.node.split('.')[0])>=20?0:1)"; then
  echo "Node.js sürümü eski (20 veya üstü gerekli): $(node -v). https://nodejs.org adresinden güncelleyin."
  exit 1
fi
if [ ! -d node_modules/vite ]; then
  echo "İlk kurulum: bağımlılıklar yükleniyor (birkaç dakika sürebilir)..."
  npm install --no-audit --no-fund
fi
exec node_modules/.bin/tsx tools/start.ts "$@"
