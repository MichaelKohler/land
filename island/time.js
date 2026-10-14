// Time of day, season and weather: follow the visitor's clock and calendar live (or ?time= / ?season= / ?rain), can
// be set by the 24-hour slider and the season buttons (the Live button goes back to real time), and are passed on to
// every part of the island through the season and time hooks.
//
// The sun stands where it really would on that day at Berlin's latitude, by the visitor's own clock: short days in
// winter, long evenings in summer. While the island follows the real calendar the weather is Berlin's real weather
// (forecast.js); with a season picked by hand, or before the forecast arrives, it has its own: a shower around eleven
// in autumn and winter (snow in winter), sunny in spring and summer. The sea rises and falls with the tides.
import {
  NOW,
  XMAS,
  FORCE_XMAS,
  NEW_MOON,
  BREEZE,
  params,
  isXmas,
  WIND,
  between,
  smooth,
  state,
  runHooks,
} from "./core.js";
import { startForecast, forecastAt, fallenBetween } from "./forecast.js";

const SEASONS = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };
const MONTH_SEASON = [
  "winter",
  "winter",
  "spring",
  "spring",
  "spring",
  "summer",
  "summer",
  "summer",
  "autumn",
  "autumn",
  "autumn",
  "winter",
];
// a day in the middle of each season, for when one is picked by hand
const SEASON_DAY = { spring: [3, 15], summer: [6, 15], autumn: [9, 15], winter: [0, 15] };
const TIME_WORDS = { day: 13, night: 22.5, sunset: 18.9 };
const forceRain = params.has("rain");
const rainAt = (h) => between(10.4, 10.8, 11.8, 12.3, h);
const timeIn = document.getElementById("time"),
  clockOut = document.getElementById("clock"),
  seasonsEl = document.getElementById("seasons"),
  liveBtn = document.getElementById("live");
const clockHour = (d) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
// live: the time (and the season, unless ?season= or a button picked one) follows the real clock
let live = true,
  liveSeason = true;
function setLive(on) {
  live = on;
  liveBtn.setAttribute("aria-pressed", on);
  liveBtn.title = on ? "Following the real time" : "Back to the real time";
}
function tick() {
  if (!live) return;
  const now = new Date();
  // the Christmas scenery is built at load, so a page left open reloads when Christmas starts or ends
  if (XMAS !== isXmas(now) && !FORCE_XMAS) return location.reload();
  state.hour = clockHour(now);
  timeIn.value = state.hour;
  if (liveSeason && MONTH_SEASON[now.getMonth()] !== state.season && !XMAS) {
    state.season = MONTH_SEASON[now.getMonth()];
    applySeason();
  }
  applyTime();
}

// the moment the island shows: the hour on today's date while it follows the calendar, else on the season's day
function momentAt(hour) {
  const day = liveSeason ? new Date() : new Date(NOW.getFullYear(), ...SEASON_DAY[state.season]);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, Math.round(hour * 3600));
}

/* ================= the sun ================= */
// the sun's elevation and compass bearing (degrees) at a moment, at Berlin's latitude and on the meridian of the
// visitor's own time zone, so noon is around 12 (13 in summer time) wherever they are
const LAT = 52.52 * (Math.PI / 180);
const MERIDIAN =
  Math.max(
    new Date(NOW.getFullYear(), 0, 1).getTimezoneOffset(),
    new Date(NOW.getFullYear(), 6, 1).getTimezoneOffset(),
  ) / -4;
function sunAt(date) {
  const r = Math.PI / 180,
    d = date.getTime() / 864e5 - 10957.5; // days since 1 January 2000, noon
  const g = (357.529 + 0.98560028 * d) * r,
    q = 280.459 + 0.98564736 * d;
  const lon = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * r,
    tilt = (23.439 - 3.6e-7 * d) * r;
  const ra = Math.atan2(Math.cos(tilt) * Math.sin(lon), Math.cos(lon)),
    dec = Math.asin(Math.sin(tilt) * Math.sin(lon));
  const H = ((18.697374558 + 24.06570982441908 * d) * 15 + MERIDIAN) * r - ra;
  const elev = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(
    -Math.sin(H) * Math.cos(dec),
    Math.sin(dec) * Math.cos(LAT) - Math.cos(dec) * Math.sin(LAT) * Math.cos(H),
  );
  return { elev: elev / r, az: (az / r + 360) % 360 };
}
// sunrise and sunset (hours) on the day of a moment, found by stepping through it
const riseSet = new Map();
function sunTimes(date) {
  const key = date.toDateString();
  if (!riseSet.has(key)) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      up = (h) => sunAt(new Date(day.getTime() + h * 36e5)).elev + 0.833;
    let rise = 6,
      set = 20;
    for (let h = 0; h < 24; h += 0.1) {
      const a = up(h),
        b = up(h + 0.1);
      if (a < 0 && b >= 0) rise = h + 0.1 * (a / (a - b));
      if (a >= 0 && b < 0) set = h + 0.1 * (a / (a - b));
    }
    riseSet.set(key, { rise, set });
  }
  return riseSet.get(key);
}

/* ================= weather ================= */
// rain (0 to 1), whether it falls as snow, cloud cover (0 to 1) and the wind at a moment
// only while the island follows the real calendar (and nothing forces the rain)
let realWeather = false;
const useReal = () => realWeather && liveSeason && !forceRain;
function weatherAt(date, hour) {
  const f = useReal() ? forecastAt(date) : null;
  if (!f) {
    const wi = state.season === "winter",
      fair = state.season === "spring" || state.season === "summer";
    return {
      rain: forceRain ? 1 : fair ? 0 : rainAt(hour),
      snowing: wi,
      cloud: 0,
      wind: BREEZE,
      gusty: state.season === "autumn",
    };
  }
  const a = f.windTo * (Math.PI / 180);
  return {
    rain: f.precip < 0.05 ? 0 : Math.min(1, 0.3 + f.precip * 0.35),
    snowing: f.snowfall > 0 || state.season === "winter",
    cloud: f.cloud,
    wind: { x: Math.sin(a), z: Math.cos(a) },
    gusty: f.windSpeed > 28,
  };
}
// winter ground: patchy, half-thawed snow that fresh snowfall covers over (all white at Christmas)
function snowCover(date, hour) {
  if (XMAS) return 1;
  const fallen = useReal() ? fallenBetween(new Date(date.getFullYear(), date.getMonth(), date.getDate()), date) : null;
  return 0.45 + 0.55 * (fallen ? Math.min(1, fallen.snow / 1.5) : smooth(10.6, 12.2, hour));
}

/* ================= tides ================= */
// two high and two low tides a day, following the moon: -1 low to 1 high
const TIDE_H = 12.4206;
const tideAt = (date) => Math.cos(((date - NEW_MOON) / 36e5 / TIDE_H) * Math.PI * 2);

export function initTime() {
  // ?time= an hour (13.5) or day, night or sunset; ?season= one of the four
  const tq = params.get("time"),
    sq = params.get("season");
  const tHour = Object.hasOwn(TIME_WORDS, tq) ? TIME_WORDS[tq] : /^\d*\.?\d+$/.test(tq) ? parseFloat(tq) % 24 : null;
  state.hour = tHour ?? clockHour(NOW);
  liveSeason = !Object.hasOwn(SEASONS, sq);
  state.season = !liveSeason ? sq : XMAS ? "winter" : MONTH_SEASON[NOW.getMonth()];
  setLive(tHour === null);
  timeIn.value = state.hour;
  // moving the slider takes over the time; Live hands it back to the clock
  timeIn.addEventListener("input", () => {
    setLive(false);
    state.hour = parseFloat(timeIn.value);
    applyTime();
  });
  liveBtn.addEventListener("click", () => {
    setLive(true);
    tick();
  });
  setInterval(tick, 20000);
  // the real weather, while the island follows the calendar
  startForecast(() => {
    realWeather = true;
    applyTime();
  });
  // back in the tab: catch up with the clock straight away
  document.addEventListener("visibilitychange", () => !document.hidden && tick());
  seasonsEl.innerHTML = Object.entries(SEASONS)
    .map(
      ([s, ic]) =>
        `<button type="button" data-s="${s}" title="${s[0].toUpperCase() + s.slice(1)}" aria-label="${s}">${ic}</button>`,
    )
    .join("");
  seasonsEl.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    liveSeason = false;
    state.season = b.dataset.s;
    applySeason();
    applyTime();
  });
}

export function applySeason() {
  const s = state.season;
  runHooks("season", { season: s, sp: s === "spring", su: s === "summer", au: s === "autumn", wi: s === "winter" });
  seasonsEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.s === s));
}

export function applyTime() {
  const { hour, season } = state,
    at = momentAt(hour),
    sun = sunAt(at),
    times = sunTimes(at),
    w = weatherAt(at, hour);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const fair = season === "spring" || season === "summer",
    wi = season === "winter",
    elev = sun.elev;
  // a rainbow needs rain in the last hour and a half that has just stopped, with the sun out and low enough
  let lastRain = 0;
  for (let k = 1; k <= 6; k++) lastRain = Math.max(lastRain, weatherAt(new Date(at - k * 9e5), hour - k / 4).rain);
  // dl: daylight, dusk: around sunrise and sunset, night: after dark, dark: dark enough for lamps; grey: how much the
  // sky is closed over (rain, or heavy cloud); clear: how much of the moon and stars shows through. The lights also
  // come on in the rain
  const L = {
    hour,
    at,
    elev,
    az: sun.az,
    fair,
    wi,
    rain: w.rain,
    snowing: w.snowing,
    cloud: w.cloud,
    grey: Math.max(w.rain, smooth(0.65, 1, w.cloud) * 0.8),
    clear: (1 - w.rain) * (1 - smooth(0.55, 0.95, w.cloud)),
    tide: tideAt(at),
    sunrise: times.rise,
    sunset: times.set,
    afterRain: !w.snowing && elev > 3 && elev < 42 ? lastRain * (1 - w.rain) * (1 - smooth(0.6, 0.95, w.cloud)) : 0,
    dl: clamp01(elev / 16),
    dusk: clamp01(1 - Math.abs(elev - 4) / 12),
    night: clamp01((2 - elev) / 10),
    dark: clamp01((8 - elev) / 10),
  };
  L.lightsOn = Math.max(L.dark, w.rain * 0.45);
  // lowSun: the low sun of the golden hour; gold and twi: the sunset colours of the golden hour and of the twilight
  // after it, which only show under a clear sky (the sky, clouds, sea and haze all take them from here)
  L.lowSun = smooth(14, 3, elev) * smooth(-4, 0, elev);
  L.gold = L.lowSun * (1 - L.grey);
  L.twi = smooth(1, -1.5, elev) * smooth(-10, -4, elev) * (1 - L.grey);
  WIND.x = w.wind.x;
  WIND.z = w.wind.z;
  Object.assign(state.weather, {
    rain: w.rain,
    snowing: w.snowing,
    lights: L.dark,
    gusty: w.gusty,
    snowCover: wi ? snowCover(at, hour) : 0,
  });
  state.tide = L.tide * 0.18;
  state.tideRising = tideAt(new Date(at.getTime() + 6e5)) > L.tide;
  state.sun = { rise: times.rise, set: times.set };
  runHooks("time", L);
  // which weather is showing (the test script reports it)
  document.documentElement.dataset.weather = useReal() && forecastAt(at) ? "berlin" : "island";
  document.body.classList.toggle("night", L.night > 0.5);
  const hh = Math.floor(hour) % 24,
    mm = Math.floor((hour - Math.floor(hour)) * 60);
  clockOut.textContent =
    String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + (w.rain > 0.3 ? (w.snowing ? " ❄️" : " 🌧️") : "");
}
