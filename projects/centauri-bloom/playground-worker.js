import {
  parseSafetensors,
  createSession,
  createBPE,
  sha256Hex,
  sampleToken,
  formatPrompt,
  loadedParams,
  architectureParams,
  headsForWidth,
  utf8Enc,
  utf8Dec
} from './inference.js?v=11';

let session = null;
let BPE = null;
let CFG = null;
let chat = false;
let cancelled = false;
let running = false;
let hidden = false;
let abortLoad = null;

function post(msg) { postMessage(msg); }

function inferCfg(weights) {
  const width = weights['norm.weight'].length;
  const tokRows = Math.round(weights['tokens.weight'].length / width);
  const context = Math.round(weights['positions.weight'].length / width);
  let layers = 0;
  while (weights[`blocks.layers.${layers}.norm1.weight`]) layers++;
  return { vocab_size: tokRows, context, width, heads: headsForWidth(width), layers };
}

async function installWeights(buf, { tokenizer, expectedSha, format, metrics, cfg }) {
  if (expectedSha) {
    const sha = await sha256Hex(buf);
    if (sha !== expectedSha) throw Error('Published checkpoint hash mismatch');
  }
  const weights = parseSafetensors(buf);
  let nextCfg = cfg;
  if (!nextCfg) nextCfg = inferCfg(weights);
  const tokenizerJson = tokenizer || null;
  if (tokenizerJson) {
    BPE = nextCfg.vocab_size === 256 && !tokenizerJson.model?.vocab ? null : createBPE(tokenizerJson);
  } else if (nextCfg.vocab_size === 256) {
    BPE = null;
  }
  const actual = loadedParams(weights);
  const expected = architectureParams(nextCfg);
  if (expected !== null && actual !== expected) {
    throw Error('Checkpoint tensors do not match the supported architecture parameter count');
  }
  CFG = nextCfg;
  session = createSession(weights, CFG);
  chat = !!format;
  return { params: actual, bytes: buf.byteLength, bpe: !!BPE, cfg: CFG, chat };
}

async function loadRemote(msg, signal) {
  post({ type: 'status', requestId: msg.requestId, text: 'Downloading ' + (msg.label || 'checkpoint') + '…' });
  const [tokRes, wRes] = await Promise.all([
    msg.tokenizerUrl ? fetch(msg.tokenizerUrl, { signal }) : Promise.resolve(null),
    fetch(msg.weightsUrl, { signal })
  ]);
  if ((msg.tokenizerUrl && !tokRes.ok) || !wRes.ok) throw Error('Hugging Face model files unavailable');
  const tokenizer = tokRes ? await tokRes.json() : null;
  const buf = await wRes.arrayBuffer();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  post({ type: 'status', requestId: msg.requestId, text: 'Building KV cache and installing weights…' });
  return installWeights(buf, {
    tokenizer,
    expectedSha: msg.expectedSha || null,
    format: msg.chat,
    metrics: msg.metrics,
    cfg: msg.cfg
  });
}

async function generate(msg) {
  if (!session || !CFG) throw Error('No model is loaded');
  running = true;
  cancelled = false;
  const temp = Number(msg.temp) || 0.8;
  const limit = Math.min(256, Math.max(1, Number(msg.limit) || 128));
  const economy = !!msg.economy;
  const prompt = formatPrompt(msg.prompt, chat);
  const ids = BPE ? BPE.encode(prompt) : Array.from(utf8Enc.encode(prompt));
  if (!ids.length) ids.push(BPE ? BPE.eotId : 32);
  const gen = [];
  const units = BPE ? 'tokens' : 'bytes';
  const t0 = performance.now();
  let count = 0, reason = 'Length limit', text = '';
  session.reset();
  post({ type: 'progress', requestId: msg.requestId, count: 0, limit, units, text: '', rate: 0, elapsed: 0, phase: 'start' });
  try {
    for (let i = 0; i < limit; i++) {
      if (cancelled) { reason = 'Stopped'; break; }
      if (economy && hidden) { reason = 'Paused tab — stopped'; break; }
      const tokenStart = performance.now();
      const window = ids.slice(-CFG.context);
      const logits = session.forward(window);
      const nxt = sampleToken(logits, temp, BPE ? 40 : 0);
      if (BPE && nxt === BPE.eotId) { reason = 'End of text'; break; }
      ids.push(nxt); gen.push(nxt); count++;
      text = BPE ? BPE.decode(gen) : utf8Dec.decode(Uint8Array.from(gen));
      if (chat) {
        const nextTurn = text.search(/\n\s*(?:User|Assistant):/);
        if (nextTurn >= 0) {
          text = text.slice(0, nextTurn).trim();
          reason = 'End of reply';
          const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
          post({ type: 'progress', requestId: msg.requestId, count, limit, units, text, rate: count / elapsed, elapsed, reason });
          break;
        }
      }
      const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
      post({ type: 'progress', requestId: msg.requestId, count, limit, units, text, rate: count / elapsed, elapsed });
      const rest = economy ? Math.min(1500, Math.max(50, performance.now() - tokenStart)) : 0;
      await new Promise(r => setTimeout(r, rest));
    }
    if (!text) text = 'No text generated.';
  } catch (err) {
    reason = 'Generation failed: ' + err.message;
    if (!text) text = 'Generation failed.';
  }
  const seconds = Math.max(0.001, (performance.now() - t0) / 1000);
  running = false;
  post({ type: 'done', requestId: msg.requestId, reason, text, count, units, seconds, rate: count / seconds });
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === 'stop') { cancelled = true; return; }
    if (msg.type === 'hidden') { hidden = !!msg.hidden; return; }
    if (msg.type === 'abortLoad') {
      if (abortLoad) abortLoad.abort();
      return;
    }
    if (msg.type === 'loadRemote') {
      if (abortLoad) abortLoad.abort();
      abortLoad = new AbortController();
      const result = await loadRemote(msg, abortLoad.signal);
      post({ type: 'loaded', requestId: msg.requestId, ...result, weightsFile: msg.weightsFile || null });
      return;
    }
    if (msg.type === 'loadLocal') {
      const result = await installWeights(msg.buffer, { tokenizer: null, expectedSha: null, format: false, cfg: null });
      post({ type: 'loaded', requestId: msg.requestId, ...result, local: true });
      return;
    }
    if (msg.type === 'generate') {
      if (running) throw Error('Generation already running');
      await generate(msg);
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError' || (msg && event.data && err.message === 'Aborted')) {
      post({ type: 'aborted', requestId: msg.requestId });
      return;
    }
    post({ type: 'error', requestId: msg.requestId, message: err.message });
  }
};
