#!/bin/sh
set -e

case "${1:-}" in
  --migrate) exec ./node_modules/.bin/prisma migrate deploy ;;
  --seed) exec node dist-seed/prisma/seed.js ;;
  "") exec node dist/main.js ;;
  *) exec "$@" ;;
esac
