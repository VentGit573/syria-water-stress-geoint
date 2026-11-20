// ---------------------------------------------------------------------
// AI DISCLOSURE: Drafted by Claude Opus 5.5 (Anthropic; model ID
// claude-opus-5-5) in conversation with Sean Ventura, 3–4 Nov 2026.
// Run and tested by the author in Google Earth Engine (control-city version added after the first run).
// ---------------------------------------------------------------------
// =====================================================================
// CITY EDGE RINGS — NIGHT LIGHTS (DMSP) + NIGHT-TIME HEAT (MODIS)
// Syria water-stress proposal · 4 Nov 2026
//
// For each city, rings 0–2 km ... 18–20 km out from the centre, comparing
// 2004–05 with 2008–09:
//   LIGHT  = change in summed night light, minus the change common to all
//            rings and cities (removes DMSP sensor drift)            [% points]
//   HEAT   = change in summer night-time land temperature, relative to the
//            city's own rural background ring (25–35 km)             [°C]
//            Built-up mass stores daytime heat and stays warmer at night,
//            whether or not it has electricity.
//   SWING  = change in the day–night temperature range, relative to the
//            background ring. Building mass narrows the swing (negative). [°C]
//
// Reading the pair:
//   light up + heat up   -> new, electrified settlement
//   heat up, light flat  -> new building mass without (much) power
//   light up, heat flat  -> electrification/brighter use of existing area
//
// HOW TO RUN: paste into the Code Editor and click Run.
//   Console: one combined chart per city.  Tasks: CSV (click RUN).
// =====================================================================

// ---------- SETTINGS ----------
var RING_WIDTH_KM = 2;
var MAX_RADIUS_KM = 20;
var BG_INNER_KM = 25, BG_OUTER_KM = 35;     // rural background ring
var SUMMER = [6, 9];                         // June–September: dry, clear, stable soils
var EXPORT_FOLDER = 'syria_water_stress';
var CITIES = {
  Aleppo:   [37.16, 36.20],
  Damascus: [36.29, 33.51],
  Daraa:    [36.10, 32.62],
  Homs:     [36.72, 34.73],
  Hama:     [36.75, 35.13],
  Raqqa:    [39.01, 35.95],
  Hasakah:  [40.75, 36.50],
  DeirEzZor:[40.14, 35.33],
  // CONTROLS across the border in Jordan: same sensor, same climate, no Syrian
  // drought migration. If their edges also "shrink" or "grow", that part is sensor.
  // (Irbid is too close: its outer rings reach into Syria around Dara'a.)
  Amman_JOR: [35.93, 31.95],
  Mafraq_JOR:[36.21, 32.34]
};
var CONTROLS = ['Amman_JOR', 'Mafraq_JOR'];
// 'stable_lights' (default) or 'avg_lights_x_pct' (discounts lights seen only part of the time;
// steadier for dim village lighting)
var LIGHT_BAND = 'stable_lights';
var EARLY = [2004, 2005], LATE = [2008, 2009];

// ---------- RINGS ----------
var ringList = [], bgList = [];
Object.keys(CITIES).forEach(function (name) {
  var c = ee.Geometry.Point(CITIES[name]);
  for (var r = 0; r < MAX_RADIUS_KM; r += RING_WIDTH_KM) {
    var outer = c.buffer((r + RING_WIDTH_KM) * 1000);
    var geom = r === 0 ? outer : outer.difference(c.buffer(r * 1000), 100);
    ringList.push(ee.Feature(geom, {city: name, ring_km: r + RING_WIDTH_KM / 2,
                                    ring_label: r + '-' + (r + RING_WIDTH_KM) + ' km'}));
  }
  bgList.push(ee.Feature(c.buffer(BG_OUTER_KM * 1000).difference(c.buffer(BG_INNER_KM * 1000), 100),
                         {city: name}));
});
var rings = ee.FeatureCollection(ringList);
var bgRings = ee.FeatureCollection(bgList);

// ---------- NIGHT LIGHTS (DMSP F16) ----------
var dmsp = ee.ImageCollection('NOAA/DMSP-OLS/NIGHTTIME_LIGHTS').select(LIGHT_BAND)
  .filter(ee.Filter.stringStartsWith('system:index', 'F16'));
function lightSum(years) {
  return ee.ImageCollection(years.map(function (y) {
    return ee.Image(dmsp.filterDate(y + '-01-01', (y + 1) + '-01-01').mean());
  })).sum();
}
var lights = lightSum(EARLY).rename('light_early').addBands(lightSum(LATE).rename('light_late'));

// ---------- MODIS LAND SURFACE TEMPERATURE (Aqua, ~1:30 pm and ~1:30 am) ----------
var lst = ee.ImageCollection('MODIS/061/MYD11A2');
function summerMean(years, band) {
  var col = ee.ImageCollection([]);
  years.forEach(function (y) {
    col = col.merge(lst.filterDate(ee.Date.fromYMD(y, SUMMER[0], 1),
                                   ee.Date.fromYMD(y, SUMMER[1] + 1, 1)).select(band));
  });
  return col.mean().multiply(0.02).subtract(273.15);   // to °C
}
var nightE = summerMean(EARLY, 'LST_Night_1km'), nightL = summerMean(LATE, 'LST_Night_1km');
var dayE = summerMean(EARLY, 'LST_Day_1km'), dayL = summerMean(LATE, 'LST_Day_1km');
var heat = nightE.rename('night_early').addBands(nightL.rename('night_late'))
  .addBands(dayE.subtract(nightE).rename('swing_early'))
  .addBands(dayL.subtract(nightL).rename('swing_late'));

// ---------- REDUCE ----------
var lightStats = lights.reduceRegions({collection: rings, reducer: ee.Reducer.sum(), scale: 927.67});
var heatStats = heat.reduceRegions({collection: lightStats, reducer: ee.Reducer.mean(), scale: 1000});
var bgStats = heat.reduceRegions({collection: bgRings, reducer: ee.Reducer.mean(), scale: 1000});

// Light change common to everything (sensor drift)
// Drift is measured on the Syrian cities only, so the controls are an independent check
var syrStats = lightStats.filter(ee.Filter.inList('city', CONTROLS).not());
var totE = ee.Number(syrStats.aggregate_sum('light_early'));
var totL = ee.Number(syrStats.aggregate_sum('light_late'));
var commonPct = totL.subtract(totE).divide(totE).multiply(100);
print('Light change common to all rings (sensor drift, %)', commonPct);

var table = heatStats.map(function (f) {
  var bg = ee.Feature(bgStats.filter(ee.Filter.eq('city', f.get('city'))).first());
  var le = ee.Number(f.get('light_early')), ll = ee.Number(f.get('light_late'));
  var lightPct = ee.Algorithms.If(le.gt(0), ll.subtract(le).divide(le).multiply(100).subtract(commonPct), null);
  // ring minus background, late minus early
  var heatChg = ee.Number(f.get('night_late')).subtract(bg.get('night_late'))
    .subtract(ee.Number(f.get('night_early')).subtract(bg.get('night_early')));
  var swingChg = ee.Number(f.get('swing_late')).subtract(bg.get('swing_late'))
    .subtract(ee.Number(f.get('swing_early')).subtract(bg.get('swing_early')));
  return f.set({light_vs_drift_pts: lightPct, night_heat_change_C: heatChg, day_night_swing_change_C: swingChg,
                night_excess_early_C: ee.Number(f.get('night_early')).subtract(bg.get('night_early'))});
});

// Controls: average light change in their outer rings (10–20 km). Near 0 = sensor drift is handled.
CONTROLS.forEach(function (k) {
  print(k + ': outer-ring light change vs drift (pts) — near 0 means the Syrian results are not sensor artefacts',
        table.filter(ee.Filter.eq('city', k)).filter(ee.Filter.gte('ring_km', 10)).aggregate_mean('light_vs_drift_pts'));
});

Export.table.toDrive({
  collection: table, description: 'syria_city_rings_lights_and_heat_' + LIGHT_BAND,
  folder: EXPORT_FOLDER, fileFormat: 'CSV',
  selectors: ['city', 'ring_label', 'ring_km', 'light_vs_drift_pts', 'night_heat_change_C',
              'day_night_swing_change_C', 'night_excess_early_C']
});

// ---------- CHARTS: bars = light (left axis), line = night heat (right axis) ----------
Object.keys(CITIES).forEach(function (name) {
  print(ui.Chart.feature.byFeature(table.filter(ee.Filter.eq('city', name)), 'ring_km',
      ['light_vs_drift_pts', 'night_heat_change_C'])
    .setChartType('ComboChart')
    .setOptions({
      title: name + ': edge change 2004–05 to 2008–09 — light (bars) and night heat (line)',
      hAxis: {title: 'km from centre (ring midpoint)'},
      seriesType: 'bars',
      series: {0: {targetAxisIndex: 0, color: 'e6a817'},
               1: {targetAxisIndex: 1, type: 'line', color: 'c0392b', lineWidth: 3, pointSize: 5}},
      vAxes: {0: {title: 'light, % points vs drift'}, 1: {title: 'night heat vs rural, °C'}}
    }));
});

// ---------- MAP ----------
Map.setCenter(38.0, 34.8, 7);
Map.addLayer(nightL.subtract(nightE), {min: -2, max: 2, palette: ['2166ac', 'f7f7f7', 'b2182b']},
  'Summer night LST change °C (not background-adjusted)', false);
Map.addLayer(rings.style({color: 'ffffff55', fillColor: '00000000', width: 1}), {}, 'Rings', false);
Map.addLayer(bgRings.style({color: '00ff0088', fillColor: '00000000', width: 1}), {}, 'Background rings', false);

// =====================================================================
// CAVEATS
// • Drought itself changes surface temperature: farmland that lost irrigation
//   dries out and its day–night swing widens. Comparing each ring with its own
//   rural background removes the region-wide part, but a ring that lost
//   irrigated fields can still look 'cooler at night' without any city change.
// • MODIS is 1 km; heat differences of a few tenths of a degree are within noise.
//   Look for consistent patterns across adjacent rings, not single values.
// =====================================================================
