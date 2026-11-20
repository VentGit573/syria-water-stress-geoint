// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, Nov 2026.
// SUPERSEDED: kept for provenance only. See docs/script_catalog.md.
// ---------------------------------------------------------------------
// =====================================================================
// SCRIPT 1 — DROUGHT (CHIRPS rainfall) AND CROP STRESS (MODIS NDVI)
// Syria water-stress proposal · draft v1 · 3 Nov 2026
//
// HOW TO RUN: open https://code.earthengine.google.com, click
// NEW > File, paste this whole script, click Run.
//   • Maps appear in the map panel (toggle them under "Layers").
//   • Charts appear in the Console tab (right side).
//   • The CSV export appears in the Tasks tab — click RUN there,
//     then RUN again in the pop-up. The file lands in Google Drive.
// =====================================================================

// ---------- SETTINGS (safe to edit) ----------
var RAIN_BASE_START = 1982;  // rainfall baseline seasons (season 1982 = Oct 1981–May 1982)
var RAIN_BASE_END   = 2005;
var NDVI_BASE_START = 2001;  // NDVI baseline years (MODIS starts Feb 2000)
var NDVI_BASE_END   = 2005;
var FIRST_YEAR      = 2000;  // first year written to the table
var LAST_YEAR       = 2011;  // last year written to the table
var FALLOW_NDVI     = 0.2;   // cropland whose seasonal peak NDVI stays below this = "never greened"
var MAP_YEAR        = 2008;  // which year to show on the map
var EXPORT_FOLDER   = 'syria_water_stress';

// ---------- STUDY AREA ----------
var syria = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic'));
var districts = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic'))
  .select(['ADM1_NAME', 'ADM2_NAME', 'ADM2_CODE']);
// Jazira / Hasakah wheat belt (approximate box)
var jazira = ee.Geometry.Rectangle([39.5, 35.8, 42.3, 37.3]);

Map.centerObject(syria, 7);
Map.addLayer(syria.style({color: 'black', fillColor: '00000000'}), {}, 'Syria outline');

// ---------- 1. RAINFALL: October–May season totals ----------
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/PENTAD').select('precipitation');

function seasonTotal(y) {
  y = ee.Number(y);
  var start = ee.Date.fromYMD(y.subtract(1), 10, 1);   // 1 Oct of previous year
  var end   = ee.Date.fromYMD(y, 6, 1);                 // up to 31 May
  return chirps.filterDate(start, end).sum()
    .rename('rain_mm')
    .set('season', y)
    .set('system:time_start', ee.Date.fromYMD(y, 1, 1).millis());
}

var seasons = ee.ImageCollection(
  ee.List.sequence(RAIN_BASE_START, LAST_YEAR).map(seasonTotal));
var rainBase = seasons
  .filter(ee.Filter.rangeContains('season', RAIN_BASE_START, RAIN_BASE_END))
  .mean();
var rainAnom = seasons.map(function (img) {
  return img.divide(rainBase).multiply(100).subtract(100)
    .rename('rain_anom_pct')
    .copyProperties(img, ['season', 'system:time_start']);
});

print(ui.Chart.image.series(seasons, jazira, ee.Reducer.mean(), 5566)
  .setOptions({title: 'Jazira: October–May rainfall (mm) by season',
               hAxis: {title: 'Season ending'}, vAxis: {title: 'mm'},
               legend: {position: 'none'}}));

// ---------- 2. CROPS: peak NDVI (Feb–May) on cropland ----------
var modis = ee.ImageCollection('MODIS/061/MOD13Q1').select('NDVI');

function peakNdvi(y) {
  y = ee.Number(y);
  return modis.filterDate(ee.Date.fromYMD(y, 2, 1), ee.Date.fromYMD(y, 6, 1))
    .max().multiply(0.0001)
    .rename('ndvi')
    .set('year', y)
    .set('system:time_start', ee.Date.fromYMD(y, 3, 15).millis());
}

// Cropland mask from the 2005 MODIS land-cover map
// (class 12 = croplands, 14 = cropland/natural vegetation mosaic)
var lc2005 = ee.ImageCollection('MODIS/061/MCD12Q1')
  .filterDate('2005-01-01', '2005-12-31').first().select('LC_Type1');
var cropMask = lc2005.eq(12).or(lc2005.eq(14));

var ndviYears = ee.ImageCollection(
  ee.List.sequence(FIRST_YEAR, LAST_YEAR).map(peakNdvi))
  .map(function (img) { return img.updateMask(cropMask); });

var ndviBase = ndviYears
  .filter(ee.Filter.rangeContains('year', NDVI_BASE_START, NDVI_BASE_END))
  .mean();
var fallowBase = ndviYears
  .filter(ee.Filter.rangeContains('year', NDVI_BASE_START, NDVI_BASE_END))
  .map(function (img) { return img.lt(FALLOW_NDVI); })
  .mean();

var cropYears = ndviYears.map(function (img) {
  var anom   = img.subtract(ndviBase).rename('ndvi_anom');
  var fallow = img.lt(FALLOW_NDVI).rename('fallow_frac');
  return img.addBands(anom).addBands(fallow)
    .copyProperties(img, ['year', 'system:time_start']);
});

print(ui.Chart.image.series(cropYears.select('ndvi'), jazira, ee.Reducer.mean(), 250)
  .setOptions({title: 'Jazira: cropland peak NDVI (Feb–May) by year',
               hAxis: {title: 'Year'}, vAxis: {title: 'NDVI'},
               legend: {position: 'none'}}));

// ---------- MAP LAYERS for MAP_YEAR ----------
var mapRain = rainAnom.filter(ee.Filter.eq('season', MAP_YEAR)).first();
var mapNdvi = cropYears.filter(ee.Filter.eq('year', MAP_YEAR)).first();
Map.addLayer(ee.Image(mapRain).clip(syria),
  {min: -60, max: 20, palette: ['8c510a', 'd8b365', 'f5f5f5', '5ab4ac', '01665e']},
  'Rainfall anomaly % ' + MAP_YEAR);
Map.addLayer(ee.Image(mapNdvi).select('ndvi_anom').clip(syria),
  {min: -0.2, max: 0.1, palette: ['a50026', 'f46d43', 'fee08b', 'd9ef8b', '1a9850']},
  'Cropland NDVI anomaly ' + MAP_YEAR);
Map.addLayer(districts.style({color: '555555', fillColor: '00000000', width: 0.5}),
  {}, 'Districts');

// ---------- DISTRICT TABLE: one row per district per year ----------
var table = ee.FeatureCollection(
  ee.List.sequence(FIRST_YEAR, LAST_YEAR).map(function (y) {
    y = ee.Number(y);
    var rain = ee.Image(rainAnom.filter(ee.Filter.eq('season', y)).first());
    var crop = ee.Image(cropYears.filter(ee.Filter.eq('year', y)).first())
      .select(['ndvi', 'ndvi_anom', 'fallow_frac']);
    var stack = rain.addBands(crop);
    return stack.reduceRegions({
      collection: districts,
      reducer: ee.Reducer.mean(),
      scale: 1000,          // 1 km is plenty for district means and keeps it fast
      tileScale: 4
    }).map(function (f) { return f.set('year', y); });
  })).flatten();

// Quick look at the first rows (full table goes to Drive)
print('First rows of district table', table.limit(5));

Export.table.toDrive({
  collection: table,
  description: 'syria_districts_rain_ndvi_2000_2011',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['ADM1_NAME', 'ADM2_NAME', 'ADM2_CODE', 'year',
              'rain_anom_pct', 'ndvi', 'ndvi_anom', 'fallow_frac']
});

// Baseline share of cropland that never greens, for the fallow threshold
Export.table.toDrive({
  collection: fallowBase.rename('fallow_frac_baseline').reduceRegions({
    collection: districts, reducer: ee.Reducer.mean(), scale: 1000, tileScale: 4}),
  description: 'syria_districts_fallow_baseline',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['ADM1_NAME', 'ADM2_NAME', 'ADM2_CODE', 'mean']
});
