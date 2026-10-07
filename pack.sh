#!/usr/bin/env bash
# gnome-extensions pack (GNOME 46+) copies schema XML and does not compile it.
# Installers that only unzip then fail looking for schemas/gschemas.compiled.
set -euo pipefail

cd "$(dirname "$0")"

out_dir="."
force=()
extra=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--out-dir)
      out_dir="$2"
      shift 2
      ;;
    -f|--force)
      force=(--force)
      shift
      ;;
    *)
      extra+=("$1")
      shift
      ;;
  esac
done

glib-compile-schemas --strict schemas

gnome-extensions pack \
  --extra-source=lib \
  --extra-source=icons \
  --extra-source=LICENSE \
  --extra-source=README.md \
  "${extra[@]}" \
  "${force[@]}" \
  --out-dir="$out_dir"

uuid=$(python3 -c 'import json; print(json.load(open("metadata.json"))["uuid"])')
zip_path="$out_dir/${uuid}.shell-extension.zip"

python3 - "$zip_path" <<'PY'
import sys
import zipfile

path, name = sys.argv[1], "schemas/gschemas.compiled"
with zipfile.ZipFile(path, "a") as archive:
    archive.write(name, name)
PY

echo "Packed $zip_path"
