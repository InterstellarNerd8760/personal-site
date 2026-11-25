const root = document.querySelector('#bloom-playground');
const HF_BASE = 'https://huggingface.co/Centauri-Bloom/Bloom-Text-0.1/resolve/main';
const BASELINE_URL = 'https://raw.githubusercontent.com/InterstellarNerd8760/centauri-bloom/main/experiments/baseline-001/model.safetensors';
const BASELINE_SHA = 'f44d8fa110384e32eb917cd6e102924e8af5a006fa4f8d32f9c47314d8f84027';
const BASELINE_CFG = { vocab_size: 256, context: 32, width: 64, heads: 4, layers: 2 };

const status = root.querySelector('[role=status]');
const metaEl = root.querySelector('[data-bloom-meta]');
const modelSelect = root.querySelector('[data-bloom-model]');
const go = root.querySelector('button');
const outEl = root.querySelector('pre');

let W = null;
let CFG = BASELINE_CFG;
let BPE = null;
let abortLoad = null;

function buildByteTables() {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }
  const b2u = new Array(256);
  const u2b = new Map();
  for (let i = 0; i < 256; i++) {
    const ch = String.fromCharCode(cs[i]);
    b2u[bs[i]] = ch;
    u2b.set(ch, bs[i]);
  }
  return { b2u, u2b };
}

const { b2u: BYTE_TO_UNI, u2b: UNI_TO_BYTE } = buildByteTables();
const GPT2_PAT = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
const utf8Enc = new TextEncoder();
const utf8Dec = new TextDecoder('utf-8', { fatal: false });

function createBPE(tokJson) {
  const vocab = tokJson.model.vocab;
  const idToToken = new Array(Object.keys(vocab).length);
  for (const [tok, id] of Object.entries(vocab)) idToToken[id] = tok;
  const ranks = new Map();
  const merges = tokJson.model.merges || [];
  for (let i = 0; i < merges.length; i++) {
    const m = merges[i];
    const key = Array.isArray(m) ? `${m[0]}\u0000${m[1]}` : m.replace(' ', '\u0000');
    ranks.set(key, i);
  }
  const specials = new Set((tokJson.added_tokens || []).filter(t => t.special).map(t => t.id));
  const eotId = vocab['<|endoftext|>'] ?? 0;
  const unkId = vocab['<|unk|>'] ?? 0;
  const cache = new Map();

  function bpeWord(token) {
    if (cache.has(token)) return cache.get(token);
    let word = Array.from(token);
    if (word.length <= 1) {
      cache.set(token, word);
      return word;
    }
    while (word.length > 1) {
      let bestRank = Infinity;
      let bestIdx = -1;
      for (let i = 0; i < word.length - 1; i++) {
        const r = ranks.get(`${word[i]}\u0000${word[i + 1]}`);
        if (r !== undefined && r < bestRank) {
          bestRank = r;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      const merged = word[bestIdx] + word[bestIdx + 1];
      const next = [];
      for (let i = 0; i < word.length; i++) {
        if (i === bestIdx) {
          next.push(merged);
          i++;
        } else {
          next.push(word[i]);
        }
      }
      word = next;
    }
    cache.set(token, word);
    return word;
  }

  return {
    eotId,
    encode(text) {
      const ids = [];
      const matches = text.match(GPT2_PAT) || [];
      for (const piece of matches) {
        const bytes = utf8Enc.encode(piece);
        let mapped = '';
        for (let i = 0; i < bytes.length; i++) mapped += BYTE_TO_UNI[bytes[i]];
        for (const sub of bpeWord(mapped)) {
          ids.push(vocab[sub] ?? unkId);
        }
      }
      return ids;
    },
    decode(ids) {
      const bytes = [];
      for (const id of ids) {
        if (specials.has(id)) continue;
        const tok = idToToken[id];
        if (!tok) continue;
        for (const ch of tok) {
          const b = UNI_TO_BYTE.get(ch);
          if (b !== undefined) bytes.push(b);
        }
      }
      return utf8Dec.decode(Uint8Array.from(bytes));
    },
  };
}

function parseSafetensors(buf) {
  const dv = new DataView(buf);
  const n = Number(dv.getBigUint64(0, true));
  const h = JSON.parse(utf8Dec.decode(new Uint8Array(buf, 8, n)));
  const tensors = {};
  for (const [k, v] of Object.entries(h)) {
    if (k === '__metadata__') continue;
    tensors[k] = new Float32Array(buf.slice(8 + n + v.data_offsets[0], 8 + n + v.data_offsets[1]));
  }
  return tensors;
}

function linear(x, w, b, outDim) {
  const inDim = x.length;
  const y = new Float32Array(outDim);
  for (let i = 0; i < outDim; i++) {
    let s = b ? b[i] : 0;
    const row = i * inDim;
    for (let j = 0; j < inDim; j++) s += x[j] * w[row + j];
    y[i] = s;
  }
  return y;
}

function layerNorm(x, p, width) {
  let sum = 0;
  for (let i = 0; i < width; i++) sum += x[i];
  const m = sum / width;
  let sq = 0;
  for (let i = 0; i < width; i++) {
    const d = x[i] - m;
    sq += d * d;
  }
  const inv = 1 / Math.sqrt(sq / width + 1e-5);
  const w = W[p + '.weight'];
  const b = W[p + '.bias'];
  const y = new Float32Array(width);
  for (let i = 0; i < width; i++) y[i] = (x[i] - m) * inv * w[i] + b[i];
  return y;
}

function geluInPlace(x) {
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const a = Math.abs(v) * Math.SQRT1_2;
    const t = 1 / (1 + 0.3275911 * a);
    const e = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
    x[i] = 0.5 * v * (1 + (v >= 0 ? e : -e));
  }
  return x;
}

function addInto(a, b) {
  const y = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) y[i] = a[i] + b[i];
  return y;
}

function logits(ids) {
  const { width, heads, layers, vocab_size } = CFG;
  const headDim = width / heads;
  const scale = 1 / Math.sqrt(headDim);
  const ffDim = 4 * width;
  const tokW = W['tokens.weight'];
  const posW = W['positions.weight'];

  let x = ids.map((id, pos) => {
    const v = new Float32Array(width);
    const tOff = id * width;
    const pOff = pos * width;
    for (let j = 0; j < width; j++) v[j] = tokW[tOff + j] + posW[pOff + j];
    return v;
  });

  for (let l = 0; l < layers; l++) {
    const p = `blocks.layers.${l}.`;
    const inW = W[p + 'self_attn.in_proj_weight'];
    const inB = W[p + 'self_attn.in_proj_bias'];
    const outW = W[p + 'self_attn.out_proj.weight'];
    const outB = W[p + 'self_attn.out_proj.bias'];
    const qkv = x.map(a => linear(layerNorm(a, p + 'norm1', width), inW, inB, 3 * width));

    x = x.map((a, i) => {
      const z = new Float32Array(width);
      for (let h = 0; h < heads; h++) {
        const hOff = h * headDim;
        const scores = new Float32Array(i + 1);
        let maxS = -Infinity;
        for (let j = 0; j <= i; j++) {
          let s = 0;
          for (let k = 0; k < headDim; k++) s += qkv[i][hOff + k] * qkv[j][width + hOff + k];
          s *= scale;
          scores[j] = s;
          if (s > maxS) maxS = s;
        }
        let sumExp = 0;
        for (let j = 0; j <= i; j++) {
          scores[j] = Math.exp(scores[j] - maxS);
          sumExp += scores[j];
        }
        for (let j = 0; j <= i; j++) {
          const w = scores[j] / sumExp;
          const vBase = 2 * width + hOff;
          for (let k = 0; k < headDim; k++) z[hOff + k] += w * qkv[j][vBase + k];
        }
      }
      return addInto(a, linear(z, outW, outB, width));
    });

    const l1W = W[p + 'linear1.weight'];
    const l1B = W[p + 'linear1.bias'];
    const l2W = W[p + 'linear2.weight'];
    const l2B = W[p + 'linear2.bias'];
    x = x.map(a => addInto(a, linear(geluInPlace(linear(layerNorm(a, p + 'norm2', width), l1W, l1B, ffDim)), l2W, l2B, width)));
  }

  return linear(layerNorm(x[x.length - 1], 'norm', width), W['head.weight'] || tokW, null, vocab_size);
}

async function sha256Hex(buf) {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}

async function loadHuggingFace(signal) {
  status.textContent = 'Loading latest Bloom-Text-0.1 from Hugging Face…';
  if (metaEl) metaEl.textContent = '';
  const [cfgRes, tokRes, wRes, metRes] = await Promise.all([
    fetch(`${HF_BASE}/config.json`, { signal }),
    fetch(`${HF_BASE}/tokenizer.json`, { signal }),
    fetch(`${HF_BASE}/model.safetensors`, { signal }),
    fetch(`${HF_BASE}/metrics.json`, { signal }).catch(() => null),
  ]);
  if (!cfgRes.ok || !wRes.ok) throw Error('Hugging Face model files unavailable');
  const cfg = await cfgRes.json();
  const tokJson = tokRes.ok ? await tokRes.json() : null;
  const buf = await wRes.arrayBuffer();
  const metrics = metRes && metRes.ok ? await metRes.json() : null;
  const commit = wRes.headers.get('x-repo-commit') || cfgRes.headers.get('x-repo-commit');

  W = parseSafetensors(buf);
  CFG = cfg;
  BPE = tokJson ? createBPE(tokJson) : null;
  const sha = await sha256Hex(buf);
  status.textContent = `Loaded Bloom-Text-0.1 (${(cfg.vocab_size === 256 ? 'byte' : 'BPE')} · ${(buf.byteLength / 1048576).toFixed(1)} MB). Ready to generate.`;
  if (metaEl) {
    const parts = [];
    if (metrics?.parameters) parts.push(`${metrics.parameters.toLocaleString()} params`);
    if (metrics?.step) parts.push(`step ${metrics.step.toLocaleString()}`);
    if (metrics?.val_loss !== undefined) parts.push(`val loss ${metrics.val_loss}`);
    if (commit) parts.push(`HF ${commit.slice(0, 8)}`);
    else parts.push(`sha256 ${sha.slice(0, 12)}`);
    metaEl.textContent = parts.join(' · ');
  }
  go.textContent = BPE ? 'Generate 48 tokens' : 'Generate 64 bytes';
  go.disabled = false;
}

async function loadBaseline(signal) {
  status.textContent = 'Loading verified 118.5K baseline-001 weights…';
  if (metaEl) metaEl.textContent = '';
  const res = await fetch(BASELINE_URL, { signal });
  if (!res.ok) throw Error('Baseline weights unavailable');
  const buf = await res.arrayBuffer();
  const sha = await sha256Hex(buf);
  if (sha !== BASELINE_SHA) throw Error('Not the verified baseline checkpoint');
  W = parseSafetensors(buf);
  CFG = BASELINE_CFG;
  BPE = null;
  status.textContent = 'Verified baseline-001 loaded (118.5K byte-level). Ready to generate.';
  if (metaEl) metaEl.textContent = `118,528 params · 100 CPU steps · sha256 ${sha.slice(0, 12)}`;
  go.textContent = 'Generate 64 bytes';
  go.disabled = false;
}

async function selectSource(kind) {
  if (abortLoad) abortLoad.abort();
  abortLoad = new AbortController();
  go.disabled = true;
  try {
    if (kind === 'hf') {
      await loadHuggingFace(abortLoad.signal);
    } else {
      await loadBaseline(abortLoad.signal);
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (kind === 'hf') {
      if (modelSelect) modelSelect.value = 'baseline';
      try {
        await loadBaseline(abortLoad.signal);
        status.textContent = 'HF Bloom-Text-0.1 not published yet; fell back to verified baseline-001.';
      } catch {
        status.textContent = 'Automatic weights unavailable. Select a local model.safetensors file below.';
      }
    } else {
      status.textContent = err.message;
    }
  }
}

if (modelSelect) {
  modelSelect.addEventListener('change', () => selectSource(modelSelect.value));
}

root.querySelector('input[type=file]').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const sha = await sha256Hex(buf);
    W = parseSafetensors(buf);
    const tokRows = Math.round(W['tokens.weight'].length / (W['norm.weight']?.length || 64));
    const width = W['norm.weight'].length;
    const context = Math.round(W['positions.weight'].length / width);
    let layers = 0;
    while (W[`blocks.layers.${layers}.norm1.weight`]) layers++;
    CFG = { vocab_size: tokRows, context, width, heads: width === 384 ? 6 : 4, layers };
    if (tokRows === 256) BPE = null;
    status.textContent = `Local checkpoint loaded (${width}w · ${layers}L · vocab ${tokRows}).`;
    if (metaEl) metaEl.textContent = `sha256 ${sha.slice(0, 12)}`;
    go.textContent = BPE ? 'Generate 48 tokens' : 'Generate 64 bytes';
    go.disabled = false;
  } catch (err) {
    status.textContent = err.message;
  }
});

function sampleToken(logitsArr, temp, topK) {
  const n = logitsArr.length;
  let indices = null;
  if (topK && topK < n) {
    indices = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => logitsArr[b] - logitsArr[a])
      .slice(0, topK);
  }
  const cand = indices || Array.from({ length: n }, (_, i) => i);
  let maxL = -Infinity;
  for (const idx of cand) if (logitsArr[idx] > maxL) maxL = logitsArr[idx];
  let sum = 0;
  const probs = cand.map(idx => {
    const p = Math.exp((logitsArr[idx] - maxL) / temp);
    sum += p;
    return p;
  });
  let r = Math.random() * sum;
  for (let i = 0; i < cand.length; i++) {
    r -= probs[i];
    if (r <= 0) return cand[i];
  }
  return cand[cand.length - 1];
}

go.addEventListener('click', async () => {
  go.disabled = true;
  try {
    const prompt = root.querySelector('textarea').value || ' ';
    const temp = Number(root.querySelector('select[data-bloom-temp]')?.value || root.querySelectorAll('select')[1]?.value || 0.8);
    if (BPE) {
      let ids = BPE.encode(prompt);
      if (!ids.length) ids = [BPE.eotId];
      const gen = [];
      outEl.textContent = '';
      for (let i = 0; i < 48; i++) {
        const a = logits(ids.slice(-CFG.context));
        const nxt = sampleToken(a, temp, 40);
        if (nxt === BPE.eotId) break;
        ids.push(nxt);
        gen.push(nxt);
        outEl.textContent = BPE.decode(gen);
        await new Promise(r => setTimeout(r, 0));
      }
    } else {
      const ids = Array.from(utf8Enc.encode(prompt));
      const out = [];
      outEl.textContent = '';
      for (let i = 0; i < 64; i++) {
        const a = logits(ids.slice(-CFG.context));
        const nxt = sampleToken(a, temp, 0);
        ids.push(nxt);
        out.push(nxt);
        outEl.textContent = utf8Dec.decode(Uint8Array.from(out));
        await new Promise(r => setTimeout(r, 0));
      }
    }
  } catch (err) {
    status.textContent = err.message;
  } finally {
    go.disabled = false;
  }
});

selectSource(modelSelect ? modelSelect.value : 'hf');
