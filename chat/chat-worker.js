// Bloom chat inference worker. Reuses the playground's KV-cache inference
// engine; adds download progress, a browser model cache and multi-turn prompts.
import {
  parseSafetensors,
  createSession,
  createBPE,
  sha256Hex,
  sampleToken,
  loadedParams,
  architectureParams,
  headsForWidth,
  utf8Enc,
  utf8Dec
} from '/projects/centauri-bloom/inference.js?v=11';

const CACHE_NAME = 'bloom-chat-models-v1';
let session = null;
let BPE = null;
let CFG = null;
let cancelled = false;
let running = false;
let hidden = false;
let abortLoad = null;

const post = msg => postMessage(msg);

function inferCfg(weights) {
  const width = weights['norm.weight'].length;
  const vocab = Math.round(weights['tokens.weight'].length / width);
  const context = Math.round(weights['positions.weight'].length / width);
  let layers = 0;
  while (weights[`blocks.layers.${layers}.norm1.weight`]) layers++;
  return { vocab_size: vocab, context, width, heads: headsForWidth(width), layers };
}

async function openCache() {
  try { return 'caches' in self ? await caches.open(CACHE_NAME) : null; } catch { return null; }
}

// Downloads with byte progress. Immutable URLs (pinned to a commit) are kept
// in Cache Storage so a second visit does not download the weights again.
async function download(url, { signal, requestId, label, cacheable }) {
  const cache = cacheable ? await openCache() : null;
  if (cache) {
    const hit = await cache.match(url).catch(() => null);
    if (hit) {
      post({ type: 'progress-load', requestId, phase: 'cache', label });
      return { buf: await hit.arrayBuffer(), cached: true };
    }
  }
  const res = await fetch(url, { signal });
  if (!res.ok) throw Error('Model files unavailable (' + res.status + ')');
  const total = Number(res.headers.get('content-length')) || 0;
  let buf;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0, lastPost = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.byteLength;
      const now = performance.now();
      if (now - lastPost > 120) {
        lastPost = now;
        post({ type: 'progress-load', requestId, phase: 'download', label, loaded: got, total });
      }
    }
    const out = new Uint8Array(got);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.byteLength; }
    buf = out.buffer;
  } else {
    buf = await res.arrayBuffer();
  }
  if (cache) {
    try {
      await cache.put(url, new Response(buf.slice(0), { headers: { 'content-type': 'application/octet-stream' } }));
    } catch { /* Storage full or unavailable: keep going without caching. */ }
  }
  return { buf, cached: false };
}

async function load(msg, signal) {
  const { requestId, label } = msg;
  post({ type: 'progress-load', requestId, phase: 'start', label });
  const tokenizer = msg.tokenizerUrl
    ? await (await fetch(msg.tokenizerUrl, { signal })).json()
    : null;
  const { buf, cached } = await download(msg.weightsUrl, { signal, requestId, label, cacheable: !!msg.cacheable });
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  post({ type: 'progress-load', requestId, phase: 'install', label });
  if (msg.expectedSha) {
    const sha = await sha256Hex(buf);
    if (sha !== msg.expectedSha) throw Error('Checkpoint hash mismatch');
  }
  const weights = parseSafetensors(buf);
  const cfg = msg.cfg || inferCfg(weights);
  BPE = tokenizer && tokenizer.model && tokenizer.model.vocab ? createBPE(tokenizer) : null;
  const actual = loadedParams(weights);
  const expected = architectureParams(cfg);
  if (expected !== null && actual !== expected) throw Error('Checkpoint does not match its configuration');
  CFG = cfg;
  session = createSession(weights, CFG);
  return { params: actual, bytes: buf.byteLength, bpe: !!BPE, cfg: CFG, cached };
}

async function generate(msg) {
  if (!session || !CFG) throw Error('No model is loaded');
  running = true;
  cancelled = false;
  const temp = Number(msg.temp) || 0.8;
  const limit = Math.min(256, Math.max(1, Number(msg.limit) || 128));
  const chat = !!msg.chat;
  const prompt = String(msg.prompt || '');
  const ids = BPE ? BPE.encode(prompt) : Array.from(utf8Enc.encode(prompt));
  if (!ids.length) ids.push(BPE ? BPE.eotId : 32);
  const gen = [];
  const units = BPE ? 'tokens' : 'bytes';
  const t0 = performance.now();
  let count = 0, reason = 'Length limit', text = '';
  session.reset();
  try {
    for (let i = 0; i < limit; i++) {
      if (cancelled) { reason = 'Stopped'; break; }
      if (msg.economy && hidden) { reason = 'Paused while the tab was hidden'; break; }
      const tokenStart = performance.now();
      const logits = session.forward(ids.slice(-CFG.context));
      const next = sampleToken(logits, temp, BPE ? 40 : 0);
      if (BPE && next === BPE.eotId) { reason = 'End of reply'; break; }
      ids.push(next); gen.push(next); count++;
      text = BPE ? BPE.decode(gen) : utf8Dec.decode(Uint8Array.from(gen));
      if (chat) {
        const turn = text.search(/\n\s*(?:User|Assistant):/);
        if (turn >= 0) { text = text.slice(0, turn); reason = 'End of reply'; }
      }
      const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
      post({ type: 'token', requestId: msg.requestId, text, count, limit, units, rate: count / elapsed });
      if (reason === 'End of reply') break;
      const rest = msg.economy ? Math.min(400, Math.max(10, (performance.now() - tokenStart) * 0.25)) : 0;
      await new Promise(r => setTimeout(r, rest));
    }
  } catch (err) {
    reason = 'Generation failed: ' + err.message;
  }
  const seconds = Math.max(0.001, (performance.now() - t0) / 1000);
  running = false;
  post({ type: 'done', requestId: msg.requestId, reason, text: chat ? text.trim() : text, count, units, seconds, rate: count / seconds });
}

self.onmessage = async event => {
  const msg = event.data || {};
  try {
    if (msg.type === 'stop') { cancelled = true; return; }
    if (msg.type === 'hidden') { hidden = !!msg.hidden; return; }
    if (msg.type === 'abortLoad') { if (abortLoad) abortLoad.abort(); return; }
    if (msg.type === 'clearCache') {
      const ok = 'caches' in self ? await caches.delete(CACHE_NAME) : false;
      post({ type: 'cleared', requestId: msg.requestId, ok });
      return;
    }
    if (msg.type === 'load') {
      if (abortLoad) abortLoad.abort();
      abortLoad = new AbortController();
      session = null;
      const result = await load(msg, abortLoad.signal);
      post({ type: 'loaded', requestId: msg.requestId, ...result });
      return;
    }
    if (msg.type === 'generate') {
      if (running) throw Error('Generation already running');
      await generate(msg);
    }
  } catch (err) {
    if (err.name === 'AbortError') { post({ type: 'aborted', requestId: msg.requestId }); return; }
    post({ type: 'error', requestId: msg.requestId, message: err.message });
  }
};
