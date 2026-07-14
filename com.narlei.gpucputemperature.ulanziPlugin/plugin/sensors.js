// sensors.js — spawn the platform-native `thermal` helper, parse its output,
// and classify sensors into CPU and GPU temperature readings.
//
// The helper prints one line per sensor: "<name>\t<celsius>". Sensor naming
// differs per platform, so we try an ordered list of matchers per domain and
// use the first matcher that hits ≥1 sensor, reporting the hottest one.
//
// macOS: native Swift helper reading IOKit HID thermal sensors directly.
//   Verified empirically on an Apple M4 (Mac16,10): under sustained CPU load
//   the "PMU tdie*" sensors rise ~7 °C while "PMU2 tdie*" stay flat — so
//   PMU = CPU die cluster, PMU2 = GPU die cluster.
//
// Windows: native .NET helper using LibreHardwareMonitorLib (the library
//   behind HWiNFO/OpenHardwareMonitor), which already classifies sensors by
//   hardware type and prints "CPU <name>" / "GPU <name>" lines directly.
//   IMPORTANT: reading CPU package temperature on Windows requires the
//   WinRing0 kernel driver, which needs the process to run elevated
//   (Administrator) — see helper-windows/Program.cs. Without elevation, CPU
//   sensors may come back empty and the key will show "N/A".

import { execFile, execFileSync } from 'child_process';
import { chmodSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IS_WINDOWS = process.platform === 'win32';
const HELPER = IS_WINDOWS
  ? path.join(__dirname, '..', 'helper-windows', 'thermal.exe')
  : path.join(__dirname, '..', 'helper', 'thermal');

// When the plugin is downloaded as a ZIP, the macOS helper binary inherits
// the com.apple.quarantine attribute and Gatekeeper kills it on first exec.
// It also may lose its executable bit through zipping. Fix both once, at
// startup, before we ever spawn it. Failures here are non-fatal. Not needed
// on Windows (no exec bit, no Gatekeeper quarantine kill).
let prepared = false;
function ensureRunnable() {
  if (prepared || IS_WINDOWS) return;
  prepared = true;
  try { chmodSync(HELPER, 0o755); } catch { /* ignore */ }
  try {
    execFileSync('/usr/bin/xattr', ['-d', 'com.apple.quarantine', HELPER], { stdio: 'ignore' });
  } catch { /* no quarantine attr present — fine */ }
}

// Ordered matchers. First pattern that matches at least one sensor wins.
const CPU_MATCHERS = [
  /^CPU /,             // Windows helper: already classified by hardware type
  /^Tp\d/i,            // Apple Silicon SMC-style CPU core keys (Tp01, Tp09…)
  /\bCPU\b/i,          // explicitly named
  /ACC\s*MTR/i,        // eACC/pACC core-cluster sensors (some chips)
  /^PMU tdie/i,        // Apple M4 CPU die cluster (verified)
  /^TC\d/i,            // Intel CPU die (TC0D/TC0E/TC0F…)
];

const GPU_MATCHERS = [
  /^GPU /,             // Windows helper: already classified by hardware type
  /^Tg\d/i,            // Apple Silicon SMC-style GPU keys (Tg05…)
  /\bGPU\b/i,          // explicitly named
  /^PMU2 tdie/i,       // Apple M4 GPU die cluster (verified)
  /^TG\d/i,            // Intel GPU die
  /^TCGC/i,            // Intel integrated GPU
];

function parse(stdout) {
  const sensors = [];
  for (const line of stdout.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const name = line.slice(0, tab).trim();
    const value = parseFloat(line.slice(tab + 1));
    if (name && Number.isFinite(value)) sensors.push({ name, value });
  }
  return sensors;
}

function pick(sensors, matchers) {
  for (const re of matchers) {
    const hits = sensors.filter((s) => re.test(s.name));
    if (hits.length) {
      // Report the hottest die sensor (the hotspot). This is what "CPU/GPU
      // temperature" conventionally means and matches tools like CleanMyMac,
      // HWiNFO, etc. — averaging across all die sensors reads several degrees
      // lower than the peak.
      const celsius = Math.max(...hits.map((s) => s.value));
      const avg = hits.reduce((a, s) => a + s.value, 0) / hits.length;
      return { celsius, avg, count: hits.length, matcher: re.source };
    }
  }
  return null;
}

function runHelper() {
  ensureRunnable();
  return new Promise((resolve, reject) => {
    execFile(HELPER, { timeout: 5000, maxBuffer: 1 << 20 }, (err, stdout) => {
      // The Windows helper exits non-zero with empty stdout when it has no
      // sensor readings (commonly: not running elevated) — treat that as an
      // empty reading rather than a hard failure so the UI shows "N/A".
      if (err && !stdout) return reject(err);
      resolve(stdout || '');
    });
  });
}

/**
 * Read current temperatures.
 * @returns {Promise<{cpu: {celsius:number,count:number}|null, gpu: {...}|null, sensors: Array}>}
 */
export async function readTemperatures() {
  const stdout = await runHelper();
  const sensors = parse(stdout);
  return {
    cpu: pick(sensors, CPU_MATCHERS),
    gpu: pick(sensors, GPU_MATCHERS),
    sensors,
  };
}

export { HELPER };
