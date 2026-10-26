import shutil
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
src_fonts = root / "assets" / "creator-subtitle-fonts"
dst_fonts = root / "apps" / "desktop" / ".pack" / "creator-runtime" / "vishnuai" / "fonts"
dst_lic = root / "apps" / "desktop" / ".pack" / "creator-runtime" / "vishnuai" / "licenses" / "fonts"

manifest = json.loads((src_fonts / "manifest.json").read_text(encoding="utf-8"))

for f in manifest["fonts"] + manifest["fallbackFonts"]:
    fname = Path(f["desktopFile"]).name
    shutil.copy2(src_fonts / f["desktopFile"], dst_fonts / fname)

dst_lic.mkdir(parents=True, exist_ok=True)
for lic in manifest["licenses"]:
    lname = Path(lic["file"]).name
    shutil.copy2(src_fonts / lic["file"], dst_lic / lname)

rm_path = dst_fonts / "manifest.json"
if rm_path.exists():
    rm = json.loads(rm_path.read_text(encoding="utf-8"))
    rm["fonts"] = [
        {
            "preset": f.get("preset"),
            "weight": f.get("weight"),
            "weightValue": f.get("weightValue"),
            "family": f["family"],
            "fullName": f["fullName"],
            "file": f"fonts/{Path(f['desktopFile']).name}",
            "sha256": f["desktopSha256"],
            "license": f"licenses/fonts/{Path(f['license']).name}",
        }
        for f in manifest["fonts"]
    ]
    rm["fallbackFonts"] = [
        {
            "scripts": f["scripts"],
            "sample": f["sample"],
            "family": f["family"],
            "fullName": f["fullName"],
            "file": f"fonts/{Path(f['desktopFile']).name}",
            "sha256": f["desktopSha256"],
            "license": f"licenses/fonts/{Path(f['license']).name}",
        }
        for f in manifest["fallbackFonts"]
    ]
    rm_path.write_text(json.dumps(rm, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

print("Runtime fonts synchronized successfully!")
