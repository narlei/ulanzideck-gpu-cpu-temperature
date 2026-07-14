// renderer.js — draws the button face as an SVG and returns a base64 data URL
// suitable for $UD.setBaseDataIcon(). No native canvas dependency.

const SIZE = 200;
const BG = '#1a1a1e';
const TRACK = '#2c2c33';
const TEXT = '#ffffff';
const MUTED = '#8a8a99';
const SHADOW = 'rgba(0,0,0,0.8)';

// Gauge range in °C used for the bottom fill bar.
const GAUGE_MIN = 30;
const GAUGE_MAX = 100;

// Temperature → accent colour (based on °C, the physical value).
const THRESHOLDS = [
  { at: 90, color: '#e3434c' }, // hot
  { at: 80, color: '#e8893c' }, // warm
  { at: 65, color: '#e3b341' }, // moderate
  { at: 0, color: '#3ecf6b' },  // cool
];

function colorFor(celsius) {
  for (const t of THRESHOLDS) if (celsius >= t.at) return t.color;
  return THRESHOLDS[THRESHOLDS.length - 1].color;
}

const FONT = '-apple-system,Helvetica,Arial,sans-serif';

function svgDoc(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${body}</svg>`;
}
function toDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function text(t, x, y, size, weight = '700', fill = TEXT, anchor = 'middle') {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(t)}</text>`;
}
function textShadowed(t, x, y, size, weight = '700', fill = TEXT, anchor = 'middle') {
  return (
    `<text x="${x + 1}" y="${y + 1}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${SHADOW}">${esc(t)}</text>` +
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(t)}</text>`
  );
}

// A slim thermometer gauge on the left edge: a track with a bottom-up fill
// proportional to temperature, capped by a bulb. Doubles as the temp metaphor.
function thermometerGauge(ratio, color) {
  const cx = 26;
  const top = 30;
  const bottom = 150;
  const stemW = 12;
  const bulbR = 15;
  const trackH = bottom - top;
  const fillH = Math.round(trackH * ratio);
  const bulbCy = bottom + bulbR + 4;
  return [
    // track
    `<rect x="${cx - stemW / 2}" y="${top}" width="${stemW}" height="${trackH}" rx="${stemW / 2}" fill="${TRACK}"/>`,
    // fill (from just above the bulb, upward)
    `<rect x="${cx - stemW / 2}" y="${bottom - fillH}" width="${stemW}" height="${fillH + 6}" rx="${stemW / 2}" fill="${color}"/>`,
    // bulb
    `<circle cx="${cx}" cy="${bulbCy}" r="${bulbR}" fill="${color}"/>`,
    `<circle cx="${cx}" cy="${bulbCy}" r="${bulbR}" fill="none" stroke="${BG}" stroke-width="3"/>`,
  ].join('');
}

/**
 * @param {string} label  e.g. "CPU" or "GPU"
 * @param {number} celsius
 * @param {'C'|'F'} unit
 */
export function renderTemp({ label, celsius, unit = 'C' }) {
  const color = colorFor(celsius);
  const shown = unit === 'F' ? celsius * 9 / 5 + 32 : celsius;
  const valueStr = `${Math.round(shown)}°`;
  const unitStr = unit === 'F' ? 'F' : 'C';

  const ratio = Math.max(0, Math.min(1, (celsius - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)));

  // Text is centred in the space to the right of the gauge.
  const cx = 118;

  const body = [
    `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="${BG}"/>`,
    // Top accent stripe.
    `<rect x="0" y="0" width="${SIZE}" height="4" fill="${color}"/>`,
    thermometerGauge(ratio, color),
    textShadowed(label, cx, 58, 34, '700'),
    textShadowed(valueStr, cx, 128, 60, '800', color),
    textShadowed(`°${unitStr}`, cx, 168, 22, '600', MUTED),
  ].join('');

  return toDataUrl(svgDoc(body));
}

export function renderLoading({ label }) {
  const body = [
    `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="${BG}"/>`,
    `<rect x="0" y="0" width="${SIZE}" height="4" fill="#6366f1"/>`,
    text(label, SIZE / 2, 90, 30, '700'),
    text('…', SIZE / 2, 150, 52, '400', MUTED),
  ].join('');
  return toDataUrl(svgDoc(body));
}

export function renderNoData({ label }) {
  const body = [
    `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="${BG}"/>`,
    `<rect x="0" y="0" width="${SIZE}" height="4" fill="#4a4a52"/>`,
    text(label, SIZE / 2, 88, 30, '700'),
    text('N/A', SIZE / 2, 140, 40, '700', MUTED),
    text('no sensor', SIZE / 2, 172, 16, '400', MUTED),
  ].join('');
  return toDataUrl(svgDoc(body));
}

export { colorFor };
