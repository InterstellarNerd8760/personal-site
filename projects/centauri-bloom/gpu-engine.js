// WebGPU backend for Bloom. Weights, KV cache and activations stay on the GPU;
// each forward pass is one command buffer and one 32 KB logits read-back.
// Math mirrors createSession() in inference.js.

const STEP_WGSL = 'struct Step { n: u32, p0: u32, a: u32, b: u32 };\n@group(0) @binding(0) var<uniform> step: Step;\n';

function shaders(c) {
  const { W, HD, CTX, SCALE } = c;
  const f = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));
  const consts = `const W: u32 = ${W}u; const HD: u32 = ${HD}u; const SCALE: f32 = ${f(SCALE)};\n`;
  const gelu = `
fn gelu(v: f32) -> f32 {
  let a = abs(v) * 0.7071067811865476;
  let t = 1.0 / (1.0 + 0.3275911 * a);
  let e = 1.0 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a));
  return 0.5 * v * (1.0 + select(-e, e, v >= 0.0));
}
struct MP { N: u32, K4: u32, flags: u32, pad: u32 };
fn finish(v0: f32, n: u32, o: u32) -> f32 {
  var v = v0;
  if ((p.flags & 1u) != 0u) { v += b[n]; }
  if ((p.flags & 2u) != 0u) { v = gelu(v); }
  if ((p.flags & 4u) != 0u) { v += y[o]; }
  return v;
}`;
  return {
    embed: STEP_WGSL + consts + `
@group(0) @binding(1) var<storage, read> ids: array<u32>;
@group(0) @binding(2) var<storage, read> tok: array<f32>;
@group(0) @binding(3) var<storage, read> pos: array<f32>;
@group(0) @binding(4) var<storage, read_write> x: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= step.n * W) { return; }
  let m = i / W; let j = i % W;
  x[i] = tok[ids[m] * W + j] + pos[(step.p0 + m) * W + j];
}`,
    norm: STEP_WGSL + consts + `
struct LP { last: u32, a: u32, b: u32, c: u32 };
@group(0) @binding(1) var<uniform> p: LP;
@group(0) @binding(2) var<storage, read> src: array<f32>;
@group(0) @binding(3) var<storage, read> gw: array<f32>;
@group(0) @binding(4) var<storage, read> gb: array<f32>;
@group(0) @binding(5) var<storage, read_write> dst: array<f32>;
var<workgroup> red: array<f32, 256>;
@compute @workgroup_size(256) fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  var row = wg.x; var orow = wg.x;
  if (p.last == 1u) { row = step.n - 1u; orow = 0u; }
  let base = row * W;
  var s = 0.0;
  for (var i = li; i < W; i += 256u) { s += src[base + i]; }
  red[li] = s;
  workgroupBarrier();
  for (var k = 128u; k > 0u; k >>= 1u) { if (li < k) { red[li] += red[li + k]; } workgroupBarrier(); }
  let mean = red[0] / f32(W);
  workgroupBarrier();
  var q = 0.0;
  for (var i = li; i < W; i += 256u) { let d = src[base + i] - mean; q += d * d; }
  red[li] = q;
  workgroupBarrier();
  for (var k = 128u; k > 0u; k >>= 1u) { if (li < k) { red[li] += red[li + k]; } workgroupBarrier(); }
  let inv = 1.0 / sqrt(red[0] / f32(W) + 1e-5);
  for (var i = li; i < W; i += 256u) { dst[orow * W + i] = (src[base + i] - mean) * inv * gw[i] + gb[i]; }
}`,
    // One token row per workgroup.y; 8 output features per workgroup, 32 lanes each.
    matvec: STEP_WGSL + `
@group(0) @binding(1) var<uniform> p: MP;
@group(0) @binding(2) var<storage, read> x: array<vec4f>;
@group(0) @binding(3) var<storage, read> w: array<vec4f>;
@group(0) @binding(4) var<storage, read> b: array<f32>;
@group(0) @binding(5) var<storage, read_write> y: array<f32>;
${gelu}
var<workgroup> red: array<f32, 256>;
@compute @workgroup_size(256) fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  let g = li / 32u; let lane = li % 32u;
  let n = wg.x * 8u + g; let m = wg.y;
  var s = 0.0;
  if (n < p.N && m < step.n) {
    let xb = m * p.K4; let wb = n * p.K4;
    for (var k = lane; k < p.K4; k += 32u) { s += dot(x[xb + k], w[wb + k]); }
  }
  red[li] = s;
  workgroupBarrier();
  for (var k = 16u; k > 0u; k >>= 1u) { if (lane < k) { red[li] += red[li + k]; } workgroupBarrier(); }
  if (lane == 0u && n < p.N) { let o = m * p.N + n; y[o] = finish(red[li], n, o); }
}`,
    // 32x32 output tiles for multi-token prefill.
    tiled: STEP_WGSL + `
@group(0) @binding(1) var<uniform> p: MP;
@group(0) @binding(2) var<storage, read> x: array<f32>;
@group(0) @binding(3) var<storage, read> w: array<f32>;
@group(0) @binding(4) var<storage, read> b: array<f32>;
@group(0) @binding(5) var<storage, read_write> y: array<f32>;
${gelu}
var<workgroup> As: array<array<f32, 33>, 32>;
var<workgroup> Bs: array<array<f32, 33>, 32>;
@compute @workgroup_size(16, 16) fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let row0 = wg.y * 32u; let col0 = wg.x * 32u;
  let K = p.K4 * 4u;
  let li = lid.y * 16u + lid.x;
  var c00 = 0.0; var c01 = 0.0; var c10 = 0.0; var c11 = 0.0;
  for (var k0 = 0u; k0 < K; k0 += 32u) {
    for (var e = 0u; e < 4u; e++) {
      let idx = li + e * 256u; let r = idx / 32u; let c = idx % 32u; let kk = k0 + c;
      let xr = row0 + r; let wr = col0 + r;
      var av = 0.0; var bv = 0.0;
      if (xr < step.n && kk < K) { av = x[xr * K + kk]; }
      if (wr < p.N && kk < K) { bv = w[wr * K + kk]; }
      As[r][c] = av; Bs[r][c] = bv;
    }
    workgroupBarrier();
    let ar = lid.y * 2u; let bc = lid.x * 2u;
    for (var c = 0u; c < 32u; c++) {
      let a0 = As[ar][c]; let a1 = As[ar + 1u][c]; let b0 = Bs[bc][c]; let b1 = Bs[bc + 1u][c];
      c00 += a0 * b0; c01 += a0 * b1; c10 += a1 * b0; c11 += a1 * b1;
    }
    workgroupBarrier();
  }
  let r0 = row0 + lid.y * 2u; let n0 = col0 + lid.x * 2u;
  if (r0 < step.n && n0 < p.N) { let o = r0 * p.N + n0; y[o] = finish(c00, n0, o); }
  if (r0 < step.n && n0 + 1u < p.N) { let o = r0 * p.N + n0 + 1u; y[o] = finish(c01, n0 + 1u, o); }
  if (r0 + 1u < step.n && n0 < p.N) { let o = (r0 + 1u) * p.N + n0; y[o] = finish(c10, n0, o); }
  if (r0 + 1u < step.n && n0 + 1u < p.N) { let o = (r0 + 1u) * p.N + n0 + 1u; y[o] = finish(c11, n0 + 1u, o); }
}`,
    storekv: STEP_WGSL + consts + `
@group(0) @binding(1) var<storage, read> qkv: array<f32>;
@group(0) @binding(2) var<storage, read_write> kc: array<f32>;
@group(0) @binding(3) var<storage, read_write> vc: array<f32>;
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= step.n * W) { return; }
  let m = i / W; let j = i % W;
  let d = (step.p0 + m) * W + j;
  kc[d] = qkv[m * 3u * W + W + j];
  vc[d] = qkv[m * 3u * W + 2u * W + j];
}`,
    // One workgroup per (head, query token).
    attend: STEP_WGSL + consts + `
@group(0) @binding(1) var<storage, read> qkv: array<f32>;
@group(0) @binding(2) var<storage, read> kc: array<f32>;
@group(0) @binding(3) var<storage, read> vc: array<f32>;
@group(0) @binding(4) var<storage, read_write> att: array<f32>;
var<workgroup> sc: array<f32, ${CTX}>;
var<workgroup> red: array<f32, 64>;
var<workgroup> qs: array<f32, ${HD}>;
@compute @workgroup_size(64) fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
  let h = wg.x; let m = wg.y; let t = step.p0 + m; let hb = h * HD;
  for (var d = li; d < HD; d += 64u) { qs[d] = qkv[m * 3u * W + hb + d]; }
  workgroupBarrier();
  var mx = -3.0e38;
  for (var j = li; j <= t; j += 64u) {
    var s = 0.0;
    let kb = j * W + hb;
    for (var d = 0u; d < HD; d++) { s += qs[d] * kc[kb + d]; }
    s *= SCALE;
    sc[j] = s;
    mx = max(mx, s);
  }
  red[li] = mx;
  workgroupBarrier();
  for (var k = 32u; k > 0u; k >>= 1u) { if (li < k) { red[li] = max(red[li], red[li + k]); } workgroupBarrier(); }
  let gmax = red[0];
  workgroupBarrier();
  var sum = 0.0;
  for (var j = li; j <= t; j += 64u) { let e = exp(sc[j] - gmax); sc[j] = e; sum += e; }
  red[li] = sum;
  workgroupBarrier();
  for (var k = 32u; k > 0u; k >>= 1u) { if (li < k) { red[li] += red[li + k]; } workgroupBarrier(); }
  let inv = 1.0 / red[0];
  for (var d = li; d < HD; d += 64u) {
    var a = 0.0;
    for (var j = 0u; j <= t; j++) { a += sc[j] * vc[j * W + hb + d]; }
    att[m * W + hb + d] = a * inv;
  }
}`
  };
}

function names(l) {
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

export async function createGpuSession(Wt, CFG, { allowFallback = false } = {}) {
  const { width, heads, layers, vocab_size: vocab, context } = CFG;
  const hd = width / heads;
  if (width % 4 || hd % 4) throw Error('Model shape not supported on the GPU');
  if (context > 4096) throw Error('Context too long for the GPU kernels');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw Error('No WebGPU adapter');
  // A software (fallback) adapter is always slower than the WASM CPU path.
  if (!allowFallback && (adapter.isFallbackAdapter || (adapter.info && adapter.info.isFallbackAdapter))) throw Error('Only a software GPU is available');
  const need = Math.max(...Object.values(Wt).map(t => t.byteLength), context * 4 * width * 4);
  if (need > adapter.limits.maxStorageBufferBindingSize) throw Error('Tensor too large for this GPU');
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, Math.max(need, 134217728)),
      maxBufferSize: Math.min(adapter.limits.maxBufferSize, Math.max(need, 268435456))
    }
  });
  let lost = null;
  device.lost.then(info => { lost = info.message || 'GPU device lost'; });

  const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST, CS = GPUBufferUsage.COPY_SRC;
  const buffers = [];
  const make = (bytes, usage) => { const b = device.createBuffer({ size: Math.max(16, Math.ceil(bytes / 16) * 16), usage }); buffers.push(b); return b; };
  const upload = arr => { const b = make(arr.byteLength, S | CD); device.queue.writeBuffer(b, 0, arr.buffer, arr.byteOffset, arr.byteLength); return b; };
  const uniform = u32s => { const b = make(16, GPUBufferUsage.UNIFORM | CD); device.queue.writeBuffer(b, 0, new Uint32Array(u32s)); return b; };

  const T = {};
  const get = n => { if (!Wt[n]) throw Error('Missing tensor ' + n); return T[n] || (T[n] = upload(Wt[n])); };
  const tokB = get('tokens.weight'), posB = get('positions.weight');
  const headB = Wt['head.weight'] ? get('head.weight') : tokB;
  const nwB = get('norm.weight'), nbB = get('norm.bias');
  const LB = Array.from({ length: layers }, (_, l) => {
    const o = {};
    for (const [k, v] of Object.entries(names(l))) o[k] = get(v);
    o.kc = make(context * width * 4, S); o.vc = make(context * width * 4, S);
    return o;
  });
  const hidden = make(context * width * 4, S), ln = make(context * width * 4, S);
  const qkv = make(context * 3 * width * 4, S), att = make(context * width * 4, S);
  const ff = make(context * 4 * width * 4, S), logits = make(vocab * 4, S | CS);
  const idsB = make(context * 4, S | CD), zero = make(Math.max(vocab, 4 * width) * 4, S);
  const stepB = make(16, GPUBufferUsage.UNIFORM | CD);
  const readB = make(vocab * 4, GPUBufferUsage.MAP_READ | CD);

  const code = shaders({ W: width, HD: hd, CTX: context, SCALE: 1 / Math.sqrt(hd) });
  device.pushErrorScope('validation');
  const pipes = {};
  for (const [k, src] of Object.entries(code)) {
    const module = device.createShaderModule({ code: src });
    pipes[k] = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  }
  const bind = (pipe, list) => device.createBindGroup({
    layout: pipes[pipe].getBindGroupLayout(0),
    entries: list.map((buffer, binding) => ({ binding, resource: { buffer } }))
  });
  const normU = uniform([0, 0, 0, 0]), lastU = uniform([1, 0, 0, 0]);
  const mmU = {};
  const mpU = (N, K, flags) => mmU[`${N}/${K}/${flags}`] || (mmU[`${N}/${K}/${flags}`] = uniform([N, K / 4, flags, 0]));
  // A linear layer: both variants share buffers; pick per call by token count.
  const linear = (X, Wb, Bb, Y, N, K, flags) => ({
    N, groups: { matvec: bind('matvec', [stepB, mpU(N, K, flags), X, Wb, Bb, Y]), tiled: bind('tiled', [stepB, mpU(N, K, flags), X, Wb, Bb, Y]) }
  });
  const embedG = bind('embed', [stepB, idsB, tokB, posB, hidden]);
  const plan = LB.map(B => ({
    n1: bind('norm', [stepB, normU, hidden, B.n1w, B.n1b, ln]),
    qkv: linear(ln, B.inW, B.inB, qkv, 3 * width, width, 1),
    store: bind('storekv', [stepB, qkv, B.kc, B.vc]),
    attend: bind('attend', [stepB, qkv, B.kc, B.vc, att]),
    out: linear(att, B.outW, B.outB, hidden, width, width, 1 | 4),
    n2: bind('norm', [stepB, normU, hidden, B.n2w, B.n2b, ln]),
    l1: linear(ln, B.l1W, B.l1B, ff, 4 * width, width, 1 | 2),
    l2: linear(ff, B.l2W, B.l2B, hidden, width, 4 * width, 1 | 4)
  }));
  const finalNorm = bind('norm', [stepB, lastU, hidden, nwB, nbB, ln]);
  const head = linear(ln, headB, zero, logits, vocab, width, 0);

  const cachedIds = new Int32Array(context);
  let cacheLen = 0;
  const out = new Float32Array(vocab);

  async function run(newIds, p0) {
    if (lost) throw Error(lost);
    const n = newIds.length;
    device.queue.writeBuffer(stepB, 0, new Uint32Array([n, p0, 0, 0]));
    device.queue.writeBuffer(idsB, 0, Uint32Array.from(newIds));
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    const go = (pipe, group, x, y = 1) => { pass.setPipeline(pipes[pipe]); pass.setBindGroup(0, group); pass.dispatchWorkgroups(x, y); };
    const lin = (L, rows) => {
      if (rows <= 4) go('matvec', L.groups.matvec, Math.ceil(L.N / 8), rows);
      else go('tiled', L.groups.tiled, Math.ceil(L.N / 32), Math.ceil(rows / 32));
    };
    const flat = Math.ceil(n * width / 64);
    go('embed', embedG, flat);
    for (const P of plan) {
      go('norm', P.n1, n);
      lin(P.qkv, n);
      go('storekv', P.store, flat);
      go('attend', P.attend, heads, n);
      lin(P.out, n);
      go('norm', P.n2, n);
      lin(P.l1, n);
      lin(P.l2, n);
    }
    go('norm', finalNorm, 1);
    lin(head, 1);
    pass.end();
    enc.copyBufferToBuffer(logits, 0, readB, 0, vocab * 4);
    device.queue.submit([enc.finish()]);
    for (let i = 0; i < n; i++) cachedIds[p0 + i] = newIds[i];
    cacheLen = p0 + n;
    await readB.mapAsync(GPUMapMode.READ);
    out.set(new Float32Array(readB.getMappedRange(), 0, vocab));
    readB.unmap();
    return out;
  }

  const setupError = await device.popErrorScope();
  if (setupError) { device.destroy(); throw Error('WebGPU setup failed: ' + setupError.message); }
  // Wait for uploads so the first timed call measures compute, not copies.
  await device.queue.onSubmittedWorkDone();

  return {
    backend: 'webgpu',
    adapter: adapter.info ? `${adapter.info.vendor || ''} ${adapter.info.architecture || ''}`.trim() : '',
    async forward(ids) {
      if (!ids.length) throw Error('Empty token window');
      if (ids.length > context) throw Error('Token window exceeds context');
      const lim = Math.min(cacheLen, ids.length - 1);
      let p = 0;
      while (p < lim && ids[p] === cachedIds[p]) p++;
      cacheLen = p;
      return run(ids.slice(p), p);
    },
    reset() { cacheLen = 0; },
    get cacheLen() { return cacheLen; },
    dispose() { for (const b of buffers) b.destroy(); device.destroy(); }
  };
}
