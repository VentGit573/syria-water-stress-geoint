// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 10 Nov 2026.
// Partly run by the author: governorate export failed on mixed GAUL geometry; fixed 10 Nov.
// ---------------------------------------------------------------------
// =====================================================================
// EXPORT NIGHT-LIGHTS LAYERS FOR ARCGIS SWIPE MAPS
// Syria water-stress proposal · DMSP-OLS F16 · 2004–05 vs 2008–09
//
// Writes analysis-ready layers to Google Drive for ArcGIS Pro / Online:
//
//  RASTERS (one study-area extent covering Syria + Jordan controls)
//   A. Analysis values (float GeoTIFF, single band each)
//      lights_2004_05           mean of F16 2004 and 2005 stable lights (DN 0–63)
//      lights_2008_09_adj       mean of F16 2008 and 2009, divided by DRIFT
//      lights_change            2008_09_adj minus 2004_05 (DN)
//   B. Original annual composites, unaltered (provenance)  [EXPORT_ANNUAL]
//      lights_F16_2004, _2005, _2008, _2009
//   C. Styled copies (RGBA byte GeoTIFF) that look exactly like the GEE
//      viewer — band 4 is transparency  [EXPORT_STYLED]
//      lights_2004_05_RGBA, lights_2008_09_adj_RGBA, lights_change_RGBA
//
//  VECTORS (Shapefiles)
//      lights_rings             2 km rings to 20 km, with pct_vs_drift
//      lights_city_points       city centres, with whole-area totals
//      lights_city_boxes        25 km analysis frames used for the PNG panels
//      syria_boundary           national outline (FAO GAUL 2015)
//      syria_governorates       governorate outlines (FAO GAUL 2015)
//
// HOW TO RUN
//  1. Paste into the Code Editor and click Run (prints a summary table).
//  2. Open the Tasks tab (top right) and click RUN on each task.
//  3. Files appear in the Google Drive of the account signed in to the
//     Code Editor, in the folder named in EXPORT_FOLDER.
//
// PIXEL GRID: by default the rasters are written on DMSP's own 30
// arc-second grid (EPSG:4326), so every pixel is an original pixel — no
// resampling. Set NATIVE_GRID = false to write UTM 37N at 927.67 m instead
// (matches the earlier swipe_lights_cities.js exports).
// =====================================================================

// ---------- SETTINGS ----------
var EXPORT_FOLDER  = 'syria_lights_arcgis';
var DRIFT          = 1.084;   // common sensor change measured by the ring script
var NATIVE_GRID    = true;    // true = DMSP 30" grid; false = UTM 37N
var EXPORT_ANNUAL  = true;    // also export the four unaltered annual composites
var EXPORT_STYLED  = true;    // also export RGBA styled copies
var INCLUDE_CONTROLS = true;  // include Jordanian control cities in the vectors
var RING_WIDTH_KM = 2, MAX_RADIUS_KM = 20, BOX_KM = 25;

// Study area: all of Syria plus the Amman / Mafraq controls
var STUDY_AREA = ee.Geometry.Rectangle([35.0, 31.5, 42.6, 37.6], null, false);

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
var CONTROLS = {Amman_JOR: [35.93, 31.95], Mafraq_JOR: [36.21, 32.34]};
if (INCLUDE_CONTROLS) { for (var k in CONTROLS) { CITIES[k] = CONTROLS[k]; } }

// ---------- LIGHTS ----------
var dmsp = ee.ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS').select('stable_lights')
  .filter(ee.Filter.stringStartsWith('system:index', 'F16'));
function year(y) {
  return ee.Image(dmsp.filterDate(y + '-01-01', (y + 1) + '-01-01').first())
    .rename('lights_F16_' + y);
}
var y04 = year(2004), y05 = year(2005), y08 = year(2008), y09 = year(2009);
var early  = y04.add(y05).divide(2).rename('lights_2004_05');
var late   = y08.add(y09).divide(2).divide(DRIFT).rename('lights_2008_09_adj');
var change = late.subtract(early).rename('lights_change');

// Export grid
var nativeProj = y04.projection();
var nativeInfo = nativeProj.getInfo();   // small, synchronous: reads the grid definition
function gridArgs() {
  return NATIVE_GRID
    ? {crs: nativeInfo.crs, crsTransform: nativeInfo.transform}
    : {crs: 'EPSG:32637', scale: 927.67};
}

function exportRaster(img, name, noData) {
  var args = {
    image: img, description: name, fileNamePrefix: name, folder: EXPORT_FOLDER,
    region: STUDY_AREA, maxPixels: 1e10,
    formatOptions: {cloudOptimized: true, noData: noData}
  };
  var g = gridArgs();
  for (var a in g) { args[a] = g[a]; }
  Export.image.toDrive(args);
}

// A. Analysis values. No mask: 0 = dark is real data, not missing.
exportRaster(early.toFloat(),  'lights_2004_05',     -9999);
exportRaster(late.toFloat(),   'lights_2008_09_adj', -9999);
exportRaster(change.toFloat(), 'lights_change',      -9999);

// B. Unaltered annual composites
if (EXPORT_ANNUAL) {
  [y04, y05, y08, y09].forEach(function (img, i) {
    exportRaster(img.toByte(), ['lights_F16_2004', 'lights_F16_2005',
                                'lights_F16_2008', 'lights_F16_2009'][i], 255);
  });
}

// C. Styled RGBA copies — same stretch and colours as the GEE swipe viewer
var litVis = {min: 0, max: 1, palette: ['000000', '1a0a33', 'b8860b', 'ffd700', 'ffffff']};
function show(img) { return img.divide(63).clamp(0, 1).pow(0.7); }
var chgVis = {min: -15, max: 15, palette: ['2166ac', '92c5de', 'f7f7f7', 'f4a582', 'b2182b']};
function rgba(img, visParams, alphaMask) {
  return img.visualize(visParams).unmask(0)
    .addBands(alphaMask.multiply(255).rename('alpha').unmask(0))
    .toByte();
}
if (EXPORT_STYLED) {
  exportRaster(rgba(show(early), litVis, early.gt(0)), 'lights_2004_05_RGBA', 0);
  exportRaster(rgba(show(late),  litVis, late.gt(0)),  'lights_2008_09_adj_RGBA', 0);
  // change: transparent where both windows are dark or change is within ±1 DN
  exportRaster(rgba(change, chgVis, early.add(late).gt(0).and(change.abs().gt(1))),
               'lights_change_RGBA', 0);
}

// ---------- VECTORS ----------
var pair = early.addBands(late);

function pctOf(f) {
  var e = ee.Number(f.get('lights_2004_05')), l = ee.Number(f.get('lights_2008_09_adj'));
  return ee.Number(ee.Algorithms.If(e.gt(0), l.subtract(e).divide(e).multiply(100), 0));
}
function control(name) { return name.indexOf('_JOR') > -1 ? 1 : 0; }

// Rings (same construction and scale as swipe_lights_cities.js, so values match)
var ringList = [];
Object.keys(CITIES).forEach(function (name) {
  var c = ee.Geometry.Point(CITIES[name]);
  for (var r = 0; r < MAX_RADIUS_KM; r += RING_WIDTH_KM) {
    var outer = c.buffer((r + RING_WIDTH_KM) * 1000);
    var g = r === 0 ? outer : outer.difference(c.buffer(r * 1000), 100);
    ringList.push(ee.Feature(g, {
      city: name, control: control(name),
      ring_km: r + RING_WIDTH_KM / 2,
      ring_lbl: r + '-' + (r + RING_WIDTH_KM) + ' km'
    }));
  }
});
var rings = pair.reduceRegions({
  collection: ee.FeatureCollection(ringList), reducer: ee.Reducer.sum(), scale: 927.67
}).map(function (f) {
  return f.set({
    sol_early: f.get('lights_2004_05'),
    sol_late:  f.get('lights_2008_09_adj'),
    pct_drift: pctOf(f),
    // class codes to symbolise with unique values in ArcGIS
    chg_class: ee.Algorithms.If(pctOf(f).lt(-10), '1 below -10%',
               ee.Algorithms.If(pctOf(f).lt(-3),  '2 -10 to -3%',
               ee.Algorithms.If(pctOf(f).lte(3),  '3 -3 to +3%',
               ee.Algorithms.If(pctOf(f).lte(10), '4 +3 to +10%', '5 above +10%'))))
  });
}).select(['city', 'control', 'ring_km', 'ring_lbl', 'sol_early', 'sol_late',
           'pct_drift', 'chg_class']);

// City points with whole-area (0–20 km) totals
var cityAreas = ee.FeatureCollection(Object.keys(CITIES).map(function (name) {
  return ee.Feature(ee.Geometry.Point(CITIES[name]).buffer(MAX_RADIUS_KM * 1000),
                    {city: name, control: control(name)});
}));
var totals = pair.reduceRegions({collection: cityAreas, reducer: ee.Reducer.sum(), scale: 927.67})
  .map(function (f) {
    return ee.Feature(f.geometry().centroid(100), {
      city: f.get('city'), control: f.get('control'),
      sol_early: f.get('lights_2004_05'), sol_late: f.get('lights_2008_09_adj'),
      pct_drift: pctOf(f)});
  });

// 25 km analysis frames
var boxes = ee.FeatureCollection(Object.keys(CITIES).map(function (name) {
  return ee.Feature(ee.Geometry.Point(CITIES[name]).buffer(BOX_KM * 1000).bounds(),
                    {city: name, control: control(name), box_km: BOX_KM});
}));

// Boundaries
var syria = ee.FeatureCollection('FAO/GAUL/2015/level0').filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic'));
var govs  = ee.FeatureCollection('FAO/GAUL/2015/level1').filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic'))
  .select(['ADM1_NAME'], ['governor']);

// GAUL stores some borders as mixed collections (polygons plus stray line
// pieces). Shapefiles allow one geometry type, so keep the polygon parts only.
function polygonsOnly(fc) {
  return fc.map(function (f) {
    var parts = f.geometry().geometries().map(function (g) {
      g = ee.Geometry(g);
      return ee.Algorithms.If(g.type().equals('Polygon'), g, null);
    }, true);   // true = drop the nulls (the line pieces)
    return f.setGeometry(ee.Geometry.MultiPolygon(parts));
  });
}
syria = polygonsOnly(syria);
govs  = polygonsOnly(govs);

function exportShp(fc, name) {
  Export.table.toDrive({collection: fc, description: name, fileNamePrefix: name,
                        folder: EXPORT_FOLDER, fileFormat: 'SHP'});
}
exportShp(rings,  'lights_rings');
exportShp(totals, 'lights_city_points');
exportShp(boxes,  'lights_city_boxes');
exportShp(syria.select(['ADM0_NAME'], ['country']), 'syria_boundary');
exportShp(govs,   'syria_governorates');

// ---------- CHECK BEFORE EXPORTING ----------
print('Export grid:', NATIVE_GRID ? 'DMSP native 30 arc-second (EPSG:4326)' : 'UTM 37N, 927.67 m');
print('City totals 0–20 km (pct_drift = change beyond the ' +
      Math.round((DRIFT - 1) * 1000) / 10 + '% drift):',
      totals.select(['city', 'control', 'pct_drift']));
Map.centerObject(STUDY_AREA, 7);
Map.setOptions('HYBRID');
Map.addLayer(rgba(show(early), litVis, early.gt(0)), {bands: ['vis-red', 'vis-green', 'vis-blue']}, 'Styled 2004–05', false);
Map.addLayer(rgba(show(late),  litVis, late.gt(0)),  {bands: ['vis-red', 'vis-green', 'vis-blue']}, 'Styled 2008–09 adj', true);
Map.addLayer(rings.style({color: 'ffffff88', fillColor: '00000000', width: 1}), {}, 'Rings');
Map.addLayer(boxes.style({color: '00ffff', fillColor: '00000000', width: 1}), {}, 'Analysis frames');
Map.addLayer(govs.style({color: 'aaaaaa', fillColor: '00000000', width: 1}), {}, 'Governorates', false);
Map.addLayer(STUDY_AREA, {color: 'ff00ff'}, 'Export extent', false);
