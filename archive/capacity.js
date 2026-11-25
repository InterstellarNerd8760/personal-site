'use strict';

function estimateCapacity(input) {
  const area = input.width * input.height;
  // The form accepts tenths for dimensions, pitch and percentages.
  const pitchTenths = Math.round(input.pitch * 10);
  const columns = Math.floor(Math.round(input.width * 10) * 1000 / pitchTenths);
  const rows = Math.floor(Math.round(input.height * 10) * 1000 / pitchTenths);
  const cells = BigInt(columns * rows * input.planes);
  const usablePerThousand = BigInt(Math.round(input.usable * 10));
  const rawBytes = Number(cells * usablePerThousand / 8000n);
  const logicalBytes = Math.round(input.logicalMB * 1_000_000);
  const correctionPerThousand = BigInt(Math.round(input.correction * 10));
  const correctionBytes = input.protectedOverride >= logicalBytes
    ? input.protectedOverride - logicalBytes
    : Number((BigInt(logicalBytes) * correctionPerThousand + 999n) / 1000n);
  const protectedBytes = logicalBytes + correctionBytes;
  const substrateVolume = area * input.thickness / 1000;
  const shieldVolume = area * input.shieldThickness / 1000;
  const copyMass = substrateVolume * input.density + shieldVolume * input.shieldDensity;

  return {
    rawBytes,
    logicalBytes,
    correctionBytes,
    protectedBytes,
    redundancyBytes: protectedBytes * (input.copies - 1),
    totalBytes: protectedBytes * input.copies,
    substrateVolume,
    copyMass,
    carrierMass: copyMass * input.copies + input.mount,
  };
}

function displayBytes(bytes) {
  const units = [[1_000_000_000, 'GB'], [1_000_000, 'MB'], [1_000, 'kB'], [1, 'B']];
  const [scale, unit] = units.find(([scale]) => bytes >= scale) || units[3];
  return `${(bytes / scale).toLocaleString('en', { maximumFractionDigits: 3 })} ${unit}`;
}

function connectCapacityForm(form) {
  const show = (id, value) => {
    document.getElementById(id).textContent = value;
  };
  const format = (amount, unit) => `${amount.toLocaleString('en', { maximumFractionDigits: 4 })} ${unit}`;

  const update = (event) => {
    event.preventDefault();
    const input = Object.fromEntries([...new FormData(form)].map(([name, value]) => [name, Number(value)]));
    if (form.dataset.protectedBytes) input.protectedOverride = Number(form.dataset.protectedBytes);
    const result = estimateCapacity(input);
    const remainingBytes = result.rawBytes - result.protectedBytes;

    show('estimate-status', remainingBytes < 0
      ? `Each copy falls short by ${displayBytes(-remainingBytes)} in this model.`
      : `Each copy has ${displayBytes(remainingBytes)} of raw space remaining in this model.`);
    show('raw-capacity', displayBytes(result.rawBytes));
    show('protected-per-copy', displayBytes(result.protectedBytes));
    show('logical-bytes', displayBytes(result.logicalBytes));
    show('correction-bytes', displayBytes(result.correctionBytes));
    show('redundancy-bytes', displayBytes(result.redundancyBytes));
    show('total-bytes', displayBytes(result.totalBytes));
    show('substrate-volume', format(result.substrateVolume, 'cm³'));
    show('copy-mass', format(result.copyMass, 'g'));
    show('carrier-mass', format(result.carrierMass, 'g'));
  };
  form.addEventListener('submit', update);
}

if (typeof document !== 'undefined') {
  connectCapacityForm(document.getElementById('capacity-form'));
}

if (typeof module !== 'undefined') {
  module.exports = { estimateCapacity };
}
