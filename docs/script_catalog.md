# Script catalog

Scripts used in the remote sensing proof of concept for *Water Stress, Fragile Institutions, and Unrest in Syria (2000–2011)*, 3–19 November 2026.

**AI disclosure:** All scripts were drafted by Claude Opus 5.5 (Anthropic; model ID `claude-opus-5-5`) in conversation with Sean Ventura, then run, tested and adjusted by the author in the Google Earth Engine Code Editor. Each script carries the same disclosure in its header.

**Platform citation:** Gorelick, N. et al. (2017). Google Earth Engine: Planetary-scale geospatial analysis for everyone. *Remote Sensing of Environment* 202: 18–27. Cite each dataset as its Earth Engine catalog page specifies. Data accessed November 2026.

## Scripts with usable results

| Script | What it does | Key datasets | Key settings | Result | Reusable for |
| --- | --- | --- | --- | --- | --- |
| `water_inventory_four_lakes.js` | Monthly water area of Lake Assad, Tishrin, Jabbul and Qattinah, 2000–2021, with cloud and Landsat 7 gaps filled; yearly radar water check | JRC/GSW1_4/MonthlyHistory; JAXA/ALOS/PALSAR/YEARLY/SAR | Fill pixels with long-term water occurrence ≥ 50%; skip months > 30% obscured | **Landsat part works.** Assad drawn down harder in 2009–10; Qattinah refill failed 2008–11; Jabbul rose in the drought. **Radar part failed** (wind and salt crusts); kept for reference only | Any lake or reservoir area time series (edit the lake boxes) |
| `groundwater_and_irrigation.js` | (1) GRACE total storage minus soil moisture and snow = groundwater plus lakes; (2) cropland still green in July–August = irrigated area, by district | NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI; NASA/FLDAS/NOAH01/C/GL/M/V001; MODIS/061/MOD13Q1; MODIS/061/MCD12Q1; FAO/GAUL/2015/level2 | 2003–2009 linear trend; summer NDVI ≥ 0.3 on 2005 cropland | **Works.** Basin groundwater −17.1 mm/yr (Voss et al. 2013: −17.3). Syria storage kept falling after 2010. Jazira irrigated area fell ~25–28% vs ~15% in the Euphrates valley | Groundwater trends for any basin; irrigation decline in any arid region |
| `lights_and_heat_rings.js` | Night light (DMSP) and summer night-time land temperature (MODIS) in 2 km rings to 20 km around cities, 2004–05 vs 2008–09 | NOAA/DMSP-OLS/NIGHTTIME_LIGHTS (F16 only); MODIS/061/MYD11A2 | Drift correction (~8%, Syrian cities); heat relative to a 25–35 km rural ring; Amman and Mafraq as controls | **Works.** Edges of receiving cities brightened (Dara'a +15 pts, Aleppo +9); Hasakah's rural fringe dimmed (−16) and dried. Control-city version not yet run | City edge growth vs rural decline in any region, 1992–2013 |
| `swipe_lights_cities.js` | Before/after swipe viewer, matching PNGs, GeoTIFFs and ring polygons for ArcGIS | NOAA/DMSP-OLS/NIGHTTIME_LIGHTS | Late period divided by 1.084; rings coloured by measured change; outlines off by default | **Works** (v1 run; v2 ring-colour version not yet run) | Visual companions to any ring analysis |
| `export_lights_for_arcgis.js` | Exports the night-light windows, change, original annual composites, styled RGBA copies, rings, city points, analysis frames and Syrian boundaries for ArcGIS swipe maps | NOAA/DMSP-OLS/NIGHTTIME_LIGHTS (F16); FAO/GAUL/2015 | DMSP's own 30" grid by default (no resampling); drift 1.084; Amman and Mafraq included as controls | **Run.** Used for the ArcGIS swipe maps (Dara'a +10.6%, Hasakah −9.3% beyond drift); boundary export fixed to polygons only | Getting any GEE raster and vector results into ArcGIS Pro or Online |
| `export_crops_drought_for_arcgis.js` | Spring peak NDVI (winter grain), summer NDVI (irrigated crops) and CHIRPS Oct–Apr rainfall for crop years 2004–05 vs 2008–09; value and styled RGBA GeoTIFFs plus a district summary for ArcGIS | MODIS/061/MOD13Q1; MODIS/061/MCD12Q1 (2005 cropland); UCSB-CHG/CHIRPS/DAILY; FAO/GAUL/2015 | Feb–May max and Jul–Aug mean NDVI on 2005 cropland; change below ±0.03 hidden in styled layers; clipped to Syria by default | **Run.** Layers used in ArcGIS; produced `crops_by_district.csv` | Drought impact on any rain-fed and irrigated farming region |
| `district_baseline_matrix.js` | One row per district: drought-year SPI approximation, cropland share, irrigated share of cropland, healthy cropland change, population change, night-light change. Settings at the top make it reusable for other study areas (e.g. Diyala) | UCSB-CHG/CHIRPS/DAILY; MODIS/061/MOD13Q1; MODIS/061/MCD12Q1; CIESIN/GPWv411; NOAA/DMSP-OLS; FAO/GAUL/2015/level2 | SPI = z-score of Oct–Apr totals vs 1982–2010; healthy = spring peak NDVI ≥ 0.4; drift 1.084 | **Not yet run** | Core module of the strain matrix in any study area, 2000–2013 |
| `score_matrix.py` (in `python/`) | Scores districts environment-only and with the institutional module (weighted and geometric, plus equal-weight check), then tests both against outcomes (AUC, Spearman) | Output of the script above + hand-filled matrix_inputs.csv | Percentile-rank normalization; MIN_COVERAGE = 0.2 (raise to 0.5 as more columns are filled) | **Tested on synthetic data; preliminary correlations run on Mazur outcomes and 2004 census** | Validating any indicator matrix against an observed outcome |
| `poc_rukban_tents_to_mudbrick.js` | Radar brightness of a camp vs surrounding desert by year | JAXA/ALOS/PALSAR/YEARLY/SAR_EPOCH | Draw the camp as `campPoly`; desert ring 500–1500 m | **Works.** Camp +8 dB while still tents (2016), +12 dB as mud brick (2018), only ~2 dB lower as population fell ~80%: radar tracks structures, not people | Calibrating radar against any known settlement, 2015–2022 |
| `poc_sar_landsat_v4c.js` | City-edge new building from radar (HH vs HV test, step beyond ground shift) with a Landsat cross-check | JAXA/ALOS/PALSAR/YEARLY/SAR; Landsat 5/7 C2 L2; JRC GHSL | 3 dB step in both 2009 and 2010; HH rise ≥ HV + 1 dB; 750 m edge band; zone masks at 50–100 m | **Partly works.** Aleppo 0.46 km² new growth, ~10:1 over noise; Landsat agreement low. Likely misses loose settlement | Rigid-construction change at city edges, 2007–2010 |
| `poc_sar_edge_vs_ground_v4.js` | Brightness change of the edge band vs open ground vs city core, without a threshold | JAXA/ALOS/PALSAR/YEARLY/SAR | Edge band 500 m; open ground ≥ 1.5 km away | **Partly works.** Showed buildings are stable year to year; Dara'a ~0.4–0.6 km² net, scattered | Testing radar change without thresholds |
| `poc_camp_detectability.js` | Radar brightness of a site vs desert ring by year | JAXA/ALOS/PALSAR/YEARLY/SAR | Point, radius and ring distances | **Mixed.** Border post +13 dB (positive control); Al-Tanf camp location not confirmed | Quick detectability check for any site |

## Superseded or failed (kept in `gee/superseded/` for provenance)

- `poc_sar_city_expansion.js` (v1/v2) — single −6 dB threshold; too sensitive to borderline pixels.
- `poc_sar_city_expansion_v3.js` — brightness correction overcorrected buildings.
- `poc_sar_landsat_v4b.js` — replaced by v4c (timed out on Aleppo).
- `nightlights_city_rings.js` — replaced by `lights_and_heat_rings.js`.
- `script1_drought_crops.js`, `script2_water.js`, `script3_people_cities.js` — first drafts; not run yet. Their GRACE and lake parts are replaced by the scripts above.

## Notes for reuse

- Run each script in the Earth Engine Code Editor; settings are in capitals at the top.
- Large areas time out in the Console after ~5 minutes; use the Tasks exports instead.
- DMSP night lights cover 1992–2013; for 2012 onward use VIIRS (NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG or NASA Black Marble).

## Additional script

| Script | What it does | Result |
| --- | --- | --- |
| `addon_healthy_crop_area.js` | Healthy cropland area (NDVI ≥ 0.3 / 0.4) by governorate, early vs late period | **Works.** Healthy cropland fell ~25% nationally (~10,000 km²); Hasakah −55%; the northeast accounts for ~73% of the loss |
