// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 3–4 Nov 2026.
// Run and tested by the author in Google Earth Engine (v2 ring-colour version added after the first run).
// ---------------------------------------------------------------------
// =====================================================================
// SWIPE MAPS — CITY NIGHT LIGHTS, 2004–05 vs 2008–09 (DMSP-OLS, satellite F16)
// Syria water-stress proposal · 4 Nov 2026 · v2
//
// The visual follows the data: the right-hand panel can show the RING
// RESULTS themselves — each 2 km ring coloured by its measured change in
// light (beyond sensor drift). Outlines at a fixed brightness are off by
// default because dim edges are noisy.
//
// OUTPUTS
//  1. Interactive swipe viewer (drag the divider; pick a city bottom-left).
//  2. Three matching PNGs per city: 2004–05, 2008–09, and the ring-change panel.
//  3. GeoTIFF per city + ring shapefile with values, for ArcGIS Pro / Online.
// =====================================================================

// ---------- SETTINGS ----------
var CITIES = {
  Aleppo:   {c: [37.16, 36.20], zoom: 10},
  Damascus: {c: [36.29, 33.51], zoom: 10},
  Daraa:    {c: [36.10, 32.62], zoom: 11},
  Hama:     {c: [36.75, 35.13], zoom: 11},
  Hasakah:  {c: [40.75, 36.50], zoom: 11}
};
var EXTENT_KM = 25;
var DRIFT = 1.084;           // common change measured by the ring script (8%)
var RING_WIDTH_KM = 2, MAX_RADIUS_KM = 20;
var SHOW_OUTLINES = false;   // true = also draw lit-extent outlines (noisy at dim edges)
var EDGE_DN = 20;            // outline brightness level, if shown
var BASEMAP = 'DARK';        // 'DARK' or 'HYBRID'
var EXPORT_FOLDER = 'syria_water_stress';
var CRS = 'EPSG:32637';

// ---------- LIGHTS ----------
var dmsp = ee.ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS').select('stable_lights')
  .filter(ee.Filter.stringStartsWith('system:index', 'F16'));
function mean2(y1, y2) {
  return ee.ImageCollection([
    ee.Image(dmsp.filterDate(y1 + '-01-01', (y1 + 1) + '-01-01').mean()),
    ee.Image(dmsp.filterDate(y2 + '-01-01', (y2 + 1) + '-01-01').mean())
  ]).mean();
}
var early = mean2(2004, 2005).rename('lights_2004_05');
var late  = mean2(2008, 2009).divide(DRIFT).rename('lights_2008_09_adj');

var vis = {min: 0, max: 1, palette: ['000000', '1a0a33', 'b8860b', 'ffd700', 'ffffff']};
function show(img) { return img.divide(63).clamp(0, 1).pow(0.7); }

// ---------- RINGS COLOURED BY MEASURED CHANGE ----------
function cityRings(name) {
  var c = ee.Geometry.Point(CITIES[name].c), list = [];
  for (var r = 0; r < MAX_RADIUS_KM; r += RING_WIDTH_KM) {
    var outer = c.buffer((r + RING_WIDTH_KM) * 1000);
    var g = r === 0 ? outer : outer.difference(c.buffer(r * 1000), 100);
    list.push(ee.Feature(g, {city: name, ring_km: r + RING_WIDTH_KM / 2}));
  }
  return ee.FeatureCollection(list);
}
// change of drift-adjusted late vs early, % (same quantity as 'light_vs_drift_pts')
function ringChange(fc) {
  return early.addBands(late).reduceRegions({collection: fc, reducer: ee.Reducer.sum(), scale: 927.67})
    .map(function (f) {
      var e = ee.Number(f.get('lights_2004_05')), l = ee.Number(f.get('lights_2008_09_adj'));
      var pct = ee.Number(ee.Algorithms.If(e.gt(0), l.subtract(e).divide(e).multiply(100), 0));
      // colour classes (fill with transparency)
      var fill = ee.Algorithms.If(pct.lt(-10), '2166acaa',
                 ee.Algorithms.If(pct.lt(-3), '92c5deaa',
                 ee.Algorithms.If(pct.lte(3), '00000000',
                 ee.Algorithms.If(pct.lte(10), 'f4a582aa', 'b2182baa'))));
      return f.set({pct_vs_drift: pct,
                    style: {fillColor: fill, color: 'ffffff66', width: 1}});
    });
}
var allRings = ee.FeatureCollection(Object.keys(CITIES).map(function (k) { return ringChange(cityRings(k)); })).flatten();
var ringLayer = allRings.style({styleProperty: 'style'});

// ---------- 1. INTERACTIVE SWIPE VIEWER ----------
var darkStyle = [
  {elementType: 'geometry', stylers: [{color: '#0b0b12'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#8a8a99'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#0b0b12'}]},
  {featureType: 'road', elementType: 'geometry', stylers: [{color: '#2a2a35'}]},
  {featureType: 'water', elementType: 'geometry', stylers: [{color: '#05101f'}]}
];
var leftMap = ui.Map(), rightMap = ui.Map();
ui.Map.Linker([leftMap, rightMap]);
[leftMap, rightMap].forEach(function (m) {
  if (BASEMAP === 'DARK') { m.setOptions('Dark', {Dark: darkStyle}); } else { m.setOptions('HYBRID'); }
  m.setControlVisibility({all: false, zoomControl: true, layerList: true});
});
leftMap.addLayer(show(early).selfMask(), vis, 'Lights 2004–05', true, 0.9);
rightMap.addLayer(show(late).selfMask(), vis, 'Lights 2008–09 (drift-adjusted)', true, 0.9);
rightMap.addLayer(ringLayer, {}, 'Ring change (measured)', false);

if (SHOW_OUTLINES) {
  Object.keys(CITIES).forEach(function (k) {
    var reg = ee.Geometry.Point(CITIES[k].c).buffer(EXTENT_KM * 1000).bounds();
    function ol(img) { return img.gte(EDGE_DN).selfMask().toInt().reduceToVectors(
      {geometry: reg, scale: 927.67, geometryType: 'polygon', eightConnected: true, maxPixels: 1e9}); }
    leftMap.addLayer(ee.FeatureCollection(ol(early)).style({color: '00ffff', fillColor: '00000000', width: 2}), {}, k + ' outline');
    rightMap.addLayer(ee.FeatureCollection(ol(late)).style({color: 'ff00ff', fillColor: '00000000', width: 2}), {}, k + ' outline');
  });
}

// Legend for the ring layer
var legend = ui.Panel({style: {position: 'bottom-right', padding: '6px 8px'}});
legend.add(ui.Label('Ring change in light (beyond 8% drift)', {fontWeight: 'bold', fontSize: '12px'}));
[['b2182b', 'more than +10%'], ['f4a582', '+3 to +10%'], ['ffffff', '−3 to +3% (no fill)'],
 ['92c5de', '−3 to −10%'], ['2166ac', 'below −10%']].forEach(function (r) {
  legend.add(ui.Panel([ui.Label('', {backgroundColor: '#' + r[0], padding: '7px', margin: '2px 6px 2px 0'}),
                       ui.Label(r[1], {fontSize: '11px', margin: '2px 0'})], ui.Panel.Layout.flow('horizontal')));
});
legend.add(ui.Label('Turn on "Ring change" in Layers', {fontSize: '10px', color: '666'}));
rightMap.add(legend);

leftMap.add(ui.Label('2004–05', {fontWeight: 'bold', fontSize: '18px', position: 'top-left'}));
rightMap.add(ui.Label('2008–09', {fontWeight: 'bold', fontSize: '18px', position: 'top-right'}));
leftMap.add(ui.Select({
  items: Object.keys(CITIES), placeholder: 'Choose a city',
  onChange: function (k) { leftMap.setCenter(CITIES[k].c[0], CITIES[k].c[1], CITIES[k].zoom); },
  style: {position: 'bottom-left'}
}));
ui.root.widgets().reset([ui.SplitPanel({firstPanel: leftMap, secondPanel: rightMap,
                                         wipe: true, style: {stretch: 'both'}})]);
leftMap.setCenter(CITIES.Daraa.c[0], CITIES.Daraa.c[1], CITIES.Daraa.zoom);

// ---------- 2. MATCHING PNGs PER CITY ----------
Object.keys(CITIES).forEach(function (k) {
  var region = ee.Geometry.Point(CITIES[k].c).buffer(EXTENT_KM * 1000).bounds();
  var params = {region: region, dimensions: 1024, format: 'png', crs: CRS};
  var bg = ee.Image(0).visualize({palette: ['0b0b12']});
  print(k + ' — 2004–05 lights PNG:', bg.blend(show(early).selfMask().visualize(vis)).getThumbURL(params));
  print(k + ' — 2008–09 lights PNG (drift-adjusted):', bg.blend(show(late).selfMask().visualize(vis)).getThumbURL(params));
  print(k + ' — ring-change panel PNG:', bg.blend(show(late).selfMask().visualize(vis))
    .blend(allRings.filter(ee.Filter.eq('city', k)).style({styleProperty: 'style'})).getThumbURL(params));

  // ---------- 3. GEOTIFF per city ----------
  Export.image.toDrive({
    image: early.addBands(late).addBands(late.subtract(early).rename('change')).toFloat(),
    description: 'lights_swipe_' + k, folder: EXPORT_FOLDER,
    region: region, scale: 927.67, crs: CRS, maxPixels: 1e9
  });
});

// Ring polygons with their values, for symbolising in ArcGIS
Export.table.toDrive({
  collection: allRings.select(['city', 'ring_km', 'pct_vs_drift']),
  description: 'lights_ring_polygons_with_change', folder: EXPORT_FOLDER, fileFormat: 'SHP'
});
