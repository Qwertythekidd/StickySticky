#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=${1:-0.1.0}; OUT="$ROOT/dist"; PKG="$OUT/sticky-sticky_${VERSION}_all"
rm -rf "$PKG"; mkdir -p "$PKG/DEBIAN" "$PKG/usr/lib/sticky-sticky" "$PKG/usr/bin" "$PKG/usr/share/applications"
cp "$ROOT/index.html" "$ROOT/server.py" "$ROOT/README.md" "$PKG/usr/lib/sticky-sticky/"
cp "$ROOT/packaging/sticky-sticky" "$PKG/usr/bin/sticky-sticky"; chmod 755 "$PKG/usr/bin/sticky-sticky"
cp "$ROOT/packaging/Sticky-Sticky.desktop" "$PKG/usr/share/applications/Sticky-Sticky.desktop"
cat > "$PKG/DEBIAN/control" <<EOF
Package: sticky-sticky
Version: $VERSION
Section: utils
Priority: optional
Architecture: all
Depends: python3, curl, chromium | chromium-browser
Maintainer: QWERTY the Kid <qwertythekid@gmail.com>
Description: Sticky-Sticky local draggable notes board
 A simple, draggable notes board for tracking tasks and priorities.
EOF
dpkg-deb --build "$PKG" "$OUT/sticky-sticky_${VERSION}_all.deb" >/dev/null
echo "$OUT/sticky-sticky_${VERSION}_all.deb"
