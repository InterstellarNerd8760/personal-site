// Fast Bloom inference backends. Same math as createSession() in inference.js
// (pre-norm GPT, learned positions, tanh-free erf GELU), three ways to run it:
//   webgpu – compute shaders on the GPU (weights live in GPU buffers)
//   wasm   – WebAssembly SIMD matmul/attention kernels on the CPU
//   js     – the original pure JavaScript engine (last-resort fallback)
// Every backend reuses the KV cache for the longest common token prefix, so a
// follow-up prompt only pays for its new tokens.
import { createSession } from './inference.js?v=11';
import { KERNELS_WASM_BASE64 } from './bloom-kernels.wasm.js?v=1';
import { createGpuSession } from './gpu-engine.js?v=1';

const LN_EPS = 1e-5;

function decodeBase64(b64) {
  if (typeof atob === 'function') {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

let kernelModule = null;
function wasmSupported() {
  try {
    if (typeof WebAssembly !== 'object') return false;
    if (!kernelModule) kernelModule = new WebAssembly.Module(decodeBase64(KERNELS_WASM_BASE64));
    return true;
  } catch { return false; }
}

function layerNormRow(buf, src, width, w, b, dst) {
  let sum = 0;
  for (let i = 0; i < width; i++) sum += buf[src + i];
  const m = sum / width;
  let sq = 0;
  for (let i = 0; i < width; i++) { const d = buf[src + i] - m; sq += d * d; }
  const inv = 1 / Math.sqrt(sq / width + LN_EPS);
  for (let i = 0; i < width; i++) buf[dst + i] = (buf[src + i] - m) * inv * buf[w + i] + buf[b + i];
}

function geluRange(buf, start, len) {
  for (let i = start, end = start + len; i < end; i++) {
    const v = buf[i];
    const a = Math.abs(v) * Math.SQRT1_2;
    const t = 1 / (1 + 0.3275911 * a);
    const e = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
    buf[i] = 0.5 * v * (1 + (v >= 0 ? e : -e));
  }
}

function layerNames(l) {
  const p = `blocks.layers.${l}.`;
  return {
    inW: p + 'self_attn.in_proj_weight', inB: p + 'self_attn.in_proj_bias',
    outW: p + 'self_attn.out_proj.weight', outB: p + 'self_attn.out_proj.bias',
    l1W: p + 'linear1.weight', l1B: p + 'linear1.bias',
    l2W: p + 'linear2.weight', l2B: p + 'linear2.bias',
    n1w: p + 'norm1.weight', n1b: p + 'norm1.bias',
    n2w: p + 'norm2.weight', n2b: p + 'norm2.bias'
  };
}

// Longest prefix of ids already in the cache, leaving at least one token to run.
function reusablePrefix(ids, cachedIds, cacheLen) {
  const lim = Math.min(cacheLen, ids.length - 1);
  let p = 0;
  while (p < lim && ids[p] === cachedIds[p]) p++;
  return p;
}

function createWasmSession(W, CFG) {
  const { width, heads, layers, vocab_size: vocab, context } = CFG;
  const hd = width / heads;
  const ffDim = 4 * width;
  if (width % 4 || hd % 4 || vocab % 4) throw Error('Model shape not supported by the WASM kernels');
  const scale = 1 / Math.sqrt(hd);

  // Byte layout of linear memory. Offset 0 stays unused so 0 can mean "no bias".
  let top = 16;
  const alloc = floats => { const at = top; top += Math.ceil(floats * 4 / 16) * 16; return at; };
  const place = {};
  const names = ['tokens.weight', 'positions.weight', 'norm.weight', 'norm.bias'];
  if (W['head.weight']) names.push('head.weight');
  for (let l = 0; l < layers; l++) names.push(...Object.values(layerNames(l)));
  for (const n of names) {
    if (!W[n]) throw Error('Missing tensor ' + n);
    place[n] = alloc(W[n].length);
  }
  const kC = [], vC = [];
  for (let l = 0; l < layers; l++) { kC.push(alloc(context * width)); vC.push(alloc(context * width)); }
  const hidden = alloc(context * width), ln = alloc(context * width), qkv = alloc(context * 3 * width);
  const att = alloc(context * width), ff = alloc(context * ffDim), sc = alloc(heads * context);
  const logits = alloc(vocab);
  const pages = Math.ceil(top / 65536) + 1;
  const memory = new WebAssembly.Memory({ initial: pages, maximum: pages });
  const inst = new WebAssembly.Instance(kernelModule, { env: { mem: memory } });
  const { matmul, scores, wsum } = inst.exports;
  const F = new Float32Array(memory.buffer);
  for (const n of names) F.set(W[n], place[n] >> 2);

  const f = ptr => ptr >> 2;
  const tok = f(place['tokens.weight']), pos = f(place['positions.weight']);
  const headW = place['head.weight'] || place['tokens.weight'];
  const L = Array.from({ length: layers }, (_, l) => {
    const n = layerNames(l), o = {};
    for (const [k, v] of Object.entries(n)) o[k] = place[v];
    return o;
  });
  const cachedIds = new Int32Array(context);
  let cacheLen = 0;

  function softmaxHeads(t) {
    for (let h = 0; h < heads; h++) {
      const base = f(sc) + h * context;
      let mx = -Infinity;
      for (let j = 0; j <= t; j++) if (F[base + j] > mx) mx = F[base + j];
      let sum = 0;
      for (let j = 0; j <= t; j++) { const e = Math.exp(F[base + j] - mx); F[base + j] = e; sum += e; }
      const inv = 1 / sum;
      for (let j = 0; j <= t; j++) F[base + j] *= inv;
    }
  }

  function run(newIds, p0) {
    const n = newIds.length;
    for (let i = 0; i < n; i++) {
      cachedIds[p0 + i] = newIds[i];
      const d = f(hidden) + i * width, a = tok + newIds[i] * width, b = pos + (p0 + i) * width;
      for (let j = 0; j < width; j++) F[d + j] = F[a + j] + F[b + j];
    }
    for (let l = 0; l < layers; l++) {
      const B = L[l];
      for (let i = 0; i < n; i++) layerNormRow(F, f(hidden) + i * width, width, f(B.n1w), f(B.n1b), f(ln) + i * width);
      matmul(ln, B.inW, B.inB, qkv, n, 3 * width, width, 0);
      for (let i = 0; i < n; i++) {
        const row = f(qkv) + i * 3 * width, dst = (p0 + i) * width;
        F.copyWithin(f(kC[l]) + dst, row + width, row + 2 * width);
        F.copyWithin(f(vC[l]) + dst, row + 2 * width, row + 3 * width);
      }
      for (let i = 0; i < n; i++) {
        const t = p0 + i;
        scores(qkv + i * 12 * width, kC[l], sc, t, heads, hd, width, context, scale);
        softmaxHeads(t);
        wsum(sc, vC[l], att + i * 4 * width, t, heads, hd, width, context);
      }
      matmul(att, B.outW, B.outB, hidden, n, width, width, 1);
      for (let i = 0; i < n; i++) layerNormRow(F, f(hidden) + i * width, width, f(B.n2w), f(B.n2b), f(ln) + i * width);
      matmul(ln, B.l1W, B.l1B, ff, n, ffDim, width, 0);
      geluRange(F, f(ff), n * ffDim);
      matmul(ff, B.l2W, B.l2B, hidden, n, width, ffDim, 1);
    }
    cacheLen = p0 + n;
    layerNormRow(F, f(hidden) + (n - 1) * width, width, f(place['norm.weight']), f(place['norm.bias']), f(ln));
    matmul(ln, headW, 0, logits, 1, vocab, width, 0);
    return F.subarray(f(logits), f(logits) + vocab);
  }

  return {
    backend: 'wasm',
    forward(ids) {
      if (!ids.length) throw Error('Empty token window');
      if (ids.length > context) throw Error('Token window exceeds context');
      const p = reusablePrefix(ids, cachedIds, cacheLen);
      return run(ids.slice(p), p);
    },
    reset() { cacheLen = 0; },
    get cacheLen() { return cacheLen; },
    dispose() {}
  };
}

function createJsSession(W, CFG) {
  const s = createSession(W, CFG);
  return { backend: 'js', forward: ids => s.forward(ids), reset: () => s.reset(), get cacheLen() { return s.cacheLen; }, dispose() {} };
}

function maxRelDiff(a, b) {
  let scale = 0, diff = 0;
  for (let i = 0; i < a.length; i++) { scale = Math.max(scale, Math.abs(a[i])); diff = Math.max(diff, Math.abs(a[i] - b[i])); }
  return diff / Math.max(scale, 1e-6);
}

function argmax(a) { let b = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[b]) b = i; return b; }

// Greedy-decodes a few tokens to time a backend and record its logits.
async function probe(session, ids, steps) {
  session.reset();
  const seq = ids.slice();
  let lg = Float32Array.from(await session.forward(seq));
  const first = lg;
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) { seq.push(argmax(lg)); lg = Float32Array.from(await session.forward(seq)); }
  const ms = (performance.now() - t0) / steps;
  session.reset();
  return { first, ms, seq };
}

// Returns an async-forward session. opts.backend: 'auto' | 'webgpu' | 'wasm' | 'js'.
export async function createFastSession(W, CFG, opts = {}) {
  const want = opts.backend || 'auto';
  const log = opts.log || (() => {});
  const wrap = s => ({ ...s, backend: s.backend, forward: async ids => s.forward(ids), reset: () => s.reset(), dispose: () => s.dispose() });
  const t0 = performance.now();
  let cpu = null;
  if (want !== 'js' && wasmSupported()) {
    try { cpu = createWasmSession(W, CFG); } catch (err) { log('wasm unavailable: ' + err.message); }
  }
  if (!cpu) cpu = createJsSession(W, CFG);
  const cpuMs = Math.round(performance.now() - t0);
  if (want === 'wasm' || want === 'js' || CFG.vocab_size <= 256) {
    // Byte-level toys are too small for the GPU to help.
    return { session: wrap(cpu), info: { backend: cpu.backend } };
  }
  const hasGpu = typeof navigator !== 'undefined' && navigator.gpu;
  if (!hasGpu) return { session: wrap(cpu), info: { backend: cpu.backend, gpu: 'unavailable' } };
  let gpu = null;
  try {
    gpu = await createGpuSession(W, CFG, { allowFallback: want === 'webgpu' });
  } catch (err) {
    log('webgpu unavailable: ' + err.message);
    return { session: wrap(cpu), info: { backend: cpu.backend, gpu: 'failed: ' + err.message, setupMs: { cpu: cpuMs, gpu: Math.round(performance.now() - t0) } } };
  }
  try {
    const probeIds = Array.from({ length: Math.min(24, CFG.context - 8) }, (_, i) => (i * 37 + 11) % CFG.vocab_size);
    const gpuReadyMs = Math.round(performance.now() - t0);
    const g = await probe(gpu, probeIds, 4);
    const c = await probe(wrap(cpu), probeIds, 4);
    const diff = maxRelDiff(g.first, c.first);
    const info = { gpuTokenMs: +g.ms.toFixed(2), cpuTokenMs: +c.ms.toFixed(2), cpuBackend: cpu.backend, diff, setupMs: { cpu: cpuMs, gpu: gpuReadyMs, probe: Math.round(performance.now() - t0) } };
    if (!(diff < 2e-3)) {
      gpu.dispose();
      return { session: wrap(cpu), info: { backend: cpu.backend, gpu: 'mismatch', ...info } };
    }
    if (want !== 'webgpu' && g.ms > c.ms) {
      gpu.dispose();
      return { session: wrap(cpu), info: { backend: cpu.backend, gpu: 'slower', ...info } };
    }
    cpu.dispose();
    return { session: gpu, info: { backend: 'webgpu', ...info } };
  } catch (err) {
    try { gpu.dispose(); } catch {}
    return { session: wrap(cpu), info: { backend: cpu.backend, gpu: 'failed: ' + err.message } };
  }
}

// Same result as sampleToken() in inference.js for the same Math.random()
// stream, without sorting the whole vocabulary every token.
export function sampleTokenFast(logits, temp, topK) {
  const n = logits.length;
  if (!topK || topK >= n) {
    let mx = -Infinity;
    for (let i = 0; i < n; i++) if (logits[i] > mx) mx = logits[i];
    let sum = 0;
    const p = new Float64Array(n);
    for (let i = 0; i < n; i++) { p[i] = Math.exp((logits[i] - mx) / temp); sum += p[i]; }
    let r = Math.random() * sum;
    for (let i = 0; i < n; i++) { r -= p[i]; if (r <= 0) return i; }
    return n - 1;
  }
  // Top-k in descending order; equal logits keep ascending index (stable sort order).
  const idx = new Int32Array(topK), val = new Float64Array(topK);
  let size = 0;
  for (let i = 0; i < n; i++) {
    const v = logits[i];
    if (size === topK && !(v > val[size - 1])) continue;
    let j = size < topK ? size++ : size - 1;
    while (j > 0 && val[j - 1] < v) { val[j] = val[j - 1]; idx[j] = idx[j - 1]; j--; }
    val[j] = v; idx[j] = i;
  }
  const mx = val[0];
  let sum = 0;
  const p = new Array(size);
  for (let i = 0; i < size; i++) { p[i] = Math.exp((val[i] - mx) / temp); sum += p[i]; }
  let r = Math.random() * sum;
  for (let i = 0; i < size; i++) { r -= p[i]; if (r <= 0) return idx[i]; }
  return idx[size - 1];
}

export { createWasmSession, createJsSession, wasmSupported, maxRelDiff };
