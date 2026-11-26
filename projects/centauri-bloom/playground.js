import {
  WEIGHTS_FILE,
  F16_WEIGHTS_FILE,
  hasWeightFile,
  pickWeightFile,
  architectureParams,
  usesChatTemplate,
  sha256Hex
} from './inference.js?v=11';

const root = document.querySelector('#bloom-playground');
const HF_ROOT = 'https://huggingface.co';
const BASELINE_URL = 'https://raw.githubusercontent.com/InterstellarNerd8760/centauri-bloom/main/experiments/baseline-001/model.safetensors';
const BASELINE_SHA = 'f44d8fa110384e32eb917cd6e102924e8af5a006fa4f8d32f9c47314d8f84027';
const BASELINE_CFG = { vocab_size: 256, context: 32, width: 64, heads: 4, layers: 2 };
// Adding a published model is one catalog entry. Optional entries enable
// themselves once model.safetensors is present on the listed revision.
const MODELS = [
  {
    id: 'text-0.2',
    label: 'Bloom Text 0.2 (50M)',
    detail: 'Base model that continues text · about 229 MB F32, or 115 MB F16 when published',
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
  const sizes = usesBpe ? [48,128,256] : [64,128,256];
  const previous = Number(lengthEl.value);
  lengthEl.replaceChildren(...sizes.map(n => new Option(n + (usesBpe ? ' tokens' : ' bytes'), String(n))));
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

let activeInstructionFormat = false;
let usesBpe = true;
let abortLoad = null;
let backend = null;

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
      return {entry, base, revision:info.sha, requested:rev, weightsFile:pickWeightFile(info), cfg:await c.json(), metrics:await m.json(), updated:info.lastModified};
    } catch (err) {
      if (signal && (signal.aborted || err.name === 'AbortError')) throw err;
      lastError = err;
    }
  }
  throw lastError || Error(entry.label + ' is not published yet');
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

function createInferenceBackend() {
  const worker = new Worker(new URL('./playground-worker.js?v=11', import.meta.url), { type: 'module' });
  let nextId = 1;
  const pending = new Map();
  let onProgress = null;
  let onStatus = null;
  worker.onmessage = event => {
    const msg = event.data || {};
    if (msg.type === 'status' && onStatus) onStatus(msg.text);
    if (msg.type === 'progress' && onProgress) onProgress(msg);
    const waiter = pending.get(msg.requestId);
    if (!waiter) return;
    if (msg.type === 'error') {
      pending.delete(msg.requestId);
      waiter.reject(new Error(msg.message));
    } else if (msg.type === 'aborted') {
      pending.delete(msg.requestId);
      waiter.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    } else if (msg.type === 'loaded' || msg.type === 'done') {
      pending.delete(msg.requestId);
      waiter.resolve(msg);
    }
  };
  worker.onerror = event => {
    const err = new Error(event.message || 'Inference worker failed');
    for (const waiter of pending.values()) waiter.reject(err);
    pending.clear();
  };
  function request(payload, transfer) {
    const requestId = nextId++;
    payload.requestId = requestId;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      worker.postMessage(payload, transfer || []);
    });
  }
  return {
    setProgress(fn) { onProgress = fn; },
    setStatus(fn) { onStatus = fn; },
    loadRemote(opts) { return request({ type: 'loadRemote', ...opts }); },
    loadLocal(buffer) { return request({ type: 'loadLocal', buffer }, [buffer]); },
    generate(opts) { return request({ type: 'generate', ...opts }); },
    stop() { worker.postMessage({ type: 'stop' }); },
    abortLoad() { worker.postMessage({ type: 'abortLoad' }); },
    setHidden(hidden) { worker.postMessage({ type: 'hidden', hidden }); }
  };
}

async function loadHuggingFace(entry, signal) {
  const sizeNote = entry.detail ? ' (' + entry.detail + ')' : '';
  status.textContent = 'Loading ' + entry.label + sizeNote + ' from Hugging Face…';
  if (metaEl) metaEl.textContent = '';
  const release = await fetchRelease(entry, signal);
  displayRelease(release);
  const {base,cfg,metrics,revision,requested,weightsFile}=release;
  if (!weightsFile) throw Error(entry.label + ' has not published model weights yet');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const expectedSha = weightsFile === WEIGHTS_FILE ? (metrics.weights_sha256 || null) : null;
  backend.setStatus(text => { if (!signal.aborted) status.textContent = text; });
  const result = await Promise.race([
    backend.loadRemote({
      label: entry.label,
      tokenizerUrl: base + '/tokenizer.json',
      weightsUrl: base + '/' + weightsFile,
      weightsFile,
      expectedSha,
      chat: usesChatTemplate(entry.format, metrics),
      cfg,
      metrics
    }),
    new Promise((_, reject) => signal.addEventListener('abort', () => {
      backend.abortLoad();
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true }))
  ]);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  activeInstructionFormat = usesChatTemplate(entry.format, metrics);
  usesBpe = !!result.bpe;
  const mb = (result.bytes / 1048576).toFixed(1) + ' MB';
  const dtype = weightsFile === F16_WEIGHTS_FILE ? 'F16' : 'F32';
  const viaPr = requested && requested !== 'main' && requested !== revision;
  status.textContent = 'Loaded ' + entry.label + ' (' + mb + ' ' + dtype + (viaPr ? ', from an open Hugging Face PR' : '') + '). Ready to generate.';
  if (metaEl) metaEl.textContent = [entry.detail || null, result.params.toLocaleString() + ' loaded params', dtype, metrics.step !== undefined ? 'step ' + metrics.step.toLocaleString() : null, 'HF ' + revision.slice(0, 8)].filter(Boolean).join(' · ');
  updateLengths();
  setReady(true);
}

async function loadBaseline(signal) {
  status.textContent = 'Loading verified 118.5K baseline-001 weights…';
  if (metaEl) metaEl.textContent = '';
  backend.setStatus(text => { if (!signal.aborted) status.textContent = text; });
  await Promise.race([
    backend.loadRemote({
      label: 'baseline-001',
      tokenizerUrl: null,
      weightsUrl: BASELINE_URL,
      expectedSha: BASELINE_SHA,
      chat: false,
      cfg: BASELINE_CFG
    }),
    new Promise((_, reject) => signal.addEventListener('abort', () => {
      backend.abortLoad();
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true }))
  ]);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  activeInstructionFormat = false;
  usesBpe = false;
  status.textContent = 'Verified baseline-001 loaded (118.5K byte-level). Ready to generate.';
  if (metaEl) metaEl.textContent = '118,528 params · 100 CPU steps · sha256 ' + BASELINE_SHA.slice(0, 12);
  updateLengths();
  setReady(true);
}

async function selectSource(id) {
  if (abortLoad) abortLoad.abort();
  if (backend) { backend.stop(); backend.abortLoad(); }
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
  if (backend) backend.abortLoad();
  setReady(false);
  try {
    const buf = await file.arrayBuffer();
    const sha = await sha256Hex(buf);
    const result = await backend.loadLocal(buf);
    activeInstructionFormat = false;
    usesBpe = !!result.bpe;
    const cfg = result.cfg;
    status.textContent = 'Local checkpoint loaded (' + cfg.width + 'w · ' + cfg.layers + 'L · vocab ' + cfg.vocab_size + ').';
    if (metaEl) metaEl.textContent = 'sha256 ' + sha.slice(0, 12);
    updateLengths();
    setReady(true);
  } catch (err) {
    status.textContent = err.message;
  }
});

async function generate(prompt) {
  if (!ready || running || !prompt.trim()) return;
  running = true; cancelled = false; lastPrompt = prompt; syncControls();
  const {output, info} = addTurn(prompt);
  const limit = Math.min(256, Math.max(1, Number(lengthEl.value) || 128));
  const units = usesBpe ? 'tokens' : 'bytes';
  activityProgress.max = limit;
  activityProgress.value = 0;
  activityText.textContent = 'Generating locally · 0 / ' + limit + ' ' + units + ' · waiting for first output';
  info.textContent = 'Generating on your device…';
  backend.setHidden(document.hidden);
  backend.setProgress(msg => {
    if (msg.text) output.textContent = msg.text;
    activityProgress.value = msg.count || 0;
    const elapsed = msg.elapsed || 0;
    activityText.textContent = 'Generating locally · ' + (msg.count || 0) + ' / ' + limit + ' ' + units + ' · ' + elapsed.toFixed(1) + 's';
    if (msg.count) info.textContent = msg.count + ' ' + units + ' generated · ' + (msg.rate || 0).toFixed(1) + ' /s';
    scrollLog();
  });
  try {
    const result = await backend.generate({
      prompt,
      temp: Number(tempEl.value) || 0.8,
      limit,
      economy: economyEl.checked
    });
    output.textContent = result.text || 'No text generated.';
    info.textContent = result.reason + ' · ' + result.count + ' ' + result.units + ' · ' + result.rate.toFixed(1) + ' /s';
  } catch (err) {
    if (!output.textContent || output.textContent === 'Generating…') output.textContent = 'Generation failed.';
    info.textContent = 'Generation failed: ' + err.message;
  } finally {
    running = false; cancelled = false; syncControls(); scrollLog();
  }
}
form.addEventListener('submit', e => { e.preventDefault(); const prompt = promptEl.value; if (ready && !running && prompt.trim()) { promptEl.value=''; generate(prompt); } });
promptEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  if (ready && !running && promptEl.value.trim()) form.requestSubmit();
});
stop.addEventListener('click', () => { cancelled=true; if (backend) backend.stop(); syncControls(); });
clear.addEventListener('click', () => { if (running) return; log.querySelectorAll('.bloom-turn').forEach(el=>el.remove()); empty.hidden=false; lastPrompt=''; syncControls(); promptEl.focus(); });
retry.addEventListener('click', () => generate(lastPrompt));
root.querySelectorAll('[data-starter]').forEach(btn=>btn.addEventListener('click',()=>{promptEl.value=btn.dataset.starter; promptEl.focus();}));
document.addEventListener('visibilitychange', () => { if (backend) backend.setHidden(document.hidden); });
try {
  backend = createInferenceBackend();
} catch (err) {
  status.textContent = 'Could not start the inference worker: ' + err.message;
}
renderModelSelect();
renderFileLinks();
syncControls();
refreshRelease();
if (backend) selectSource(modelSelect ? modelSelect.value : defaultModel().id);
refreshOptionalModels().catch(()=>{});
// Refresh metadata only; never reload weights or interrupt generation in the background.
setInterval(()=>{if(!document.hidden)refreshRelease();},120000);
