// Today's real weather in Berlin from Open-Meteo (free, no key): rain, snowfall, cloud and wind, hour by hour from
// yesterday to tomorrow. time.js uses it while the island follows the real calendar; until it arrives, or when it
// cannot be fetched (offline, blocked), the island keeps its own weather.
const URL_ =
  "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&timeformat=unixtime&past_days=1&forecast_days=2" +
  "&hourly=precipitation,snowfall,cloud_cover,wind_speed_10m,wind_direction_10m";
let hourly = null;

// fetches now and then every half hour; onUpdate runs whenever new numbers arrive
export function startForecast(onUpdate) {
  const load = () =>
    fetch(URL_)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        hourly = j.hourly;
        onUpdate();
      })
      .catch(() => {}); // keep whatever we had, or the island's own weather
  load();
  setInterval(load, 30 * 60 * 1000);
}

// the weather at a moment, blended between the two hours around it, or null when there is no forecast for it.
// The wind direction is where it blows towards, in compass degrees (the forecast gives where it comes from).
export function forecastAt(date) {
  if (!hourly) return null;
  const t = date.getTime() / 1000,
    ts = hourly.time,
    i = ts.findIndex((x) => x > t);
  if (i <= 0) return null;
  const f = (t - ts[i - 1]) / (ts[i] - ts[i - 1]),
    at = (k) => hourly[k][i - 1] + (hourly[k][i] - hourly[k][i - 1]) * f;
  // directions blend the short way round
  const d0 = hourly.wind_direction_10m[i - 1],
    d1 = hourly.wind_direction_10m[i],
    dd = ((d1 - d0 + 540) % 360) - 180;
  return {
    precip: at("precipitation"),
    snowfall: at("snowfall"),
    cloud: at("cloud_cover") / 100,
    windSpeed: at("wind_speed_10m"),
    windTo: (d0 + dd * f + 180 + 360) % 360,
  };
}

// how much it has rained or snowed (mm, cm) between two moments
export function fallenBetween(from, to) {
  if (!hourly) return null;
  const a = from.getTime() / 1000,
    b = to.getTime() / 1000;
  let rain = 0,
    snow = 0;
  hourly.time.forEach((t, i) => {
    if (t > a && t <= b) {
      rain += hourly.precipitation[i];
      snow += hourly.snowfall[i];
    }
  });
  return { rain, snow };
}
