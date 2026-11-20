// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, Nov 2026.
// SUPERSEDED: kept for provenance only. See docs/script_catalog.md.
// ---------------------------------------------------------------------
// =====================================================================
// PROOF OF CONCEPT v4B — CITY-EDGE SETTLEMENT: RADAR (HH + HV) + LANDSAT CHECK
// Syria water-stress proposal · 3 Nov 2026
//
// WHAT'S NEW vs v4A
//  1. Two radar polarisations. Buildings brighten mainly in HH (double bounce
//     off wall and ground). Trees and crops brighten strongly in HV (scattering
//     inside foliage). A pixel only counts as new building if HH rose by more
//     than HV did. Orchards, crops and other farm change are filtered out.
//  2. Main city body only. The edge band is drawn around the built-up area
//     connected to the city centre (including ribbon growth along roads that
//     touches it), not around every village and farm shed in the circle.
//  3. Landsat check (2003–05 vs 2009–11): a true-colour before/after pair for
//     visual comparison, a built-up index change map, and how much of the radar
//     result Landsat agrees with.
//
// HOW TO RUN: paste into https://code.earthengine.google.com and click Run.
// Aleppo is large: allow 3–6 minutes. Turn off map layers you don't need.
// If a print says "Computation timed out", set SCALE to 50 and run again.
// =====================================================================

// ---------- SETTINGS (safe to edit) ----------
var CITY = 'Aleppo';         // 'Aleppo', 'Daraa', 'Douma' or 'Raqqa'
var SCALE = 25;              // analysis resolution in metres (50 = faster, coarser)
var CORE_DB = -6;            // outlines the 2007 built-up area (not used in the change test)
var GAP_BRIDGE_M = 150;      // gaps smaller than this still count as "connected" to the city
var EDGE_DISTANCE_M = 750;   // edge band width outside the main city body
var GROUND_GAP_M = 1500;     // open-ground reference at least this far from any built-up
var SOIL_DB = -10;           // open-ground reference must read below this in 2007
var MAX_SLOPE_DEG = 5;
var SMOOTH_M = 50;
var STEP_DB = 3;             // HH must rise this much beyond the ground shift, in 2009 AND 2010
var POL_MARGIN_DB = 1;       // ...and by at least this much MORE than HV rose
var MIN_PATCH_PIXELS = 8;
var RUN_LANDSAT = true;      // set false to skip the Landsat section (faster)
var BUI_STEP = 0.10;         // Landsat: rise in built-up index counted as new built-up

var CITIES = {
  Aleppo: {lon: 37.16, lat: 36.20, radius: 15000},
  Daraa:  {lon: 36.10, lat: 32.62, radius: 8000},
  Douma:  {lon: 36.40, lat: 33.57, radius: 10000},
  Raqqa:  {lon: 39.01, lat: 35.95, radius: 8000}
};

// ---------- AREA OF INTEREST ----------
var c = CITIES[CITY];
var centre = ee.Geometry.Point([c.lon, c.lat]);
var aoi = centre.buffer(c.radius);
Map.centerObject(aoi, 11);
Map.setOptions('HYBRID');
Map.addLayer(ee.FeatureCollection([ee.Feature(aoi)]).style({color: 'yellow', fillColor: '00000000'}),
  {}, 'Analysis circle');

// ---------- RADAR: HH and HV in dB ----------
var palsar = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR');
var YEARS = [2007, 2008, 2009, 2010];
function mosaic(y) {
  return ee.Image(palsar.filterDate(y + '-01-01', (y + 1) + '-01-01').first());
}
function toDb(img, band) {
  // Earth Engine catalog formula: 10*log10(DN^2) - 83
  return img.select(band).toFloat().pow(2).log10().multiply(10).subtract(83)
    .focal_median(SMOOTH_M, 'circle', 'meters').rename('dB').clip(aoi);
}
var hh = {}, hv = {};
YEARS.forEach(function (y) {
  var m = mosaic(y);
  hh[y] = toDb(m, 'HH');
  hv[y] = toDb(m, 'HV');
});

// ---------- ZONES ----------
var flat = ee.Terrain.slope(ee.Image('USGS/SRTMGL1_003')).lt(MAX_SLOPE_DEG);
var g10 = ee.Image('JRC/GHSL/P2023A/GHS_BUILT_S/2010').select('built_surface');
function dropSpecks(m) {
  return m.selfMask().connectedPixelCount(100, true).gte(MIN_PATCH_PIXELS).unmask(0).and(m);
}
var core = dropSpecks(hh[2007].gt(CORE_DB).and(flat));

// Main city body = built-up connected to the city centre (small gaps bridged)
var bridge = core.focal_max(GAP_BRIDGE_M, 'circle', 'meters');
var seed = ee.Image(0).paint(centre.buffer(500), 1).selfMask();
var reach = ee.Image(1).updateMask(bridge)
  .cumulativeCost({source: seed, maxDistance: c.radius * 2});
var mainBody = core.and(reach.gte(0).unmask(0));

var edge = mainBody.focal_max(EDGE_DISTANCE_M, 'circle', 'meters')
  .and(core.not()).and(flat).clip(aoi);
var ground = flat.and(core.focal_max(GROUND_GAP_M, 'circle', 'meters').not())
  .and(g10.eq(0)).and(hh[2007].lt(SOIL_DB)).clip(aoi);

Map.addLayer(core.selfMask(), {palette: ['80ffff']}, 'Built-up 2007 (all)', false, 0.4);
Map.addLayer(mainBody.selfMask(), {palette: ['00ffff']}, 'Main city body 2007', true, 0.5);
Map.addLayer(edge.selfMask(), {palette: ['ff8c00']}, 'Edge band', false, 0.4);
Map.addLayer(ground.selfMask(), {palette: ['00cc00']}, 'Open-ground reference', false, 0.4);

// ---------- GROUND SHIFT (moisture / farming / calibration) for HH and HV ----------
function median(img, zone) {
  return ee.Number(img.updateMask(zone).reduceRegion({
    reducer: ee.Reducer.median(), geometry: aoi, scale: SCALE, maxPixels: 1e9, bestEffort: true
  }).get('dB'));
}
var shiftHH = {}, shiftHV = {};
var hh07g = median(hh[2007], ground), hv07g = median(hv[2007], ground);
YEARS.forEach(function (y) {
  shiftHH[y] = median(hh[y], ground).subtract(hh07g);
  shiftHV[y] = median(hv[y], ground).subtract(hv07g);
});
print('Open-ground shift vs 2007 (dB)', ee.Dictionary({
  HH_2008: shiftHH[2008], HH_2009: shiftHH[2009], HH_2010: shiftHH[2010],
  HV_2008: shiftHV[2008], HV_2009: shiftHV[2009], HV_2010: shiftHV[2010]}));

// Brightening beyond the ground shift
function exHH(y) { return hh[y].subtract(hh[2007]).subtract(shiftHH[y]); }
function exHV(y) { return hv[y].subtract(hv[2007]).subtract(shiftHV[y]); }

// ---------- RADAR TEST ----------
var hhStepped = exHH(2009).gt(STEP_DB).and(exHH(2010).gt(STEP_DB)).and(edge);
var buildingLike = exHH(2009).subtract(exHV(2009)).gt(POL_MARGIN_DB)
  .and(exHH(2010).subtract(exHV(2010)).gt(POL_MARGIN_DB));
var radarNew = dropSpecks(hhStepped.and(buildingLike));
var vegLike  = dropSpecks(hhStepped.and(buildingLike.not()));   // stepped up, but HV rose as much: crops/trees
// Noise check: the mirror image (HH dropped, and dropped more than HV)
var radarLost = dropSpecks(exHH(2009).lt(-STEP_DB).and(exHH(2010).lt(-STEP_DB))
  .and(exHH(2010).subtract(exHV(2010)).lt(-POL_MARGIN_DB)).and(edge));

Map.addLayer(vegLike.selfMask(), {palette: ['00ff00']}, 'Filtered out: vegetation-like change', false);
Map.addLayer(radarLost.selfMask(), {palette: ['0000ff']}, 'Noise check: building-like LOSS', false);
Map.addLayer(radarNew.selfMask(), {palette: ['ff00ff']}, 'RADAR: new building-like growth 2007–2010', true);

// ---------- AREA HELPER ----------
var pix = ee.Image.pixelArea().divide(1e6);
function km2(m) {
  return ee.Number(pix.updateMask(m).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: aoi, scale: SCALE, maxPixels: 1e9, bestEffort: true
  }).get('area'));
}

var summary = {
  city: CITY,
  main_body_2007_km2: km2(mainBody),
  edge_band_km2: km2(edge),
  radar_new_building_like_km2: km2(radarNew),
  radar_filtered_vegetation_like_km2: km2(vegLike),
  radar_noise_check_loss_km2: km2(radarLost)
};

// ---------- LANDSAT CHECK ----------
if (RUN_LANDSAT) {
  var landsat = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
    .merge(ee.ImageCollection('LANDSAT/LE07/C02/T1_L2'))
    .filterBounds(aoi)
    .filter(ee.Filter.calendarRange(6, 9, 'month'));   // dry season: fields bare, consistent light
  function prep(img) {
    var qa = img.select('QA_PIXEL');
    var clear = qa.bitwiseAnd(1 << 3).eq(0).and(qa.bitwiseAnd(1 << 4).eq(0));
    // Landsat 5/7: B1 blue, B2 green, B3 red, B4 NIR, B5 SWIR1
    return img.select(['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5'],
                      ['blue', 'green', 'red', 'nir', 'swir1'])
      .multiply(0.0000275).add(-0.2).updateMask(clear);
  }
  function comp(y1, y2) {
    var col = landsat.filter(ee.Filter.calendarRange(y1, y2, 'year'));
    print('Landsat scenes ' + y1 + '–' + y2 + ' (want 10+):', col.size());
    return col.map(prep).median().clip(aoi);
  }
  var early = comp(2003, 2005);
  var late  = comp(2009, 2011);
  function bui(img) {
    return img.normalizedDifference(['swir1', 'nir'])
      .subtract(img.normalizedDifference(['nir', 'red']));
  }
  var buiChange = bui(late).subtract(bui(early));
  var lateNdvi = late.normalizedDifference(['nir', 'red']);
  var landsatNew = dropSpecks(buiChange.gt(BUI_STEP).and(lateNdvi.lt(0.2)).and(edge));

  var tc = {bands: ['red', 'green', 'blue'], min: 0, max: 0.3, gamma: 1.2};
  Map.addLayer(early, tc, 'Landsat true colour 2003–05 (visual)', false);
  Map.addLayer(late,  tc, 'Landsat true colour 2009–11 (visual)', false);
  Map.addLayer(buiChange, {min: -0.2, max: 0.2, palette: ['1a9850', 'ffffbf', 'd73027']},
    'Landsat built-up index change (red = more built-up)', false);
  Map.addLayer(landsatNew.selfMask(), {palette: ['ffa500']}, 'LANDSAT: new built-up', false);
  Map.addLayer(radarNew.and(landsatNew).selfMask(), {palette: ['ff0000']},
    'BOTH radar and Landsat agree', true);

  var radarKm2 = summary.radar_new_building_like_km2;
  var bothKm2 = km2(radarNew.and(landsatNew));
  summary.landsat_new_km2 = km2(landsatNew);
  summary.both_agree_km2 = bothKm2;
  summary.landsat_agrees_with_radar_pct = bothKm2.divide(radarKm2.max(0.001)).multiply(100);
}

print('SUMMARY', ee.Dictionary(summary));

// =====================================================================
// READING THE RESULTS
// • Map: magenta (radar) should sit along the cyan city body, especially on
//   the outskirts and along roads. Green ("filtered out") shows what the HV
//   test removed — it should look like fields and orchards.
// • Red = radar and Landsat both say new built-up: the strongest candidates.
// • Visual check: switch between the two Landsat true-colour layers over a
//   red or magenta cluster. New settlement looks like grey/beige texture
//   with a street pattern replacing smooth field colour. At 30 m you see
//   blocks, not houses; use Google Earth Pro historical imagery to confirm.
// • SUMMARY: radar_new vs noise_check_loss gives the signal-to-noise ratio.
//   landsat_agrees_with_radar_pct above ~40% is encouraging; low values mean
//   one of the sensors is picking up something else.
// =====================================================================
