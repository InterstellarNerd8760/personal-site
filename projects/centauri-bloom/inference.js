const CHAT_PROMPT_FORMAT = 'User: {prompt}\nAssistant:';
const WEIGHTS_FILE = 'model.safetensors';
const F16_WEIGHTS_FILE = 'model.f16.safetensors';

const utf8Enc = new TextEncoder();
const utf8Dec = new TextDecoder('utf-8', { fatal: false });

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

function createF16Table() {
  const table = new Float32Array(65536);
  const box = new Float32Array(1);
  const bits = new Uint32Array(box.buffer);
  for (let h = 0; h < 65536; h++) {
    const sign = (h & 0x8000) << 16;
    const exp = (h >> 10) & 0x1f;
    const frac = h & 0x3ff;
    if (exp === 0) {
      if (frac === 0) bits[0] = sign;
      else box[0] = (h & 0x8000 ? -1 : 1) * (frac / 1024) * Math.pow(2, -14);
    } else if (exp === 31) {
      bits[0] = sign | 0x7f800000 | (frac ? 0x400000 : 0);
    } else {
      bits[0] = sign | ((exp + (127 - 15)) << 23) | (frac << 13);
    }
    table[h] = box[0];
  }
  return table;
}

const F16_TO_F32 = createF16Table();

function parseSafetensors(buf) {
  const dv = new DataView(buf);
  const n = Number(dv.getBigUint64(0, true));
  const h = JSON.parse(utf8Dec.decode(new Uint8Array(buf, 8, n)));
  const tensors = {};
  for (const [k, v] of Object.entries(h)) {
    if (k === '__metadata__') continue;
    const start = 8 + n + v.data_offsets[0];
    const end = 8 + n + v.data_offsets[1];
    const dtype = v.dtype || 'F32';
    if (dtype === 'F32') {
      tensors[k] = start % 4 === 0
        ? new Float32Array(buf, start, (end - start) / 4)
        : new Float32Array(buf.slice(start, end));
    } else if (dtype === 'F16') {
      const src = start % 2 === 0
        ? new Uint16Array(buf, start, (end - start) / 2)
        : new Uint16Array(buf.slice(start, end));
      const out = new Float32Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = F16_TO_F32[src[i]];
      tensors[k] = out;
    } else {
      throw Error('Unsupported tensor type ' + dtype);
    }
  }
  return tensors;
}

function siblingNames(info) {
  return (info.siblings || []).map(item => item.rfilename || item);
}

function hasWeightFile(info) {
  const names = siblingNames(info);
  return names.includes(WEIGHTS_FILE) || names.includes(F16_WEIGHTS_FILE);
}

function pickWeightFile(info) {
  const names = siblingNames(info);
  if (names.includes(F16_WEIGHTS_FILE)) return F16_WEIGHTS_FILE;
  if (names.includes(WEIGHTS_FILE)) return WEIGHTS_FILE;
  return null;
}

function architectureParams(cfg) {
  const {vocab_size:v,context:t,width:w,layers:l,heads:h}=cfg;
  if (![v,t,w,l,h].every(x=>Number.isSafeInteger(x)&&x>0)||w%h!==0) return null;
  const n=v*w+t*w+l*(12*w*w+13*w)+2*w;
  return Number.isSafeInteger(n)?n:null;
}

function loadedParams(weights) {
  const head=weights['head.weight'], embedding=weights['tokens.weight'];
  const tied=head&&embedding&&head.length===embedding.length&&head.every((x,i)=>x===embedding[i]);
  return Object.entries(weights).reduce((sum,[key,tensor])=>sum+(key==='head.weight'&&tied?0:tensor.length),0);
}

function headsForWidth(width) {
  if (width === 640) return 10;
  if (width === 384) return 6;
  if (width === 64) return 4;
  if (width % 64 === 0) return width / 64;
  throw Error('Could not infer attention heads for width ' + width);
}

function usesChatTemplate(format, metrics) {
  if (format === 'chat') return true;
  if (format === 'completion') return false;
  return metrics && metrics.training_track === 'instruction-tuning' && typeof metrics.prompt_format === 'string' && metrics.prompt_format.includes('User:') && metrics.prompt_format.includes('Assistant:');
}

function formatPrompt(prompt, useChat) {
  if (!useChat || /^User:/.test(prompt)) return prompt;
  return CHAT_PROMPT_FORMAT.replace('{prompt}', prompt);
}

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

async function sha256Hex(buf) {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}

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

function linearInto(x, w, b, out, outDim, inDim) {
  if (inDim === undefined) inDim = x.length;
  for (let i = 0; i < outDim; i++) {
    let s = b ? b[i] : 0;
    const row = i * inDim;
    for (let j = 0; j < inDim; j++) s += x[j] * w[row + j];
    out[i] = s;
  }
}

function layerNormInto(src, off, width, weight, bias, out) {
  let sum = 0;
  for (let i = 0; i < width; i++) sum += src[off + i];
  const m = sum / width;
  let sq = 0;
  for (let i = 0; i < width; i++) {
    const d = src[off + i] - m;
    sq += d * d;
  }
  const inv = 1 / Math.sqrt(sq / width + 1e-5);
  for (let i = 0; i < width; i++) out[i] = (src[off + i] - m) * inv * weight[i] + bias[i];
}

function geluInPlace(x, n) {
  const len = n === undefined ? x.length : n;
  for (let i = 0; i < len; i++) {
    const v = x[i];
    const a = Math.abs(v) * Math.SQRT1_2;
    const t = 1 / (1 + 0.3275911 * a);
    const e = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
    x[i] = 0.5 * v * (1 + (v >= 0 ? e : -e));
  }
  return x;
}

function createSession(W, CFG) {
  const { width, heads, layers, vocab_size, context } = CFG;
  const headDim = width / heads;
  const scale = 1 / Math.sqrt(headDim);
  const ffDim = 4 * width;
  const tokW = W['tokens.weight'];
  const posW = W['positions.weight'];
  const headW = W['head.weight'] || tokW;
  const normW = W['norm.weight'];
  const normB = W['norm.bias'];

  const layer = [];
  for (let l = 0; l < layers; l++) {
    const p = `blocks.layers.${l}.`;
    layer.push({
      inW: W[p + 'self_attn.in_proj_weight'],
      inB: W[p + 'self_attn.in_proj_bias'],
      outW: W[p + 'self_attn.out_proj.weight'],
      outB: W[p + 'self_attn.out_proj.bias'],
      l1W: W[p + 'linear1.weight'],
      l1B: W[p + 'linear1.bias'],
      l2W: W[p + 'linear2.weight'],
      l2B: W[p + 'linear2.bias'],
      n1w: W[p + 'norm1.weight'],
      n1b: W[p + 'norm1.bias'],
      n2w: W[p + 'norm2.weight'],
      n2b: W[p + 'norm2.bias'],
    });
  }

  const kCache = Array.from({ length: layers }, () => new Float32Array(context * width));
  const vCache = Array.from({ length: layers }, () => new Float32Array(context * width));
  const hidden = new Float32Array(context * width);
  const xVec = new Float32Array(width);
  const ln = new Float32Array(width);
  const qkv = new Float32Array(3 * width);
  const attn = new Float32Array(width);
  const tmp = new Float32Array(width);
  const ff = new Float32Array(ffDim);
  const scores = new Float32Array(context);
  const logitsOut = new Float32Array(vocab_size);
  const cachedIds = new Int32Array(context);
  let cacheLen = 0;

  function storeKV(l, t, qkvSrc, qOff) {
    const kDest = t * width;
    const kSrc = qOff + width;
    const vSrc = qOff + 2 * width;
    kCache[l].set(qkvSrc.subarray(kSrc, kSrc + width), kDest);
    vCache[l].set(qkvSrc.subarray(vSrc, vSrc + width), kDest);
  }

  function attend(qSrc, qOff, t, kBuf, vBuf) {
    attn.fill(0);
    for (let h = 0; h < heads; h++) {
      const hOff = h * headDim;
      const qBase = qOff + hOff;
      let maxS = -Infinity;
      for (let j = 0; j <= t; j++) {
        let s = 0;
        const kBase = j * width + hOff;
        for (let k = 0; k < headDim; k++) s += qSrc[qBase + k] * kBuf[kBase + k];
        s *= scale;
        scores[j] = s;
        if (s > maxS) maxS = s;
      }
      let sumExp = 0;
      for (let j = 0; j <= t; j++) {
        scores[j] = Math.exp(scores[j] - maxS);
        sumExp += scores[j];
      }
      for (let j = 0; j <= t; j++) {
        const wt = scores[j] / sumExp;
        const vBase = j * width + hOff;
        for (let k = 0; k < headDim; k++) attn[hOff + k] += wt * vBuf[vBase + k];
      }
    }
  }

  function mlpInto(src, off, block) {
    layerNormInto(src, off, width, block.n2w, block.n2b, ln);
    linearInto(ln, block.l1W, block.l1B, ff, ffDim, width);
    geluInPlace(ff, ffDim);
    linearInto(ff, block.l2W, block.l2B, tmp, width, ffDim);
    for (let i = 0; i < width; i++) src[off + i] += tmp[i];
  }

  function embedInto(dest, destOff, id, pos) {
    const tOff = id * width;
    const pOff = pos * width;
    for (let j = 0; j < width; j++) dest[destOff + j] = tokW[tOff + j] + posW[pOff + j];
  }

  function finalLogits(src, off) {
    layerNormInto(src, off, width, normW, normB, ln);
    linearInto(ln, headW, null, logitsOut, vocab_size, width);
    return logitsOut;
  }

  function prefill(ids) {
    const n = ids.length;
    if (n < 1 || n > context) throw Error('Prefill length out of range');
    for (let i = 0; i < n; i++) {
      cachedIds[i] = ids[i];
      embedInto(hidden, i * width, ids[i], i);
    }
    for (let l = 0; l < layers; l++) {
      const block = layer[l];
      for (let i = 0; i < n; i++) {
        layerNormInto(hidden, i * width, width, block.n1w, block.n1b, ln);
        linearInto(ln, block.inW, block.inB, qkv, 3 * width, width);
        storeKV(l, i, qkv, 0);
        attend(qkv, 0, i, kCache[l], vCache[l]);
        linearInto(attn, block.outW, block.outB, tmp, width, width);
        const off = i * width;
        for (let j = 0; j < width; j++) hidden[off + j] += tmp[j];
      }
      for (let i = 0; i < n; i++) mlpInto(hidden, i * width, block);
    }
    cacheLen = n;
    return finalLogits(hidden, (n - 1) * width);
  }

  function decode(id) {
    const t = cacheLen;
    if (t >= context) throw Error('KV cache is full');
    cachedIds[t] = id;
    embedInto(xVec, 0, id, t);
    for (let l = 0; l < layers; l++) {
      const block = layer[l];
      layerNormInto(xVec, 0, width, block.n1w, block.n1b, ln);
      linearInto(ln, block.inW, block.inB, qkv, 3 * width, width);
      storeKV(l, t, qkv, 0);
      attend(qkv, 0, t, kCache[l], vCache[l]);
      linearInto(attn, block.outW, block.outB, tmp, width, width);
      for (let j = 0; j < width; j++) xVec[j] += tmp[j];
      mlpInto(xVec, 0, block);
    }
    cacheLen = t + 1;
    return finalLogits(xVec, 0);
  }

  function samePrefix(ids) {
    if (ids.length !== cacheLen + 1 || cacheLen < 1) return false;
    for (let i = 0; i < cacheLen; i++) if (ids[i] !== cachedIds[i]) return false;
    return true;
  }

  function forward(ids) {
    if (!ids.length) throw Error('Empty token window');
    if (ids.length > context) throw Error('Token window exceeds context');
    if (samePrefix(ids)) return decode(ids[ids.length - 1]);
    return prefill(ids);
  }

  function reset() { cacheLen = 0; }

  return { forward, prefill, decode, reset, get cacheLen() { return cacheLen; } };
}

export {
  CHAT_PROMPT_FORMAT,
  WEIGHTS_FILE,
  F16_WEIGHTS_FILE,
  utf8Enc,
  utf8Dec,
  parseSafetensors,
  hasWeightFile,
  pickWeightFile,
  architectureParams,
  loadedParams,
  headsForWidth,
  usesChatTemplate,
  formatPrompt,
  createBPE,
  sha256Hex,
  sampleToken,
  createSession
};
