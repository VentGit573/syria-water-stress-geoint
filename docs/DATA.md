# Data index

What is stored where, what each file contains, and the terms of the source data.

## Storage tiers

| Tier | Location | Contents |
| --- | --- | --- |
| Code and small tables | This GitHub repository | Scripts, district-level CSVs, small figures |
| Large derived rasters | Zenodo 10.5281/zenodo.24383827 | GeoTIFF exports from the GEE scripts |
| Intermediate GEE layers | Author's Earth Engine project assets | Reused masks and composites (not public) |
| Web maps | ArcGIS Online (USC organization) | Tile layers for swipe maps and storymaps (display only, not an archive) |
| Working copy | Author's local drive | Everything during analysis |

## Files in this repository

### `data/`

| File | Rows | Description | Derived from |
| --- | --- | --- | --- |
| `district_census2004.csv` | Syrian districts (GAUL level 2) | 2004 census aggregates per district: population, households, towns, unemployment, illiteracy, agricultural and government employment, water network, sanitation and electricity access, and estimated ethnic/sectarian shares | Syria Town Database (Khaddour & Mazur), aggregated from town level via an OCHA→GAUL district crosswalk |
| `district_uprising_events.csv` | Syrian districts | Uprising outcomes per district: protest by April 2011, onset days, 2011 event counts, state and pro-government event counts, armed onset, events per 100k | Mazur event dataset, aggregated by district |
| `matrix_inputs_prefilled.csv` | 59 matched districts | Template for `score_matrix.py`. Outcome and census columns filled; institutional columns (state share, diesel exposure, relief coverage, in-migration, etc.) partly blank, to be completed. Rename to `matrix_inputs.csv` before running | Files above plus hand-coded fields (e.g. `restrict` = 1 for Hasakah border-zone rules) |

### `outputs/`

| File | Description |
| --- | --- |
| `district_analysis_table.csv` | Census, outcome and remote sensing indicators joined per district (working table for correlations) |
| `prelim_correlations.csv` | Preliminary district-level correlations (Spearman ρ, AUC) between indicators and early protest. Exploratory; n ≈ 47–59 |

### Planned for Zenodo (not yet uploaded)

| Product | Script | Format |
| --- | --- | --- |
| Spring and summer NDVI 2004–05 and 2008–09, change, styled copies | `export_crops_drought_for_arcgis.js` | Cloud-Optimized GeoTIFF |
| CHIRPS Oct–Apr rainfall, crop years 2004–05 and 2008–09 | `export_crops_drought_for_arcgis.js` | Cloud-Optimized GeoTIFF |
| DMSP night lights windows, change (drift-corrected), styled copies | `export_lights_for_arcgis.js` | Cloud-Optimized GeoTIFF |
| Healthy cropland by governorate | `addon_healthy_crop_area.js` | CSV |
| District baseline matrix | `district_baseline_matrix.js` | CSV |

Suggested file naming: `syria_<variable>_<years>_<source>_v<version>.tif`, e.g. `syria_hlth_crop_2005_2009_mod13q1_v1.tif`.

## Source data and terms

This repository redistributes **derived** tables only. Raw third-party files are not included; obtain them from the sources below.

| Source | Used for | Terms / note |
| --- | --- | --- |
| MODIS MOD13Q1, MCD12Q1 (NASA LP DAAC) | NDVI, cropland | Public, no restrictions; cite per EE catalog |
| CHIRPS (UCSB Climate Hazards Center) | Rainfall, SPI | Open; cite Funk et al. (2015) |
| DMSP-OLS Nighttime Lights (NOAA) | Night lights | Public domain |
| GPWv4.11 (CIESIN) | Population | CC BY 4.0 |
| ALOS PALSAR yearly mosaics (JAXA) | Settlement change | Free for research; cite per EE catalog |
| Landsat 5/7 Collection 2 (USGS) | Cross-checks | Public domain |
| JRC GHSL, JRC Global Surface Water | Settlement, lake area | CC BY 4.0 |
| GRACE mascons (NASA JPL), FLDAS | Groundwater trend | Public |
| FAO GAUL 2015 | Admin boundaries | Restricted terms (non-commercial; limits on redistribution). Boundaries are **not** redistributed here; derived statistics only |
| Syria Town Database (Khaddour & Mazur, 2018) | 2004 census and ethnicity aggregates | Made public by the authors for research use; no formal license stated. Raw files not redistributed; cite the dataset and obtain from the authors' release |
| Mazur Syria uprising event data | Uprising outcomes | Raw event files not redistributed; derived district counts only; cite the dataset |

## Notes and caveats

- **Ethnic/sectarian shares** are estimates from the Syria Town Database and describe pre-2011 settlement patterns. Displacement since 2011 has changed them substantially. They are used only as tested variables in the matrix, not as assumed causes.
- **Event data** for violent opposition and pro-government activity draw heavily on Syrian state media (about 70% and 90% of events respectively). Treat trends in those series with caution.
- **District matching:** some GAUL districts have no OCHA census match and carry blank census fields (noted in `matrix_inputs_prefilled.csv`).
