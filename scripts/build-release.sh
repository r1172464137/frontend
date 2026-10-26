#!/usr/bin/env bash
# Build the four established frontend artifacts without modifying checked-in env files.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${1:-"$ROOT/release"}
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
VERSION=$(node -p "require('$ROOT/package.json').version")
COMMIT=$(git -C "$ROOT" rev-parse HEAD)
export VERSION COMMIT
# Leave dist/ in the normal same-origin mode for local deployment after packaging.
for PREFIX in /api ''; do
    for APP in admin user; do
        (cd "$ROOT/apps/$APP" && VITE_API_BASE_URL= VITE_API_PREFIX="$PREFIX" bun run build)
        DIST="$ROOT/apps/$APP/dist"
        export APP PREFIX DIST
        node <<'JS'
const fs = require('node:fs')
const path = require('node:path')
fs.writeFileSync(path.join(process.env.DIST, 'deployment-info.json'), JSON.stringify({
  repository: 'r1172464137/frontend',
  version: process.env.VERSION,
  commit: process.env.COMMIT,
  application: process.env.APP,
  api_prefix: process.env.PREFIX,
}, null, 2) + '\n')
JS
        # Scan this exact build candidate before creating any archive from it.
        node "$ROOT/scripts/check-release-dist.mjs" "$DIST"
        SUFFIX=''; [ -z "$PREFIX" ] || SUFFIX='-with-api'
        ARCHIVE="$OUT/ppanel-$APP-web$SUFFIX.tar.gz"
        tar -czf "$ARCHIVE" -C "$DIST" .
        # Check each effective archive, not just the build's exit status.
        tar -tzf "$ARCHIVE" > "$OUT/.archive-contents-$APP$SUFFIX.txt"
        grep -qx './index.html' "$OUT/.archive-contents-$APP$SUFFIX.txt"
        if [ -z "$PREFIX" ]; then
            python3 - "$DIST" "$OUT/ppanel-$APP-web.zip" <<'PY'
from pathlib import Path
import sys, zipfile
root=Path(sys.argv[1]); target=Path(sys.argv[2])
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(root.rglob('*')):
        if p.is_file(): z.write(p,p.relative_to(root).as_posix())
with zipfile.ZipFile(target) as z:
    assert 'index.html' in z.namelist()
    assert z.testzip() is None
PY
        fi
    done
done
(
    cd "$OUT"
    sha256sum ppanel-admin-web.tar.gz ppanel-user-web.tar.gz \
        ppanel-admin-web-with-api.tar.gz ppanel-user-web-with-api.tar.gz \
        ppanel-admin-web.zip ppanel-user-web.zip > SHA256SUMS
    sha256sum -c SHA256SUMS
)
printf 'FRONTEND_RELEASE_READY version=%s commit=%s output=%s\n' "$VERSION" "$COMMIT" "$OUT"
