#!/bin/bash
cd "$(dirname "$0")"
case "$(uname -m)" in arm64) NODE="tools/node-mac-arm64" ;; *) NODE="tools/node-mac-x64" ;; esac
xattr -dr com.apple.quarantine . 2>/dev/null   # files unzipped from a download are quarantined; harmless otherwise
chmod +x "$NODE"
"$NODE" pc-backfill/export.js "$@"
echo
read -n 1 -s -r -p "Press any key to close this window."
