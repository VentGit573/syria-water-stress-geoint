// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, Nov 2026.
// SUPERSEDED: kept for provenance only. See docs/script_catalog.md.
// ---------------------------------------------------------------------
// =====================================================================
// SCRIPT 3 — POPULATION MOVEMENT AND URBAN-EDGE GROWTH
//   A. Night lights by district (DMSP-OLS, satellite F16)
//   B. Built-up area by site (GHSL)
//   C. Landsat built-up index change by site (NDBI minus NDVI)
//   D. Radar change by site (ALOS PALSAR yearly mosaics)
// Syria water-stress proposal · draft v1 · 3 Nov 2026
//
// HOW TO RUN: paste into https://code.earthengine.google.com and click Run.
// Maps: Layers panel. Numbers: Console tab. Exports: Tasks tab > RUN.
// =====================================================================

// ---------- SETTINGS (safe to edit) ----------
var EXPORT_FOLDER  = 'syria_water_stress';
var BUI_THRESHOLD  = 0.10;  // rise in built-up index counted as new construction
var SAR_DB_THRESHOLD = 3;   // rise in radar HH backscatter (dB) counted as new structures

// Sites: centre point and analysis radius (metres). Edit or add rows.
var sites = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Point([37.16, 36.20]).buffer(15000), {site: 'Aleppo', role: 'study'}),
  ee.Feature(ee.Geometry.Point([36.40, 33.57]).buffer(10000), {site: 'Douma_EasternGhouta', role: 'study'}),
  ee.Feature(ee.Geometry.Point([36.10, 32.62]).buffer(8000),  {site: 'Daraa', role: 'study'}),
  ee.Feature(ee.Geometry.Point([39.01, 35.95]).buffer(8000),  {site: 'Raqqa', role: 'comparison'})
]);

// Optional: gas-flare areas to exclude from night lights. Draw polygons on the
// map with the drawing tools into a layer named "flares", then set USE_FLARE_MASK = true.
var USE_FLARE_MASK = false;

var districts = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic'))
  .select(['ADM1_NAME', 'ADM2_NAME', 'ADM2_CODE']);

Map.setCenter(38.0, 35.0, 7);
Map.addLayer(sites, {color: 'yellow'}, 'Sites');

// ---------- A. NIGHT LIGHTS BY DISTRICT ----------
// Only F16 images, so the comparison uses one sensor (F16 flew 2004–2009).
var dmsp = ee.ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS')
  .select('stable_lights')
  .filter(ee.Filter.stringStartsWith('system:index', 'F16'));
print('F16 night-light images found (should include 2004, 2005, 2008, 2009):',
      dmsp.aggregate_array('system:index'));

var lightsEarly = dmsp.filterDate('2004-01-01', '2006-01-01').mean().rename('sol_2004_05');
var lightsLate  = dmsp.filterDate('2008-01-01', '2010-01-01').mean().rename('sol_2008_09');
var lights = lightsEarly.addBands(lightsLate);
if (USE_FLARE_MASK) {
  // "flares" is the drawn layer; pixels inside it are removed
  lights = lights.updateMask(ee.Image(0).paint(flares, 1).eq(0));
}

Map.addLayer(lightsLate.subtract(lightsEarly).selfMask(),
  {min: -10, max: 10, palette: ['2166ac', 'f7f7f7', 'b2182b']},
  'Night-light change 2004–05 to 2008–09 (red = brighter)', false);

var lightTable = lights.reduceRegions({
  collection: districts, reducer: ee.Reducer.sum(), scale: 927.67, tileScale: 4
}).map(function (f) {
  var a = ee.Number(f.get('sol_2004_05'));
  var b = ee.Number(f.get('sol_2008_09'));
  return f.set('pct_change', ee.Algorithms.If(a.gt(0), b.subtract(a).divide(a).multiply(100), null));
});
Export.table.toDrive({
  collection: lightTable,
  description: 'syria_districts_nightlights_F16',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['ADM1_NAME', 'ADM2_NAME', 'ADM2_CODE', 'sol_2004_05', 'sol_2008_09', 'pct_change']
});

// Same totals around each city site
var lightSites = lights.reduceRegions({collection: sites, reducer: ee.Reducer.sum(), scale: 927.67});
print('Night-light totals by site', lightSites);

// ---------- B. BUILT-UP AREA BY SITE (GHSL) ----------
function ghsl(y) {
  return ee.Image('JRC/GHSL/P2023A/GHS_BUILT_S/' + y).select('built_surface');
}
var built = ghsl(2000).rename('built_km2_2000')
  .addBands(ghsl(2005).rename('built_km2_2005'))
  .addBands(ghsl(2010).rename('built_km2_2010'))
  .addBands(ghsl(2015).rename('built_km2_2015'))
  .divide(1e6);   // m² per cell -> km²
var builtSites = built.reduceRegions({collection: sites, reducer: ee.Reducer.sum(), scale: 100});
print('GHSL built-up area by site (km²)', builtSites);

Map.addLayer(ghsl(2010).subtract(ghsl(2005)).selfMask(),
  {min: 0, max: 3000, palette: ['ffffb2', 'fd8d3c', 'bd0026']},
  'GHSL new built-up 2005–2010', false);

// ---------- C. LANDSAT BUILT-UP INDEX CHANGE ----------
function prepLandsat(img) {
  var qa = img.select('QA_PIXEL');
  var clear = qa.bitwiseAnd(1 << 3).eq(0)     // not cloud
    .and(qa.bitwiseAnd(1 << 4).eq(0));        // not cloud shadow
  // Landsat 5 and 7 share band numbers for red (B3), NIR (B4), SWIR1 (B5)
  return img.select(['SR_B3', 'SR_B4', 'SR_B5'], ['red', 'nir', 'swir1'])
    .multiply(0.0000275).add(-0.2)
    .updateMask(clear);
}
var landsat = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
  .merge(ee.ImageCollection('LANDSAT/LE07/C02/T1_L2'))
  .filterBounds(sites.geometry())
  .filter(ee.Filter.calendarRange(6, 9, 'month'));   // dry season, June–September

function composite(y1, y2) {
  var c = landsat.filter(ee.Filter.calendarRange(y1, y2, 'year'));
  print('Landsat scenes ' + y1 + '–' + y2 + ':', c.size());
  return c.map(prepLandsat).median();
}
function bui(c) {
  var ndbi = c.normalizedDifference(['swir1', 'nir']);
  var ndvi = c.normalizedDifference(['nir', 'red']);
  return ndbi.subtract(ndvi).rename('BUI');
}
var early = composite(2003, 2005);
var late  = composite(2009, 2011);
var buiEarly = bui(early);
var buiLate  = bui(late);
var buiChange = buiLate.subtract(buiEarly).rename('BUI_change');
var newBuiltLandsat = buiChange.gt(BUI_THRESHOLD).rename('new_landsat');

Map.addLayer(early.clip(sites.geometry()), {bands: ['red', 'nir', 'swir1'], min: 0, max: 0.4},
  'Landsat 2003–05 (false colour)', false);
Map.addLayer(late.clip(sites.geometry()), {bands: ['red', 'nir', 'swir1'], min: 0, max: 0.4},
  'Landsat 2009–11 (false colour)', false);
Map.addLayer(buiChange.clip(sites.geometry()),
  {min: -0.3, max: 0.3, palette: ['1a9850', 'ffffbf', 'd73027']},
  'Built-up index change (red = more built-up)', false);

// ---------- D. RADAR (ALOS PALSAR) CHANGE ----------
var palsar = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR');
function hhDb(year) {
  var img = palsar.filterDate(year + '-01-01', (year + 1) + '-01-01').first();
  // Convert digital numbers to decibels (formula from the Earth Engine catalog)
  return ee.Image(img).select('HH').toFloat().pow(2).log10().multiply(10).subtract(83)
    .focal_median(50, 'circle', 'meters')    // light speckle smoothing
    .rename('HH_dB');
}
var hh2007 = hhDb(2007);
var hh2010 = hhDb(2010);
var sarChange = hh2010.subtract(hh2007).rename('HH_change_dB');
var newBuiltSar = sarChange.gt(SAR_DB_THRESHOLD).rename('new_sar');

Map.addLayer(sarChange.clip(sites.geometry()),
  {min: -6, max: 6, palette: ['2166ac', 'f7f7f7', 'b2182b']},
  'Radar HH change 2007–2010 dB (red = stronger echo)', true);

// ---------- C + D TOGETHER: area flagged by each sensor and by both ----------
var flags = newBuiltLandsat.addBands(newBuiltSar)
  .addBands(newBuiltLandsat.and(newBuiltSar).rename('new_both'));
var flagArea = flags.multiply(ee.Image.pixelArea().divide(1e6));   // km²
var changeSites = flagArea.reduceRegions({
  collection: sites, reducer: ee.Reducer.sum(), scale: 30, tileScale: 4
});
print('New built-up area by site, km² (Landsat / radar / both)', changeSites);

Map.addLayer(newBuiltLandsat.and(newBuiltSar).selfMask().clip(sites.geometry()),
  {palette: ['ff00ff']}, 'New built-up confirmed by BOTH sensors', true);

// ---------- EXPORT one site table with everything ----------
var siteTable = builtSites.map(function (f) {
  var id = f.get('site');
  var l = ee.Feature(lightSites.filter(ee.Filter.eq('site', id)).first());
  var c = ee.Feature(changeSites.filter(ee.Filter.eq('site', id)).first());
  return f.set({
    sol_2004_05: l.get('sol_2004_05'), sol_2008_09: l.get('sol_2008_09'),
    new_landsat_km2: c.get('new_landsat'), new_sar_km2: c.get('new_sar'),
    new_both_km2: c.get('new_both')
  });
});
Export.table.toDrive({
  collection: siteTable,
  description: 'syria_sites_urban_change',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['site', 'role', 'built_km2_2000', 'built_km2_2005', 'built_km2_2010',
              'built_km2_2015', 'sol_2004_05', 'sol_2008_09',
              'new_landsat_km2', 'new_sar_km2', 'new_both_km2']
});
