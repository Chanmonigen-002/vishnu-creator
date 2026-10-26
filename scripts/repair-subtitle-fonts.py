import io
import json
import hashlib
import subprocess
from pathlib import Path
from fontTools.ttLib import TTFont

REPO_ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = REPO_ROOT / 'assets' / 'creator-subtitle-fonts'
DESKTOP_DIR = ASSETS_DIR / 'desktop'
MANIFEST_PATH = ASSETS_DIR / 'manifest.json'
RUNTIME_FONTS_DIR = REPO_ROOT / 'apps' / 'desktop' / '.pack' / 'creator-runtime' / 'vishnuai' / 'fonts'

FONTS_TO_REBUILD = [
    ('OpenCreatorSans-Medium.ttf', 'VishnuCreatorSans-Medium.ttf', 'VishnuCreator Sans Medium', 'VishnuCreator-Sans-Medium', 500),
    ('OpenCreatorSans-Bold.ttf', 'VishnuCreatorSans-Bold.ttf', 'VishnuCreator Sans Bold', 'VishnuCreator-Sans-Bold', 700),
    ('OpenCreatorSerif-Regular.ttf', 'VishnuCreatorSerif-Regular.ttf', 'VishnuCreator Serif Regular', 'VishnuCreator-Serif-Regular', 400),
    ('OpenCreatorSerif-Medium.ttf', 'VishnuCreatorSerif-Medium.ttf', 'VishnuCreator Serif Medium', 'VishnuCreator-Serif-Medium', 500),
    ('OpenCreatorSerif-Bold.ttf', 'VishnuCreatorSerif-Bold.ttf', 'VishnuCreator Serif Bold', 'VishnuCreator-Serif-Bold', 700),
]

with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
    manifest = json.load(f)

for orig_file, new_file, full_name, ps_name, weight in FONTS_TO_REBUILD:
    print(f'Rebuilding {new_file} from {orig_file}...')
    raw = subprocess.check_output(['git', 'show', f'0b5323e:assets/creator-subtitle-fonts/desktop/{orig_file}'], cwd=str(REPO_ROOT))
    font = TTFont(io.BytesIO(raw))
    name_table = font['name']
    for record in name_table.names:
        text = str(record)
        text = text.replace('OpenCreator Sans Medium', full_name)
        text = text.replace('OpenCreator Sans Bold', full_name)
        text = text.replace('OpenCreator Serif Regular', full_name)
        text = text.replace('OpenCreator Serif Medium', full_name)
        text = text.replace('OpenCreator Serif Bold', full_name)
        text = text.replace('OpenCreator', 'VishnuCreator')
        record.string = text.encode('utf-16-be' if record.platformID == 3 else 'utf-8')
    
    font['OS/2'].usWeightClass = weight
    
    buf = io.BytesIO()
    font.save(buf)
    data = buf.getvalue()
    
    dest_path = DESKTOP_DIR / new_file
    dest_path.write_bytes(data)
    
    sha256 = hashlib.sha256(data).hexdigest()
    print(f'Wrote {dest_path} ({len(data)} bytes, sha256={sha256})')
    
    # Update manifest
    for entry in manifest['fonts']:
        if entry['desktopFile'] == f'desktop/{new_file}':
            entry['desktopSha256'] = sha256
            break
    
    # Also update runtime fonts if directory exists
    if RUNTIME_FONTS_DIR.exists():
        runtime_dest = RUNTIME_FONTS_DIR / new_file
        runtime_dest.write_bytes(data)
        print(f'Updated runtime font {runtime_dest}')

with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write('\n')

# Also update runtime manifest if present
runtime_manifest_path = RUNTIME_FONTS_DIR / 'manifest.json'
if runtime_manifest_path.exists():
    with open(runtime_manifest_path, 'r', encoding='utf-8') as f:
        rm = json.load(f)
    for entry in rm.get('fonts', []):
        filename = Path(entry['file']).name
        for orig_file, new_file, _, _, _ in FONTS_TO_REBUILD:
            if filename == new_file:
                for mf_entry in manifest['fonts']:
                    if mf_entry['desktopFile'] == f'desktop/{new_file}':
                        entry['sha256'] = mf_entry['desktopSha256']
    with open(runtime_manifest_path, 'w', encoding='utf-8') as f:
        json.dump(rm, f, indent=2, ensure_ascii=False)
        f.write('\n')

print('Font repair complete!')
