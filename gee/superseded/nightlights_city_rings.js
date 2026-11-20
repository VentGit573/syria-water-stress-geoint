// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, Nov 2026.
// SUPERSEDED: kept for provenance only. See docs/script_catalog.md.
// ---------------------------------------------------------------------
// =====================================================================
// NIGHT LIGHTS — DID CITIES BRIGHTEN OUTWARD WHILE THE COUNTRYSIDE DIMMED?
// DMSP-OLS night-time lights (yearly, ~1 km), satellite F16 only (2004–2009)
// Syria water-stress proposal · 4 Nov 2026
//
// METHOD: for each city, sum the lights in rings outward from the centre
// (0–2 km, 2–4 km ... 18–20 km) and compare 2004–05 with 2008–09.
// New settlement at the edge should show as the OUTER rings brightening
// more than the inner ones. City cores are saturated, so look at the edges.
//
// HOW TO RUN: paste into the Code Editor and click Run.
//   Console: one chart per city (% change by ring) + the F16 image list
//   Tasks:   CSV of every ring, city and year
// =====================================================================

// ---------- SETTINGS ----------
var RING_WIDTH_KM = 2;
var MAX_RADIUS_KM = 20;
var LIT_DN = 6;                 // pixel counts as "lit" at or above this (0–63 scale)
var EXPORT_FOLDER = 'syria_water_stress';
var CITIES = {
  Aleppo:   [37.16, 36.20],
  Damascus: [36.29, 33.51],
  Daraa:    [36.10, 32.62],
  Homs:     [36.72, 34.73],
  Hama:     [36.75, 35.13],
  Raqqa:    [39.01, 35.95],
  Hasakah:  [40.75, 36.50],
  DeirEzZor:[40.14, 35.33]
};

// ---------- DATA ----------
var dmsp = ee.ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS')
  .select('stable_lights')
  .filter(ee.Filter.stringStartsWith('system:index', 'F16'));
print('F16 images used (want 2004 to 2009):', dmsp.aggregate_array('system:index'));

var YEARS = [2004, 2005, 2006, 2007, 2008, 2009];
function yearImg(y) {
  return ee.Image(dmsp.filterDate(y + '-01-01', (y + 1) + '-01-01').mean());
}

// ---------- RINGS ----------
function rings(name, lonlat) {
  var c = ee.Geometry.Point(lonlat);
  var list = [];
  for (var r = 0; r < MAX_RADIUS_KM; r += RING_WIDTH_KM) {
    var outer = c.buffer((r + RING_WIDTH_KM) * 1000);
    var geom = r === 0 ? outer : outer.difference(c.buffer(r * 1000), 100);
    list.push(ee.Feature(geom, {city: name, ring_km: r + RING_WIDTH_KM / 2,
                                ring_label: r + '-' + (r + RING_WIDTH_KM) + ' km'}));
  }
  return list;
}
var allRings = [];
Object.keys(CITIES).forEach(function (k) { allRings = allRings.concat(rings(k, CITIES[k])); });
allRings = ee.FeatureCollection(allRings);

// One band per year: summed light, and lit area
var stack = ee.Image.cat(YEARS.map(function (y) {
  var img = yearImg(y);
  var pixKm2 = ee.Image.pixelArea().divide(1e6);
  return img.rename('sol_' + y)
    .addBands(pixKm2.updateMask(img.gte(LIT_DN)).unmask(0).rename('litkm2_' + y));
}));
var table = stack.reduceRegions({collection: allRings, reducer: ee.Reducer.sum(), scale: 927.67})
  .map(function (f) {
    var a = ee.Number(f.get('sol_2004')).add(ee.Number(f.get('sol_2005')));
    var b = ee.Number(f.get('sol_2008')).add(ee.Number(f.get('sol_2009')));
    return f.set('pct_change_0405_to_0809',
      ee.Algorithms.If(a.gt(0), b.subtract(a).divide(a).multiply(100), null));
  });

Export.table.toDrive({
  collection: table, description: 'syria_city_light_rings_2004_2009',
  folder: EXPORT_FOLDER, fileFormat: 'CSV',
  selectors: ['city', 'ring_label', 'ring_km', 'pct_change_0405_to_0809']
    .concat(YEARS.map(function (y) { return 'sol_' + y; }))
    .concat(YEARS.map(function (y) { return 'litkm2_' + y; }))
});

// ---------- CHARTS: % change by distance from centre ----------
Object.keys(CITIES).forEach(function (k) {
  print(ui.Chart.feature.byFeature(table.filter(ee.Filter.eq('city', k)), 'ring_km',
      'pct_change_0405_to_0809')
    .setChartType('ColumnChart')
    .setOptions({title: k + ': change in night light, 2004–05 to 2008–09, by distance from centre',
                 hAxis: {title: 'km from centre (ring midpoint)'},
                 vAxis: {title: '% change'}, legend: {position: 'none'}}));
});

// ---------- MAP ----------
var early = yearImg(2004).add(yearImg(2005)).divide(2);
var late  = yearImg(2008).add(yearImg(2009)).divide(2);
Map.setCenter(38.0, 34.8, 7);
Map.addLayer(early.selfMask(), {min: 0, max: 63, palette: ['000000', 'ffff00', 'ffffff']}, 'Lights 2004–05', false);
Map.addLayer(late.selfMask(),  {min: 0, max: 63, palette: ['000000', 'ffff00', 'ffffff']}, 'Lights 2008–09', false);
Map.addLayer(late.subtract(early).updateMask(early.add(late).gt(0)),
  {min: -15, max: 15, palette: ['2166ac', 'f7f7f7', 'b2182b']},
  'Change (red = brighter, blue = dimmer)', true);
Map.addLayer(allRings.style({color: 'ffffff55', fillColor: '00000000', width: 1}), {}, 'Rings', false);

// =====================================================================
// READING THE RESULTS
// • A city whose bars rise toward the outer rings grew at its edge.
//   Bars near zero or negative in the core are normal (saturation).
// • Compare cities: drought-receiving cities (Aleppo, Damascus, Dara'a)
//   vs eastern towns (Hasakah, Deir ez-Zor, Raqqa) that were source areas.
// • The red/blue map shows rural dimming in the Jazira and brightening
//   rings around receiving cities. Gas flares in the oil fields east of
//   Deir ez-Zor and near Hasakah will also flicker; ignore those spots.
// • Lights measure electrified activity. Settlements without power, or
//   power cuts in a given year, both read as dimmer.
// =====================================================================
