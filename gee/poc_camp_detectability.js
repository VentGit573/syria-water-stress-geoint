// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 3–4 Nov 2026.
// Run and tested by the author in Google Earth Engine (border-post control positive; camp site inconclusive).
// ---------------------------------------------------------------------
// =====================================================================
// DETECTABILITY TEST — CAN L-BAND RADAR SEE A MAKESHIFT CAMP?
// Test sites: Al-Waleed camp (Iraq side) and Al-Tanf camp (no-man's land),
// Palestinian refugees from Baghdad, 2006–2010. Al-Tanf was closed on
// 1 Feb 2010 (UNHCR), so it should be present in the 2007–2009 radar
// mosaics and gone in 2010: a known change with a known date.
//
// HOW TO SET THE SITES (one-time, ~5 minutes)
//  1. Find each camp in Google Earth Pro historical imagery (2007–2009)
//     near the Al-Tanf / Al-Waleed border crossings.
//  2. Read the centre latitude/longitude of the tent area and its rough
//     radius in metres (most camps here are a few hundred metres across).
//  3. Enter them in SITES below and click Run.
//
// OUTPUTS: Console table + chart of camp vs surrounding desert brightness
// for each year; map layers of radar and Landsat true colour per year.
// =====================================================================

// ---------- SETTINGS ----------
var SITES = {
  // name: [longitude, latitude, radius of camp in metres]  <- REPLACE with your readings
  AlWaleed: [38.80, 33.40, 300],
  AlTanf:   [38.65, 33.50, 300]
};
var SITE = 'AlTanf';          // which site to analyse this run
var RING_INNER_M = 600;       // desert reference ring: from this distance...
var RING_OUTER_M = 2000;      // ...to this distance from the camp centre

// ---------- GEOMETRY ----------
var s = SITES[SITE];
var centre = ee.Geometry.Point([s[0], s[1]]);
var camp = centre.buffer(s[2]);
var ring = centre.buffer(RING_OUTER_M).difference(centre.buffer(RING_INNER_M), 1);
Map.centerObject(camp, 15);
Map.setOptions('SATELLITE');

// ---------- RADAR ----------
var palsar = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR');
var YEARS = [2007, 2008, 2009, 2010];
function mosaic(y) {
  return ee.Image(palsar.filterDate(y + '-01-01', (y + 1) + '-01-01').first());
}
function toDb(img, band) {
  // no smoothing here: camps are small, and we compare averages over areas
  return img.select(band).toFloat().pow(2).log10().multiply(10).subtract(83).rename('dB');
}
function stat(img, geom) {
  return img.reduceRegion({reducer: ee.Reducer.percentile([50, 90]),
                           geometry: geom, scale: 25, maxPixels: 1e8});
}

var rows = YEARS.map(function (y) {
  var m = mosaic(y);
  var hh = toDb(m, 'HH'), hv = toDb(m, 'HV');
  var cHH = stat(hh, camp), rHH = stat(hh, ring), cHV = stat(hv, camp), rHV = stat(hv, ring);
  var date = ee.Date(ee.Number(m.select('date').reduceRegion({
    reducer: ee.Reducer.median(), geometry: camp, scale: 25}).get('date')).multiply(86400000));
  return ee.Feature(null, {
    year: String(y),
    capture_date: date.format('YYYY-MM-dd'),
    camp_HH_median: cHH.get('dB_p50'), camp_HH_p90: cHH.get('dB_p90'),
    desert_HH_median: rHH.get('dB_p50'),
    camp_HV_median: cHV.get('dB_p50'), desert_HV_median: rHV.get('dB_p50'),
    contrast_HH_dB: ee.Number(cHH.get('dB_p50')).subtract(ee.Number(rHH.get('dB_p50'))),
    contrast_HH_p90_dB: ee.Number(cHH.get('dB_p90')).subtract(ee.Number(rHH.get('dB_p50'))),
    contrast_HV_dB: ee.Number(cHV.get('dB_p50')).subtract(ee.Number(rHV.get('dB_p50')))
  });
});
var table = ee.FeatureCollection(rows);
print(SITE + ': camp vs desert, by radar year', table);

print(ui.Chart.feature.byFeature(table, 'year',
    ['contrast_HH_dB', 'contrast_HH_p90_dB', 'contrast_HV_dB'])
  .setChartType('ColumnChart')
  .setOptions({title: SITE + ': how much brighter the camp is than the desert (dB)',
               vAxis: {title: 'dB above desert'}}));

YEARS.forEach(function (y) {
  Map.addLayer(toDb(mosaic(y), 'HH').clip(centre.buffer(RING_OUTER_M)),
    {min: -25, max: 0}, 'Radar HH ' + y, y === 2009);
});

// ---------- LANDSAT TRUE COLOUR, one summer composite per year ----------
var landsat = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
  .merge(ee.ImageCollection('LANDSAT/LE07/C02/T1_L2'))
  .filterBounds(camp);
YEARS.forEach(function (y) {
  var img = landsat.filterDate(y + '-05-01', y + '-10-01')
    .map(function (i) {
      var qa = i.select('QA_PIXEL');
      return i.select(['SR_B3', 'SR_B2', 'SR_B1'], ['red', 'green', 'blue'])
        .multiply(0.0000275).add(-0.2)
        .updateMask(qa.bitwiseAnd(1 << 3).eq(0));
    }).median();
  Map.addLayer(img.clip(centre.buffer(RING_OUTER_M)),
    {min: 0, max: 0.35, gamma: 1.2}, 'Landsat ' + y + ' (May–Sep)', false);
});

Map.addLayer(ring, {color: '00ff00'}, 'Desert reference ring', false);
Map.addLayer(ee.FeatureCollection([ee.Feature(camp)]).style({color: 'yellow', fillColor: '00000000'}),
  {}, 'Camp outline');

// =====================================================================
// READING THE RESULTS
// • Contrast above ~3 dB: the radar clearly sees the camp.
//   0–3 dB: weakly visible. Near 0: invisible to this radar.
// • Al-Tanf: contrast should be high in 2007–2009 and drop in 2010
//   (closed Feb 2010; check the capture dates, mosaics are mid-year).
//   If it drops, the method detects a known change on a known date.
// • HV contrast higher than HH contrast = the camp scatters like
//   "disorder" (your point): the HH-vs-HV vegetation filter would
//   wrongly drop it. That tells us to switch to the NDVI filter.
// =====================================================================
