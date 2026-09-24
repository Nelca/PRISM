"""Read-only source extraction. Run with the bundled Python (openpyxl, pypdf)."""
from pathlib import Path
import hashlib,json,math
import openpyxl
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[2]
base=ROOT/'docs/data/research'
w=openpyxl.load_workbook(base/'raw/esvd-december-2020.xlsx',read_only=True,data_only=True)
rows=w['ESVD December 2020'].values
keys=next(rows); records=[]
for rownum,row in enumerate(rows,2):
 if row[0] is None: continue
 r=dict(zip(keys,row)); value=r['INT$_2020_ha_yr_all']
 records.append(dict(id=str(r['ValueID']),row=rownum,country=str(r['Country'] or ''),biome=str(r['Biome'] or ''),service=str(r['ES_Text'] or ''),cices=str(r['CICES'] or ''),method=str(r['Valuation_Method'] or ''),value=value if isinstance(value,(float,int)) and math.isfinite(value) else None,reference=str(r['Reference'] or ''),reviewed=bool(str(r['Reviewer'] or '').strip())))
assert len(records)==4808
(base/'esvd-2020.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
manifest=[]
urls={
 'esvd-december-2020.xlsx':'https://www.es-partnership.org/wp-content/uploads/2021/04/ESVD-version-December-2020.xlsx',
 'ce-delft-eu27-v1.1.pdf':'https://cedelft.eu/wp-content/uploads/sites/2/2024/12/CE_Delft_230107_Environmental-Prices-Handbook-2024-EU-version_def_V1.1.pdf',
 'ce-delft-erratum-v1.1.pdf':'https://cedelft.eu/wp-content/uploads/sites/2/2024/12/CE-Delft_230107_Erratum-v1.1_Environmental_Prices_Handbook_EU_Def.pdf',
 'ifvi-air-pollution-2024.pdf':'https://ifvi.org/wp-content/uploads/2024/10/IFVI_Environmental-Methodology_Interim-Air-Pollution-Topic-Methodology.pdf'}
for name,url in urls.items():
 p=base/'raw'/name
 manifest.append(dict(file=name,url=url,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size,acquiredOn='2026-09-21',use='research-only'))
 if name.endswith('.pdf'):
  pages=PdfReader(p).pages
  # Extract only the relevant tables/erratum for reproducible verification.
  indexes=range(len(pages)) if 'erratum' in name else [32] if name.startswith('ce-') else [46]
  (base/(name+'.txt')).write_text('\n'.join(f'PDF page {i+1}\n'+pages[i].extract_text() for i in indexes))
(base/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('ESVD records:',len(records),'numeric:',sum(r['value'] is not None for r in records),'source files:',len(manifest))
