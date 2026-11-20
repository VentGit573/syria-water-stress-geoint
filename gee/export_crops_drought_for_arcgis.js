// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 10 Nov 2026.
// Not yet run by the author; check the console chart and Tasks tab first.
// ---------------------------------------------------------------------
// =====================================================================
// CROPS AND RAINFALL, 2004–05 vs 2008–09 — EXPORTS FOR ARCGIS
// Syria water-stress proposal · companion to export_lights_for_arcgis.js
//
// Same two windows as the night-lights analysis, by CROP YEAR
// (a crop year runs Oct–Sep; "2008" = autumn 2007 sowing, spring 2008 harvest).
//
// WHAT IT MEASURES
//  Spring peak NDVI  Highest greenness Feb–May on cropland. Syria's winter wheat
//                    and barley (rain-fed and irrigated) peak in Mar–Apr, so this
//                    is the drought signal for the main grain crop.
//  Summer NDVI       Mean greenness Jul–Aug on cropland. Little rain falls then,
//                    so summer green = irrigated crops (cotton, vegetables) —
//                    the same proxy used in groundwater_and_irrigation.js.
//  Rainfall          CHIRPS season total Oct–Apr: the cause, beside the effect.
//
// OUTPUTS (Google Drive, folder EXPORT_FOLDER)
//  Rasters, analysis values (float, NoData −9999):
//    ndvi_spring_2004_05, ndvi_spring_2008_09, ndvi_spring_change
//    ndvi_summer_2004_05, ndvi_summer_2008_09, ndvi_summer_change
//    rain_2004_05_mm, rain_2008_09_mm, rain_change_pct
//    cropland_2005 (1 = cropland in 2005, before the drought; 0 = not)
//  Rasters, styled RGBA (band 4 = transparency; only cropland is coloured):
//    ndvi_spring_2004_05_RGBA, ndvi_spring_2008_09_RGBA  (the swipe pair)
//    ndvi_spring_change_RGBA, ndvi_summer_change_RGBA, rain_change_RGBA
//  Shapefile:
//    crops_by_district  district means + % change, cropland area, rainfall
//
// MAP USE
//  Spring pair = swipe map ("the green that didn't come").
//  ndvi_spring_change_RGBA = stand-alone, or UNDER the night-lights layers.
//  Brown = less green, teal = more green (colour-blind safe; avoids the
//  red/blue used for light change so the two can be stacked).
// =====================================================================

// ---------- SETTINGS ----------
var EXPORT_FOLDER  = 'syria_crops_arcgis';
var EARLY = [2004, 2005], LATE = [2008, 2009];   // crop years, same as lights
var CLIP_TO_SYRIA  = true;     // false = whole study area incl. Turkey/Jordan
var CHANGE_HIDE    = 0.03;     // hide NDVI change smaller than this (styled layers)
var SPRING = ['-02-01', '-05-31'];
var SUMMER = ['-07-01', '-08-31'];
var CRS = 'EPSG:32637', SCALE = 231.66;           // MODIS 250 m product pixel size
var STUDY_AREA = ee.Geometry.Rectangle([35.0, 31.5, 42.6, 37.6], null, false);

// ---------- BOUNDARIES (polygon parts only, for Shapefiles) ----------
function polygonsOnly(fc) {
  return fc.map(function (f) {
    var parts = f.geometry().geometries().map(function (g) {
      g = ee.Geometry(g);
      return ee.Algorithms.If(g.type().equals('Polygon'), g, null);
    }, true);
    return f.setGeometry(ee.Geometry.MultiPolygon(parts));
  });
}
var syria = polygonsOnly(ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic')));
var syriaGeom = syria.geometry();
var districts = polygonsOnly(ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic')))
  .select(['ADM1_NAME', 'ADM2_NAME'], ['governor', 'district']);

var REGION = CLIP_TO_SYRIA ? syriaGeom.bounds() : STUDY_AREA;
function clipIf(img) { return CLIP_TO_SYRIA ? img.clip(syriaGeom) : img.clip(STUDY_AREA); }

// ---------- CROPLAND (2005, before the drought) ----------
// MODIS land cover: 12 = croplands, 14 = cropland/natural mosaic.
// Using the pre-drought year keeps fields that were later abandoned.
var lc2005 = ee.Image(ee.ImageCollection('MODIS/061/MCD12Q1')
  .filterDate('2005-01-01', '2006-01-01').first()).select('LC_Type1');
var crop = lc2005.eq(12).or(lc2005.eq(14)).rename('cropland_2005');

// ---------- NDVI ----------
var mod13 = ee.ImageCollection('MODIS/061/MOD13Q1').map(function (img) {
  var ok = img.select('SummaryQA').lte(1);              // good or marginal pixels
  return ee.Image(img.select('NDVI').multiply(0.0001).updateMask(ok)
    .copyProperties(img, ['system:time_start']));
});
function springPeak(y) { return mod13.filterDate(y + SPRING[0], y + SPRING[1]).max(); }
function summerMean(y) { return mod13.filterDate(y + SUMMER[0], y + SUMMER[1]).mean(); }
function pair(fn, yrs) { return fn(yrs[0]).add(fn(yrs[1])).divide(2); }

var sprE = pair(springPeak, EARLY).rename('ndvi_spring_2004_05');
var sprL = pair(springPeak, LATE).rename('ndvi_spring_2008_09');
var sprC = sprL.subtract(sprE).rename('ndvi_spring_change');
var sumE = pair(summerMean, EARLY).rename('ndvi_summer_2004_05');
var sumL = pair(summerMean, LATE).rename('ndvi_summer_2008_09');
var sumC = sumL.subtract(sumE).rename('ndvi_summer_change');

// ---------- RAINFALL (CHIRPS, Oct–Apr season total) ----------
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').select('precipitation');
function season(y) { return chirps.filterDate((y - 1) + '-10-01', y + '-05-01').sum(); }
var rainE = pair(season, EARLY).rename('rain_2004_05_mm');
var rainL = pair(season, LATE).rename('rain_2008_09_mm');
var rainP = rainL.subtract(rainE).divide(rainE).multiply(100).rename('rain_change_pct');

// ---------- EXPORT HELPERS ----------
function exportRaster(img, name, noData, scale) {
  Export.image.toDrive({
    image: clipIf(img), description: name, fileNamePrefix: name, folder: EXPORT_FOLDER,
    region: REGION, crs: CRS, scale: scale || SCALE, maxPixels: 1e10,
    formatOptions: {cloudOptimized: true, noData: noData}
  });
}
function rgba(img, visParams, alphaMask) {
  return img.visualize(visParams).unmask(0)
    .addBands(alphaMask.multiply(255).rename('alpha').unmask(0)).toByte();
}

// A. Analysis values (unmasked; use cropland_2005 to mask in ArcGIS if needed)
exportRaster(sprE.toFloat(), 'ndvi_spring_2004_05', -9999);
exportRaster(sprL.toFloat(), 'ndvi_spring_2008_09', -9999);
exportRaster(sprC.toFloat(), 'ndvi_spring_change',  -9999);
exportRaster(sumE.toFloat(), 'ndvi_summer_2004_05', -9999);
exportRaster(sumL.toFloat(), 'ndvi_summer_2008_09', -9999);
exportRaster(sumC.toFloat(), 'ndvi_summer_change',  -9999);
exportRaster(crop.toByte(),  'cropland_2005', 255);
// CHIRPS is ~5.5 km; export at its own resolution rather than inventing detail
exportRaster(rainE.toFloat(), 'rain_2004_05_mm', -9999, 5566);
exportRaster(rainL.toFloat(), 'rain_2008_09_mm', -9999, 5566);
exportRaster(rainP.toFloat(), 'rain_change_pct', -9999, 5566);

// B. Styled RGBA
var greenVis  = {min: 0.1, max: 0.6, palette: ['d9c9a3', 'e9e4a6', 'b5d77b', '5aae4f', '1b6e2a']};
var changeVis = {min: -0.2, max: 0.2, palette: ['8c510a', 'd8b365', 'f6e8c3', 'c7eae5', '5ab4ac', '01665e']};
var rainVis   = {min: -50, max: 50,  palette: ['8c510a', 'd8b365', 'f6e8c3', 'c7eae5', '5ab4ac', '01665e']};

exportRaster(rgba(sprE, greenVis, crop.and(sprE.gte(0.1))), 'ndvi_spring_2004_05_RGBA', 0);
exportRaster(rgba(sprL, greenVis, crop.and(sprL.gte(0.1))), 'ndvi_spring_2008_09_RGBA', 0);
exportRaster(rgba(sprC, changeVis, crop.and(sprC.abs().gte(CHANGE_HIDE))), 'ndvi_spring_change_RGBA', 0);
exportRaster(rgba(sumC, changeVis, crop.and(sumC.abs().gte(CHANGE_HIDE))), 'ndvi_summer_change_RGBA', 0);
exportRaster(rgba(rainP, rainVis, rainE.gt(0)), 'rain_change_RGBA', 0, 5566);

// ---------- DISTRICT SUMMARY ----------
// Means over 2005 cropland only. Single-band sums use setOutputs so the
// field gets a proper name (the fix learned in the lake-inventory script).
var ndviStack = ee.Image.cat([sprE.rename('spr_early'), sprL.rename('spr_late'),
                              sumE.rename('sum_early'), sumL.rename('sum_late')]).updateMask(crop);
var byDistrict = ndviStack.reduceRegions({
  collection: districts, reducer: ee.Reducer.mean(), scale: SCALE, crs: CRS, tileScale: 4
});
byDistrict = crop.unmask(0).multiply(ee.Image.pixelArea()).divide(1e6).reduceRegions({
  collection: byDistrict, reducer: ee.Reducer.sum().setOutputs(['crop_km2']),
  scale: SCALE, crs: CRS, tileScale: 4
});
byDistrict = rainE.rename('rain_early').addBands(rainL.rename('rain_late')).reduceRegions({
  collection: byDistrict, reducer: ee.Reducer.mean(), scale: 5566, tileScale: 2
});
function pct(f, a, b) {
  var e = f.get(a), l = f.get(b);
  return ee.Algorithms.If(ee.Algorithms.IsEqual(e, null), -9999,
         ee.Algorithms.If(ee.Algorithms.IsEqual(l, null), -9999,
         ee.Number(l).subtract(e).divide(e).multiply(100)));
}
byDistrict = byDistrict.map(function (f) {
  return f.set({spr_pct: pct(f, 'spr_early', 'spr_late'),
                sum_pct: pct(f, 'sum_early', 'sum_late'),
                rain_pct: pct(f, 'rain_early', 'rain_late')});
}).select(['governor', 'district', 'crop_km2', 'spr_early', 'spr_late', 'spr_pct',
           'sum_early', 'sum_late', 'sum_pct', 'rain_early', 'rain_late', 'rain_pct']);

Export.table.toDrive({collection: byDistrict, description: 'crops_by_district',
                      fileNamePrefix: 'crops_by_district', folder: EXPORT_FOLDER, fileFormat: 'SHP'});
Export.table.toDrive({collection: byDistrict, description: 'crops_by_district_csv',
                      fileNamePrefix: 'crops_by_district', folder: EXPORT_FOLDER, fileFormat: 'CSV'});

// ---------- CHECK BEFORE EXPORTING ----------
// Syria-wide cropland spring peak NDVI and season rainfall, crop years 2001–2012.
// Expect a sharp dip in 2008 (and weak 2009 in the north-east) if the method works.
var years = ee.List.sequence(2001, 2012);
var series = ee.FeatureCollection(years.map(function (y) {
  y = ee.Number(y).int();
  var start = ee.Date.fromYMD(y, 2, 1), end = ee.Date.fromYMD(y, 5, 31);
  var ndvi = mod13.filterDate(start, end).max().updateMask(crop).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: syriaGeom, scale: 1000, tileScale: 4, maxPixels: 1e10
  }).get('NDVI');
  var rain = chirps.filterDate(ee.Date.fromYMD(y.subtract(1), 10, 1), ee.Date.fromYMD(y, 5, 1)).sum()
    .reduceRegion({reducer: ee.Reducer.mean(), geometry: syriaGeom, scale: 5566, maxPixels: 1e10})
    .get('precipitation');
  return ee.Feature(null, {crop_year: y, spring_ndvi: ndvi, rain_mm: rain});
}));
print(ui.Chart.feature.byFeature(series, 'crop_year', ['spring_ndvi', 'rain_mm'])
  .setChartType('LineChart')
  .setOptions({title: 'Syria cropland: spring peak NDVI and Oct–Apr rainfall',
               series: {0: {targetAxisIndex: 0}, 1: {targetAxisIndex: 1}},
               vAxes: {0: {title: 'NDVI'}, 1: {title: 'Rain (mm)'}},
               hAxis: {format: '####'}}));
print('District summary (first 10):', byDistrict.limit(10));

Map.centerObject(syriaGeom, 7);
Map.setOptions('HYBRID');
Map.addLayer(clipIf(sprE).updateMask(crop), greenVis, 'Spring peak 2004–05', false);
Map.addLayer(clipIf(sprL).updateMask(crop), greenVis, 'Spring peak 2008–09', false);
Map.addLayer(clipIf(sprC).updateMask(crop.and(sprC.abs().gte(CHANGE_HIDE))), changeVis, 'Spring change', true);
Map.addLayer(clipIf(sumC).updateMask(crop.and(sumC.abs().gte(CHANGE_HIDE))), changeVis, 'Summer (irrigated) change', false);
Map.addLayer(clipIf(rainP), rainVis, 'Rainfall change %', false);
Map.addLayer(districts.style({color: 'ffffff88', fillColor: '00000000', width: 1}), {}, 'Districts');
