# Water Stress, Fragile Institutions, and Unrest in Syria (2000–2012)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24383382.svg)](https://doi.org/10.5281/zenodo.24383382)
Geospatial and socio-economic analysis of Syria's 2006–2010 drought, the state's institutional response, internal migration, and the 2011 uprising. The repository holds the Google Earth Engine (GEE) scripts, the Python scoring script for the strain/indicator matrix, and the small derived tables behind the analysis.

**Author:** Sean Ventura, MS Human Security and Geospatial Intelligence, USC Spatial Sciences Institute
**Status:** Work in progress (November 2026). Several scripts have not yet been run on project data; see `docs/script_catalog.md`.

## AI disclosure

All scripts were drafted by Claude Opus 5.5 (Anthropic; model ID `claude-opus-5-5`) in conversation with the author, then run, tested and adjusted by the author. Each script carries the same disclosure in its header. Analytical judgements, interpretation and final responsibility for the work are the author's.

## Repository layout

| Folder | Contents |
| --- | --- |
| `gee/` | Earth Engine Code Editor scripts (JavaScript). Settings are in capitals at the top of each script. |
| `gee/superseded/` | Earlier versions kept for provenance only. Not maintained. |
| `python/` | `score_matrix.py`: scores districts on the environment-only and institutional modules and tests them against uprising outcomes (AUC, Spearman). |
| `data/` | Small derived input tables at district level (2004 census aggregates, uprising event counts, matrix input template). |
| `outputs/` | Small derived results (preliminary correlations, joined district analysis table). |
| `docs/` | Script catalog and data index. |

Large raster products (GeoTIFFs) are **not** stored here. They are archived separately on Zenodo; see `docs/DATA.md`.

## How to run

1. **GEE scripts:** paste a script into the [Earth Engine Code Editor](https://code.earthengine.google.com/), check the settings block at the top, and run. Large areas time out in the Console after about 5 minutes; use the Tasks tab exports instead. Exports go to the Google Drive of the signed-in account.
2. **Matrix scoring:** run `district_baseline_matrix.js` and export `district_baseline.csv`; fill `data/matrix_inputs_prefilled.csv` and save it as `matrix_inputs.csv`; then:
   ```
   python python/score_matrix.py district_baseline.csv matrix_inputs.csv
   ```
   Pure Python 3; `matplotlib` is optional (for the chart).

## Key methods (summary)

- **Crop stress:** MODIS MOD13Q1 NDVI, spring peak (Feb–May) for winter grain and summer mean (Jul–Aug) as an irrigation proxy, on 2005 MCD12Q1 cropland. Healthy cropland = spring peak NDVI ≥ 0.4.
- **Drought:** CHIRPS Oct–Apr rainfall; SPI approximated as a z-score against 1982–2010.
- **Night lights:** DMSP-OLS F16 only, late period divided by 1.084 to correct sensor drift.
- **Population:** GPWv4.11.
- **Settlement change:** ALOS PALSAR yearly mosaics (2007–2010) with Landsat 5/7 and GHSL cross-checks.
- **Boundaries:** FAO GAUL 2015 (level 1 and 2), filtered to polygons.

## How to cite

See `CITATION.cff` (GitHub shows a "Cite this repository" button). Archived releases carry a Zenodo DOI.

Please also cite the platform and each dataset as its Earth Engine catalog page specifies, including:
Gorelick, N. et al. (2017). Google Earth Engine: Planetary-scale geospatial analysis for everyone. *Remote Sensing of Environment* 202: 18–27.

## License

- **Code** (`gee/`, `python/`): MIT License; see `LICENSE`.
- **Data products, figures and documentation** (`data/`, `outputs/`, `docs/`, and the Zenodo raster archive): Creative Commons Attribution 4.0 International (CC BY 4.0); see `LICENSE-DATA`.

Third-party source data keep their own terms and are not redistributed here; see `docs/DATA.md`.
