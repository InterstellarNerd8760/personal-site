const root = document.querySelector('#bloom-playground');
const HF_ROOT = 'https://huggingface.co';
const WEIGHTS_FILE = 'model.safetensors';
const CHAT_PROMPT_FORMAT = 'User: {prompt}\nAssistant:';
const BASELINE_URL = 'https://raw.githubusercontent.com/InterstellarNerd8760/centauri-bloom/main/experiments/baseline-001/model.safetensors';
const BASELINE_SHA = 'f44d8fa110384e32eb917cd6e102924e8af5a006fa4f8d32f9c47314d8f84027';
const BASELINE_CFG = { vocab_size: 256, context: 32, width: 64, heads: 4, layers: 2 };
const HEADS_BY_WIDTH = { 64: 4, 384: 6, 640: 10 };

// Adding a published model is one catalog entry. Optional entries enable
// themselves once model.safetensors is present on the listed revision.
const MODELS = [
  {
    id: 'text-0.2',
    label: 'Bloom Text 0.2 (50M)',
    detail: 'Base model that continues text · about 229 MB',
    source: 'hf',
    repo: 'Centauri-Bloom/Bloom-Text-0.2',
    revision: 'main',
    fallbacks: ['refs/pr/1'],
    format: 'completion',
    card: 'https://huggingface.co/Centauri-Bloom/Bloom-Text-0.2'
  },
  {
    id: 'chat-0.2',
    label: 'Bloom Chat 0.2',
    detail: 'Assistant fine-tune · coming soon',
    source: 'hf',
    repo: 'Centauri-Bloom/Bloom-Chat-0.2',
    revision: 'main',
    format: 'chat',
    optional: true,
    disabled: true,
    card: 'https://huggingface.co/Centauri-Bloom/Bloom-Chat-0.2'
  },
  {
    id: 'text-0.1',
    label: 'Bloom Text 0.1 (14M) · Latest',
    detail: 'Latest published 14M checkpoint · about 65 MB',
    source: 'hf',
    repo: 'Centauri-Bloom/Bloom-Text-0.1',
    revision: 'main',
    format: 'auto',
    default: true,
    card: 'https://huggingface.co/Centauri-Bloom/Bloom-Text-0.1'
  },
  {
    id: 'baseline',
    label: 'baseline-001 · 118.5K',
    detail: 'Original verified prototype',
    source: 'baseline',
    format: 'completion',
    card: 'https://github.com/InterstellarNerd8760/centauri-bloom/releases/download/baseline-001-experimental/model.safetensors'
  }
];

function findModel(id) {
  return MODELS.find(model => model.id === id) || null;
}
function defaultModel() {
  return MODELS.find(model => model.default && !model.disabled) || MODELS.find(model => !model.disabled);
}
function headsForWidth(width) {
  if (HEADS_BY_WIDTH[width]) return HEADS_BY_WIDTH[width];
  if (width % 64 === 0) return width / 64;
  throw Error('Could not infer attention heads for width ' + width);
}
function usesChatTemplate(format, metrics) {
  if (format === 'chat') return true;
  if (format === 'completion') return false;
  return metrics && metrics.training_track === 'instruction-tuning' && typeof metrics.prompt_format === 'string' && metrics.prompt_format.includes('User:') && metrics.prompt_format.includes('Assistant:');
}
function formatPrompt(prompt) {
  if (!activeInstructionFormat || /^User:/.test(prompt)) return prompt;
  return CHAT_PROMPT_FORMAT.replace('{prompt}', prompt);
}

const status = root.querySelector('[role=status]');
const metaEl = root.querySelector('[data-bloom-meta]');
const modelSelect = root.querySelector('[data-bloom-model]');
const go = root.querySelector('[data-bloom-generate]');
const stop = root.querySelector('[data-bloom-stop]');
const clear = root.querySelector('[data-bloom-clear]');
const retry = root.querySelector('[data-bloom-retry]');
const form = root.querySelector('[data-bloom-form]');
const promptEl = root.querySelector('textarea');
const lengthEl = root.querySelector('[data-bloom-length]');
const tempEl = root.querySelector('[data-bloom-temp]');
const economyEl = root.querySelector('[data-bloom-economy]');
const activity = root.querySelector('[data-bloom-activity]');
const activityText = root.querySelector('[data-bloom-activity-text]');
const activityProgress = root.querySelector('[data-bloom-activity-progress]');
const log = root.querySelector('[data-bloom-log]');
const fileInput = document.querySelector('.bloom-advanced input[type=file]');
const empty = root.querySelector('[data-bloom-empty]');
let ready = false, running = false, cancelled = false, lastPrompt = '';
function syncControls() {
  go.disabled = !ready || running;
  go.textContent = running ? 'Generating…' : 'Generate ↗';
  form.setAttribute('aria-busy', String(running));
  activity.hidden = !running;
  if (running && cancelled) activityText.textContent = 'Stopping after the current token…';
  stop.disabled = !running || cancelled;
  clear.disabled = running;
  retry.disabled = !ready || running || !lastPrompt;
  modelSelect.disabled = running;
  fileInput.disabled = running;
  lengthEl.disabled = running;
  tempEl.disabled = running;
  promptEl.disabled = running;
}
function setReady(value) { ready = value; syncControls(); }
function updateLengths() {
  const sizes = BPE ? [48,128,256] : [64,128,256];
  const previous = Number(lengthEl.value);
  lengthEl.replaceChildren(...sizes.map(n => new Option(n + (BPE ? ' tokens' : ' bytes'), String(n))));
  lengthEl.value = String(sizes.includes(previous) ? previous : sizes[0]);
}
function scrollLog() { log.scrollTop = log.scrollHeight; }
function addTurn(prompt) {
  empty.hidden = true;
  const turn = document.createElement('article'); turn.className = 'bloom-turn';
  const user = document.createElement('div'); user.className = 'bloom-message bloom-message-user';
  const model = document.createElement('div'); model.className = 'bloom-message bloom-message-model';
  function label(parent, text) { const span = document.createElement('span'); span.className='bloom-chat-kicker'; span.textContent=text; parent.append(span); }
  label(user, 'YOU / PROMPT');
  const p = document.createElement('p'); p.textContent = prompt; user.append(p);
  label(model, activeInstructionFormat ? 'BLOOM / REPLY' : 'BLOOM / COMPLETION');
  const output = document.createElement('p'); output.textContent = 'Generating…'; model.append(output);
  const info = document.createElement('p'); info.className='bloom-run-info'; info.setAttribute('role','status'); model.append(info);
  turn.append(user,model); log.append(turn);
  while (log.querySelectorAll('.bloom-turn').length > 30) log.querySelector('.bloom-turn').remove();
  scrollLog(); return {output, info};
}

let W = null;
let CFG = BASELINE_CFG;
let BPE = null;
let activeInstructionFormat = false;
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
    const start = 8 + n + v.data_offsets[0];
    const end = 8 + n + v.data_offsets[1];
    const dtype = v.dtype || 'F32';
    if (dtype !== 'F32') throw Error('Unsupported tensor type ' + dtype);
    tensors[k] = start % 4 === 0
      ? new Float32Array(buf, start, (end - start) / 4)
      : new Float32Array(buf.slice(start, end));
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

function hasWeightFile(info) {
  return (info.siblings || []).some(item => (item.rfilename || item) === WEIGHTS_FILE);
}
async function fetchHfModel(repo, revision, signal) {
  const suffix = revision && revision !== 'main' ? '/revision/' + encodeURIComponent(revision) : '';
  const api = await fetch(HF_ROOT + '/api/models/' + repo + suffix, {signal, cache:'no-cache'});
  if (!api.ok) throw Error('Published model metadata unavailable');
  return api.json();
}
async function fetchRelease(entry, signal) {
  if (!entry || entry.source !== 'hf') throw Error('No Hugging Face checkpoint selected');
  const opts = {signal, cache:'no-cache'};
  const revisions = [entry.revision, ...(entry.fallbacks || [])].filter(Boolean);
  const seen = new Set();
  let lastError = null;
  for (const rev of revisions) {
    if (seen.has(rev)) continue;
    seen.add(rev);
    try {
      const info = await fetchHfModel(entry.repo, rev, signal);
      if (!hasWeightFile(info)) {
        lastError = Error(entry.label + ' has not published model weights yet');
        continue;
      }
      if (!/^[a-f0-9]{40}$/i.test(info.sha || '')) throw Error('Missing model revision');
      const base = HF_ROOT + '/' + entry.repo + '/resolve/' + info.sha;
      const [c,m] = await Promise.all([fetch(base+'/config.json',opts),fetch(base+'/metrics.json',opts)]);
      if (!c.ok || !m.ok) throw Error('Published configuration or metrics unavailable');
      return {entry, base, revision:info.sha, requested:rev, cfg:await c.json(), metrics:await m.json(), updated:info.lastModified};
    } catch (err) {
      if (signal && (signal.aborted || err.name === 'AbortError')) throw err;
      lastError = err;
    }
  }
  throw lastError || Error(entry.label + ' is not published yet');
}
// The current Bloom architecture ties its input embedding and output head.
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
let lastRelease = null;
let latestRequest = 0;
function displayRelease(r) {
  const put = (selector,value) => {const el=document.querySelector(selector);if(el)el.textContent=value;};
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const num=v=>finite(v)?v.toLocaleString(undefined,{maximumFractionDigits:8}):'—';
  const loss=v=>finite(v)?v.toLocaleString(undefined,{maximumFractionDigits:6}):'—';
  const expected=architectureParams(r.cfg);
  const m=r.metrics,c=r.cfg;
  put('[data-release-params]',num(expected??m.parameters));
  put('[data-release-step]',num(m.step));
  const scope=String(m.train_tokens_scope||'');
  const isContinuation=scope.startsWith('this continuation');
  let cumulative=Number.isSafeInteger(m.cumulative_train_tokens)&&m.cumulative_train_tokens>=0?m.cumulative_train_tokens:null;
  let cumulativeNote=cumulative!==null?'Published cumulative token exposures (includes repeated tokens).':'Lifetime token count not established.';
  if(cumulative===null&&!isContinuation&&Number.isSafeInteger(m.train_tokens)&&m.train_tokens>=0&&m.step===3000){cumulative=m.train_tokens;cumulativeNote='Original pretraining count reported by this checkpoint.';}
  if(cumulative===null&&m.step===4500&&m.parent_revision&&m.parent_reported_train_tokens===49152000&&m.train_tokens===24576000&&isContinuation){cumulative=m.parent_reported_train_tokens+m.train_tokens;cumulativeNote='Derived from reported original and continuation token counts.';}
  put('[data-release-tokens]',num(m.train_tokens));
  put('[data-release-total-tokens]',num(cumulative));
  put('[data-release-target-tokens]',num(m.supervised_target_tokens));
  put('[data-release-updates]',num(m.optimizer_updates));
  put('[data-release-examples]',num(m.train_examples));
  put('[data-release-val-examples]',num(m.validation_examples));
  put('[data-release-loss]',loss(m.val_loss));
  put('[data-release-train-loss]',loss(m.last_train_loss??m.train_loss));
  put('[data-release-perplexity]',finite(m.val_loss)&&Number.isFinite(Math.exp(m.val_loss))?loss(Math.exp(m.val_loss)):'—');
  put('[data-release-context]',num(c.context));
  put('[data-release-vocab]',num(c.vocab_size));
  put('[data-release-layers]',num(c.layers));
  put('[data-release-heads]',num(c.heads));
  put('[data-release-width]',num(c.width));
  put('[data-release-lr]',num(m.learning_rate));
  put('[data-release-batch]',num(m.batch_size));
  put('[data-release-accum]',num(m.grad_accum));
  put('[data-release-elapsed]',finite(m.elapsed_seconds)?num(m.elapsed_seconds/60)+' min':'—');
  const warning=document.querySelector('[data-release-warning]');
  if(warning){
    const mismatch=expected!==null&&finite(m.parameters)&&m.parameters!==expected;
    warning.hidden=!mismatch;
    warning.textContent=mismatch?'Metrics report '+num(m.parameters)+' parameters, but the configuration implies '+num(expected)+'. Check checkpoint metadata.':'';
  }
  put('[data-bloom-release-status]',(r.entry?r.entry.repo.split('/')[1]:'Bloom')+' · HF '+r.revision.slice(0,8));
  put('[data-release-details]',[m.run_name,r.updated?'Published '+r.updated.slice(0,10):null,'Checked '+new Date().toLocaleTimeString()].filter(Boolean).join(' · '));
  put('[data-release-provenance]',[m.train_tokens_scope?'Token count scope: '+m.train_tokens_scope:null,m.training_track?'Track: '+m.training_track:null,cumulativeNote,m.validation_loss_scope?'Loss scope: '+m.validation_loss_scope:null,'Losses across different datasets/objectives are not directly comparable. Perplexity is derived from validation loss. — means unavailable.'].filter(Boolean).join(' · '));
  put('[data-release-raw]',JSON.stringify({model:r.entry?r.entry.repo:null,revision:r.revision,requested:r.requested,updated:r.updated,metrics:m,config:c},null,2));
  const kicker=document.querySelector('.bloom-release-head .bloom-chat-kicker');
  if(kicker&&r.entry)kicker.textContent='SELECTED CHECKPOINT / '+(r.entry.repo?r.entry.repo.split('/')[1]:r.entry.label).toUpperCase();
  const card=document.querySelector('[data-bloom-card]');
  if(card&&r.entry&&r.entry.card){card.href=r.entry.card;card.hidden=false;}
  lastRelease=r;
}

function selectedHfEntry() {
  const current = findModel(modelSelect && modelSelect.value);
  if (current && current.source === 'hf' && !current.disabled) return current;
  return MODELS.find(model => model.source === 'hf' && !model.disabled && !model.optional) || null;
}
async function refreshRelease() {
  const request=++latestRequest;
  const entry=selectedHfEntry();
  if(!entry){
    if(request===latestRequest){
      const el=document.querySelector('[data-bloom-release-status]');
      if(el)el.textContent='Select a published Hugging Face model to load live metrics.';
    }
    return null;
  }
  try {
    const r=await fetchRelease(entry);
    if(request===latestRequest)displayRelease(r);
    return r;
  }catch(e){
    if(request===latestRequest){
      const el=document.querySelector('[data-bloom-release-status]');
      if(el)el.textContent=lastRelease?'Refresh failed — showing last successful revision '+lastRelease.revision.slice(0,8):'Live metadata unavailable — see the model card.';
    }
    return null;
  }
}
function optionLabel(model) {
  return model.disabled ? model.label + ' · coming soon' : model.label;
}
function renderModelSelect() {
  if (!modelSelect) return;
  const previous = modelSelect.value;
  modelSelect.replaceChildren(...MODELS.map(model => {
    const opt = new Option(optionLabel(model), model.id);
    opt.disabled = !!model.disabled;
    if (model.detail) opt.title = model.detail;
    return opt;
  }));
  const keep = findModel(previous);
  modelSelect.value = keep && !keep.disabled ? previous : defaultModel().id;
}
function renderFileLinks() {
  const host = document.querySelector('[data-bloom-file-links]');
  if (!host) return;
  host.replaceChildren();
  MODELS.forEach((model, index) => {
    if (!model.card) return;
    if (index && host.childNodes.length) host.append(' · ');
    const a = document.createElement('a');
    a.href = model.card;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = model.label + ' ↗';
    host.append(a);
  });
}
async function refreshOptionalModels(signal) {
  const optional = MODELS.filter(model => model.optional && model.source === 'hf');
  await Promise.all(optional.map(async model => {
    try {
      const info = await fetchHfModel(model.repo, model.revision, signal);
      model.disabled = !hasWeightFile(info);
    } catch {
      model.disabled = true;
    }
  }));
  renderModelSelect();
}
document.querySelector('[data-release-refresh]')?.addEventListener('click',()=>refreshRelease());
async function loadHuggingFace(entry, signal) {
  const sizeNote = entry.detail ? ' (' + entry.detail + ')' : '';
  status.textContent = 'Loading ' + entry.label + sizeNote + ' from Hugging Face…';
  if (metaEl) metaEl.textContent = '';
  const release=await fetchRelease(entry, signal);
  displayRelease(release);
  const {base,cfg,metrics,revision,requested}=release;
  const [tokRes,wRes]=await Promise.all([fetch(base+'/tokenizer.json',{signal}),fetch(base+'/'+WEIGHTS_FILE,{signal})]);
  if (!tokRes.ok || !wRes.ok) throw Error('Hugging Face model files unavailable');
  const tokJson=await tokRes.json();
  const buf=await wRes.arrayBuffer();
  const sha=await sha256Hex(buf);
  if (signal.aborted) throw new DOMException('Aborted','AbortError');
  if (metrics.weights_sha256 && sha!==metrics.weights_sha256) throw Error('Published checkpoint hash mismatch');
  const tokenizer=cfg.vocab_size===256 && !tokJson.model?.vocab ? null : createBPE(tokJson);
  W=parseSafetensors(buf); CFG=cfg; BPE=tokenizer;
  activeInstructionFormat=usesChatTemplate(entry.format, metrics);
  const mb=(buf.byteLength/1048576).toFixed(1)+' MB';
  const viaPr = requested && requested !== 'main' && requested !== revision;
  status.textContent='Loaded '+entry.label+' ('+mb+(viaPr ? ', from an open Hugging Face PR' : '')+'). Ready to generate.';
  const actual=loadedParams(W);
  const expected=architectureParams(cfg);
  if(expected!==null&&actual!==expected){
    throw Error('Checkpoint tensors do not match the supported architecture parameter count');
  }
  if(metaEl)metaEl.textContent=[entry.detail||null,actual.toLocaleString()+' loaded params',metrics.step!==undefined?'step '+metrics.step.toLocaleString():null,'HF '+revision.slice(0,8)].filter(Boolean).join(' · ');
  updateLengths();setReady(true);
}

async function loadBaseline(signal) {
  status.textContent = 'Loading verified 118.5K baseline-001 weights…';
  if (metaEl) metaEl.textContent = '';
  const res = await fetch(BASELINE_URL, { signal });
  if (!res.ok) throw Error('Baseline weights unavailable');
  const buf = await res.arrayBuffer();
  const sha = await sha256Hex(buf);
  if (sha !== BASELINE_SHA) throw Error('Not the verified baseline checkpoint');
  if(signal.aborted) throw new DOMException('Aborted','AbortError');
  W = parseSafetensors(buf);
  CFG = BASELINE_CFG;
  BPE = null;
  activeInstructionFormat = false;
  status.textContent = 'Verified baseline-001 loaded (118.5K byte-level). Ready to generate.';
  if (metaEl) metaEl.textContent = `118,528 params · 100 CPU steps · sha256 ${sha.slice(0, 12)}`;
  updateLengths();
  setReady(true);
}

async function selectSource(id) {
  if (abortLoad) abortLoad.abort();
  abortLoad = new AbortController();
  const signal = abortLoad.signal;
  const entry = findModel(id) || defaultModel();
  if (modelSelect && entry) modelSelect.value = entry.id;
  if (!entry || entry.disabled) {
    setReady(false);
    status.textContent = (entry ? entry.label : 'That model') + ' is not published yet.';
    return;
  }
  setReady(false);
  try {
    if (entry.source === 'hf') {
      await loadHuggingFace(entry, signal);
    } else {
      await loadBaseline(signal);
    }
  } catch (err) {
    if (signal.aborted || err.name === 'AbortError') return;
    if (entry.id === 'text-0.1') {
      if (modelSelect) modelSelect.value = 'baseline';
      try {
        await loadBaseline(signal);
        status.textContent = 'Latest 14M checkpoint unavailable; using verified baseline-001.';
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

fileInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || running) return;
  if (abortLoad) abortLoad.abort();
  setReady(false);
  try {
    const buf = await file.arrayBuffer();
    const sha = await sha256Hex(buf);
    W = parseSafetensors(buf);
    activeInstructionFormat = false;
    const tokRows = Math.round(W['tokens.weight'].length / (W['norm.weight']?.length || 64));
    const width = W['norm.weight'].length;
    const context = Math.round(W['positions.weight'].length / width);
    let layers = 0;
    while (W[`blocks.layers.${layers}.norm1.weight`]) layers++;
    CFG = { vocab_size: tokRows, context, width, heads: headsForWidth(width), layers };
    if (tokRows === 256) BPE = null;
    status.textContent = `Local checkpoint loaded (${width}w · ${layers}L · vocab ${tokRows}).`;
    if (metaEl) metaEl.textContent = `sha256 ${sha.slice(0, 12)}`;
    updateLengths();
    setReady(true);
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

async function generate(prompt) {
  if (!ready || running || !prompt.trim()) return;
  running = true; cancelled = false; lastPrompt = prompt; syncControls();
  const {output, info} = addTurn(prompt);
  const temp = Number(tempEl.value) || 0.8;
  const limit = Math.min(256, Math.max(1, Number(lengthEl.value) || 128));
  const t0 = performance.now();
  let count = 0, reason = 'Length limit', text = '';
  const units = BPE ? 'tokens' : 'bytes';
  activityProgress.max = limit;
  activityProgress.value = 0;
  activityText.textContent = 'Generating locally · 0 / ' + limit + ' ' + units + ' · waiting for first output';
  info.textContent = 'Generating on your device…';
  try {
    const modelPrompt=formatPrompt(prompt);
    const ids = BPE ? BPE.encode(modelPrompt) : Array.from(utf8Enc.encode(modelPrompt));
    if (!ids.length) ids.push(BPE ? BPE.eotId : 32);
    const gen = [];
    // Allow the browser to paint the indicator before synchronous CPU inference.
    await new Promise(r => setTimeout(r, 50));
    for (let i = 0; i < limit; i++) {
      if (cancelled) { reason = 'Stopped'; break; }
      if (economyEl.checked && document.hidden) { reason='Paused tab — stopped'; break; }
      const tokenStart=performance.now();
      const a = logits(ids.slice(-CFG.context));
      const nxt = sampleToken(a, temp, BPE ? 40 : 0);
      if (BPE && nxt === BPE.eotId) { reason = 'End of text'; break; }
      ids.push(nxt); gen.push(nxt); count++;
      text = BPE ? BPE.decode(gen) : utf8Dec.decode(Uint8Array.from(gen));
      if(activeInstructionFormat){const nextTurn=text.search(/\n\s*(?:User|Assistant):/);if(nextTurn>=0){text=text.slice(0,nextTurn).trim();output.textContent=text;reason='End of reply';break;}}
      output.textContent = text;
      activityProgress.value = count;
      const elapsed = Math.max(0.001,(performance.now()-t0)/1000);
      activityText.textContent = 'Generating locally · ' + count + ' / ' + limit + ' ' + units + ' · ' + elapsed.toFixed(1) + 's';
      info.textContent = count + ' ' + units + ' generated · ' + (count/elapsed).toFixed(1) + ' /s';
      scrollLog();
      const rest=economyEl.checked ? Math.min(1500,Math.max(50,performance.now()-tokenStart)) : 0;
      await new Promise(r => setTimeout(r, rest));
    }
    if (!text) output.textContent = 'No text generated.';
  } catch (err) {
    reason = 'Generation failed: ' + err.message;
    if (!text) output.textContent = 'Generation failed.';
  } finally {
    const seconds = Math.max(0.001,(performance.now()-t0)/1000);
    info.textContent = reason + ' · ' + count + ' ' + units + ' · ' + (count/seconds).toFixed(1) + ' /s';
    running = false; syncControls(); scrollLog();
  }
}
form.addEventListener('submit', e => { e.preventDefault(); const prompt = promptEl.value; if (ready && !running && prompt.trim()) { promptEl.value=''; generate(prompt); } });
promptEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  if (ready && !running && promptEl.value.trim()) form.requestSubmit();
});
stop.addEventListener('click', () => { cancelled=true; syncControls(); });
clear.addEventListener('click', () => { if (running) return; log.querySelectorAll('.bloom-turn').forEach(el=>el.remove()); empty.hidden=false; lastPrompt=''; syncControls(); promptEl.focus(); });
retry.addEventListener('click', () => generate(lastPrompt));
root.querySelectorAll('[data-starter]').forEach(btn=>btn.addEventListener('click',()=>{promptEl.value=btn.dataset.starter; promptEl.focus();}));
renderModelSelect();
renderFileLinks();
syncControls();
refreshRelease();
selectSource(modelSelect ? modelSelect.value : defaultModel().id);
refreshOptionalModels().catch(()=>{});
// Refresh metadata only; never reload weights or interrupt generation in the background.
setInterval(()=>{if(!document.hidden)refreshRelease();},120000);
