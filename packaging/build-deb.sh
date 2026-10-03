#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VERSION=${1:-0.1.0}; OUT="$ROOT/dist"; PKG="$ROOT/.pkg/sticky-sticky_${VERSION}_all"
rm -rf "$PKG"; mkdir -p "$PKG/DEBIAN" "$PKG/usr/lib/sticky-sticky" "$PKG/usr/bin" "$PKG/usr/share/applications" "$PKG/usr/share/icons/hicolor/scalable/apps" "$PKG/usr/share/icons/hicolor/16x16/apps" "$PKG/usr/share/icons/hicolor/24x24/apps" "$PKG/usr/share/icons/hicolor/32x32/apps"
cp "$ROOT/server.py" "$ROOT/README.md" "$PKG/usr/lib/sticky-sticky/"
cp -R "$ROOT/dist/." "$PKG/usr/lib/sticky-sticky/"
cp "$ROOT/packaging/sticky-sticky" "$PKG/usr/bin/sticky-sticky"; chmod 755 "$PKG/usr/bin/sticky-sticky"
cp "$ROOT/packaging/Sticky-Sticky.desktop" "$PKG/usr/share/applications/Sticky-Sticky.desktop"
cp "$ROOT/public/sticky-sticky.svg" "$PKG/usr/share/icons/hicolor/scalable/apps/sticky-sticky.svg"
cp "$ROOT/public/sticky-sticky-16.png" "$PKG/usr/share/icons/hicolor/16x16/apps/sticky-sticky.png"
cp "$ROOT/public/sticky-sticky-24.png" "$PKG/usr/share/icons/hicolor/24x24/apps/sticky-sticky.png"
cp "$ROOT/public/sticky-sticky-32.png" "$PKG/usr/share/icons/hicolor/32x32/apps/sticky-sticky.png"
cat > "$PKG/DEBIAN/control" <<EOF
Package: sticky-sticky
Version: $VERSION
Section: utils
Priority: optional
Architecture: all
Depends: python3, curl, brave-browser | chromium | chromium-browser
Maintainer: QWERTY the Kid <qwertythekid@gmail.com>
Description: Sticky-Sticky local draggable notes board
 A simple, draggable notes board for tracking tasks and priorities.
EOF
dpkg-deb --build "$PKG" "$OUT/sticky-sticky_${VERSION}_all.deb" >/dev/null
echo "$OUT/sticky-sticky_${VERSION}_all.deb"
