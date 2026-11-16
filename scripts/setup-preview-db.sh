#!/usr/bin/env bash
# Apply Prisma schema to the PREVIEW database only.
# Usage (on the preview API host or locally with preview credentials):
#   cp .env.preview.example .env.preview
#   # edit DATABASE_URL to the preview MySQL DB
#   ./scripts/setup-preview-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:-.env.preview}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.preview.example and set preview DATABASE_URL."
  exit 1
fi

# shellcheck disable=SC1090
set -a
# Load only DATABASE_URL-related lines safely via node (no secrets printed)
DATABASE_URL="$(node -e "
const fs=require('fs');
const t=fs.readFileSync(process.argv[1],'utf8');
const m=t.match(/^DATABASE_URL=(.*)$/m);
if(!m){ process.stderr.write('DATABASE_URL not found\\n'); process.exit(1); }
let v=m[1].trim();
if((v[0]==='\"'&&v.endsWith('\"'))||(v[0]===\"'\"&&v.endsWith(\"'\"))) v=v.slice(1,-1);
process.stdout.write(v);
" "$ENV_FILE")"
set +a

HOST="$(node -e "const u=new URL(process.env.DATABASE_URL.replace(/^mysql:\\/\\//,'http://')); process.stdout.write(u.hostname + u.pathname);" )"
echo "Pushing Prisma schema to preview DB → $HOST"
export DATABASE_URL
npx prisma db push
echo "Preview schema OK. Start the preview API with this same env (never production)."
