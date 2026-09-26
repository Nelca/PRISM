"""Extract IFVI GVFD V2 without executing macros or modifying the workbook.
Run with bundled Python (openpyxl). The combined table is reconciled with each topic sheet.
"""
from pathlib import Path
from collections import Counter
from io import BytesIO
import hashlib, json, math, zipfile
import openpyxl

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/data/research'
ARCHIVE = BASE / 'raw/ifvi-gvfd-v2.zip'
URL = 'https://ifvi.org/wp-content/uploads/2024/10/IFVI_Environmental-Methodology_Global-Value-Factor-Database.xlsm.zip'
SHEETS = {'GHG Emissions': 'GHGs', 'Water Consumption': 'Water Consumption', 'Air Pollution': 'Air Pollution', 'Waste': 'Waste', 'Land Use': 'Land Use & Conversion', 'Land Conversion': 'Land Use & Conversion', 'Water Pollution': 'Water Pollution'}
with zipfile.ZipFile(ARCHIVE) as archive:
    name, = [n for n in archive.namelist() if n.endswith('.xlsm') and not n.startswith('__MACOSX/')]
    original = archive.read(name)
(BASE / 'raw/ifvi-gvfd-v2.xlsm').write_bytes(original)
book = openpyxl.load_workbook(BytesIO(original), read_only=True, data_only=True)
assert book['Version control']['C10'].value == 'v2'
assert book['Version control']['D10'].value.isoformat()[:10] == '2025-04-03'
matrix = list(book['Global Value Factors'].values)
assert matrix[12][1:6] == ('Topic', 'Category', 'Location', 'Impact', 'Units')
assert matrix[12][-1] == 'Reference'
geographies = [dict(id=openpyxl.utils.get_column_letter(c+1), name=matrix[12][c], region=matrix[10][c], incomeClass=matrix[11][c]) for c in range(6, len(matrix[12])-1)]
assert len(geographies) == len({g['name'] for g in geographies}) == 268
metadata = {}
source_tables = {}
for sheet_name in set(SHEETS.values()):
    sheet = book[sheet_name]
    metadata[sheet_name] = dict(status=sheet['C5'].value, updatedOn=sheet['C6'].value.isoformat()[:10], priceYear=sheet['C7'].value, currency=sheet['C8'].value)
    assert metadata[sheet_name]['priceYear'] == 2023 and metadata[sheet_name]['currency'] == 'USD'
    rows = list(sheet.values)
    header = 14 if sheet_name in ('Water Consumption', 'Land Use & Conversion') else 13
    source_tables[sheet_name] = (rows, {v: i for i, v in enumerate(rows[header]) if i >= 7 and v}) if sheet_name != 'GHGs' else (rows, {})
records = []
for row_number, row in enumerate(matrix[13:], 14):
    topic, category, location, impact, unit = row[1:6]
    assert topic in SHEETS
    values = list(row[6:-1])
    assert all(v is None or (type(v) in (int, float) and math.isfinite(v) and v >= 0) for v in values)
    source_rows, source_cols = source_tables[SHEETS[topic]]
    if topic == 'GHG Emissions':
        assert all(v == book['GHGs']['D16'].value for v in values)
    else:
        source, = [r for r in source_rows if r[1:5] == row[1:5]]
        for geo, value in zip(geographies, values):
            expected = source[source_cols[geo['name']]] if geo['name'] in source_cols else None
            assert value == expected, (topic, row_number, geo['name'], value, expected)
    records.append(dict(row=row_number, topic=topic, category=category, location=location, impact=impact, sourceUnit=unit, reference=row[-1], **metadata[SHEETS[topic]], values=values))
assert len(records) == 474
assert sum(v is not None for r in records for v in r['values']) == 104832
source = dict(version='v2', versionDate='2025-04-03', acquiredOn='2026-09-24', url=URL, workbookName=name, workbookSha256=hashlib.sha256(original).hexdigest(), archiveSha256=hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(), sheet='Global Value Factors', recordCount=104832, missingCount=22200)
(BASE / 'gvfd-v2.json').write_text(json.dumps(dict(source=source, geographies=geographies, rows=records), ensure_ascii=False, separators=(',', ':')) + '\n')
(BASE / 'gvfd-v2-source.json').write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
manifest_path = BASE / 'manifest.json'
manifest = [m for m in json.loads(manifest_path.read_text()) if not m['file'].startswith('ifvi-gvfd-')]
for file in ('ifvi-gvfd-v2.zip', 'ifvi-gvfd-v2.xlsm'):
    path = BASE / 'raw' / file
    manifest.append(dict(file=file, url=URL, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), bytes=path.stat().st_size, acquiredOn=source['acquiredOn'], use='research-only'))
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(geographies=len(geographies), rows=len(records), numeric=source['recordCount'], missing=source['missingCount'], topics=Counter(r['topic'] for r in records))))
