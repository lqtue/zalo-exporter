#!/bin/bash
# Builds dist/ZaloExporter-windows.zip and dist/ZaloExporter-mac.zip.
# Bundles the official Node 22 (so end users install nothing); every download is checked against nodejs.org's SHA-256 list.
set -euo pipefail
cd "$(dirname "$0")/.."
C=.cache; mkdir -p "$C" dist
V=$(curl -fsS https://nodejs.org/dist/index.json | python3 -c "import sys,json; print(next(x['version'] for x in json.load(sys.stdin) if x['version'].startswith('v22.') and x.get('lts')))")
echo "Node $V"
curl -fsS -o "$C/SHASUMS256.txt" "https://nodejs.org/dist/$V/SHASUMS256.txt"
fetch() { # fetch <path-on-nodejs.org> <local-file>
  local want; want=$(grep " $1\$" "$C/SHASUMS256.txt" | cut -d' ' -f1)
  [ -n "$want" ] || { echo "no checksum listed for $1"; exit 1; }
  if [ ! -f "$2" ] || [ "$(shasum -a 256 "$2" | cut -d' ' -f1)" != "$want" ]; then curl -fsS -o "$2" "https://nodejs.org/dist/$V/$1"; fi
  [ "$(shasum -a 256 "$2" | cut -d' ' -f1)" = "$want" ] || { echo "CHECKSUM MISMATCH for $1"; exit 1; }
}
fetch win-x64/node.exe "$C/node.exe"
for A in arm64 x64; do
  fetch "node-$V-darwin-$A.tar.gz" "$C/node-$A.tar.gz"
  mkdir -p "$C/mac-$A"; tar -xzf "$C/node-$A.tar.gz" -C "$C/mac-$A" --strip-components=2 "node-$V-darwin-$A/bin/node"
done
common() { mkdir -p "$1/tools" "$1/pc-backfill" "$1/extension"; cp pc-backfill/export.js "$1/pc-backfill/"; cp extension/{manifest.json,content.js,popup.html,popup.js} "$1/extension/"; }
crlf() { python3 -c "import sys;b=open(sys.argv[1],'rb').read().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n');open(sys.argv[2],'wb').write(b)" "$1" "$2"; }
B=$(mktemp -d); rm -f dist/ZaloExporter-*.zip
# Windows
W="$B/win/ZaloExporter"; common "$W"; cp "$C/node.exe" "$W/tools/node.exe"; crlf Export.bat "$W/Export.bat"
crlf README.md "$W/README.md"; crlf README.vi.md "$W/README.vi.md"
(cd "$B/win" && zip -qr "$OLDPWD/dist/ZaloExporter-windows.zip" ZaloExporter)
# Mac
M="$B/mac/ZaloExporter"; common "$M"; cp "$C/mac-arm64/node" "$M/tools/node-mac-arm64"; cp "$C/mac-x64/node" "$M/tools/node-mac-x64"
cp Export.command README.md README.vi.md "$M/"; chmod +x "$M/Export.command" "$M/tools/"node-mac-*
(cd "$B/mac" && zip -qr "$OLDPWD/dist/ZaloExporter-mac.zip" ZaloExporter)
rm -rf "$B"; ls -lh dist/*.zip
