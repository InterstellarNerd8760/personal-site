"use strict";

const CAR_HEADER_BYTES = 22;
const SHA256_BYTES = 32;
const CAR_MARKER = [255, 0, 255, 0, 0, 255, 0, 255];
const CAR_MODE = { 1: "mono", 8: "gray", 24: "rgb" };

function hex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

async function decodeRaster(bytes, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error("Frame verification requires HTTPS or localhost.");
  if (bytes.length < CAR_HEADER_BYTES + SHA256_BYTES
      || CAR_MARKER.some((value, offset) => bytes[offset] !== value) || bytes[8] !== 2) {
    throw new Error("Invalid CAR v2 marker or version.");
  }
  const fields = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const depth = bytes[9];
  const mode = CAR_MODE[depth];
  const width = fields.getUint16(10);
  const height = fields.getUint16(12);
  const recordId = fields.getUint32(14);
  const samples = width * height;
  if (!mode || !recordId || !width || !height || width > 16_384 || height > 16_384 || samples > 16_777_216) {
    throw new Error("Invalid sample layout or record ID.");
  }
  const length = Math.ceil(samples * depth / 8);
  if (fields.getUint32(18) !== length || bytes.length !== CAR_HEADER_BYTES + length + SHA256_BYTES) {
    throw new Error("Unexpected CAR frame length.");
  }
  const boundary = CAR_HEADER_BYTES + length;
  const payload = bytes.subarray(CAR_HEADER_BYTES, boundary);
  if (depth === 1 && samples % 8 && payload[length - 1] & ((1 << (8 - samples % 8)) - 1)) {
    throw new Error("Nonzero monochrome padding.");
  }
  const digest = hex(bytes.subarray(boundary));
  const calculated = hex(new Uint8Array(await subtle.digest("SHA-256", bytes.subarray(0, boundary))));
  if (calculated !== digest) throw new Error("CAR frame failed SHA-256 verification.");
  return { recordId, mode, width, height, payload, digest };
}

async function decodeIntactProtection(bytes, metadata, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error("Protection verification requires HTTPS or localhost.");
  const slotLength = 255;
  const dataEnd = 223;
  const chunkStart = 57;
  const chunkEnd = 191;
  const payloadLength = chunkEnd - chunkStart;
  const count = Math.max(1, Math.ceil(metadata.raw_bytes / payloadLength));
  if (count !== metadata.block_count || bytes.length !== slotLength * count
      || metadata.encoded_bytes !== bytes.length
      || hex(new Uint8Array(await subtle.digest("SHA-256", bytes))) !== metadata.sha256) {
    throw new Error("The protected download differs from its published inventory. Use the recovery tool for damaged copies.");
  }
  const output = new Uint8Array(metadata.raw_bytes);
  let expectedRecordDigest;
  for (let index = 0; index < count; index += 1) {
    const slot = bytes.subarray(index * slotLength, (index + 1) * slotLength);
    const fields = new DataView(slot.buffer, slot.byteOffset, slot.byteLength);
    const storedDigest = hex(slot.subarray(chunkEnd, dataEnd));
    const digest = hex(new Uint8Array(await subtle.digest("SHA-256", slot.subarray(0, chunkEnd))));
    if (storedDigest !== digest || hex(slot.subarray(0, 4)) !== "43414543" || slot[4] !== 1
        || fields.getUint32(5) !== metadata.record_id || fields.getUint32(9) !== index
        || fields.getUint32(13) !== count || fields.getBigUint64(17) !== BigInt(output.length)) {
      throw new Error("Unexpected protected block metadata or digest.");
    }
    const recordDigest = hex(slot.subarray(25, chunkStart));
    expectedRecordDigest ??= recordDigest;
    if (expectedRecordDigest !== recordDigest) throw new Error("Inconsistent protected record digest.");
    const offset = index * payloadLength;
    const useful = Math.min(payloadLength, output.length - offset);
    if (slot.subarray(chunkStart + useful, chunkEnd).some(value => value !== 0)) {
      throw new Error("Nonzero protected block padding.");
    }
    output.set(slot.subarray(chunkStart, chunkStart + useful), offset);
  }
  if (hex(new Uint8Array(await subtle.digest("SHA-256", output))) !== expectedRecordDigest) {
    throw new Error("The unwrapped frame failed its record integrity check.");
  }
  return output;
}

function monochromeBit(frame, index) {
  return (frame.payload[Math.floor(index / 8)] >> (7 - index % 8)) & 1;
}

function renderSamples(frame) {
  const pixels = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let index = 0; index < frame.width * frame.height; index += 1) {
    const offset = index * 4;
    if (frame.mode === "rgb") {
      pixels[offset] = frame.payload[index * 3];
      pixels[offset + 1] = frame.payload[index * 3 + 1];
      pixels[offset + 2] = frame.payload[index * 3 + 2];
    } else {
      const value = frame.mode === "gray" ? frame.payload[index] : 255 * monochromeBit(frame, index);
      pixels.fill(value, offset, offset + 3);
    }
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function drawRaster(canvas, frame, label) {
  canvas.width = frame.width;
  canvas.height = frame.height;
  canvas.getContext("2d").putImageData(new ImageData(renderSamples(frame), frame.width, frame.height), 0, 0);
  canvas.setAttribute("aria-label", `${label}, ${frame.width} by ${frame.height} pixels`);
}

function pairedMarks(container, frame) {
  const row = Math.floor(frame.height / 2);
  const width = Math.min(frame.width, 8);
  const start = row * frame.width + Math.floor((frame.width - width) / 2);
  const pair = document.createDocumentFragment();
  for (let index = start; index < start + width; index += 1) {
    const bit = monochromeBit(frame, index);
    const cell = document.createElement("span");
    cell.className = bit ? "explain-mark marked" : "explain-mark";
    cell.textContent = String(bit);
    pair.append(cell);
  }
  container.replaceChildren(pair);
  container.setAttribute("aria-label", `Eight consecutive monochrome pixels in row ${row + 1}`);
}

async function loadRaster(variant) {
  const response = await fetch(`photo-reconstruction/${variant.file}`);
  if (!response.ok) throw new Error("The selected CAR frame is unavailable.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const frame = await decodeRaster(bytes);
  const fileDigest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  if (frame.recordId !== variant.record_id || frame.mode !== variant.mode || frame.width !== variant.width
      || frame.height !== variant.height || bytes.length !== variant.frame_bytes || fileDigest !== variant.sha256) {
    throw new Error("The verified frame differs from the exhibit manifest.");
  }
  return { frame, bytes };
}

async function runExhibit(exhibit) {
  const find = id => exhibit.querySelector(`#${id}`);
  const source = find("explain-photo-source");
  const subject = find("explain-subject");
  const edge = find("explain-resolution");
  const mode = find("explain-mode");
  const status = find("explain-raster-summary");
  const stages = find("explain-verified-stages");
  const download = find("explain-download-frame");
  const formatNumber = number => number.toLocaleString("en");
  const formatBits = byte => byte.toString(2).padStart(8, "0");
  let revision = 0;

  try {
    const response = await fetch("photo-reconstruction/manifest.json");
    if (!response.ok) throw new Error("The exhibit manifest is unavailable.");
    const { version, records, protection } = await response.json();
    if (version !== 1 || !Array.isArray(records) || records.length === 0) {
      throw new Error("The exhibit manifest version is unsupported.");
    }

    for (const record of records) subject.add(new Option(record.subject, record.id));

    async function redraw(resetEdges = false) {
      const request = ++revision;
      const record = records.find(item => item.id === subject.value);
      if (resetEdges) {
        const previousEdge = edge.value || "32";
        const edges = [...new Set(record.variants.map(variant => variant.edge))];
        edge.replaceChildren(...edges.map(value => new Option(String(value), String(value))));
        edge.value = edges.includes(Number(previousEdge)) ? previousEdge : "32";
        source.src = `records/${record.asset}`;
        source.alt = record.alt;
        find("explain-photo-title").textContent = record.title;
        find("explain-photo-credit").textContent = record.credit;
        find("explain-photo-rights").textContent = record.rights;
        find("explain-photo-link").href = record.sources[0].url;
        find("explain-photo-archive").href = `images.html?record=${encodeURIComponent(record.id)}`;
      }
      const chosen = record.variants.find(variant => variant.edge === Number(edge.value) && variant.mode === mode.value);

      status.textContent = "Reading and verifying the selected CAR frame…";
      stages.hidden = true;
      download.href = `photo-reconstruction/${chosen.file}`;
      try {
        const small = ["mono", "gray", "rgb"].map(
          channel => record.variants.find(variant => variant.edge === 16 && variant.mode === channel)
        );
        const selected = small.findIndex(variant => variant.file === chosen.file);
        const examples = await Promise.all(small.map(loadRaster).concat(selected === -1 ? [loadRaster(chosen)] : []));
        if (request !== revision) return;
        const [mono, gray, rgb] = examples.map(example => example.frame);
        const { frame, bytes } = examples[selected === -1 ? 3 : selected];

        drawRaster(find("explain-tiny-raster"), rgb, "Tiny color sampling grid");
        drawRaster(find("explain-mono-raster"), mono, "Monochrome reference");
        drawRaster(find("explain-gray-raster"), gray, "Grayscale reference");
        drawRaster(find("explain-rgb-raster"), rgb, "RGB reference");
        drawRaster(find("explain-photo-raster"), frame, `Reconstructed ${record.subject} ${frame.mode} preview`);
        pairedMarks(find("explain-paired-marks"), mono);

        find("explain-tiny-dimensions").textContent = `${rgb.width} columns × ${rgb.height} rows. Start at the upper left and read across each row.`;
        find("explain-raster-header").textContent = Array.from(bytes.subarray(0, CAR_HEADER_BYTES), value => value.toString(16).padStart(2, "0")).join(" ");
        find("explain-raster-stream").textContent = `${Array.from(frame.payload.subarray(0, 8), formatBits).join(" ")} …`;
        find("explain-raster-digest").textContent = frame.digest;
        status.textContent = `Verified ${record.id} · ${frame.width} × ${frame.height} pixels · ${formatNumber(frame.payload.length)} sample bytes · ${formatNumber(bytes.length)} total bytes`;
        stages.hidden = false;
      } catch (error) {
        if (request === revision) status.textContent = error.message;
      }
    }

    const protectedButton = find("explain-read-protected");
    const protectedStatus = find("explain-protected-status");
    const protectedRaster = find("explain-protected-raster");
    protectedButton.addEventListener("click", async () => {
      protectedButton.disabled = true;
      protectedRaster.hidden = true;
      protectedStatus.textContent = "Reading the protected Earth record…";
      try {
        const response = await fetch(`photo-reconstruction/${protection.file}`);
        if (!response.ok) throw new Error("The protected record is unavailable.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const raw = await decodeIntactProtection(bytes, protection);
        const raster = await decodeRaster(raw);
        drawRaster(protectedRaster, raster, "Earth reconstructed from the intact protected copy");
        protectedRaster.hidden = false;
        protectedStatus.textContent = `Verified ${protection.block_count} intact blocks, reassembled the ${formatNumber(raw.length)}-byte CAR frame, and reconstructed Earth.`;
      } catch (error) {
        protectedStatus.textContent = error.message;
      } finally {
        protectedButton.disabled = false;
      }
    });

    subject.disabled = edge.disabled = mode.disabled = false;
    subject.addEventListener("change", () => redraw(true));
    edge.addEventListener("change", () => redraw());
    mode.addEventListener("change", () => redraw());
    await redraw(true);
  } catch (error) {
    status.textContent = error.message;
  }
}

if (typeof module !== "undefined") module.exports = { decodeIntactProtection, decodeRaster, renderSamples };
if (typeof document !== "undefined") {
  const exhibit = document.getElementById("photo-encoding");
  if (exhibit) runExhibit(exhibit);
}
