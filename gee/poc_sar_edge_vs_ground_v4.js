// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 3–4 Nov 2026.
// Run and tested by the author in Google Earth Engine (Dara'a).
// ---------------------------------------------------------------------
// =====================================================================
// PROOF OF CONCEPT v4A — EDGE BAND vs OPEN GROUND (no built-up threshold for the test)
// ALOS PALSAR yearly mosaics (L-band, 25 m), JAXA/ALOS/PALSAR/YEARLY/SAR
// Syria water-stress proposal · 3 Nov 2026
//
// IDEA: wetness changes from year to year and brightens or darkens open
// ground; buildings, once built, stay bright and steady. So:
//   • OPEN GROUND (far from the city) shows the moisture effect alone.
//   • CITY CORE (built-up in 2007) should stay nearly flat: buildings are stable.
//   • EDGE BAND (just outside the 2007 city) gets moisture PLUS any new building.
// If the edge band brightens MORE than open ground, the extra is construction.
// A wetter or drier year moves both together and cancels out.
//
// HOW TO RUN: paste into https://code.earthengine.google.com and click Run.
//   Console: acquisition dates, zone table, two charts, step-up area
//   Map: zones and the step-up layer (Layers menu, top right)
// =====================================================================

// ---------- SETTINGS (safe to edit) ----------
var CITY = 'Daraa';          // 'Aleppo', 'Daraa', 'Douma' or 'Raqqa'
var CORE_DB = -6;            // only used to OUTLINE the 2007 city; the test itself uses no threshold
var EDGE_DISTANCE_M = 500;   // width of the edge band outside the 2007 city
var GROUND_GAP_M = 1500;     // open-ground reference must be at least this far from the 2007 city
var SOIL_DB = -10;           // open-ground reference must read below this in 2007
var MAX_SLOPE_DEG = 5;       // ignore slopes
var SMOOTH_M = 50;           // speckle smoothing radius
var STEP_DB = 3;             // pixel map: brightened this much MORE than open ground, in both 2009 and 2010
var MIN_PATCH_PIXELS = 8;    // drop specks in the pixel map

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
Map.setOptions('HYBRID');
Map.addLayer(ee.FeatureCollection([ee.Feature(aoi)]).style({color: 'yellow', fillColor: '00000000'}),
  {}, 'Analysis circle');

// ---------- RADAR ----------
var palsar = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR');
var YEARS = [2007, 2008, 2009, 2010];

function mosaic(year) {
  return ee.Image(palsar.filterDate(year + '-01-01', (year + 1) + '-01-01').first());
}
function hhDb(year) {
  return mosaic(year).select('HH').toFloat().pow(2).log10().multiply(10).subtract(83)
    .focal_median(SMOOTH_M, 'circle', 'meters').rename('HH_dB').clip(aoi);
}
var hh = {};
YEARS.forEach(function (y) { hh[y] = hhDb(y); });

// When was each year's mosaic actually captured here? (band "date" = days since 1 Jan 1970)
var dates = ee.Dictionary(YEARS.reduce(function (acc, y) {
  var d = mosaic(y).select('date').reduceRegion({
    reducer: ee.Reducer.median(), geometry: aoi, scale: 100, maxPixels: 1e9}).get('date');
  acc[String(y)] = ee.Date(ee.Number(d).multiply(86400000)).format('YYYY-MM-dd');
  return acc;
}, {}));
print('Radar capture date at this city (median), by mosaic year', dates);

// ---------- ZONES ----------
var flat = ee.Terrain.slope(ee.Image('USGS/SRTMGL1_003')).lt(MAX_SLOPE_DEG);
var g10 = ee.Image('JRC/GHSL/P2023A/GHS_BUILT_S/2010').select('built_surface');

var core = hh[2007].gt(CORE_DB).and(flat);
var core2 = core.selfMask().connectedPixelCount(100, true).gte(MIN_PATCH_PIXELS).unmask(0).and(core);
var nearCity = core2.focal_max(EDGE_DISTANCE_M, 'circle', 'meters');
var edge = nearCity.and(core2.not()).and(flat);
var farFromCity = core2.focal_max(GROUND_GAP_M, 'circle', 'meters').not();
var ground = flat.and(farFromCity).and(g10.eq(0)).and(hh[2007].lt(SOIL_DB));

Map.addLayer(core2.selfMask(), {palette: ['00ffff']}, 'Zone: city core 2007', true, 0.5);
Map.addLayer(edge.selfMask().clip(aoi), {palette: ['ff8c00']}, 'Zone: edge band', true, 0.5);
Map.addLayer(ground.selfMask().clip(aoi), {palette: ['00cc00']}, 'Zone: open-ground reference', false, 0.4);

// ---------- ZONE STATISTICS ----------
// Median = typical pixel; 90th percentile = the brightest tenth, where new buildings show first.
function zoneStats(img, zone) {
  return img.updateMask(zone).reduceRegion({
    reducer: ee.Reducer.percentile([50, 90]), geometry: aoi,
    scale: 25, maxPixels: 1e9, bestEffort: true
  });
}
var rows = YEARS.map(function (y) {
  var e = zoneStats(hh[y], edge), g = zoneStats(hh[y], ground), k = zoneStats(hh[y], core2);
  return ee.Feature(null, {
    year: String(y),
    edge_p50: e.get('HH_dB_p50'), edge_p90: e.get('HH_dB_p90'),
    ground_p50: g.get('HH_dB_p50'), ground_p90: g.get('HH_dB_p90'),
    core_p50: k.get('HH_dB_p50')
  });
});
var base = rows[0];
var table = ee.FeatureCollection(rows.map(function (f) {
  function chg(key) { return ee.Number(f.get(key)).subtract(ee.Number(base.get(key))); }
  return f.set({
    ground_change: chg('ground_p50'),            // moisture effect
    core_change: chg('core_p50'),                // should stay near 0 (buildings are stable)
    edge_change: chg('edge_p50'),
    excess_p50: chg('edge_p50').subtract(chg('ground_p50')),   // edge minus moisture
    excess_p90: chg('edge_p90').subtract(chg('ground_p90'))    // brightest edge pixels minus moisture
  });
}));
print('Zone values and changes vs 2007 (dB)', table);

print(ui.Chart.feature.byFeature(table, 'year', ['ground_change', 'core_change', 'edge_change'])
  .setChartType('LineChart')
  .setOptions({title: CITY + ': change in typical brightness since 2007 (dB)',
               vAxis: {title: 'dB vs 2007'}, pointSize: 5,
               series: {0: {color: '2ca02c'}, 1: {color: '17becf'}, 2: {color: 'ff7f0e'}}}));

print(ui.Chart.feature.byFeature(table, 'year', ['excess_p50', 'excess_p90'])
  .setChartType('ColumnChart')
  .setOptions({title: CITY + ': edge brightening BEYOND the moisture effect (dB)',
               vAxis: {title: 'dB'},
               series: {0: {color: 'fdae6b'}, 1: {color: 'e6550d'}}}));

// ---------- PIXEL MAP: edge pixels that stepped up and stayed up ----------
var groundShift = {};
YEARS.forEach(function (y, i) {
  groundShift[y] = ee.Number(ee.Feature(table.filter(ee.Filter.eq('year', String(y))).first())
    .get('ground_change'));
});
function excess(y) { return hh[y].subtract(hh[2007]).subtract(groundShift[y]); }
var stepUp = excess(2009).gt(STEP_DB).and(excess(2010).gt(STEP_DB)).and(edge);
stepUp = stepUp.selfMask().connectedPixelCount(100, true).gte(MIN_PATCH_PIXELS).unmask(0).and(stepUp);
// The reverse, as a noise check
var stepDown = excess(2009).lt(-STEP_DB).and(excess(2010).lt(-STEP_DB)).and(edge);
stepDown = stepDown.selfMask().connectedPixelCount(100, true).gte(MIN_PATCH_PIXELS).unmask(0).and(stepDown);

var pix = ee.Image.pixelArea().divide(1e6);
function km2(m) {
  return ee.Number(pix.updateMask(m).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: aoi, scale: 25, maxPixels: 1e9}).get('area'));
}
var upKm2 = km2(stepUp), downKm2 = km2(stepDown), edgeKm2 = km2(edge);
print(ee.Dictionary({
  city: CITY,
  edge_band_km2: edgeKm2,
  stepped_up_and_stayed_km2: upKm2,
  stepped_up_pct_of_edge: upKm2.divide(edgeKm2).multiply(100),
  noise_check_stepped_down_km2: downKm2,
  up_to_down_ratio: upKm2.divide(downKm2.max(0.001))
}));

Map.addLayer(stepDown.selfMask(), {palette: ['0000ff']}, 'Noise check: stepped DOWN and stayed', false);
Map.addLayer(stepUp.selfMask(), {palette: ['ff00ff']}, 'Stepped UP beyond moisture, stayed (likely new building)', true);

// =====================================================================
// READING THE RESULTS
// Chart 1: green (open ground) shows the moisture swings. Cyan (city core)
//   should stay close to 0 — if it does, buildings really are stable and
//   moisture mainly affects open ground. Orange (edge) above green = extra
//   brightening at the edge.
// Chart 2: bars above 0 that grow over the years = construction at the edge
//   beyond what moisture explains. The 90th-percentile bar reacts first,
//   because new building affects only part of the edge band.
// Pixel map: magenta clusters should hug the city edge. Compare the
//   stepped-up area with the stepped-down noise check.
// =====================================================================
