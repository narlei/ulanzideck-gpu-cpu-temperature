// Ulanzi Deck — GPU & CPU Temperature
// Two actions (CPU, GPU). A single shared poller reads the native `thermal`
// helper every few seconds and pushes an updated icon to every active key.
// Clicking a key toggles the unit between °C and °F (saved per key).

import UlanziApi from './plugin-common-node/index.js';
import { readTemperatures } from './sensors.js';
import { renderTemp, renderLoading, renderNoData } from './renderer.js';

const PLUGIN_UUID = 'com.narlei.gpucputemperature.plugin';
const DEFAULT_POLL_MS = 10000;

const $UD = new UlanziApi();
const INSTANCES = new Map(); // context -> { context, domain, unit, active, pollMs }

let lastReading = null; // { cpu, gpu, sensors }
let polling = false;
let pollMs = DEFAULT_POLL_MS;
let pollTimer = null;

function log(...args) {
  console.log('[gpu-cpu-temp]', ...args);
}

// Ulanzi Studio delivers the *action* UUID in the first context segment
// (decodeContext().uuid), while the raw actionid field carries a per-instance
// id. Accept a ".gpu" suffix in either field so we're robust to both.
function domainForContext(context) {
  const { uuid = '', actionid = '' } = $UD.decodeContext(context) || {};
  return uuid.endsWith('.gpu') || actionid.endsWith('.gpu') ? 'gpu' : 'cpu';
}

function labelFor(domain) {
  return domain === 'gpu' ? 'GPU' : 'CPU';
}

function unitFor(settings) {
  return settings && (settings.unit === 'F' || settings.unit === 'C') ? settings.unit : 'C';
}

function renderInstance(inst) {
  const label = labelFor(inst.domain);

  if (!lastReading) {
    $UD.setBaseDataIcon(inst.context, renderLoading({ label }));
    return;
  }

  const reading = inst.domain === 'gpu' ? lastReading.gpu : lastReading.cpu;
  if (!reading || !Number.isFinite(reading.celsius)) {
    $UD.setBaseDataIcon(inst.context, renderNoData({ label }));
    return;
  }

  $UD.setBaseDataIcon(inst.context, renderTemp({ label, celsius: reading.celsius, unit: inst.unit }));
}

function renderAllActive() {
  for (const inst of INSTANCES.values()) {
    if (inst.active) renderInstance(inst);
  }
}

function updatePollInterval(newPollMs) {
  if (newPollMs === pollMs) return;
  pollMs = newPollMs;
  log(`poll interval updated to ${pollMs}ms`);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, pollMs);
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    lastReading = await readTemperatures();
  } catch (err) {
    log('helper error:', err.message);
    lastReading = { cpu: null, gpu: null, sensors: [] };
  } finally {
    polling = false;
  }
  renderAllActive();
}

function ensureInstance(msg) {
  const context = msg.context;
  const domain = domainForContext(context);
  const settings = msg.param || msg.settings || {};

  let inst = INSTANCES.get(context);
  if (!inst) {
    inst = { context, domain, unit: unitFor(settings), active: true };
    INSTANCES.set(context, inst);
  } else {
    inst.domain = domain;
    inst.unit = unitFor(settings);
  }

  // Update global poll interval if present in settings
  if (settings.pollInterval) {
    const newPollMs = parseInt(settings.pollInterval, 10);
    if (newPollMs && newPollMs > 0) {
      updatePollInterval(newPollMs);
    }
  }

  renderInstance(inst);
  return inst;
}

$UD.connect(PLUGIN_UUID);

$UD.onConnected(() => {
  log('connected');
  poll();
});

$UD.onAdd((msg) => {
  log('add', msg.actionid, msg.context);
  ensureInstance(msg);
  poll();
});

$UD.onParamFromApp((msg) => ensureInstance(msg));
$UD.onParamFromPlugin((msg) => ensureInstance(msg));
$UD.onDidReceiveSettings((msg) => {
  ensureInstance({ ...msg, param: msg.settings || msg.param });
});

// Click toggles °C <-> °F for that key.
$UD.onRun((msg) => {
  let inst = INSTANCES.get(msg.context);
  if (!inst) inst = ensureInstance(msg);
  inst.unit = inst.unit === 'C' ? 'F' : 'C';
  $UD.setSettings({ unit: inst.unit }, msg.context);
  renderInstance(inst);
});

$UD.onSetActive((msg) => {
  const inst = INSTANCES.get(msg.context);
  if (!inst) return;
  inst.active = !!msg.active;
  if (inst.active) renderInstance(inst);
});

$UD.onClear((msg) => {
  if (!msg.param) return;
  for (const item of msg.param) {
    if (INSTANCES.delete(item.context)) log('clear', item.context);
  }
});

$UD.onError((err) => log('socket error', err));
$UD.onClose(() => log('socket closed'));

pollTimer = setInterval(poll, pollMs);
