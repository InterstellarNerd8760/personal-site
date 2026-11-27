// Checks the WebAssembly engine against the original JavaScript engine on a
// small random Bloom-shaped model: logits, greedy tokens, prefix reuse, sampler.
// Usage: node tools/test-bloom-engine.mjs
import assert from 'node:assert/strict';
import { createSession, sampleToken } from '../projects/centauri-bloom/inference.js';
import { createWasmSession, wasmSupported, maxRelDiff, sampleTokenFast } from '../projects/centauri-bloom/fast-engine.js';

let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const cfg = { vocab_size: 512, context: 48, width: 64, heads: 4, layers: 3 };
const { vocab_size: V, context: T, width: D, layers: L } = cfg;
const t = (n, s = 0.08) => Float32Array.from({ length: n }, () => (rnd() - 0.5) * 2 * s);
const W = { 'tokens.weight': t(V * D, 0.5), 'positions.weight': t(T * D, 0.2), 'norm.weight': t(D, 1).map(x => 1 + x), 'norm.bias': t(D, 0.1) };
for (let l = 0; l < L; l++) {
  const p = `blocks.layers.${l}.`;
  Object.assign(W, {
    [p + 'self_attn.in_proj_weight']: t(3 * D * D), [p + 'self_attn.in_proj_bias']: t(3 * D, 0.02),
    [p + 'self_attn.out_proj.weight']: t(D * D), [p + 'self_attn.out_proj.bias']: t(D, 0.02),
    [p + 'linear1.weight']: t(4 * D * D), [p + 'linear1.bias']: t(4 * D, 0.02),
    [p + 'linear2.weight']: t(4 * D * D), [p + 'linear2.bias']: t(D, 0.02),
    [p + 'norm1.weight']: t(D, 0.2).map(x => 1 + x), [p + 'norm1.bias']: t(D, 0.05),
    [p + 'norm2.weight']: t(D, 0.2).map(x => 1 + x), [p + 'norm2.bias']: t(D, 0.05)
  });
}
assert.ok(wasmSupported(), 'WebAssembly SIMD should be available');
const ref = createSession(W, cfg), fast = createWasmSession(W, cfg);
const argmax = a => a.reduce((b, x, i) => (x > a[b] ? i : b), 0);
const prompt = [5, 17, 300, 42, 7, 99, 1];
let a = prompt.slice(), b = prompt.slice(), worst = 0;
for (let i = 0; i < T - prompt.length; i++) {
  const la = Float32Array.from(ref.forward(a)), lb = fast.forward(b);
  worst = Math.max(worst, maxRelDiff(la, lb));
  a.push(argmax(la)); b.push(argmax(lb));
}
assert.ok(worst < 1e-4, 'logits differ by ' + worst);
assert.deepEqual(b, a, 'greedy tokens differ');
// Prefix reuse must give the same logits as a fresh prefill.
const ext = a.slice(0, 20).concat([3, 4, 5]);
const reused = Float32Array.from(fast.forward(ext));
fast.reset();
assert.equal(maxRelDiff(reused, fast.forward(ext)), 0, 'prefix reuse changed logits');
// The fast sampler picks the same token as the original for the same random stream.
const logits = Float32Array.from(ref.forward(a.slice(0, 30)));
for (let k = 1; k <= 200; k++) {
  const keep = Math.random;
  let s = k; Math.random = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  const x = sampleToken(logits, 0.8, 40);
  s = k; const y = sampleTokenFast(logits, 0.8, 40);
  Math.random = keep;
  assert.equal(y, x, 'sampler mismatch');
}
console.log('ok: wasm matches js (max rel logit diff ' + worst.toExponential(2) + '), prefix reuse exact, sampler identical');
