// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 3–4 Nov 2026.
// Run and tested by the author in Google Earth Engine; GRACE trend checked against Voss et al. (2013).
// ---------------------------------------------------------------------
// =====================================================================
// GROUNDWATER (GRACE) + WELL-IRRIGATED SUMMER CROPLAND (MODIS)
// Syria water-stress proposal · 4 Nov 2026
//
// PART 1 — GROUNDWATER, REGIONAL (GRACE / GRACE-FO, 2002–2024)
//   GRACE measures TOTAL water storage change (groundwater + soil moisture
//   + snow + lakes). Subtracting modelled soil moisture and snow (FLDAS)
//   leaves groundwater + surface water. Simplified version of Voss et al.
//   (2013, Water Resources Research), who found ~144 km³ total and ~90 km³
//   groundwater loss across the Tigris–Euphrates–western Iran region, 2003–2009.
//   Resolution is ~300 km effective: regional picture only.
//
// PART 2 — SUMMER-GREEN CROPLAND, BY DISTRICT (MODIS NDVI, 2001–2021)
//   In July–August almost nothing grows in Syria's interior without
//   irrigation. Cropland still green then is irrigated, from rivers in
//   the Euphrates valley or from wells in the Jazira. Its area per year
//   tracks how much land wells and canals kept alive.
//
// HOW TO RUN: paste into the Code Editor and click Run.
//   Console: charts + 2003–2009 trends.  Tasks: two CSV exports (click RUN).
// =====================================================================

// ---------- SETTINGS ----------
var SUMMER_NDVI = 0.30;       // cropland at or above this NDVI in Jul–Aug counts as irrigated
var USE_CROP_MASK = true;     // limit Part 2 to MODIS cropland (avoids coastal forest, orchards outside cropland)
var FIRST_YEAR = 2001, LAST_YEAR = 2021;
var EXPORT_FOLDER = 'syria_water_stress';

var syria = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic')).geometry();
var districts = ee.FeatureCollection('FAO/GAUL/2015/level2')
  .filter(ee.Filter.eq('ADM0_NAME', 'Syrian Arab Republic'))
  .select(['ADM1_NAME', 'ADM2_NAME', 'ADM2_CODE']);
// Tigris–Euphrates basin from HydroSHEDS (level-3 basin containing Baghdad)
var basin = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_3')
  .filterBounds(ee.Geometry.Point([44.4, 33.3])).geometry();
// Two Syrian sub-regions for Part 2 charts (approximate)
var jazira    = ee.Geometry.Rectangle([39.5, 36.2, 42.3, 37.3]);  // Hasakah–Qamishli plains: rain + wells
var euphrates = ee.Geometry.Rectangle([38.5, 34.4, 41.0, 36.1]);  // Raqqa–Deir ez-Zor valley: river-fed

print('Basin area used for GRACE (km²; Voss et al. region ≈ 754,000)', basin.area(1000).divide(1e6));
Map.setCenter(39.5, 35.5, 6);
Map.addLayer(ee.FeatureCollection([ee.Feature(basin)]).style({color: 'cyan', fillColor: '00000000'}), {}, 'Tigris–Euphrates basin');
Map.addLayer(ee.FeatureCollection([ee.Feature(jazira), ee.Feature(euphrates)]).style({color: 'yellow', fillColor: '00000000'}), {}, 'Jazira & Euphrates boxes');

// =====================================================================
// PART 1 — GRACE GROUNDWATER
// =====================================================================
var grace = ee.ImageCollection('NASA/GRACE/MASS_GRIDS_V04/MASCON_CRI')
  .select('lwe_thickness').filterDate('2002-01-01', '2025-01-01');   // cm, anomaly vs 2004–2009 mean
var fldas = ee.ImageCollection('NASA/FLDAS/NOAH01/C/GL/M/V001');

// Soil water in the top 2 m (cm of water) + snow water (cm)
function soilSnowCm(img) {
  var soil = img.select('SoilMoi00_10cm_tavg').multiply(0.1)
    .add(img.select('SoilMoi10_40cm_tavg').multiply(0.3))
    .add(img.select('SoilMoi40_100cm_tavg').multiply(0.6))
    .add(img.select('SoilMoi100_200cm_tavg').multiply(1.0))
    .multiply(100).rename('soil_cm');
  var snow = img.select('SWE_inst').divide(10).rename('snow_cm');   // kg/m² = mm -> cm
  return soil.addBands(snow).copyProperties(img, ['system:time_start']);
}
var fl = fldas.filterDate('2002-01-01', '2025-01-01').map(soilSnowCm);
// Same baseline period as the GRACE anomalies (2004–2009)
var flBase = fl.filterDate('2004-01-01', '2010-01-01').mean();

function graceRow(region, regionName) {
  return grace.map(function (g) {
    var d = g.date();
    var m0 = ee.Date.fromYMD(d.get('year'), d.get('month'), 1);
    var f = fl.filterDate(m0, m0.advance(1, 'month')).first();
    var anom = ee.Image(f).subtract(flBase);
    var stack = g.rename('tws_cm').addBands(anom);
    var v = stack.reduceRegion({reducer: ee.Reducer.mean(), geometry: region,
                                scale: 25000, maxPixels: 1e9, bestEffort: true});
    var tws = ee.Number(v.get('tws_cm')), soil = ee.Number(v.get('soil_cm')), snow = ee.Number(v.get('snow_cm'));
    return ee.Feature(null, {
      region: regionName,
      date: d.format('YYYY-MM'),
      t: d.difference(ee.Date('2000-01-01'), 'year').add(2000),   // decimal year
      'system:time_start': d.millis(),
      tws_cm: tws, soil_cm: soil, snow_cm: snow,
      groundwater_plus_surface_cm: tws.subtract(soil).subtract(snow)
    });
  });
}

var gBasin = graceRow(basin, 'Tigris_Euphrates_basin');
var gSyria = graceRow(syria, 'Syria');

function graceChart(fc, title) {
  return ui.Chart.feature.byFeature(fc, 'system:time_start',
      ['tws_cm', 'soil_cm', 'groundwater_plus_surface_cm'])
    .setChartType('LineChart')
    .setOptions({title: title, vAxis: {title: 'cm of water vs 2004–09 mean'},
                 hAxis: {title: ''}, lineWidth: 1.5, pointSize: 0,
                 series: {0: {color: '1f77b4'}, 1: {color: '8c564b'}, 2: {color: 'd62728', lineWidth: 2.5}}});
}
print(graceChart(gBasin, 'Tigris–Euphrates basin: total storage (blue), soil (brown), groundwater + lakes (red)'));
print(graceChart(gSyria, 'Syria: total storage (blue), soil (brown), groundwater + lakes (red)'));

// Linear trend 2003–2009, as cm/yr and km³/yr (1 cm over 1 km² = 1e-5 km³)
function trend(fc, field, region) {
  var fit = fc.filter(ee.Filter.rangeContains('t', 2003, 2010))
    .reduceColumns(ee.Reducer.linearFit(), ['t', field]);
  var cmPerYr = ee.Number(fit.get('scale'));
  var km3PerYr = cmPerYr.multiply(region.area(1000).divide(1e6)).multiply(1e-5);
  return ee.Dictionary({cm_per_year: cmPerYr, km3_per_year: km3PerYr,
                        km3_over_2003_2009: km3PerYr.multiply(7)});
}
print('Basin trend 2003–2009, TOTAL storage', trend(gBasin, 'tws_cm', basin));
print('Basin trend 2003–2009, GROUNDWATER + lakes', trend(gBasin, 'groundwater_plus_surface_cm', basin));
print('Syria trend 2003–2009, GROUNDWATER + lakes', trend(gSyria, 'groundwater_plus_surface_cm', syria));

Export.table.toDrive({
  collection: gBasin.merge(gSyria),
  description: 'grace_groundwater_basin_and_syria',
  folder: EXPORT_FOLDER, fileFormat: 'CSV',
  selectors: ['region', 'date', 'tws_cm', 'soil_cm', 'snow_cm', 'groundwater_plus_surface_cm']
});

// =====================================================================
// PART 2 — SUMMER-GREEN (IRRIGATED) CROPLAND
// =====================================================================
var modis = ee.ImageCollection('MODIS/061/MOD13Q1').select('NDVI');
var lc2005 = ee.ImageCollection('MODIS/061/MCD12Q1')
  .filterDate('2005-01-01', '2005-12-31').first().select('LC_Type1');
var cropMask = lc2005.eq(12).or(lc2005.eq(14));
var notWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').unmask(0).lt(10);
var pixKm2 = ee.Image.pixelArea().divide(1e6);

function summerGreen(y) {
  var ndvi = modis.filterDate(y + '-07-01', y + '-09-01').median().multiply(0.0001);
  var green = ndvi.gte(SUMMER_NDVI).and(notWater);
  if (USE_CROP_MASK) { green = green.and(cropMask); }
  return green;
}

// One band per year -> a single district table with a column per year
var years = [];
for (var y = FIRST_YEAR; y <= LAST_YEAR; y++) { years.push(y); }
var stack = ee.Image.cat(years.map(function (y) {
  return pixKm2.updateMask(summerGreen(y)).unmask(0).rename('km2_' + y);
}));
var districtTable = stack.reduceRegions({
  collection: districts, reducer: ee.Reducer.sum(), scale: 250, tileScale: 8
});
Export.table.toDrive({
  collection: districtTable,
  description: 'syria_districts_summer_green_km2_2001_2021',
  folder: EXPORT_FOLDER, fileFormat: 'CSV',
  selectors: ['ADM1_NAME', 'ADM2_NAME', 'ADM2_CODE'].concat(years.map(function (y) { return 'km2_' + y; }))
});

// Charts for the two sub-regions
var greenCol = ee.ImageCollection(years.map(function (y) {
  return pixKm2.updateMask(summerGreen(y)).rename('green_km2')
    .set('system:time_start', ee.Date.fromYMD(y, 7, 15).millis());
}));
function greenChart(region, title) {
  return ui.Chart.image.series({imageCollection: greenCol, region: region,
      reducer: ee.Reducer.sum(), scale: 250})
    .setChartType('ColumnChart')
    .setOptions({title: title, vAxis: {title: 'km² green in Jul–Aug'}, legend: {position: 'none'}});
}
print(greenChart(jazira, 'Jazira (rain + wells): irrigated summer cropland, km²'));
print(greenChart(euphrates, 'Euphrates valley (river-fed): irrigated summer cropland, km²'));

// Map: 2006 vs 2009 summer green
Map.addLayer(summerGreen(2006).selfMask().clip(syria), {palette: ['00aa00']}, 'Summer-green cropland 2006', false);
Map.addLayer(summerGreen(2009).selfMask().clip(syria), {palette: ['ff8800']}, 'Summer-green cropland 2009', false);
Map.addLayer(summerGreen(2006).and(summerGreen(2009).not()).selfMask().clip(syria),
  {palette: ['ff0000']}, 'Green in 2006, NOT in 2009 (lost irrigation)', true);

// =====================================================================
// READING THE RESULTS
// Part 1: red line falling = groundwater (plus reservoirs) being drawn down
//   faster than it refills. Compare the basin trend with Voss et al.
//   (−27.2 mm/yr total; ~91 km³ groundwater over 2003–2009 for their region).
//   The 'groundwater + lakes' line still includes reservoir storage; the
//   lake-area results suggest reservoirs held, so most of a decline there
//   is groundwater.
// Part 2: Jazira summer-green area rising, then collapsing around 2008–09,
//   would show wells failing (water table too deep, or pumping too costly).
//   Euphrates valley holding steady would mirror the reservoirs holding.
//   Red map layer = fields irrigated in 2006 but not in 2009.
// =====================================================================
