#!/bin/zsh
set -eu
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd -- "$(dirname -- "$0")"
echo 'Запускаю локальную РМ ОС с отдельной тестовой базой.'
echo 'Адрес: http://127.0.0.1:4194/objects'
exec python3 scripts/local-dev.py start
