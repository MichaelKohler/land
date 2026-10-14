// Everything on top of the 3D view: name tags over the houses, link tags by the lanterns, the resident nav and
// details panel, tooltips, clicking (houses, lanterns, Sally, the animals and boats), Sally's card that follows her
// around, and the Share button.
import * as THREE from "three";
import {
  R,
  FORCE_XMAS,
  esc,
  camera,
  canvas,
  controls,
  state,
  pickables,
  currentResident,
  onTime,
  onFrame,
} from "./core.js";
import { plots, heightAt } from "./world.js";
import { houses } from "./houses.js";
import { cat, catStatus } from "./cat.js";
import { flyHome, flyToHouse, flyTo, flying, lookAtSpot, setSpin } from "./camera.js";

const $ = (id) => document.getElementById(id);
const tip = $("tip"),
  panel = $("panel"),
  catCard = $("catcard");
const anchors = [],
  v = new THREE.Vector3();
let hover = null;

/* ================= routing: #<resident> selects a house, no hash shows everyone ================= */
export function route() {
  const sel = currentResident();
  renderNav(sel);
  renderPanel(sel);
  setSpin(!sel);
  if (sel) flyToHouse(houses[sel.id].plot);
  else flyHome();
}

function renderNav(sel) {
  $("nav").innerHTML =
    `<a class="glass" href="#"${sel ? "" : ' aria-current="page"'}>Everyone</a>` +
    R.map(
      (r) =>
        `<a class="glass" href="#${r.id}" style="--c:${r.color}"${sel === r ? ' aria-current="page"' : ""}><i></i>${esc(r.short)}</a>`,
    ).join("");
}
function renderPanel(r) {
  if (!r) {
    panel.classList.remove("open");
    return;
  }
  panel.style.setProperty("--c", r.color);
  const close = `<button class="close" aria-label="Close">✕</button>`;
  // residents marked nameOnly show just their name
  panel.innerHTML = r.nameOnly
    ? `${close}<h2>${esc(r.name)}</h2>`
    : `${close}<span class="badge"><i></i>Resident</span><h2>${esc(r.name)}</h2><div class="role">${esc(r.role)} · ${esc(r.org)} · ${esc(r.home)}</div><h3>Their places</h3>` +
      r.links
        .map(
          (l) =>
            `<a class="l" href="${esc(l.url)}"><span class="ic">${l.locked ? "🔒" : esc(l.label[0])}</span><span>${esc(l.label)}<small>${esc(l.sub)}</small></span><span>↗</span></a>` +
            (l.src
              ? `<a class="l" href="${esc(l.src)}"><span class="ic">{ }</span><span>${esc(l.label)} source<small>the blueprints</small></span><span>↗</span></a>`
              : ""),
        )
        .join("") +
      `<h3>How they got here</h3><ol>${r.path.map((p) => `<li><b>${esc(p.year)}</b><span>${esc(p.text)}</span></li>`).join("")}</ol>`;
  panel.classList.add("open");
}

/* ================= Sally's card ================= */
let catCardStatus = "";
function updateCatCard() {
  if (!catCard.classList.contains("open")) return;
  const s = catStatus();
  if (s !== catCardStatus) {
    catCardStatus = s;
    const livesWith = `${R.slice(0, -1)
      .map((r) => esc(r.short))
      .join(", ")} and ${esc(R[R.length - 1].short)}`;
    catCard.innerHTML = `<button class="close" aria-label="Close">✕</button><h4>Sally 🐾</h4><p>European Shorthair · smoky grey with white paws and white back legs</p><dl><dt>Born</dt><dd>2020</dd><dt>Lives with</dt><dd>${livesWith}</dd><dt>Right now</dt><dd>${esc(s)}</dd></dl>`;
  }
  v.copy(cat.position)
    .setY(cat.position.y + 1.0)
    .project(camera);
  catCard.style.visibility = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 ? "hidden" : "visible";
  catCard.style.left = Math.min(innerWidth - 130, Math.max(130, ((v.x + 1) / 2) * innerWidth)) + "px";
  catCard.style.top = ((1 - v.y) / 2) * innerHeight + "px";
}

/* ================= pointer: hover, click, double-tap ================= */
const ray = new THREE.Raycaster(),
  ndc = new THREE.Vector2();
function pick(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // the nearest thing that is showing (a hidden hedgehog's click target is still there in winter)
  const shown = (o) => {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  const hit = ray.intersectObjects(pickables, false).find((h) => shown(h.object));
  return hit ? hit.object.userData : null;
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* no clipboard here (plain http) */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    /* not allowed */
  }
  ta.remove();
  return ok;
}
const infoTip = (u) => `${esc(u.title)}<small>${esc(u.text())}</small>`;
let tipTimer = 0;
function showTip(e, html) {
  tip.innerHTML = html;
  tip.style.left = e.clientX + "px";
  tip.style.top = e.clientY + "px";
  tip.classList.add("on");
}

export function initUI() {
  // a name tag above each house
  plots.forEach((p) => {
    const t = document.createElement("div");
    t.className = "tag glass";
    t.style.setProperty("--c", p.r.color);
    t.innerHTML = `<i></i>${esc(p.r.short)}`;
    $("tags").appendChild(t);
    anchors.push({ el: t, pos: new THREE.Vector3(p.x, heightAt(p.x, p.z) + 7.4, p.z), plot: p });
  });
  // a link tag by each lantern, shown while its house is selected
  Object.values(houses).forEach((h) => {
    h.ltags = h.lanterns.map((lan) => {
      const l = lan.userData.l,
        a = document.createElement("a");
      // the same links are in the panel, so these stay out of the keyboard order
      a.className = "ltag glass";
      a.href = l.url;
      a.tabIndex = -1;
      a.style.setProperty("--c", l.locked ? "#e0a030" : h.plot.r.color);
      a.style.opacity = 0;
      a.innerHTML = `<span>${l.locked ? "🔒" : esc(l.label[0])}</span>${esc(l.label)}`;
      $("ltags").appendChild(a);
      return a;
    });
  });
  const bar = document.querySelector(".time");
  new ResizeObserver(() => document.documentElement.style.setProperty("--bar", bar.offsetHeight + "px")).observe(bar);
  addEventListener("hashchange", route);
  panel.addEventListener("click", (e) => {
    if (e.target.closest(".close")) location.hash = "";
  });
  catCard.addEventListener("click", (e) => {
    if (e.target.closest(".close")) catCard.classList.remove("open");
  });
  // keyboard: the (otherwise hidden) Sally button flies to her and opens her card; Escape closes cards and panels
  $("sally").addEventListener("click", () => {
    setSpin(false);
    flyTo(
      v
        .subVectors(camera.position, controls.target)
        .setY(0)
        .setLength(9)
        .add(cat.position)
        .setY(cat.position.y + 5),
      cat.position,
    );
    catCardStatus = "";
    catCard.classList.add("open");
  });
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (catCard.classList.contains("open")) catCard.classList.remove("open");
    else if (currentResident()) location.hash = "";
  });
  // Share: a link to this time, season (and Christmas) and house; the phone's share sheet where there is one
  $("share").addEventListener("click", async () => {
    const q = `?time=${state.hour.toFixed(2)}&season=${state.season}${FORCE_XMAS ? "&christmas" : ""}`;
    const url = location.origin + location.pathname + q + location.hash,
      b = $("share");
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    // the clipboard, the old way where the page is not served securely (plain http), or else show the link to copy
    if (await copyText(url)) {
      b.textContent = "Copied ✓";
      setTimeout(() => (b.textContent = "Share"), 2000);
    } else prompt("Copy this link:", url);
  });
  // what the island looks like right now, for screen readers (read with the canvas, not announced on every change)
  const PART = (h) => (h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night");
  onTime((L) => {
    const hh = String(Math.floor(L.hour) % 24).padStart(2, "0"),
      mm = String(Math.floor((L.hour % 1) * 60)).padStart(2, "0");
    const season = state.season[0].toUpperCase() + state.season.slice(1);
    $("scene").textContent = [
      `${season} ${PART(L.hour)}, ${hh}:${mm}.`,
      L.rain > 0.3
        ? L.snowing
          ? "It is snowing."
          : "It is raining."
        : L.night > 0.5
          ? "The sky is dark and the stars are out."
          : L.dusk > 0.5
            ? "The sun is low."
            : "The sun is out.",
      L.lightsOn > 0.3 ? "Lights are on in the houses and along the plaza." : "",
      `Sally: ${catStatus()}.`,
    ]
      .filter(Boolean)
      .join(" ");
  });

  canvas.addEventListener("pointermove", (e) => {
    hover = pick(e);
    canvas.style.cursor = hover ? "pointer" : "grab";
    if (hover?.kind === "link")
      showTip(
        e,
        `${esc(hover.l.label)}${hover.l.locked ? " 🔒" : ""}<small>${esc(hover.r.short)} · ${esc(hover.l.sub)}</small>`,
      );
    else if (hover?.kind === "cat") showTip(e, "Sally 🐾<small>click to say hi</small>");
    else if (hover?.kind === "info") showTip(e, infoTip(hover));
    else tip.classList.remove("on");
  });
  // a click is a press and release without dragging
  let downAt = null,
    lastTap = null,
    tapFocusAt = 0;
  canvas.addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY]));
  canvas.addEventListener("pointerup", (e) => {
    const moved = downAt ? Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) : Infinity;
    if (moved <= 6) {
      const u = pick(e);
      if (u?.kind === "house") location.hash = u.r.id;
      if (u?.kind === "link") location.href = u.l.url;
      // touch screens have no hover, so a tap shows the tip for a few seconds
      if (u?.kind === "info") {
        showTip(e, infoTip(u));
        clearTimeout(tipTimer);
        tipTimer = setTimeout(() => tip.classList.remove("on"), 3500);
      }
      catCard.classList.toggle("open", u?.kind === "cat" && !catCard.classList.contains("open"));
      catCardStatus = "";
    }
    // double-tap on touch screens (browsers do not reliably send dblclick there)
    if (e.pointerType === "touch" && moved <= 10) {
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        lastTap = null;
        tapFocusAt = now;
        lookAtSpot(e.clientX, e.clientY);
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  });
  canvas.addEventListener("dblclick", (e) => {
    if (performance.now() - tapFocusAt > 600) lookAtSpot(e.clientX, e.clientY);
  });

  // roofs light up under the pointer; the selected house's lanterns pulse
  onFrame((dt, t) => {
    const sel = currentResident();
    Object.values(houses).forEach((h) => {
      const on = hover && hover.r === h.plot.r;
      h.roof.material.emissive.set(h.plot.r.color);
      h.roof.material.emissiveIntensity += ((on ? 0.25 : 0) - h.roof.material.emissiveIntensity) * Math.min(1, dt * 8);
      h.lanterns.forEach(
        (l, j) => (l.material.emissiveIntensity = 0.6 + (sel === h.plot.r ? 0.6 + Math.sin(t * 3 + j) * 0.3 : 0)),
      );
    });
  });
}

// after rendering: move the tags to where their houses and lanterns are on screen
const toScreen = (el) =>
  (el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%)`);
export function updateOverlay() {
  const sel = currentResident(),
    arrived = !flying();
  anchors.forEach((a) => {
    v.copy(a.pos).project(camera);
    toScreen(a.el);
    a.el.style.opacity = v.z < 1 && !(sel && a.plot.r === sel && arrived) ? 1 : 0;
  });
  Object.values(houses).forEach((h) => {
    const on = sel === h.plot.r && arrived;
    h.lanterns.forEach((l, j) => {
      l.getWorldPosition(v);
      v.y += 0.6;
      v.project(camera);
      const a = h.ltags[j];
      toScreen(a);
      a.style.opacity = on ? 1 : 0;
      a.style.pointerEvents = on ? "auto" : "none";
    });
  });
  updateCatCard();
}
