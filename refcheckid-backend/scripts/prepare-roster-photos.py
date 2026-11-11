"""Extract only the 42 verified images, outside the repository; never execute ZIP content."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

if len(sys.argv) != 4:
    raise SystemExit("Usage: python3 scripts/prepare-roster-photos.py OUTPUT_DIRECTORY CASA.zip OSPITE.zip")
output = Path(sys.argv[1]).resolve()
repository = Path(__file__).resolve().parents[2]
if output == repository or repository in output.parents:
    raise SystemExit("Photo input directory must be outside the Git repository.")
manifest = json.loads((repository / "refcheckid-backend/demo/restored-roster/manifest.json").read_text())
pending = []
for team, archive in zip(["home", "away"], sys.argv[2:], strict=True):
    expected = {Path(row["file"]).name: row for row in manifest["subjects"] if row["team"] == team}
    seen = set()
    with zipfile.ZipFile(archive) as source:
        for item in source.infolist():
            if item.is_dir():
                continue
            name = PurePosixPath(item.filename).name
            if name not in expected or name in seen or stat.S_ISLNK(item.external_attr >> 16):
                raise SystemExit("Unexpected, duplicate or symbolic-link ZIP entry: " + name)
            if item.file_size > 5 * 1024 * 1024:
                raise SystemExit("Image exceeds 5 MiB: " + name)
            data = source.read(item)
            row = expected[name]
            if len(data) != row["bytes"] or hashlib.sha256(data).hexdigest() != row["sha256"]:
                raise SystemExit("Image checksum mismatch: " + name)
            destination = output / row["file"]
            if destination.is_symlink() or (destination.exists() and destination.read_bytes() != data):
                raise SystemExit("Existing destination differs; nothing overwritten: " + str(destination))
            pending.append((destination, data))
            seen.add(name)
    if seen != set(expected):
        raise SystemExit("Missing images: " + ", ".join(sorted(set(expected) - seen)))
output.mkdir(mode=0o700, parents=True, exist_ok=True)
for destination, data in pending:
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not destination.exists():
        with destination.open("xb") as target:
            target.write(data)
        destination.chmod(0o600)
print(f"Verified and prepared {len(pending)} images in {output}. Originals unchanged; no remote uploads.")
