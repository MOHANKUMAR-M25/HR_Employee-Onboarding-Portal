#!/usr/bin/env bash
# Compile and run the ADLC demo backend with nothing but a JDK.
# Usage:  ./run.sh           (port 8080)
#         ./run.sh 9090      (custom port)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/src"
OUT="$HERE/out"

mkdir -p "$OUT"
echo "Compiling..."
find "$SRC" -name '*.java' -print0 | xargs -0 javac -d "$OUT"

PORT="${1:-8080}"
echo "Starting backend on port $PORT ..."
exec java -cp "$OUT" com.cognizant.adlc.Server "$PORT"
