// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, Nov 2026.
// SUPERSEDED: kept for provenance only. See docs/script_catalog.md.
// ---------------------------------------------------------------------
// =====================================================================
// PROOF OF CONCEPT v3 — ONE CITY'S URBAN-EDGE EXPANSION IN RADAR, 2007–2010
// ALOS PALSAR yearly mosaics (L-band, 25 m), JAXA/ALOS/PALSAR/YEARLY/SAR
// Syria water-stress proposal · 3 Nov 2026
//
// NEW IN v3: year-to-year brightness correction. Each year's mosaic is shifted
// so that stable open ground (no buildings, flat, clearly soil) has the same
// median brightness as in 2007. This removes most of the soil-moisture /
// capture-date offset (e.g. fields reading 2–4 dB brighter in 2010).
// The script reports results BOTH with and without the correction, so you
// can see what the correction changes.
//
// HOW TO RUN: paste into https://code.earthengine.google.com and click Run.
//   Console: brightness offsets, two charts, and two summary tables
//   Map: corrected layers (Layers menu, top right)
//   Tasks: optional GeoTIFF export for ArcGIS Pro
// =====================================================================

// ---------- SETTINGS (safe to edit) ----------
var CITY = 'Daraa';           // 'Aleppo', 'Daraa', 'Douma' or 'Raqqa'
var URBAN_DB = -6;            // HH backscatter (dB) above which a pixel counts as built-up
var SMOOTH_M = 50;            // speckle smoothing radius in metres
var MAX_SLOPE_DEG = 5;        // ignore steeper ground (bright slopes mimic buildings)
var MIN_PATCH_PIXELS = 8;     // drop specks smaller than this (8 px x 25 m ≈ 0.5 ha)
var EDGE_DISTANCE_M = 500;    // boundary expansion = new growth within this distance of 2007 built-up
var GHSL_NEW_M2 = 500;        // GHSL 100 m cell counts as new if it gained this many m²
var REF_SOIL_DB = -10;        // reference ground must read below this in 2007 (clearly soil)
var EXPORT_FOLDER = 'syria_water_stress';

var CITIES = {
  Aleppo: {lon: 37.16, lat: 36.20, radius: 15000},
  Daraa:  {lon: 36.10, lat: 32.62, radius: 8000},
  Douma:  {lon: 36.40, lat: 33.57, radius: 10000},
  Raqqa:  {lon: 39.01, lat: 35.95, radius: 8000}
};

// ---------- AREA OF INTEREST ----------
var c = CITIES[CITY];
var aoi = ee.Geometry.Point([c.lon, c.lat]).buffer(c.radius);
Map.centerObject(aoi, 12);
Map.setOptions('HYBRID');   // basemap is current imagery (after the war)
Map.addLayer(ee.FeatureCollection([ee.Feature(aoi)]).style({color: 'yellow', fillColor: '00000000'}),
  {}, 'Analysis circle');

// ---------- RADAR in dB ----------
var palsar = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR');
var YEARS = [2007, 2008, 2009, 2010];

function hhDb(year) {
  var img = ee.Image(palsar.filterDate(year + '-01-01', (year + 1) + '-01-01').first());
  // DN to decibels (Earth Engine catalog formula): 10*log10(DN^2) - 83
  return img.select('HH').toFloat().pow(2).log10().multiply(10).subtract(83)
    .focal_median(SMOOTH_M, 'circle', 'meters')
    .rename('HH_dB')
    .clip(aoi);
}

var flat = ee.Terrain.slope(ee.Image('USGS/SRTMGL1_003')).lt(MAX_SLOPE_DEG);
var rawHH = {};
YEARS.forEach(function (y) { rawHH[y] = hhDb(y); });

// ---------- BRIGHTNESS CORRECTION ----------
// Reference ground: flat, no buildings in GHSL 2010, and clearly soil in 2007.
var g05 = ee.Image('JRC/GHSL/P2023A/GHS_BUILT_S/2005').select('built_surface');
var g10 = ee.Image('JRC/GHSL/P2023A/GHS_BUILT_S/2010').select('built_surface');
var refMask = flat.and(g10.eq(0)).and(rawHH[2007].lt(REF_SOIL_DB));
Map.addLayer(refMask.selfMask().clip(aoi), {palette: ['00ff00']},
  'Reference ground used for correction', false, 0.4);

function refMedian(img) {
  return ee.Number(img.updateMask(refMask).reduceRegion({
    reducer: ee.Reducer.median(), geometry: aoi, scale: 25, maxPixels: 1e9, bestEffort: true
  }).get('HH_dB'));
}
var base = refMedian(rawHH[2007]);
var offsets = {};
var corrHH = {};
YEARS.forEach(function (y) {
  offsets[y] = refMedian(rawHH[y]).subtract(base);   // + means this year reads brighter
  corrHH[y] = rawHH[y].subtract(offsets[y]);
});
print('Brightness offset vs 2007 (dB) — positive = year read brighter, removed in "corrected"',
      ee.Dictionary({'2007': offsets[2007], '2008': offsets[2008],
                     '2009': offsets[2009], '2010': offsets[2010]}));
print('Reference ground area (km²)', ee.Image.pixelArea().divide(1e6).updateMask(refMask)
  .reduceRegion({reducer: ee.Reducer.sum(), geometry: aoi, scale: 25, maxPixels: 1e9}).get('area'));

// ---------- ANALYSIS (run twice: raw and corrected) ----------
var pixKm2 = ee.Image.pixelArea().divide(1e6);
function areaKm2(mask) {
  return ee.Number(pixKm2.updateMask(mask).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: aoi, scale: 25, maxPixels: 1e9
  }).get('area'));
}
function dropSpecks(mask) {
  return mask.selfMask().connectedPixelCount(100, true)
    .gte(MIN_PATCH_PIXELS).unmask(0).and(mask);
}
var ghslNew = g10.subtract(g05).gt(GHSL_NEW_M2).clip(aoi);

function analyse(hh, label) {
  var urban = {};
  YEARS.forEach(function (y) { urban[y] = hh[y].gt(URBAN_DB).and(flat); });

  var newAll  = dropSpecks(urban[2007].not().and(urban[2009]).and(urban[2010]));
  var lost    = dropSpecks(urban[2007].and(urban[2009].not()).and(urban[2010].not()));
  var nearEdge = urban[2007].focal_max(EDGE_DISTANCE_M, 'circle', 'meters');
  var newEdge = newAll.and(nearEdge);
  var newIso  = newAll.and(nearEdge.not());

  var base07 = areaKm2(urban[2007]);
  var nNew = areaKm2(newEdge);
  var nLost = areaKm2(lost);
  var summary = ee.Dictionary({
    version: label,
    builtup_2007_km2: base07,
    new_edge_growth_km2: nNew,
    noise_check_lost_km2: nLost,
    growth_to_noise_ratio: nNew.divide(nLost.max(0.001)),
    growth_upper_pct: nNew.divide(base07).multiply(100),
    growth_minus_noise_pct: nNew.subtract(nLost).divide(base07).multiply(100),
    new_isolated_km2: areaKm2(newIso),
    also_flagged_by_GHSL_pct: areaKm2(newEdge.and(ghslNew)).divide(nNew).multiply(100)
  });
  var yearly = ee.FeatureCollection(YEARS.map(function (y) {
    return ee.Feature(null, {year: String(y), km2: areaKm2(urban[y]), version: label});
  }));
  return {summary: summary, yearly: yearly, urban: urban, newEdge: newEdge, lost: lost, newIso: newIso};
}

var raw = analyse(rawHH, 'raw');
var cor = analyse(corrHH, 'corrected');

print('RAW (no correction)', raw.summary);
print('CORRECTED', cor.summary);

// Side-by-side yearly chart
var both = ee.FeatureCollection(YEARS.map(function (y) {
  return ee.Feature(null, {
    year: String(y),
    raw: ee.Feature(raw.yearly.filter(ee.Filter.eq('year', String(y))).first()).get('km2'),
    corrected: ee.Feature(cor.yearly.filter(ee.Filter.eq('year', String(y))).first()).get('km2')
  });
}));
print(ui.Chart.feature.byFeature(both, 'year', ['raw', 'corrected'])
  .setChartType('ColumnChart')
  .setOptions({title: CITY + ': radar built-up area inside circle (km²), raw vs corrected',
               vAxis: {title: 'km²'}}));

print(ui.Chart.image.histogram({image: corrHH[2010], region: aoi, scale: 25, maxBuckets: 120})
  .setOptions({title: CITY + ': corrected HH 2010 (dB) — built-up is the long right tail',
               hAxis: {title: 'dB'}, legend: {position: 'none'}}));

// ---------- MAP LAYERS (corrected version) ----------
var dbVis = {min: -20, max: 0};
Map.addLayer(rawHH[2010], dbVis, 'Radar HH 2010 raw (dB)', false);
Map.addLayer(corrHH[2010], dbVis, 'Radar HH 2010 corrected (dB)', false);
Map.addLayer(rawHH[2007], dbVis, 'Radar HH 2007 (dB, reference year)', false);
Map.addLayer(ghslNew.selfMask(), {palette: ['ffa500']}, 'GHSL new built-up 2005–2010', false, 0.6);
Map.addLayer(cor.urban[2007].selfMask(), {palette: ['00ffff']}, 'Built-up 2007', true, 0.5);
Map.addLayer(cor.lost.selfMask(), {palette: ['0000ff']}, 'Noise check: "lost" (corrected)', false);
Map.addLayer(cor.newIso.selfMask(), {palette: ['ffff00']}, 'New but isolated (corrected)', false);
Map.addLayer(raw.newEdge.selfMask(), {palette: ['ff8080']}, 'NEW edge growth (raw)', false);
Map.addLayer(cor.newEdge.selfMask(), {palette: ['ff00ff']}, 'NEW edge growth (corrected)', true);

// ---------- OPTIONAL EXPORT for ArcGIS Pro ----------
Export.image.toDrive({
  image: rawHH[2007].rename('HH_2007')
    .addBands(corrHH[2010].rename('HH_2010_corrected'))
    .addBands(cor.urban[2007].rename('urban_2007').toFloat())
    .addBands(cor.newEdge.rename('new_edge_corrected').toFloat()),
  description: 'sar_poc_v3_' + CITY,
  folder: EXPORT_FOLDER,
  region: aoi,
  scale: 25,
  crs: 'EPSG:4326',
  maxPixels: 1e9
});

// =====================================================================
// READING THE RESULTS
// • Offsets: expect 2010 to be positive (brighter) if your field readings
//   were right. Offsets near 0 mean the correction changes little.
// • Compare RAW vs CORRECTED: a good correction lowers "lost" (noise)
//   more than it lowers "new", so growth_to_noise_ratio goes up.
// • Caveat: buildings respond less to soil moisture than open ground does,
//   so subtracting a ground-based offset can slightly under-count built-up
//   in bright years. Report raw and corrected together as a range.
// =====================================================================
