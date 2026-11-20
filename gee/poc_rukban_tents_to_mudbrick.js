// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 3–4 Nov 2026.
// Run and tested by the author in Google Earth Engine.
// ---------------------------------------------------------------------
// =====================================================================
// CALIBRATION TEST — RUKBAN CAMP: TENTS -> MUD-BRICK, 2015–2022
// L-band radar (ALOS-2 PALSAR-2 yearly mosaics, 25 m, HH + HV)
// Syria water-stress proposal · 4 Nov 2026
//
// WHY THIS SITE: a well-documented informal settlement with known
// population and a known change in building type:
//   2014–15 founded, peak ~75,000–100,000 in 2016 (mostly tents)
//   ~42,000 early 2019; ~11,000 by July 2019; ~8,000 in 2024 (mud-brick houses)
//   closed June 2025
// If radar brightness RISES as tents are replaced by mud-brick walls,
// even while population FALLS, the radar tracks rigid structure, not people.
//
// SETUP
//  1. Click Run once; the map centres on Rukban.
//  2. Use the polygon tool (top-left of map) to draw around the camp's
//     built-up area. Avoid the two border berms and the trench: they are
//     long straight reflectors.
//  3. Under "Imports" at the top, rename "geometry" to campPoly. Run again.
// =====================================================================

var EXPORT_NOTE = 'radar = PALSAR-2 yearly mosaics, JAXA/ALOS/PALSAR/YEARLY/SAR_EPOCH';
var RING_INNER_M = 500;     // desert reference: 500–1500 m out from the camp outline
var RING_OUTER_M = 1500;

// Rukban (Wikipedia coordinates, 33.3109 N, 38.6685 E)
var rukban = ee.Geometry.Point([38.6685, 33.3109]);
Map.setCenter(38.6685, 33.3109, 15);
Map.setOptions('SATELLITE');

// Use the drawn outline if it exists; otherwise a 600 m circle as a placeholder
var camp = (typeof campPoly !== 'undefined') ? campPoly : rukban.buffer(600);
var ring = camp.buffer(RING_OUTER_M).difference(camp.buffer(RING_INNER_M), 1);
if (typeof campPoly === 'undefined') {
  print('No campPoly drawn yet — using a 600 m circle. Draw the outline for real results.');
}

// ---------- RADAR ----------
var palsar2 = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR_EPOCH');
var YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];
function mosaic(y) {
  return ee.Image(palsar2.filterDate(y + '-01-01', (y + 1) + '-01-01').first());
}
function toDb(img, band) {
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
  return ee.Feature(null, {
    year: String(y),
    contrast_HH_median_dB: ee.Number(cHH.get('dB_p50')).subtract(ee.Number(rHH.get('dB_p50'))),
    contrast_HH_p90_dB: ee.Number(cHH.get('dB_p90')).subtract(ee.Number(rHH.get('dB_p50'))),
    contrast_HV_median_dB: ee.Number(cHV.get('dB_p50')).subtract(ee.Number(rHV.get('dB_p50'))),
    camp_HH_median: cHH.get('dB_p50'),
    desert_HH_median: rHH.get('dB_p50')
  });
});
var table = ee.FeatureCollection(rows);
print('Rukban: camp vs desert by year', table);

print(ui.Chart.feature.byFeature(table, 'year',
    ['contrast_HH_median_dB', 'contrast_HH_p90_dB', 'contrast_HV_median_dB'])
  .setChartType('LineChart')
  .setOptions({title: 'Rukban: how much brighter the camp is than the desert (dB), 2015–2022',
               vAxis: {title: 'dB above desert'}, pointSize: 5}));

YEARS.forEach(function (y) {
  Map.addLayer(toDb(mosaic(y), 'HH').clip(camp.buffer(RING_OUTER_M)),
    {min: -25, max: 0}, 'Radar HH ' + y, false);
});

// ---------- LANDSAT 8 TRUE COLOUR, one summer composite per year ----------
var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(rukban);
YEARS.forEach(function (y) {
  var img = l8.filterDate(y + '-05-01', y + '-10-01').map(function (i) {
    return i.select(['SR_B4', 'SR_B3', 'SR_B2'], ['red', 'green', 'blue'])
      .multiply(0.0000275).add(-0.2)
      .updateMask(i.select('QA_PIXEL').bitwiseAnd(1 << 3).eq(0));
  }).median();
  Map.addLayer(img.clip(camp.buffer(RING_OUTER_M)), {min: 0, max: 0.35, gamma: 1.2},
    'Landsat 8 ' + y, false);
});

Map.addLayer(ring, {color: '00ff00'}, 'Desert reference ring', false);
Map.addLayer(ee.FeatureCollection([ee.Feature(camp)]).style({color: 'yellow', fillColor: '00000000'}),
  {}, 'Camp outline');

// =====================================================================
// READING THE RESULTS (compare with the population line in the header)
// • Low contrast in 2015–2017 (tent years) that RISES in 2018–2022
//   (mud-brick years) while population falls = radar sees walls, not tents.
//   That confirms the Al-Tanf/Al-Waleed reading and the Aleppo interpretation.
// • High contrast already in 2016 = tents/tarps at high density DO register;
//   then light shelter is not invisible and the Aleppo totals are a true low.
// • Mud brick is weaker than concrete (softer, rounder edges), so expect
//   smaller contrast than the border post's +13 dB.
// =====================================================================
