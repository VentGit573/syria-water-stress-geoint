// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 10 Nov 2026.
// Not yet run by the author.
// ---------------------------------------------------------------------
// ADD-ON: HEALTHY CROP AREA, 2004–05 vs 2008–09
// Paste at the BOTTOM of export_crops_drought_for_arcgis.js (it reuses
// sprE, sprL, crop, syriaGeom, polygonsOnly, SCALE, CRS, EXPORT_FOLDER).
//
// "Healthy" = 2005 cropland whose spring peak NDVI reached the threshold.
//   0.4 = strong crop at peak;  0.3 = includes thinner rain-fed barley.
// Area is computed for each window; % change = (late − early) / early.
// =====================================================================

var THRESHOLDS = [0.3, 0.4];
var govsH = polygonsOnly(ee.FeatureCollection('FAO/GAUL/2015/level1')
  .filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic')))
  .select(['ADM1_NAME'], ['governor']);

// Area (km²) bands: cropland, and healthy cropland in each window per threshold
var km2 = ee.Image.pixelArea().divide(1e6);
var bands = [crop.unmask(0).multiply(km2).rename('crop_km2')];
THRESHOLDS.forEach(function (t) {
  var tag = String(t * 10);                                  // '3' or '4'
  bands.push(crop.and(sprE.gte(t)).unmask(0).multiply(km2).rename('h' + tag + '_early'));
  bands.push(crop.and(sprL.gte(t)).unmask(0).multiply(km2).rename('h' + tag + '_late'));
});
var areaImg = ee.Image.cat(bands);

function addPct(f) {
  var out = {};
  THRESHOLDS.forEach(function (t) {
    var tag = String(t * 10);
    var e = ee.Number(f.get('h' + tag + '_early')), l = ee.Number(f.get('h' + tag + '_late'));
    out['h' + tag + '_pct'] = ee.Algorithms.If(e.gt(0), l.subtract(e).divide(e).multiply(100), -9999);
  });
  return f.set(out);
}

// Syria-wide
var national = ee.Feature(syriaGeom, areaImg.reduceRegion({
  reducer: ee.Reducer.sum(), geometry: syriaGeom, scale: SCALE, crs: CRS,
  maxPixels: 1e10, tileScale: 4
})).set('governor', 'SYRIA (total)');
national = addPct(national);

// By governorate
var byGov = areaImg.reduceRegions({
  collection: govsH, reducer: ee.Reducer.sum(), scale: SCALE, crs: CRS, tileScale: 4
}).map(addPct);

var table = ee.FeatureCollection([national]).merge(byGov)
  .select(['governor', 'crop_km2', 'h3_early', 'h3_late', 'h3_pct',
           'h4_early', 'h4_late', 'h4_pct'], null, false);

print('Healthy crop area (km²) and % change, 2004–05 → 2008–09:', table);
Export.table.toDrive({collection: table, description: 'healthy_crop_area_by_governorate',
                      fileNamePrefix: 'healthy_crop_area_by_governorate',
                      folder: EXPORT_FOLDER, fileFormat: 'CSV'});
