// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, Nov 2026.
// SUPERSEDED: kept for provenance only. See docs/script_catalog.md.
// ---------------------------------------------------------------------
// =====================================================================
// SCRIPT 2 — WATER STORAGE: Lake Assad surface area + basin groundwater
// Syria water-stress proposal · draft v1 · 3 Nov 2026
//
// HOW TO RUN: paste into https://code.earthengine.google.com and click Run.
// Charts appear in the Console tab. Exports appear in the Tasks tab —
// click RUN on each. Files land in Google Drive.
// If a chart says "Computation timed out", ignore it and use the export.
// =====================================================================

// ---------- SETTINGS (safe to edit) ----------
// Box around Lake Assad (Tabqa reservoir). To use your own shape, draw a
// polygon with the map's drawing tools, name it lakeBox, and delete this line.
var lakeBox = ee.Geometry.Rectangle([37.95, 35.80, 38.65, 36.25]);
var MAX_NODATA_PCT = 5;        // drop months where more than this % of the box has no data
var RECENT_START = '2021-01-01'; // Sentinel-2 recent window
var EXPORT_FOLDER = 'syria_water_stress';

Map.centerObject(lakeBox, 10);
Map.addLayer(lakeBox, {color: 'red'}, 'Lake Assad box', true, 0.3);

// ---------- 1. LAKE ASSAD AREA, 2000–2021 (JRC Global Surface Water) ----------
// Band "water": 0 = no data, 1 = not water, 2 = water
var gsw = ee.ImageCollection('JRC/GSW1_4/MonthlyHistory')
  .filterDate('2000-01-01', '2022-01-01');
var boxKm2 = lakeBox.area(1).divide(1e6);
var pixKm2 = ee.Image.pixelArea().divide(1e6);

var monthly = gsw.map(function (img) {
  var w = img.select('water');
  var stats = pixKm2.updateMask(w.eq(2)).rename('water_km2')
    .addBands(pixKm2.updateMask(w.eq(0)).rename('nodata_km2'))
    .reduceRegion({reducer: ee.Reducer.sum(), geometry: lakeBox,
                   scale: 30, maxPixels: 1e10});
  var nodataPct = ee.Number(stats.get('nodata_km2')).divide(boxKm2).multiply(100);
  return ee.Feature(null, {
    date: img.date().format('YYYY-MM'),
    'system:time_start': img.get('system:time_start'),
    water_km2: stats.get('water_km2'),
    nodata_pct: nodataPct
  });
});
var clean = monthly.filter(ee.Filter.lte('nodata_pct', MAX_NODATA_PCT));

print(ui.Chart.feature.byFeature(clean, 'system:time_start', 'water_km2')
  .setChartType('LineChart')
  .setOptions({title: 'Lake Assad water surface (km²), 2000–2021, clear months only',
               vAxis: {title: 'km²'}, legend: {position: 'none'}, pointSize: 2}));

Export.table.toDrive({
  collection: monthly,   // all months; filter on nodata_pct in your spreadsheet
  description: 'lake_assad_area_jrc_2000_2021',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['date', 'water_km2', 'nodata_pct']
});

// Map: how often each pixel was water, drought years vs baseline
function waterFreq(start, end) {
  var c = gsw.filterDate(start, end);
  var isWater = c.map(function (i) { return i.select('water').eq(2); }).sum();
  var valid   = c.map(function (i) { return i.select('water').gt(0); }).sum();
  return isWater.divide(valid);
}
Map.addLayer(waterFreq('2001-01-01', '2006-01-01').selfMask(),
  {min: 0, max: 1, palette: ['ffffff', '0000ff']}, 'Water frequency 2001–2005', false);
Map.addLayer(waterFreq('2007-01-01', '2011-01-01').selfMask(),
  {min: 0, max: 1, palette: ['ffffff', '0000ff']}, 'Water frequency 2007–2010', true);

// ---------- 2. LAKE ASSAD AREA, RECENT (Sentinel-2) ----------
// Monthly median, water where MNDWI (green vs shortwave infrared) > 0
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(lakeBox)
  .filterDate(RECENT_START, ee.Date(Date.now()))
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

var months = ee.List.sequence(0, ee.Date(Date.now())
  .difference(ee.Date(RECENT_START), 'month').floor().subtract(1));
var recent = ee.FeatureCollection(months.map(function (m) {
  var start = ee.Date(RECENT_START).advance(m, 'month');
  var c = s2.filterDate(start, start.advance(1, 'month'));
  var mndwi = c.median().normalizedDifference(['B3', 'B11']);
  var km2 = ee.Algorithms.If(c.size().gt(0),
    pixKm2.updateMask(mndwi.gt(0)).reduceRegion({
      reducer: ee.Reducer.sum(), geometry: lakeBox, scale: 20, maxPixels: 1e10
    }).get('area'),
    null);
  return ee.Feature(null, {date: start.format('YYYY-MM'),
                           'system:time_start': start.millis(),
                           scenes: c.size(), water_km2: km2});
}));

Export.table.toDrive({
  collection: recent,
  description: 'lake_assad_area_sentinel2_recent',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['date', 'scenes', 'water_km2']
});

// ---------- 3. GROUNDWATER / TOTAL WATER STORAGE (GRACE, basin scale) ----------
// Values are anomalies in cm of water relative to the long-term mean.
var basin = ee.Geometry.Rectangle([36, 30, 48, 40]);  // Euphrates–Tigris basin, approximate
var grace = ee.ImageCollection('NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI')
  .select('lwe_thickness')
  .filterDate('2002-01-01', '2025-01-01');

print(ui.Chart.image.series(grace, basin, ee.Reducer.mean(), 55660)
  .setOptions({title: 'Euphrates–Tigris basin: water storage anomaly (cm), GRACE/GRACE-FO',
               vAxis: {title: 'cm of water'}, legend: {position: 'none'}}));

var graceTable = grace.map(function (img) {
  var v = img.reduceRegion({reducer: ee.Reducer.mean(), geometry: basin, scale: 55660})
    .get('lwe_thickness');
  return ee.Feature(null, {date: img.date().format('YYYY-MM'), lwe_cm: v});
});
Export.table.toDrive({
  collection: graceTable,
  description: 'grace_euphrates_tigris_basin',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['date', 'lwe_cm']
});
