// Общий код: расчёт скора и условие «полного сигнала».
// v1.7.0: без исторического бэктеста панели, веса 1, объём без текущей свечи

const FULL_MIN = 50;
const ENTRY_BASE = 70;
const COST_PCT = 0.13;

const cl = (x, a = -100, b = 100) => Math.max(a, Math.min(b, x));
const fmt = p => p >= 1000 ? p.toFixed(1) : p >= 10 ? p.toFixed(2) : p.toFixed(4);

function ema(a, n) {
  const k = 2 / (n + 1);
  let p = a[0];
  return a.map((v, i) => i ? (p = v * k + p * (1 - k)) : v);
}

function bbs(a, n = 20, m = 2) {
  return a.map((_, i) => {
    if (i < n - 1) return null;
    const s = a.slice(i - n + 1, i + 1);
    const mu = s.reduce((x, y) => x + y) / n;
    const sd = Math.sqrt(s.reduce((x, y) => x + (y - mu) ** 2, 0) / n);
    return { m: mu, u: mu + m * sd, l: mu - m * sd };
  });
}

function atr(c, n = 14) {
  const t = c.slice(-n - 1);
  let s = 0;
  for (let i = 1; i < t.length; i++) {
    s += Math.max(t[i].h - t[i].l, Math.abs(t[i].h - t[i - 1].c), Math.abs(t[i].l - t[i - 1].c));
  }
  return s / n;
}

function adx(c, n = 14) {
  const m = c.length;
  if (m < n * 2 + 1) return 0;
  const tr = [], pdm = [], ndm = [];
  for (let i = 1; i < m; i++) {
    const h = c[i].h, l = c[i].l, pc = c[i - 1].c, ph = c[i - 1].h, pl = c[i - 1].l;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = h - ph, dn = pl - l;
    pdm.push(up > dn && up > 0 ? up : 0);
    ndm.push(dn > up && dn > 0 ? dn : 0);
  }
  const wilder = (a) => {
    let v = a.slice(0, n).reduce((x, y) => x + y, 0);
    const o = [v];
    for (let i = n; i < a.length; i++) {
      v = v - v / n + a[i];
      o.push(v);
    }
    return o;
  };
  const trS = wilder(tr), pdS = wilder(pdm), ndS = wilder(ndm);
  const pdi = pdS.map((v, i) => trS[i] > 0 ? v / trS[i] * 100 : 0);
  const ndi = ndS.map((v, i) => trS[i] > 0 ? v / trS[i] * 100 : 0);
  const dx = pdi.map((v, i) => (v + ndi[i]) > 0 ? Math.abs(v - ndi[i]) / (v + ndi[i]) * 100 : 0);
  let ax = dx.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < dx.length; i++) ax = (ax * (n - 1) + dx[i]) / n;
  return ax;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function levels(c) {
  const L = [], f = 3;
  for (let i = Math.max(f, c.length - 150); i < c.length - f; i++) {
    let hi = 1, lo = 1;
    for (let j = 1; j <= f; j++) {
      if (c[i].h <= c[i - j].h || c[i].h <= c[i + j].h) hi = 0;
      if (c[i].l >= c[i - j].l || c[i].l >= c[i + j].l) lo = 0;
    }
    if (hi) L.push(c[i].h);
    if (lo) L.push(c[i].l);
  }
  L.sort((a, b) => a - b);
  const o = [];
  for (const p of L) {
    const g = o[o.length - 1];
    if (g && (p - g.p) / g.p < 0.0015) {
      g.p = (g.p * g.n + p) / (g.n + 1);
      g.n++;
    } else o.push({ p, n: 1 });
  }
  return o;
}

function analyze(c) {
  const cs = c.map(x => x.c);
  const vs = c.map(x => x.v || 0);
  const n = cs.length - 1;
  const px = cs[n];
  const a = atr(c) || px * 0.001;

  const e9 = ema(cs, 9), e21 = ema(cs, 21), e50 = ema(cs, 50);
  const B = bbs(cs);
  const up = e9[n] > e21[n] && e21[n] > e50[n];
  const dn = e9[n] < e21[n] && e21[n] < e50[n];

  const tr = cl(
    Math.sign(e9[n] - e21[n]) * 25 +
    Math.sign(e21[n] - e50[n]) * 25 +
    cl((e21[n] - e21[n - 6]) / a * 15, -50, 50)
  );
  const trN = up ? "EMA 9 > 21 > 50: бычий тренд" :
               dn ? "EMA 9 < 21 < 50: медвежий тренд" :
                    "EMA перемешаны, тренда нет";

  const lv = levels(c);
  const sup = lv.filter(x => x.p < px).pop();
  const res = lv.find(x => x.p > px);
  const dS = sup ? px - sup.p : a * 5;
  const dR = res ? res.p - px : a * 5;
  const pr = cl(1 - Math.min(dS, dR) / (a * 4), 0.2, 1);
  const ls = cl((dR - dS) / (dR + dS) * 150 * pr);
  const lN = (sup ? "Поддержка " + fmt(sup.p) + " (" + (dS / a).toFixed(1) + " ATR)" : "Поддержки нет") +
             "; " +
             (res ? "сопротивление " + fmt(res.p) + " (" + (dR / a).toFixed(1) + " ATR)" : "сопротивления нет");

  const b = B[n], bp = B[n - 1];
  const bandW = b ? b.u - b.l : 0;
  const pb = b && bandW !== 0 ? (px - b.l) / bandW : 0.5;
  const bw = b && b.m ? bandW / b.m : 0;
  const prevBw = bp && bp.m ? (bp.u - bp.l) / bp.m : bw;
  const ws = B.slice(-50).filter(Boolean).map(x => (x.u - x.l) / x.m);
  const avg = ws.reduce((x, y) => x + y, 0) / (ws.length || 1);
  let bs = cl((0.5 - pb) * 200);
  let bN = "Возврат к средней, %B = " + (pb * 100).toFixed(0) + "%";
  if ((pb > 1 || pb < 0) && bw > prevBw) {
    bs = pb > 1 ? 60 : -60;
    bN = "Выход за полосу с расширением: продолжение движения";
  }
  if (avg > 0 && bw < avg * 0.7) {
    bs *= 0.5;
    bN = "Сжатие полос: ждём импульс";
  }

  let k = -1;
  for (let i = n; i > n - 8; i--) {
    if (Math.sign(e9[i] - e21[i]) !== Math.sign(e9[i - 1] - e21[i - 1])) {
      k = n - i;
      break;
    }
  }
  let ms, mN;
  if (k >= 0) {
    const d = Math.sign(e9[n] - e21[n]);
    ms = d * (100 - k * 10);
    mN = (d > 0 ? "Бычье" : "Медвежье") + " пересечение EMA " + (k ? k + " св. назад" : "на этой свече");
  } else {
    ms = cl((e9[n] - e21[n]) / a * 40);
    mN = "Свежих пересечений нет, смотрим расстояние между EMA";
  }

  let vs_score = 0;
  let vN = "Объём нейтральный";
  let relVol = 0;
  if (n >= 1) {
    const from = Math.max(0, n - 20);
    const prev = vs.slice(from, n).filter(v => v > 0);
    const sma = prev.length ? prev.reduce((s, v) => s + v, 0) / prev.length : 0;
    relVol = sma > 0 && vs[n] > 0 ? vs[n] / sma : (vs[n] > 0 ? 1 : 0);
    const priceDir = Math.sign(cs[n] - cs[n - 1] || 0);
    if (vs[n] <= 0 || sma <= 0) {
      vN = "Объёма нет";
    } else if (relVol > 1.4) {
      vs_score = priceDir * Math.min(40, (relVol - 1) * 30);
      vN = "Высокий объём (×" + relVol.toFixed(1) + ") " + (priceDir > 0 ? "на росте" : priceDir < 0 ? "на падении" : "");
    } else if (relVol < 0.7) {
      vs_score = -Math.sign(tr) * 15;
      vN = "Низкий объём (×" + relVol.toFixed(1) + ")";
    } else {
      vN = "Объём нормальный (×" + relVol.toFixed(1) + ")";
    }
  }

  const rsiVal = rsi(cs, 14);
  let rsiN = "RSI " + rsiVal.toFixed(0);
  if (rsiVal > 75) rsiN += " (перекуплен)";
  else if (rsiVal < 25) rsiN += " (перепродан)";

  const er = Math.abs(cs[n] - cs[n - 20]) /
    (cs.slice(n - 19).reduce((s, v, i, r) => s + Math.abs(v - (i ? r[i - 1] : cs[n - 20])), 0) || 1);

  const S = [tr, ls, bs, ms];
  const W = [0.30, 0.25, 0.25, 0.20];
  let t = S.reduce((s, v, i) => s + v * W[i], 0);
  t += cl(vs_score, -40, 40) * 0.12;

  const d = Math.sign(t);
  const ag = S.filter(v => Math.sign(v) === d && Math.abs(v) > 20).length;
  if (ag >= 3) t *= 1.2;

  const adxv = adx(c, 14);
  const atrp = a / px * 100;
  const flat = er < 0.2 || adxv < 20;
  if (flat) t *= 0.55;
  if (atrp < 0.15) t *= 0.65;

  if (t > 0 && rsiVal > 78) t *= 0.4;
  if (t < 0 && rsiVal < 22) t *= 0.4;
  if (t > 0 && rsiVal > 50 && rsiVal < 70) t *= 1.05;
  if (t < 0 && rsiVal < 50 && rsiVal > 30) t *= 1.05;

  t = cl(t);

  let entry = ENTRY_BASE;
  if (atrp < 0.25) entry = 78;
  else if (atrp > 1.2) entry = 62;
  else if (atrp > 0.7) entry = 66;

  return {
    px, a, t, S, W,
    N: [trN, lN, bN, mN],
    ag, flat, er, e9, e21, e50, B, lv,
    adx: adxv, atrp,
    rsi: rsiVal, rsiN,
    volScore: vs_score, vN,
    entryThreshold: entry,
    relVol
  };
}

function fullDir(a) {
  if (a.atrp !== undefined && a.atrp < 0.08) return 0;
  if (a.t > 0 && a.rsi > 80) return 0;
  if (a.t < 0 && a.rsi < 20) return 0;

  const d = Math.sign(a.t);
  const entry = a.entryThreshold || ENTRY_BASE;
  return d && Math.abs(a.t) >= entry && a.S.every(v => Math.sign(v) === d && Math.abs(v) >= FULL_MIN) ? d : 0;
}

function fullMsg(d, sym, a) {
  return {
    title: "Полный сигнал: " + (d > 0 ? "ЛОНГ" : "ШОРТ"),
    message: sym + " " + fmt(a.px) + ", скор " + (a.t > 0 ? "+" : "") + Math.round(a.t) +
             ", RSI " + Math.round(a.rsi) + ", все 4 индикатора согласны"
  };
}
