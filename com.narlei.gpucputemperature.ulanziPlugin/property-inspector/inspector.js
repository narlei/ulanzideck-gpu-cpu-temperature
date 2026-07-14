$UD.connect();

let currentSettings = {};

$UD.onConnected(() => {
  document.querySelector('.udpi-wrapper').classList.remove('hidden');
  $UD.getSettings();
});

$UD.onParamFromPlugin((msg) => applySettings(msg?.payload || msg?.param || {}));
$UD.onParamFromApp((msg) => applySettings(msg?.payload || msg?.param || {}));

function applySettings(settings) {
  currentSettings = settings || {};
  const unit = currentSettings.unit === 'F' ? 'F' : 'C';
  document.getElementById('unit').value = unit;
  const pollInterval = currentSettings.pollInterval || '10000';
  document.getElementById('pollInterval').value = pollInterval;
}

function saveSettings() {
  currentSettings = {
    ...currentSettings,
    unit: document.getElementById('unit').value,
    pollInterval: document.getElementById('pollInterval').value,
  };
  $UD.setSettings(currentSettings);
}

document.getElementById('unit').addEventListener('change', saveSettings);
document.getElementById('pollInterval').addEventListener('change', saveSettings);
