// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 3–4 Nov 2026.
// Run and tested by the author in Google Earth Engine (Landsat results used; radar check failed, see README).
// ---------------------------------------------------------------------
// =====================================================================
// SYRIA WATER INVENTORY — SURFACE AREA OF FOUR LAKES / RESERVOIRS
//   Lake Assad (Tabqa), Tishrin, Jabbul, Qattinah (Lake Homs)
// Syria water-stress proposal · 4 Nov 2026
//
// METHOD
//  A. Landsat (via JRC Global Surface Water, monthly, 30 m, 1984–2021):
//     water area per lake per month. Gaps from cloud and Landsat 7's
//     striping are filled using each pixel's long-term water frequency.
//  B. Radar check (ALOS PALSAR yearly mosaics, 2007–2010 and 2015–2022):
//     calm water is a mirror for radar and reads very dark, so area below a
//     darkness threshold = water. Independent of cloud and Landsat gaps.
//
// NOTE: this measures SURFACE AREA, not volume. Volume needs water level
// (satellite altimetry, e.g. DAHITI/Hydroweb) or each reservoir's
// area–capacity curve (e.g. from Lorenz & Erickson, Strategic Water).
//
// HOW TO RUN: paste into the Code Editor and click Run.
//   Console: annual charts per lake (quick look, coarser grid)
//   Tasks:   full monthly CSV for all four lakes (click RUN)
// The boxes below are approximate. For best results draw a polygon around
// each lake's maximum shoreline and replace the box (see notes at bottom).
// =====================================================================

// ---------- SETTINGS ----------
var START = '2000-01-01';
var END   = '2022-01-01';          // JRC monthly record ends Dec 2021
var FILL_OCCURRENCE = 50;          // fill no-data pixels as water if water >= this % of all observations
var MAX_NODATA_PCT_FOR_CHART = 30; // charts skip months with more missing data than this
var RADAR_WATER_DB = -19;          // radar: HH darker than this = open water (check with Inspector)
var CHART_SCALE = 90;              // quick-look charts (m); exports use 30 m
var EXPORT_FOLDER = 'syria_water_stress';

// Approximate boxes [west, south, east, north]. Replace with drawn polygons when you can.
var LAKES = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Rectangle([37.95, 35.80, 38.65, 36.36]), {lake: 'Assad_Tabqa'}),
  ee.Feature(ee.Geometry.Rectangle([38.05, 36.36, 38.35, 36.80]), {lake: 'Tishrin'}),
  ee.Feature(ee.Geometry.Rectangle([37.35, 35.95, 37.70, 36.20]), {lake: 'Jabbul'}),
  ee.Feature(ee.Geometry.Rectangle([36.48, 34.58, 36.68, 34.73]), {lake: 'Qattinah_Homs'})
]);

Map.setCenter(37.8, 35.6, 8);
Map.addLayer(LAKES.style({color: 'yellow', fillColor: '00000000'}), {}, 'Lake boxes');

// Long-term water frequency (% of observations that were water, 1984–2021)
var occurrence = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').unmask(0);
Map.addLayer(occurrence.selfMask(), {min: 0, max: 100, palette: ['ffffff', '0000ff']},
  'Long-term water frequency (%)', true, 0.7);

var pix = ee.Image.pixelArea().divide(1e6);   // km² per pixel

// ---------- A. LANDSAT / JRC MONTHLY ----------
var monthly = ee.ImageCollection('JRC/GSW1_4/MonthlyHistory').filterDate(START, END);

// For one month: water, no-data, and gap-filled water area in each lake
function monthStats(img, scale) {
  var w = img.select('water');                      // 0 no data, 1 land, 2 water
  var water  = w.eq(2);
  var nodata = w.eq(0);
  var filled = water.or(nodata.and(occurrence.gte(FILL_OCCURRENCE)));
  var stack = pix.updateMask(water).rename('water_km2')
    .addBands(pix.updateMask(nodata).rename('nodata_km2'))
    .addBands(pix.updateMask(filled).rename('filled_km2'))
    // no-data only counts where water is possible (inside the lake's max extent)
    .addBands(pix.updateMask(nodata.and(occurrence.gt(0))).rename('nodata_in_lake_km2'))
    .addBands(pix.updateMask(occurrence.gt(0)).rename('max_extent_km2'));
  return stack.reduceRegions({collection: LAKES, reducer: ee.Reducer.sum(), scale: scale, tileScale: 4})
    .map(function (f) {
      var gap = ee.Number(f.get('nodata_in_lake_km2'))
        .divide(ee.Number(f.get('max_extent_km2')).max(0.001)).multiply(100);
      return f.set({date: img.date().format('YYYY-MM'),
                    'system:time_start': img.get('system:time_start'),
                    nodata_pct: gap});
    });
}

// Full-resolution monthly table for all lakes -> Tasks tab
var table = monthly.map(function (img) { return monthStats(img, 30); }).flatten();
Export.table.toDrive({
  collection: table,
  description: 'syria_four_lakes_monthly_area_2000_2021',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['lake', 'date', 'water_km2', 'filled_km2', 'nodata_pct', 'max_extent_km2']
});

// Quick-look charts: late dry season (Aug–Oct) mean of gap-filled area, per lake per year
var years = ee.List.sequence(2000, 2021);
var annual = ee.FeatureCollection(years.map(function (y) {
  var c = monthly.filter(ee.Filter.calendarRange(y, y, 'year'))
                 .filter(ee.Filter.calendarRange(8, 10, 'month'));
  var stats = c.map(function (img) { return monthStats(img, CHART_SCALE); }).flatten()
    .filter(ee.Filter.lte('nodata_pct', MAX_NODATA_PCT_FOR_CHART));
  return LAKES.map(function (lake) {
    var s = stats.filter(ee.Filter.eq('lake', lake.get('lake')));
    return ee.Feature(null, {
      lake: lake.get('lake'), year: ee.Number(y).toInt().format('%d'),
      dry_season_km2: ee.Algorithms.If(s.size().gt(0), s.aggregate_mean('filled_km2'), null),
      months_used: s.size()
    });
  });
})).flatten();

['Assad_Tabqa', 'Tishrin', 'Jabbul', 'Qattinah_Homs'].forEach(function (name) {
  print(ui.Chart.feature.byFeature(annual.filter(ee.Filter.eq('lake', name)), 'year', 'dry_season_km2')
    .setChartType('ColumnChart')
    .setOptions({title: name + ': late dry-season (Aug–Oct) water area, km² (Landsat/JRC)',
                 vAxis: {title: 'km²'}, legend: {position: 'none'}}));
});

// ---------- B. RADAR CHECK (one value per year) ----------
var palsar1 = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR');        // 2007–2010
var palsar2 = ee.ImageCollection('JAXA/ALOS/PALSAR/YEARLY/SAR_EPOCH');  // 2015–2022
function radarWater(col, y) {
  var img = ee.Image(col.filterDate(y + '-01-01', (y + 1) + '-01-01').first());
  var hh = img.select('HH').toFloat().pow(2).log10().multiply(10).subtract(83)
    .focal_median(50, 'circle', 'meters');
  // only count dark pixels inside the lake's long-term maximum extent
  // (dry sand can also be dark, so the extent mask prevents false water)
  var water = hh.lt(RADAR_WATER_DB).and(occurrence.gt(0));
  return pix.updateMask(water).rename('radar_water_km2')
    .reduceRegions({collection: LAKES, reducer: ee.Reducer.sum().setOutputs(['radar_water_km2']), scale: 50, tileScale: 4})
    .map(function (f) { return f.set('year', String(y)); });
}
var radarYears = [];
[2007, 2008, 2009, 2010].forEach(function (y) { radarYears.push(radarWater(palsar1, y)); });
[2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022].forEach(function (y) { radarYears.push(radarWater(palsar2, y)); });
var radarTable = ee.FeatureCollection(radarYears).flatten();
print('Radar water area by lake and year (km²) — compare with the Landsat charts',
      radarTable.select(['lake', 'year', 'radar_water_km2'], null, false));
Export.table.toDrive({
  collection: radarTable,
  description: 'syria_four_lakes_radar_area',
  folder: EXPORT_FOLDER,
  fileFormat: 'CSV',
  selectors: ['lake', 'year', 'radar_water_km2']
});

// Map: radar 2007 vs 2010 over the lakes (dark = water)
[2007, 2010].forEach(function (y) {
  var img = ee.Image(palsar1.filterDate(y + '-01-01', (y + 1) + '-01-01').first());
  Map.addLayer(img.select('HH').toFloat().pow(2).log10().multiply(10).subtract(83).clip(LAKES),
    {min: -30, max: 0}, 'Radar HH ' + y + ' (dark = water)', false);
});

// =====================================================================
// NOTES
// • Replacing a box with your own outline: draw a polygon around the lake's
//   widest-ever shoreline (use the "Long-term water frequency" layer as a
//   guide; stop where the lake narrows into river), rename it under Imports
//   (e.g. assadPoly), and swap it in for the Rectangle on that lake's line.
// • Jabbul is a natural salt lake that fills in winter and largely dries in
//   summer. Its dry-season area mostly reflects salt pans and drainage
//   inflow, so read it differently from the three dammed reservoirs.
// • Radar threshold: with the Inspector, click open water and nearby dry
//   ground on a 'Radar HH' layer. Water is usually -20 dB or darker; wind
//   roughens water and brightens it, which under-counts area in windy years.
// • In the CSV, use 'filled_km2' for area and check 'nodata_pct': months
//   above ~30% missing are less reliable even after filling.
// =====================================================================
