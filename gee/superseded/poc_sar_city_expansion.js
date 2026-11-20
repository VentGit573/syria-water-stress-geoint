// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, Nov 2026.
// SUPERSEDED: kept for provenance only. See docs/script_catalog.md.
// ---------------------------------------------------------------------
// =====================================================================
// PROOF OF CONCEPT — ONE CITY'S URBAN-EDGE EXPANSION IN RADAR, 2007–2010
// ALOS PALSAR yearly mosaics (L-band, 25 m), JAXA/ALOS/PALSAR/YEARLY/SAR
// Syria water-stress proposal · 3 Nov 2026
//
// HOW TO RUN: paste into https://code.earthengine.google.com and click Run.
//   Console tab : histogram, urban-area chart, summary numbers
//   Map         : radar layers and the new-growth layer (Layers menu, top right)
//   Tasks tab   : optional GeoTIFF export for ArcGIS Pro (click RUN)
// =====================================================================

// ---------- SETTINGS (safe to edit) ----------
var CITY = 'Aleppo';          // 'Aleppo', 'Daraa', 'Douma' or 'Raqqa'
var URBAN_DB = -6;            // HH backscatter (dB) above which a pixel counts as built-up.
                              // Check it with the histogram and Inspector (see notes at bottom).
var SMOOTH_M = 50;            // speckle smoothing radius in metres
var MAX_SLOPE_DEG = 5;        // ignore steeper ground: slopes facing the satellite look bright like buildings
var MIN_PATCH_PIXELS = 8;     // drop specks of new growth smaller than this (8 px x 25 m ≈ 0.5 ha)
var EDGE_DISTANCE_M = 500;    // "boundary expansion" = new growth within this distance of 2007 built-up
var GHSL_NEW_M2 = 500;        // GHSL cell (100 m) counts as "new built-up" if it gained this many m²
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
Map.centerObject(aoi, 11);
Map.setOptions('HYBRID');   // note: the basemap is current imagery, i.e. after the war
Map.addLayer(ee.FeatureCollection([ee.Feature(aoi)]).style({color: 'yellow', fillColor: '00000000'}),
  {}, 'Analysis circle');

// ---------- RADAR: HH backscatter in dB for each year ----------
var palsar = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR');
var YEARS = [2007, 2008, 2009, 2010];

function hhDb(year) {
  var img = ee.Image(palsar.filterDate(year + '-01-01', (year + 1) + '-01-01').first());
  // DN to decibels, formula from the Earth Engine catalog: 10*log10(DN^2) - 83
  return img.select('HH').toFloat().pow(2).log10().multiply(10).subtract(83)
    .focal_median(SMOOTH_M, 'circle', 'meters')
    .rename('HH_dB')
    .clip(aoi);
}

// Flat-ground mask from SRTM elevation (30 m)
var flat = ee.Terrain.slope(ee.Image('USGS/SRTMGL1_003')).lt(MAX_SLOPE_DEG);

var hh = {};
var urban = {};
YEARS.forEach(function (y) {
  hh[y] = hhDb(y);
  urban[y] = hh[y].gt(URBAN_DB).and(flat).rename('urban');
});

// Histogram to choose the threshold: built-up areas form the bright tail on the right
print(ui.Chart.image.histogram({image: hh[2010], region: aoi, scale: 25, maxBuckets: 120})
  .setOptions({title: CITY + ': HH backscatter 2010 (dB) — pick URBAN_DB between the two humps',
               hAxis: {title: 'dB'}, legend: {position: 'none'}}));

// ---------- 1. Built-up area each year ----------
var pixKm2 = ee.Image.pixelArea().divide(1e6);
function areaKm2(mask) {
  return pixKm2.updateMask(mask).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: aoi, scale: 25, maxPixels: 1e9
  }).get('area');
}

var yearly = ee.FeatureCollection(YEARS.map(function (y) {
  return ee.Feature(null, {year: y, urban_km2: areaKm2(urban[y])});
}));
print(ui.Chart.feature.byFeature(yearly, 'year', 'urban_km2')
  .setChartType('ColumnChart')
  .setOptions({title: CITY + ': radar built-up area inside circle (km²)',
               vAxis: {title: 'km²'}, legend: {position: 'none'}}));

// ---------- 2. New growth that persists ----------
// New = not built-up in 2007, but built-up in BOTH 2009 and 2010.
// Requiring two later years filters out one-year noise from soil moisture.
// Then remove specks smaller than MIN_PATCH_PIXELS.
function dropSpecks(mask) {
  return mask.selfMask().connectedPixelCount(100, true)
    .gte(MIN_PATCH_PIXELS).unmask(0).and(mask);
}
var newAll = dropSpecks(urban[2007].not().and(urban[2009]).and(urban[2010])).rename('new');
// "Lost" = the reverse. Real demolition was rare before 2011, so this is mostly noise:
// it shows roughly how much of the "new" figure could be noise too.
var lostUrban = dropSpecks(urban[2007].and(urban[2009].not()).and(urban[2010].not())).rename('lost');

// Boundary expansion: new growth touching or near the 2007 built-up area.
// (New patches far from anything are more likely noise or isolated farms.)
var nearEdge = urban[2007].focal_max(EDGE_DISTANCE_M, 'circle', 'meters');
var newUrban = newAll.and(nearEdge).rename('new');
var newIsolated = newAll.and(nearEdge.not()).rename('isolated');

var newKm2  = ee.Number(areaKm2(newUrban));
var lostKm2 = ee.Number(areaKm2(lostUrban));
var base07  = ee.Number(areaKm2(urban[2007]));

// ---------- 3. Cross-check against GHSL (independent, optical-based) ----------
var g05 = ee.Image('JRC/GHSL/P2023A/GHS_BUILT_S/2005').select('built_surface');
var g10 = ee.Image('JRC/GHSL/P2023A/GHS_BUILT_S/2010').select('built_surface');
var ghslNew = g10.subtract(g05).gt(GHSL_NEW_M2).clip(aoi);
var overlapKm2 = ee.Number(areaKm2(newUrban.and(ghslNew)));

print(ee.Dictionary({
  city: CITY,
  threshold_dB: URBAN_DB,
  builtup_2007_km2: base07,
  new_edge_growth_2007_to_2010_km2: newKm2,
  new_isolated_patches_km2: areaKm2(newIsolated),
  growth_pct: newKm2.divide(base07).multiply(100),
  noise_check_lost_km2: lostKm2,
  new_also_flagged_by_GHSL_pct: overlapKm2.divide(newKm2).multiply(100)
}));

// ---------- MAP LAYERS ----------
var dbVis = {min: -20, max: 0};
Map.addLayer(hh[2007], dbVis, 'Radar HH 2007 (dB)', false);
Map.addLayer(hh[2010], dbVis, 'Radar HH 2010 (dB)', false);
Map.addLayer(ee.Image.rgb(hh[2010], hh[2007], hh[2007]).unitScale(-20, 0), {},
  'Change composite (red = brighter in 2010)', false);
Map.addLayer(urban[2007].selfMask(), {palette: ['00ffff']}, 'Built-up 2007 (radar)', true, 0.5);
Map.addLayer(ghslNew.selfMask(), {palette: ['ffa500']}, 'GHSL new built-up 2005–2010', false, 0.6);
Map.addLayer(lostUrban.selfMask(), {palette: ['0000ff']}, 'Noise check: "lost" 2007–2010', false);
Map.addLayer(flat.not().selfMask().clip(aoi), {palette: ['808080']}, 'Excluded: slopes', false, 0.5);
Map.addLayer(newIsolated.selfMask(), {palette: ['ffff00']}, 'New but isolated (not edge growth)', false);
Map.addLayer(newUrban.selfMask(), {palette: ['ff00ff']}, 'NEW edge growth 2007–2010 (radar)', true);

// ---------- OPTIONAL EXPORT for ArcGIS Pro ----------
// Bands: HH dB for 2007 and 2010, built-up flag 2007, new growth flag
Export.image.toDrive({
  image: hh[2007].rename('HH_2007').addBands(hh[2010].rename('HH_2010'))
    .addBands(urban[2007].rename('urban_2007').toFloat())
    .addBands(newUrban.toFloat()),
  description: 'sar_poc_' + CITY,
  folder: EXPORT_FOLDER,
  region: aoi,
  scale: 25,
  crs: 'EPSG:4326',
  maxPixels: 1e9
});

// =====================================================================
// NOTES — calibrating the threshold (do this once per city)
// 1. Look at the histogram in the Console. Desert soil forms a big hump
//    around -20 to -12 dB; buildings form a smaller bright tail above it.
//    Set URBAN_DB in the dip between them.
// 2. Click the Inspector tab (top right), then click the map on the old
//    city centre and on open desert. Read the 'Radar HH 2010' values.
//    The threshold should sit between them.
// 3. Re-run. Good signs: cyan (2007 built-up) covers the city and not the
//    fields; magenta (new) sits on the city edge rather than scattered
//    across farmland; the noise-check "lost" area is much smaller than the
//    "new" area; a fair share of new pixels is also flagged by GHSL.
// =====================================================================
