const $ = id => document.getElementById(id);
const BASE = { BTCUSDT: 67000, ETHUSDT: 3400, SOLUSDT: 165, XRPUSDT: 2.4, DOGEUSDT: 0.38, AVAXUSDT: 37, LINKUSDT: 22, TONUSDT: 5.5 };
const TFS_OK = [1, 5, 15, 30, 60, 240, "D", "W"];
const STORAGE_KEY = "bybit-pwa-st";

let sym = "BTCUSDT", tf = 15, mode = "demo", C = [], A = null, timer, tk = 0, dr = 0;
let P = null, armed = true, cd = 0, lt = 0, LOG = [], FT = "";
let seed = Date.now() % 2147483646 + 1, nt = true, pf = null, lk = "", lastKey = "";
const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const gs = () => rnd() + rnd() + rnd() - 1.5;

function tfMinutes(t) {
  if (t === "D") return 1440;
  if (t === "W") return 10080;
  return +t || 1;
}
function tfLabel(t) {
  if (t === "D") return "Д";
  if (t === "W") return "Н";
  return t >= 60 ? Math.round(t / 60) + "ч" : t + "м";
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const st = JSON.parse(raw);
    if (BASE[st.sym]) sym = st.sym;
    if (TFS_OK.includes(st.tf) || TFS_OK.includes(+st.tf)) tf = st.tf === "D" || st.tf === "W" ? st.tf : +st.tf;
    if (+st.rs > 0 && $("rs")) $("rs").value = st.rs;
    if (typeof st.nt === "boolean") nt = st.nt;
    if (typeof st.ntfy === "string" && $("ntfy")) $("ntfy").value = st.ntfy;
    if (typeof st.pushOn === "boolean" && $("push-on")) $("push-on").checked = st.pushOn;
    if (Array.isArray(st.LOG)) LOG = st.LOG;
    if (typeof st.lastKey === "string") lastKey = st.lastKey;
  } catch (e) {}
}

function persist() {
  try {
    const o = {
      sym, tf, rs: $("rs") ? $("rs").value : 10, nt,
      pushOn: $("push-on") ? $("push-on").checked : false,
      ntfy: $("ntfy") ? $("ntfy").value.trim() : "",
      LOG: LOG.slice(-500),
      lastKey
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch (e) {}
}

const NT = {
  ntfy: async function (topic, title, body, opts) {
    if (!topic) return false;
    opts = opts || {};
    try {
      const r = await fetch("https://ntfy.sh/" + encodeURIComponent(topic), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, message: body,
          priority: opts.priority || "high",
          tags: opts.tags
            ? (Array.isArray(opts.tags) ? opts.tags : String(opts.tags).split(","))
            : ["chart_with_upwards_trend"]
        })
      });
      return r.ok;
    } catch (e) {
      console.warn("ntfy:", e);
      return false;
    }
  },
  browser: async function (title, body) {
    try {
      if (!("Notification" in window)) return false;
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission !== "granted") return false;
      new Notification(title, { body, icon: "icons/icon192.png", tag: "sig-" + Date.now() });
      return true;
    } catch (e) {
      console.warn("browser notify:", e);
      return false;
    }
  },
  all: async function (title, body, opts) {
    const topic = $("ntfy") ? $("ntfy").value.trim() : "";
    const pushOn = $("push-on") ? $("push-on").checked : false;
    const out = {};
    if (pushOn && topic) out.ntfy = await NT.ntfy(topic, title, body, opts);
    if (nt) out.browser = await NT.browser(title, body);
    return out;
  }
};

function openP(d) {
  if (P || !A) return;
  P = { d, e: A.px, sl: A.px - d * A.a, tp: A.px + d * 1.5 * A.a, r: A.a, age: 0, s: A.t, man: 1, t0: Date.now() };
  render();
}
function closeNow() {
  if (!P) return;
  const R = P.d * (A.px - P.e) / P.r;
  const costR = P.e * 0.13 / 100 / P.r;
  LOG.push({
    tm: new Date().toLocaleTimeString("ru"),
    d: P.d, s: P.s, e: P.e, x: A.px,
    w: "вручную", m: 1, R: R - costR, age: P.age, t0: P.t0
  });
  P = null; cd = 3; render();
}
function trade(t) {
  const c = C[C.length - 1], px = A.px, a = A.a, f = Math.abs(t), COST = 0.13;
  if (lt !== c.t) { lt = c.t; if (cd > 0) cd--; if (P) P.age++; }
  if (P) {
    const R = P.d * (px - P.e) / P.r;
    if (R >= 0.5 && P.d * (P.e - P.sl) > 0) P.sl = P.e;
    if (R >= 1.0) {
      let ts = px - P.d * 0.5 * P.r;
      if (P.d * (ts - P.tp) > 0) ts = P.tp;
      if (P.d * (ts - P.sl) > 0) P.sl = ts;
    }
    const tpHit = P.d * (px - P.tp) >= 0, slHit = P.d * (px - P.sl) <= 0;
    let w = "", exitPx = 0;
    if (tpHit) { w = "тейк"; exitPx = P.tp; }
    else if (slHit) { w = P.d * (P.sl - P.e) / P.r >= 0 ? "тр.стоп" : "стоп"; exitPx = P.sl; }
    else if (P.age >= 12) { w = "время"; exitPx = px; }
    if (w) {
      const exitR = P.d * (exitPx - P.e) / P.r;
      LOG.push({
        tm: new Date().toLocaleTimeString("ru"),
        d: P.d, s: P.s, e: P.e, x: exitPx,
        w, m: P.man || 0, R: exitR - P.e * COST / 100 / P.r, age: P.age, t0: P.t0
      });
      P = null; cd = 3;
    }
  }
  FT = "";
  if (!P) {
    if (f < 50) armed = true;
    const entry = A && A.entryThreshold ? A.entryThreshold : 70;
    if (f >= entry) {
      if (!armed) FT = "Ждём сброса ниже 50";
      else if (cd > 0) FT = "Пауза " + cd + " св.";
      else if (1.5 * a / px * 100 < 2 * COST) FT = "Тейк меньше издержек";
      else {
        const d = Math.sign(t);
        P = { d, e: px, sl: px - d * a, tp: px + d * 1.5 * a, r: a, age: 0, s: t, man: 0, t0: Date.now() };
        armed = false;
      }
    }
  }
  return P ? (P.d > 0 ? "Лонг открыт" : "Шорт открыт") : FT || (f >= 40 ? (t > 0 ? "Лонг слабый" : "Шорт слабый") : "Ждать");
}

let AC = null;
function unlock() {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
  } catch (e) {}
}
function beep(d) {
  try {
    if (!AC) unlock();
    if (!AC) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    const fr = d > 0 ? [660, 880] : [880, 660];
    o.connect(g); g.connect(AC.destination);
    o.frequency.setValueAtTime(fr[0], t); o.frequency.setValueAtTime(fr[1], t + 0.16);
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.start(t); o.stop(t + 0.5);
  } catch (e) {}
}

function alertFull(d) {
  beep(d);
  const m = fullMsg(d, sym, A);
  const body = m.message + "\nADX " + Math.round(A.adx) + ", ATR " + A.atrp.toFixed(2) + "%" +
    (A.rsi ? ", RSI " + Math.round(A.rsi) : "");
  NT.all(m.title, body, {
    priority: "high",
    tags: d > 0 ? "chart_increasing,moneybag" : "chart_decreasing,moneybag"
  }).catch(e => console.warn("notify:", e));
}

function signal(d) {
  $("sg").className = "card" + (d ? d > 0 ? " full-l" : " full-s" : "");
  $("fs").hidden = !d;
  if (d) $("fs").innerHTML = "Полный сигнал: " + (d > 0 ? "ЛОНГ" : "ШОРТ") +
    "<small>все 4 ≥" + FULL_MIN + ", скор " + (A.t > 0 ? "+" : "") + Math.round(A.t) +
    ", порог " + Math.round(A.entryThreshold || 70) + ", RSI " + Math.round(A.rsi) + "</small>";
  const key = d + ":" + C[C.length - 1].t;
  if (pf !== null && d && d !== pf && key !== lk && key !== lastKey) {
    lk = key;
    lastKey = key;
    persist();
    if (nt || ($("push-on") && $("push-on").checked)) alertFull(d);
  }
  pf = d;
}

function render() {
  if (C.length < 60) return;
  A = analyze(C);
  const t = A.t, r = Math.round(t);
  $("sc").textContent = (r > 0 ? "+" : "") + r;
  $("sc").style.color = Math.abs(t) >= (A.entryThreshold || 70) ? (t > 0 ? "var(--up)" : "var(--dn)") : "var(--tx)";
  $("lb").textContent = trade(t);
  $("px").textContent = sym + " " + fmt(A.px);
  $("rg").textContent = (A.flat ? "флэт" : "тренд") + " · ADX " + Math.round(A.adx) +
    ", ATR " + A.atrp.toFixed(2) + "% · RSI " + Math.round(A.rsi) + " · " + A.ag + "/4" +
    (Number.isFinite(A.relVol) ? " · Vol×" + A.relVol.toFixed(1) : "");
  $("mk").style.left = (t + 100) / 2 + "%";
  signal(fullDir(A));

  const nm = ["Тренд", "Уровни", "Полосы Боллинджера", "Пересечения MA"];
  let html = A.S.map((s, i) => {
    const c = s >= 0 ? "var(--up)" : "var(--dn)", w = Math.abs(s) / 2;
    return `<div class="m"><div class="mh">${nm[i]}<span>вес ${Math.round(A.W[i] * 100)}%, ${s > 0 ? "+" : ""}${Math.round(s)}</span></div><div class="bar"><i style="background:${c};left:${s >= 0 ? 50 : 50 - w}%;width:${w}%"></i></div><div class="n">${A.N[i]}</div></div>`;
  }).join("");
  html += `<div class="m"><div class="mh">Объём<span>${A.volScore > 0 ? "+" : ""}${Math.round(A.volScore)}</span></div>
    <div class="bar"><i style="background:${A.volScore >= 0 ? "var(--up)" : "var(--dn)"};left:${A.volScore >= 0 ? 50 : 50 - Math.abs(A.volScore) / 2}%;width:${Math.abs(A.volScore) / 2}%"></i></div>
    <div class="n">${A.vN}</div></div>`;
  html += `<div class="m"><div class="mh">RSI (14)<span>${Math.round(A.rsi)}</span></div>
    <div class="n">${A.rsiN} · порог ${Math.round(A.entryThreshold || 70)}</div></div>`;
  $("ms").innerHTML = html;

  $("bl").disabled = $("bs").disabled = !!P;
  $("bc").disabled = !P;
  const rk = +$("rs").value || 10;
  $("rk").innerHTML = P ? [
    ["Вход", fmt(P.e)], ["Стоп", fmt(P.sl) + (P.d * (P.sl - P.e) > 0 ? " (тр.)" : "")],
    ["Тейк", fmt(P.tp)], ["Размер", (rk / P.r).toFixed(4) + " " + sym.replace("USDT", "")],
    ["Сейчас, R", (P.d * (A.px - P.e) / P.r).toFixed(2)], ["Свечей", P.age + " / 12"]
  ].map(x => `<div><b>${x[0]}</b>${x[1]}</div>`).join("") :
    `<div style="grid-column:1/4"><b>Нет сделки</b>Стоп 1 ATR=${fmt(A.a)}, тейк 1.5, трейл 0.5/1R, макс 12 св.</div>`;

  if (LOG.length) {
    const rows = LOG.slice(-12).reverse().map(x => {
      const side = x.d > 0 ? "Л" : "Ш";
      const cls = x.R > 0 ? "pos" : x.R < 0 ? "neg" : "";
      const man = x.m ? " (руч.)" : "";
      return `<tr>
        <td>${x.tm}</td>
        <td style="color:var(--${x.d > 0 ? "up" : "dn"})">${side}</td>
        <td>${Math.round(x.s)}</td>
        <td>${fmt(x.e)}</td>
        <td>${x.x != null ? fmt(x.x) : "—"}</td>
        <td class="${cls}">${x.R > 0 ? "+" : ""}${x.R.toFixed(2)}</td>
        <td>${x.w}${man}</td>
        <td>${x.age != null ? x.age : "—"}</td>
      </tr>`;
    }).join("");
    $("lg").innerHTML =
      "<tr><th>Время</th><th>Ст</th><th>Скор</th><th>Вход</th><th>Выход</th><th>R</th><th>Итог</th><th>Св</th></tr>" + rows;
    const wins = LOG.filter(x => x.R > 0).length;
    const sumR = LOG.reduce((s, x) => s + x.R, 0);
    $("st").textContent = LOG.length + " сд. · WR " + Math.round(wins / LOG.length * 100) + "% · Σ " +
      (sumR >= 0 ? "+" : "") + sumR.toFixed(1) + " R";
    $("log-save").disabled = false;
    $("log-ntfy").disabled = false;
    $("log-clear").disabled = false;
  } else {
    $("lg").innerHTML = "<tr><td colspan='8'>Сделок пока нет</td></tr>";
    $("st").textContent = "";
    $("log-save").disabled = true;
    $("log-ntfy").disabled = true;
    $("log-clear").disabled = true;
  }
  persist();
  draw();
}

function draw() {
  if (!A) return;
  const cv = $("cv"), dp = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  cv.width = w * dp; cv.height = h * dp;
  const g = cv.getContext("2d"); g.scale(dp, dp);
  const st = getComputedStyle(document.documentElement), V = n => st.getPropertyValue(n).trim();
  const N = Math.min(80, C.length), o = C.length - N, D = C.slice(o), pw = 52, cw = (w - pw) / N;
  let lo = Math.min(...D.map(x => x.l)), hi = Math.max(...D.map(x => x.h));
  const pd = (hi - lo) * 0.06; lo -= pd; hi += pd;
  const Y = p => h - 6 - (p - lo) / (hi - lo) * (h - 12), X = i => (i + 0.5) * cw;
  g.font = "10px system-ui"; g.textAlign = "left";
  for (let i = 0; i <= 4; i++) {
    const p = lo + (hi - lo) * i / 4, y = Y(p);
    g.strokeStyle = V("--bd"); g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w - pw, y); g.stroke();
    g.fillStyle = V("--mu"); g.fillText(fmt(p), w - pw + 4, y + 3);
  }
  g.save(); g.beginPath(); g.rect(0, 0, w - pw, h); g.clip();
  const bb = A.B.slice(o);
  g.globalAlpha = 0.1; g.fillStyle = V("--ac"); g.beginPath();
  bb.forEach((b, i) => { if (b) g[i ? "lineTo" : "moveTo"](X(i), Y(b.u)); });
  for (let i = N - 1; i >= 0; i--) if (bb[i]) g.lineTo(X(i), Y(bb[i].l));
  g.fill(); g.globalAlpha = 1;
  const ln = (arr, col) => {
    g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath();
    arr.slice(o).forEach((v, i) => g[i ? "lineTo" : "moveTo"](X(i), Y(v)));
    g.stroke();
  };
  ln(A.e50, V("--mu")); ln(A.e21, V("--am")); ln(A.e9, V("--ac"));
  g.setLineDash([4, 3]); g.lineWidth = 1;
  A.lv.filter(l => l.p > lo && l.p < hi).forEach(l => {
    g.strokeStyle = l.p < A.px ? V("--up") : V("--dn");
    g.globalAlpha = 0.45 + Math.min(l.n, 3) * 0.12;
    g.beginPath(); g.moveTo(0, Y(l.p)); g.lineTo(w - pw, Y(l.p)); g.stroke();
  });
  g.setLineDash([]); g.globalAlpha = 1;
  D.forEach((c, i) => {
    const col = c.c >= c.o ? V("--up") : V("--dn"), x = X(i);
    g.strokeStyle = g.fillStyle = col; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, Y(c.h)); g.lineTo(x, Y(c.l)); g.stroke();
    const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
    g.fillRect(x - cw * 0.32, y1, cw * 0.64, Math.max(1, y2 - y1));
  });
  g.restore();
  const y = Y(A.px), up = A.px >= C[C.length - 2].c;
  g.fillStyle = up ? V("--up") : V("--dn");
  g.fillRect(w - pw, y - 8, pw, 16);
  g.fillStyle = "#fff"; g.fillText(fmt(A.px), w - pw + 3, y + 3);
}

function gen(n) {
  let p = BASE[sym] || 100;
  const mins = tfMinutes(tf);
  const t0 = Date.now() - n * mins * 6e4, out = [];
  for (let i = 0; i < n; i++) {
    if (i % 40 === 0) dr = rnd() < 0.35 ? 0 : gs() * 0.0012 * Math.sqrt(Math.min(mins, 240));
    const o = p, c = o * (1 + dr + gs() * 0.0016 * Math.sqrt(Math.min(mins, 240)));
    out.push({
      t: t0 + i * mins * 6e4, o, c,
      h: Math.max(o, c) * (1 + rnd() * 0.0006),
      l: Math.min(o, c) * (1 - rnd() * 0.0006),
      v: 1000 + rnd() * 5000
    });
    p = c;
  }
  return out;
}
function tick() {
  const l = C[C.length - 1]; tk++;
  const mins = tfMinutes(tf);
  if (tk % 10 === 0) {
    dr = rnd() < 0.35 ? 0 : gs() * 0.0012 * Math.sqrt(Math.min(mins, 240));
    C.push({ t: l.t + mins * 6e4, o: l.c, c: l.c, h: l.c, l: l.c, v: 1000 + rnd() * 3000 });
    if (C.length > 300) C.shift();
  } else {
    l.c *= 1 + dr * 0.15 + gs() * 0.0007 * Math.sqrt(Math.min(mins, 240));
    l.h = Math.max(l.h, l.c); l.l = Math.min(l.l, l.c);
  }
  render();
}
async function live() {
  try {
    const r = await fetch(
      "https://api.bybit.com/v5/market/kline?category=linear&symbol=" + encodeURIComponent(sym) +
      "&interval=" + String(tf) + "&limit=200",
      { cache: "no-store" }
    );
    const j = await r.json();
    if (!j.result || !j.result.list) throw 0;
    C = j.result.list.reverse().map(x => ({
      t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] || 0
    }));
    return true;
  } catch (e) { return false; }
}
async function load(keep) {
  clearInterval(timer);
  P = null; pf = null;
  if (!keep) LOG = [];
  armed = true; cd = 0; lt = 0;
  const ok = await live();
  mode = ok ? "live" : "demo";
  if (!ok) C = gen(200);
  $("md").className = "bd" + (ok ? " lv" : "");
  $("md").innerHTML = ok ? "<b>Live</b> Bybit · " + tfLabel(tf) : "<b>Демо</b> · нет сети к Bybit";
  render();
  timer = setInterval(async () => {
    if (mode === "live") { if (await live()) render(); }
    else tick();
  }, ok ? 5000 : 2000);
}

$("sym").onchange = e => { sym = e.target.value; load(); };
$("tfs").onclick = e => {
  const b = e.target.closest("button");
  if (!b) return;
  const v = b.dataset.t;
  tf = (v === "D" || v === "W") ? v : +v;
  [...$("tfs").children].forEach(x => x.classList.toggle("on", x === b));
  load();
};
$("bl").onclick = () => openP(1);
$("bs").onclick = () => openP(-1);
$("bc").onclick = closeNow;

function logPayload() {
  const wins = LOG.filter(x => x.R > 0).length;
  const sumR = LOG.reduce((s, x) => s + x.R, 0);
  return {
    version: "1.0-pwa",
    savedAt: new Date().toISOString(),
    symbol: sym,
    timeframe: tf,
    summary: {
      n: LOG.length, wins,
      losses: LOG.filter(x => x.R < 0).length,
      winrate: LOG.length ? +(wins / LOG.length * 100).toFixed(1) : 0,
      sumR: +sumR.toFixed(4)
    },
    trades: LOG.map(x => ({
      time: x.tm, side: x.d > 0 ? "long" : "short", score: +(+x.s).toFixed(2),
      entry: x.e, exit: x.x != null ? x.x : null, R: +x.R.toFixed(4),
      reason: x.w, manual: !!x.m, bars: x.age != null ? x.age : null
    }))
  };
}
function logFileName() {
  const tfl = (tf === "D" || tf === "W") ? tf : (tf >= 60 ? Math.round(tf / 60) + "h" : tf + "m");
  return `trades_${sym}_${tfl}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
}
function downloadJson(name, json) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function buildLogSummary() {
  if (!LOG.length) return null;
  const wins = LOG.filter(x => x.R > 0).length;
  const sumR = LOG.reduce((s, x) => s + x.R, 0);
  const last = LOG.slice(-5).reverse().map(x => {
    const side = x.d > 0 ? "L" : "S";
    return `${side} ${x.R > 0 ? "+" : ""}${x.R.toFixed(2)}R (${x.w})`;
  });
  return {
    title: `Журнал ${sym} ${tfLabel(tf)}`,
    body: `${LOG.length} сделок · WR ${Math.round(wins / LOG.length * 100)}% · Σ ${(sumR >= 0 ? "+" : "") + sumR.toFixed(2)}R\nПоследние:\n` + last.join("\n")
  };
}

$("log-clear").onclick = () => {
  if (!LOG.length) return;
  if (!confirm("Очистить журнал (" + LOG.length + " сделок)?")) return;
  LOG = [];
  $("log-msg").textContent = "Журнал очищен";
  render();
};
$("log-save").onclick = () => {
  if (!LOG.length) return;
  downloadJson(logFileName(), JSON.stringify(logPayload(), null, 2));
  $("log-msg").textContent = "Файл скачан";
};
$("log-ntfy").onclick = async () => {
  const summary = buildLogSummary();
  if (!summary) return;
  const topic = $("ntfy").value.trim();
  if (!topic) { $("log-msg").textContent = "Укажите топик ntfy"; return; }
  const ok = await NT.ntfy(topic, summary.title, summary.body, { priority: "default", tags: "clipboard,bar_chart" });
  $("log-msg").textContent = ok ? "Сводка в ntfy" : "Ошибка ntfy";
};

$("nt").onclick = () => {
  nt = !nt;
  $("nt").textContent = nt ? "🔔" : "🔕";
  unlock();
  if (nt) {
    beep(1);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  }
  persist();
};
$("ntfy-t").onclick = async () => {
  const topic = $("ntfy").value.trim();
  if (!topic) { alert("Введите топик ntfy"); return; }
  const ok = await NT.ntfy(topic, "Дашборд сигналов", "Тест PWA: " + new Date().toLocaleString("ru"), {
    priority: "high", tags: "white_check_mark"
  });
  alert(ok ? "Отправлено — проверьте ntfy" : "Ошибка — топик или сеть");
};
$("ntfy").oninput = persist;
$("push-on").onchange = () => { persist(); unlock(); };

// PWA install prompt
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const bar = $("install-bar");
  if (bar) bar.classList.add("show");
});
$("install-btn") && ($("install-btn").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  const bar = $("install-bar");
  if (bar) bar.classList.remove("show");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(e => console.warn("SW:", e));
}

addEventListener("pointerdown", unlock);
addEventListener("resize", draw);

loadState();
$("sym").value = sym;
$("nt").textContent = nt ? "🔔" : "🔕";
[...$("tfs").children].forEach(x => {
  const v = x.dataset.t;
  const match = (v === "D" || v === "W") ? tf === v : +v === +tf;
  x.classList.toggle("on", match);
});
load(true);
