"""Package shareable code only. The sibling case-f-private directory is never read."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT_FILES = {'README.md', 'BRIEF.md', 'SOURCE-AUDIT.md', 'CONTRACT.md', 'VERIFICATION.md', 'package.json', '.gitignore'}
CODE_DIRS = {'core', 'preview', 'apps-script', 'paste-into-apps-script', 'scripts', 'tests'}
CODE_SUFFIXES = {'.js', '.cjs', '.gs', '.py', '.html', '.css'}

def package_sources(root, destination):
    root = Path(root).resolve()
    destination = Path(destination).resolve()
    selected = []
    for path in sorted(root.rglob('*')):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(root)
        if any(part in {'private', 'case-f-private', 'node_modules', '__pycache__', '.git'} for part in relative.parts):
            continue
        if path.name in {'attached-data.js', 'attached-data.json'}:
            continue
        allowed = len(relative.parts) == 1 and path.name in ROOT_FILES
        allowed |= relative.parts[0] in CODE_DIRS and path.suffix in CODE_SUFFIXES
        allowed |= relative.as_posix() == 'apps-script/appsscript.json'
        if allowed:
            selected.append((path, relative))
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for path, relative in selected:
            archive.write(path, root.name + '/' + relative.as_posix())
    return len(selected)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    target = args.output or args.root.parent / 'case-f-prototype.zip'
    count = package_sources(args.root, target)
    print(f'Packaged {count} code/documentation files. Private data is excluded.')
