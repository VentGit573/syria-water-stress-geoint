// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 14 Nov 2026.
// Not yet run by the author.
// ---------------------------------------------------------------------
// =====================================================================
// DISTRICT BASELINE MATRIX – environmental and population core
// Syria water-stress project · reusable for other study areas (e.g. Diyala)
//
// One row per district (FAO GAUL level 2) with the "core module" indicators,
// following the water-conflict early-warning approach (WPS): drought (SPI),
// rain-fed agriculture, crop condition, population, plus night-light change.
// The institutional and outcome columns are added later in the scoring sheet.
//
// TO REUSE FOR ANOTHER AREA: change COUNTRY (GAUL name), optionally
// FILTER_ADM1 (a list of province names), the year windows and EXPORT_FOLDER.
// Everything else follows from those settings.
//
// OUTPUT: district_baseline.csv and district_baseline (Shapefile) in Drive.
//
// FIELDS (short names so the Shapefile keeps them):
//  adm1, adm2      province, district            area_km2   district area
//  lon, lat        district centroid
//  spi_YYYY        standardized Oct–Apr rainfall anomaly for each crop year
//                  (z-score vs CLIM years; an SPI approximation, see note)
//  spi_drt         mean SPI over the drought years (DROUGHT_YEARS)
//  crop_f          share of district that is cropland (MODIS, BASE_LC_YEAR)
//  irr_crop        share of that cropland still green in Jul–Aug in the early
//                  window (irrigated proxy); rainfed = 1 − irr_crop
//  hlth_e, hlth_l  healthy cropland (spring peak NDVI ≥ HEALTHY) km², early / late
//  hlth_pct        % change in healthy cropland
//  pop_e, pop_l    population (GPW v4.11) in POP_YEARS[0] and POP_YEARS[1]
//  pop_pct         % population change
//  lit_e, lit_l    sum of night lights, early / late (late divided by DRIFT)
//  lit_pct         % change in lights beyond the sensor drift
//
// NOTE ON SPI: true SPI fits a gamma distribution to rainfall; this uses a
// z-score of seasonal totals, which behaves the same in most semi-arid
// settings. Say "standardized precipitation anomaly (SPI approximation)".
// =====================================================================

// ---------- SETTINGS ----------
var COUNTRY       = 'Syrian Arab Republic';   // GAUL ADM0_NAME, e.g. 'Iraq'
var FILTER_ADM1   = null;                     // e.g. ['Diyala'] ; null = whole country
var EXPORT_FOLDER = 'syria_matrix';
var EARLY = [2004, 2005], LATE = [2008, 2009];  // crop years (Oct–Apr seasons)
var SPI_YEARS     = [2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011];
var DROUGHT_YEARS = [2007, 2008, 2009];
var CLIM          = [1982, 2010];             // rainfall climatology (crop years)
var BASE_LC_YEAR  = 2005;                     // cropland map year (pre-drought)
var HEALTHY       = 0.4;                      // spring peak NDVI threshold
var IRRIG_NDVI    = 0.3;                      // Jul–Aug NDVI threshold for irrigated
var POP_YEARS     = [2005, 2010];
var DRIFT         = 1.084;                    // DMSP F16 drift, from the ring analysis

// ---------- DISTRICTS (polygon parts only, for Shapefiles) ----------
function polygonsOnly(fc) {
  return fc.map(function (f) {
    var parts = f.geometry().geometries().map(function (g) {
      g = ee.Geometry(g);
      return ee.Algorithms.If(g.type().equals('Polygon'), g, null);
    }, true);
    return f.setGeometry(ee.Geometry.MultiPolygon(parts));
  });
}
var adm2 = ee.FeatureCollection('FAO/GAUL/2015/level2').filter(ee.Filter.eq('ADM0_NAME', COUNTRY));
if (FILTER_ADM1) { adm2 = adm2.filter(ee.Filter.inList('ADM1_NAME', FILTER_ADM1)); }
var districts = polygonsOnly(adm2).map(function (f) {
  var c = f.geometry().centroid(100).coordinates();
  return ee.Feature(f.geometry(), {
    adm1: f.get('ADM1_NAME'), adm2: f.get('ADM2_NAME'),
    area_km2: f.geometry().area(100).divide(1e6),
    lon: c.get(0), lat: c.get(1)
  });
});
var aoi = districts.geometry();

// ---------- RAINFALL: seasonal totals and SPI approximation ----------
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').select('precipitation');
function season(y) {   // y = crop year; Oct of y−1 to end of Apr y
  return chirps.filterDate(ee.Date.fromYMD(ee.Number(y).subtract(1), 10, 1),
                           ee.Date.fromYMD(y, 5, 1)).sum();
}
var climCol = ee.ImageCollection(ee.List.sequence(CLIM[0], CLIM[1]).map(function (y) { return season(y); }));
var climMean = climCol.mean(), climSd = climCol.reduce(ee.Reducer.stdDev());
function spi(y) { return season(y).subtract(climMean).divide(climSd).rename('spi_' + y); }
var spiImg = ee.Image.cat(SPI_YEARS.map(spi));
var spiDrt = ee.ImageCollection(DROUGHT_YEARS.map(spi).map(function (i) { return i.rename('s'); }))
  .mean().rename('spi_drt');
spiImg = spiImg.addBands(spiDrt);

// ---------- CROPLAND, IRRIGATION PROXY, HEALTHY CROPLAND ----------
var lc = ee.Image(ee.ImageCollection('MODIS/061/MCD12Q1')
  .filterDate(BASE_LC_YEAR + '-01-01', (BASE_LC_YEAR + 1) + '-01-01').first()).select('LC_Type1');
var crop = lc.eq(12).or(lc.eq(14));
var mod13 = ee.ImageCollection('MODIS/061/MOD13Q1').map(function (img) {
  return ee.Image(img.select('NDVI').multiply(0.0001).updateMask(img.select('SummaryQA').lte(1))
    .copyProperties(img, ['system:time_start']));
});
function springPeak(y) { return mod13.filterDate(y + '-02-01', y + '-05-31').max(); }
function summerMean(y) { return mod13.filterDate(y + '-07-01', y + '-08-31').mean(); }
function pair(fn, yrs) { return fn(yrs[0]).add(fn(yrs[1])).divide(2); }
var sprE = pair(springPeak, EARLY), sprL = pair(springPeak, LATE);
var sumE = pair(summerMean, EARLY);

var km2 = ee.Image.pixelArea().divide(1e6);
var agImg = ee.Image.cat([
  crop.unmask(0).multiply(km2).rename('crop_km2'),
  crop.and(sumE.gte(IRRIG_NDVI)).unmask(0).multiply(km2).rename('irr_km2'),
  crop.and(sprE.gte(HEALTHY)).unmask(0).multiply(km2).rename('hlth_e'),
  crop.and(sprL.gte(HEALTHY)).unmask(0).multiply(km2).rename('hlth_l')
]);

// ---------- POPULATION (GPW v4.11) ----------
var gpw = ee.ImageCollection('CIESIN/GPWv411/GPW_Population_Count').select('population_count');
function popYear(y) { return ee.Image(gpw.filterDate(y + '-01-01', (y + 1) + '-01-01').first()); }
var popImg = popYear(POP_YEARS[0]).rename('pop_e').addBands(popYear(POP_YEARS[1]).rename('pop_l'));

// ---------- NIGHT LIGHTS (DMSP F16) ----------
var dmsp = ee.ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS').select('stable_lights')
  .filter(ee.Filter.stringStartsWith('system:index', 'F16'));
function lightYear(y) { return ee.Image(dmsp.filterDate(y + '-01-01', (y + 1) + '-01-01').first()); }
var litImg = lightYear(EARLY[0]).add(lightYear(EARLY[1])).divide(2).rename('lit_e')
  .addBands(lightYear(LATE[0]).add(lightYear(LATE[1])).divide(2).divide(DRIFT).rename('lit_l'));

// ---------- REDUCE TO DISTRICTS (one pass per native resolution) ----------
var t = spiImg.reduceRegions({collection: districts, reducer: ee.Reducer.mean(), scale: 5566, tileScale: 2});
t = agImg.reduceRegions({collection: t, reducer: ee.Reducer.sum(), scale: 250, tileScale: 8});
t = popImg.reduceRegions({collection: t, reducer: ee.Reducer.sum(), scale: 927.67, tileScale: 4});
t = litImg.reduceRegions({collection: t, reducer: ee.Reducer.sum(), scale: 927.67, tileScale: 4});

function pctChange(f, a, b) {
  var e = ee.Number(f.get(a)), l = ee.Number(f.get(b));
  return ee.Algorithms.If(e.gt(0), l.subtract(e).divide(e).multiply(100), -9999);
}
t = t.map(function (f) {
  var cropKm = ee.Number(f.get('crop_km2'));
  return f.set({
    crop_f:   cropKm.divide(ee.Number(f.get('area_km2'))),
    irr_crop: ee.Algorithms.If(cropKm.gt(0), ee.Number(f.get('irr_km2')).divide(cropKm), -9999),
    hlth_pct: pctChange(f, 'hlth_e', 'hlth_l'),
    pop_pct:  pctChange(f, 'pop_e', 'pop_l'),
    lit_pct:  pctChange(f, 'lit_e', 'lit_l')
  });
});

var fields = ['adm1', 'adm2', 'area_km2', 'lon', 'lat']
  .concat(SPI_YEARS.map(function (y) { return 'spi_' + y; }))
  .concat(['spi_drt', 'crop_km2', 'crop_f', 'irr_crop', 'hlth_e', 'hlth_l', 'hlth_pct',
           'pop_e', 'pop_l', 'pop_pct', 'lit_e', 'lit_l', 'lit_pct']);
t = t.select(fields);

// ---------- EXPORT ----------
Export.table.toDrive({collection: t, description: 'district_baseline', fileNamePrefix: 'district_baseline',
                      folder: EXPORT_FOLDER, fileFormat: 'CSV', selectors: fields});
Export.table.toDrive({collection: t, description: 'district_baseline_shp', fileNamePrefix: 'district_baseline',
                      folder: EXPORT_FOLDER, fileFormat: 'SHP'});

// ---------- CHECK ----------
print('Districts:', districts.size());
print('First 5 rows (check values before running the tasks):', t.limit(5));
Map.centerObject(aoi, 7);
Map.addLayer(spiDrt.clip(aoi), {min: -2, max: 2, palette: ['8c510a', 'd8b365', 'f5f5f5', '5ab4ac', '01665e']},
             'SPI, mean of drought years');
Map.addLayer(districts.style({color: '333333', fillColor: '00000000', width: 1}), {}, 'Districts');
