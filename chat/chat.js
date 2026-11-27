// Bloom chat: a full-screen chat client for every published Centauri Bloom
// model. Inference runs in a web worker on the visitor's device; chats are
// stored only in localStorage.
import { hasWeightFile, pickWeightFile, WEIGHTS_FILE } from '/projects/centauri-bloom/inference.js?v=11';

const HF = 'https://huggingface.co';
const ORG = 'Centauri-Bloom';
const STORE_KEY = 'bloom-chat-v1';
const PREF_KEY = 'bloom-chat-prefs-v1';
const MAX_CHATS = 60;
const MEMORY_CHARS = 1400;
const CHAT_ROOT = location.hostname.startsWith('chat.') ? '/' : '/chat/';

const BASELINE = {
  id: 'baseline-001',
  family: 'baseline-001',
  name: 'baseline-001',
  kind: 'text',
  size: '118.5K',
  versionLabel: 'Verified prototype',
  meta: '118,528 params · byte-level · 100 CPU steps',
  weightsUrl: 'https://raw.githubusercontent.com/InterstellarNerd8760/centauri-bloom/main/experiments/baseline-001/model.safetensors',
  expectedSha: 'f44d8fa110384e32eb917cd6e102924e8af5a006fa4f8d32f9c47314d8f84027',
  cfg: { vocab_size: 256, context: 32, width: 64, heads: 4, layers: 2 },
  approxMB: 0.5
};

// Known families, newest first. Other repos in the org that publish
// model.safetensors are discovered and added automatically.
const KNOWN = [
  { repo: `${ORG}/Bloom-Chat-0.2`, name: 'Bloom Chat 0.2', kind: 'chat', size: '54M', approxMB: 229,
    desc: 'Assistant fine-tune of Bloom Text 0.2. It answers questions, often incorrectly.' },
  { repo: `${ORG}/Bloom-Text-0.2`, name: 'Bloom Text 0.2', kind: 'text', size: '54M', approxMB: 229,
    desc: 'Base model. It continues whatever you write instead of answering.' },
  { repo: `${ORG}/Bloom-Text-0.1`, name: 'Bloom Text 0.1', kind: 'auto', size: '14M', approxMB: 65,
    desc: 'The first 14M Bloom model. Small and fast, mostly story-like text.' }
];

const STARTERS = {
  chat: [
    ['Ask', 'What is the moon made of?'],
    ['Explain', 'Explain photosynthesis in simple words.'],
    ['Write', 'Write a short poem about the stars.'],
    ['Math', 'What is 12 times 5?']
  ],
  text: [
    ['Story', 'Once upon a time, there was a little robot'],
    ['Science', 'The ocean covers most of the Earth, and'],
    ['History', 'In 1969, astronauts landed on the moon. They'],
    ['Finish', 'The dog was hungry, so']
  ]
};

const $ = sel => document.querySelector(sel);
const app = $('[data-app]');
const els = {
  sidebar: $('[data-sidebar]'), scrim: $('[data-scrim]'), openSide: $('[data-sidebar-open]'), closeSide: $('[data-sidebar-close]'),
  history: $('[data-history]'), modelButton: $('[data-model-button]'), modelMenu: $('[data-model-menu]'),
  modelName: $('[data-model-name]'), modelVersion: $('[data-model-version]'), modelDot: $('[data-model-dot]'),
  settingsButton: $('[data-settings-button]'), settings: $('[data-settings]'), length: $('[data-length]'), temp: $('[data-temp]'),
  memory: $('[data-memory]'), economy: $('[data-economy]'), clearCache: $('[data-clear-cache]'),
  load: $('[data-load]'), loadText: $('[data-load-text]'), loadFill: $('[data-load-fill]'),
  thread: $('[data-thread]'), empty: $('[data-empty]'), starters: $('[data-starters]'), messages: $('[data-messages]'),
  form: $('[data-form]'), input: $('[data-input]'), send: $('[data-send]'), note: $('[data-note]'), jump: $('[data-jump]')
};
document.querySelectorAll('[data-home-link]').forEach(a => { a.href = CHAT_ROOT; });

/* ---------- storage ---------- */
function readJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota or private mode */ } }
const store = readJSON(STORE_KEY, { chats: [], activeId: null });
if (!Array.isArray(store.chats)) store.chats = [];
const prefs = Object.assign({ modelId: null, length: '128', temp: '0.7', memory: false, economy: false }, readJSON(PREF_KEY, {}));
function saveStore() {
  store.chats.sort((a, b) => b.updated - a.updated);
  store.chats = store.chats.slice(0, MAX_CHATS);
  writeJSON(STORE_KEY, store);
}
function savePrefs() { writeJSON(PREF_KEY, prefs); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function activeChat() { return store.chats.find(c => c.id === store.activeId) || null; }

/* ---------- worker ---------- */
function createBackend() {
  const worker = new Worker('/chat/chat-worker.js?v=1', { type: 'module' });
  let nextId = 1;
  const pending = new Map();
  worker.onmessage = ({ data: msg }) => {
    const w = pending.get(msg.requestId);
    if (!w) return;
    if (msg.type === 'progress-load' || msg.type === 'token') { w.onEvent && w.onEvent(msg); return; }
    pending.delete(msg.requestId);
    if (msg.type === 'error') w.reject(new Error(msg.message));
    else if (msg.type === 'aborted') w.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    else w.resolve(msg);
  };
  worker.onerror = e => {
    const err = new Error(e.message || 'Inference worker failed');
    pending.forEach(w => w.reject(err));
    pending.clear();
  };
  const request = (payload, onEvent) => new Promise((resolve, reject) => {
    const requestId = nextId++;
    pending.set(requestId, { resolve, reject, onEvent });
    worker.postMessage({ ...payload, requestId });
  });
  return {
    load: (opts, onEvent) => request({ type: 'load', ...opts }, onEvent),
    generate: (opts, onEvent) => request({ type: 'generate', ...opts }, onEvent),
    clearCache: () => request({ type: 'clearCache' }),
    stop: () => worker.postMessage({ type: 'stop' }),
    abortLoad: () => worker.postMessage({ type: 'abortLoad' }),
    setHidden: hidden => worker.postMessage({ type: 'hidden', hidden })
  };
}
let backend = null;
try { backend = createBackend(); } catch (err) { console.error(err); }

/* ---------- model catalog ---------- */
let families = [];         // [{ name, kind, size, desc, versions: [model] }]
const models = new Map();  // id -> model
let current = null;        // selected model
let loaded = null;         // id of the model installed in the worker
let ready = false, running = false, loadToken = 0;

const shortDate = iso => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
function runName(title) {
  const t = String(title || '').replace(/^Bloom continuation\s*/i, '').replace(/^bloom-\d+m-/i, '');
  return t.replace(/-\d{8}-\d{6}(?:-\d+)?$/, '').replace(/-/g, ' ').trim();
}
function familyFromRepo(repo) {
  const known = KNOWN.find(k => k.repo === repo);
  if (known) return { ...known };
  const short = repo.split('/')[1];
  const m = short.match(/(\d+)\.(\d+)/);
  return { repo, name: short.replace(/-/g, ' '), kind: /chat|instruct/i.test(short) ? 'chat' : 'auto', size: '', approxMB: 0,
    desc: 'Published in the Centauri-Bloom organization on Hugging Face.', discovered: true, ver: m ? +m[1] * 1000 + +m[2] : 0 };
}
const familyRank = f => {
  const m = f.repo.match(/(\d+)\.(\d+)/);
  const ver = m ? +m[1] * 1000 + +m[2] : 0;
  return ver * 10 + (f.kind === 'chat' ? 1 : 0);
};
async function getJSON(url, signal) {
  const r = await fetch(url, { signal, cache: 'no-cache' });
  if (!r.ok) throw Error('HTTP ' + r.status);
  return r.json();
}
async function revisionInfo(repo, rev) {
  const suffix = rev === 'main' ? '' : '/revision/' + encodeURIComponent(rev);
  return getJSON(`${HF}/api/models/${repo}${suffix}`);
}
async function discoverFamily(fam) {
  const versions = [];
  const [mainInfo, discussions] = await Promise.all([
    revisionInfo(fam.repo, 'main').catch(() => null),
    getJSON(`${HF}/api/models/${fam.repo}/discussions`).then(d => d.discussions || []).catch(() => [])
  ]);
  if (mainInfo && hasWeightFile(mainInfo) && /^[a-f0-9]{40}$/i.test(mainInfo.sha || '')) {
    versions.push({ rev: 'main', sha: mainInfo.sha, updated: mainInfo.lastModified, label: 'Main', note: 'published' });
  }
  const prs = discussions.filter(d => d.isPullRequest && d.status !== 'closed' && d.status !== 'draft').sort((a, b) => b.num - a.num);
  const infos = await Promise.all(prs.map(pr => revisionInfo(fam.repo, `refs/pr/${pr.num}`).then(info => ({ pr, info })).catch(() => null)));
  for (const item of infos) {
    if (!item || !hasWeightFile(item.info) || !/^[a-f0-9]{40}$/i.test(item.info.sha || '')) continue;
    if (mainInfo && item.info.sha === mainInfo.sha) continue;
    versions.push({ rev: `refs/pr/${item.pr.num}`, sha: item.info.sha, updated: item.info.lastModified, label: `PR #${item.pr.num}`,
      note: [item.pr.status === 'merged' ? 'merged' : 'open PR', runName(item.pr.title)].filter(Boolean).join(' · ') });
  }
  // Latest = main when it has weights, otherwise the newest PR checkpoint.
  return versions.map((v, i) => ({
    id: `${fam.repo}@${v.rev}`, family: fam.name, name: fam.name, kind: fam.kind, size: fam.size, approxMB: fam.approxMB,
    repo: fam.repo, rev: v.rev, sha: v.sha, latest: i === 0, versionLabel: i === 0 ? 'Latest' : v.label,
    meta: [v.note, v.updated ? shortDate(v.updated) : null].filter(Boolean).join(' · ')
  }));
}
async function discover() {
  let repos = KNOWN.map(k => k.repo);
  try {
    const list = await getJSON(`${HF}/api/models?author=${ORG}&full=true`);
    for (const m of list) {
      if (!repos.includes(m.id) && hasWeightFile(m)) repos.push(m.id);
    }
  } catch { /* org listing unavailable: use the known catalog */ }
  const fams = repos.map(familyFromRepo).sort((a, b) => familyRank(b) - familyRank(a));
  const results = await Promise.all(fams.map(f => discoverFamily(f).catch(() => [])));
  const out = [];
  fams.forEach((f, i) => { if (results[i].length) out.push({ ...f, versions: results[i] }); });
  out.push({ name: 'baseline-001', kind: 'text', size: '118.5K', desc: 'The original prototype. Kept for comparison; it produces mostly gibberish.', versions: [BASELINE] });
  return out;
}

/* ---------- model menu ---------- */
const VISIBLE_VERSIONS = 3;
const expanded = new Set();
const kindLabel = kind => kind === 'chat' ? 'Chat' : kind === 'text' ? 'Text completion' : 'Text';
function renderModelMenu() {
  els.modelMenu.replaceChildren();
  for (const fam of families) {
    const g = document.createElement('div'); g.className = 'model-group'; 
    const head = document.createElement('div'); head.className = 'model-group-title';
    const s = document.createElement('strong'); s.textContent = fam.name;
    const k = document.createElement('span'); k.textContent = [fam.size, kindLabel(fam.kind)].filter(Boolean).join(' · ');
    head.append(s, k);
    const d = document.createElement('p'); d.className = 'model-group-desc'; d.textContent = fam.desc;
    g.setAttribute('aria-label', fam.name);
    g.append(head, d);
    const showAll = expanded.has(fam.name) || fam.versions.some((v, i) => i >= VISIBLE_VERSIONS && current && current.id === v.id);
    fam.versions.forEach((m, vi) => {
      if (vi >= VISIBLE_VERSIONS && !showAll) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'model-option'; 
      b.dataset.id = m.id; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(!!(current && current.id === m.id)));
      if (current && current.id === m.id) b.setAttribute('aria-current', 'true');
      const main = document.createElement('span'); main.className = 'opt-main';
      const n = document.createElement('span'); n.className = 'opt-name';
      n.textContent = m === BASELINE ? m.versionLabel : m.rev === 'main' ? 'Main' : m.rev.replace('refs/pr/', 'PR #');
      if (m.latest && m !== BASELINE) { const t = document.createElement('span'); t.className = 'tag tag-latest'; t.textContent = 'latest'; n.append(t); }
      if (!m.latest && m.rev && m.rev.startsWith('refs/pr/')) { const t = document.createElement('span'); t.className = 'tag tag-pr'; t.textContent = 'checkpoint'; n.append(t); }
      const meta = document.createElement('span'); meta.className = 'opt-meta'; meta.textContent = m.meta || '';
      main.append(n, meta);
      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); tick.setAttribute('class', 'tick');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-check'); tick.append(use);
      b.append(main, tick);
      b.addEventListener('click', () => { closeMenus(); selectModel(m.id); });
      g.append(b);
    });
    const hiddenCount = fam.versions.length - VISIBLE_VERSIONS;
    if (hiddenCount > 0 && !showAll) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'model-more';
      more.textContent = `Show ${hiddenCount} earlier checkpoint${hiddenCount === 1 ? '' : 's'}`;
      more.addEventListener('click', () => {
        expanded.add(fam.name); renderModelMenu();
        els.modelMenu.querySelectorAll('.model-option')[0] && [...els.modelMenu.querySelectorAll('.model-option')].find(o => o.dataset.id === fam.versions[VISIBLE_VERSIONS].id)?.focus();
      });
      g.append(more);
    }
    els.modelMenu.append(g);
  }
  const foot = document.createElement('p'); foot.className = 'model-menu-foot';
  foot.textContent = 'Models download once from Hugging Face and run on this device. The 54M models are about 229 MB.';
  els.modelMenu.append(foot);
}
function renderModelButton() {
  els.modelName.textContent = current ? current.name : 'Bloom';
  els.modelVersion.textContent = current ? (current === BASELINE ? '' : current.versionLabel) : '';
  els.modelDot.className = 'model-dot ' + (ready ? 'ready' : loadError ? 'error' : 'loading');
}

/* ---------- loading ---------- */
let loadError = null;
function showLoad(text, fraction, isError) {
  els.load.hidden = false;
  els.load.classList.toggle('error', !!isError);
  els.loadText.textContent = text;
  if (fraction == null) { els.loadFill.classList.add('indeterminate'); els.loadFill.style.width = ''; }
  else { els.loadFill.classList.remove('indeterminate'); els.loadFill.style.width = Math.round(fraction * 100) + '%'; }
}
const mb = n => (n / 1048576).toFixed(n > 1048576 * 10 ? 0 : 1) + ' MB';
async function selectModel(id) {
  const m = models.get(id) || models.get(families[0]?.versions[0]?.id) || BASELINE;
  if (running) return;
  current = m; prefs.modelId = m.id; savePrefs();
  if (loaded === m.id && ready) { renderModelMenu(); renderStarters(); renderModelButton(); return; }
  const token = ++loadToken;
  ready = false; loadError = null;
  renderModelMenu(); renderStarters(); renderModelButton(); syncControls();
  if (!backend) { loadError = 'worker'; showLoad('This browser could not start the inference worker.', 0, true); renderModelButton(); return; }
  backend.abortLoad();
  try {
    let opts;
    if (m === BASELINE) {
      opts = { label: m.name, weightsUrl: m.weightsUrl, expectedSha: m.expectedSha, cfg: m.cfg, tokenizerUrl: null, cacheable: false };
    } else {
      showLoad(`Checking ${m.name}…`, null);
      const info = await revisionInfo(m.repo, m.sha);
      const file = pickWeightFile(info);
      if (!file) throw Error(`${m.name} has no weights on this revision`);
      const base = `${HF}/${m.repo}/resolve/${m.sha}`;
      const [cfg, metrics] = await Promise.all([getJSON(base + '/config.json'), getJSON(base + '/metrics.json').catch(() => ({}))]);
      if (m.kind === 'auto') {
        const instr = metrics.training_track === 'instruction-tuning' && String(metrics.prompt_format || '').includes('Assistant:');
        m.kind = instr ? 'chat' : 'text';
        renderStarters();
      }
      opts = { label: m.name, weightsUrl: `${base}/${file}`, tokenizerUrl: `${base}/tokenizer.json`, cfg,
        expectedSha: file === WEIGHTS_FILE ? (metrics.weights_sha256 || null) : null, cacheable: true };
    }
    if (token !== loadToken) return;
    showLoad(`Downloading ${m.name}…`, null);
    const res = await backend.load(opts, ev => {
      if (token !== loadToken) return;
      if (ev.phase === 'cache') showLoad(`Loading ${m.name} from this browser…`, null);
      else if (ev.phase === 'download') {
        const total = ev.total || (m.approxMB ? m.approxMB * 1048576 : 0);
        showLoad(`Downloading ${m.name} · ${mb(ev.loaded)}${total ? ' of ' + mb(total) : ''}`, total ? Math.min(1, ev.loaded / total) : null);
      } else if (ev.phase === 'install') showLoad(`Checking and installing ${m.name}…`, 1);
    });
    if (token !== loadToken) return;
    loaded = m.id; ready = true;
    if (m.kind === 'auto') m.kind = 'text';
    els.load.hidden = true;
    els.note.textContent = `${m.name} · ${res.params.toLocaleString()} parameters · ${res.cached ? 'loaded from this browser' : mb(res.bytes) + ' downloaded'} · runs on your device`;
  } catch (err) {
    if (err.name === 'AbortError' || token !== loadToken) return;
    loadError = err.message;
    showLoad(`Could not load ${m.name}: ${err.message}. Try another model or reload.`, 0, true);
  }
  renderModelButton(); syncControls();
}

/* ---------- rendering ---------- */
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + name); s.append(u); return s;
}
function renderStarters() {
  const kind = current && current.kind === 'chat' ? 'chat' : 'text';
  els.starters.replaceChildren(...STARTERS[kind].map(([tag, text]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'starter';
    const t = document.createElement('span'); t.textContent = tag;
    b.append(t, document.createTextNode(text));
    b.addEventListener('click', () => { els.input.value = text; autosize(); els.input.focus(); if (ready && !running) submit(); });
    return b;
  }));
  els.input.placeholder = kind === 'chat' ? 'Message Bloom' : 'Start some text for Bloom to continue';
}
function renderHistory() {
  els.history.replaceChildren();
  if (!store.chats.length) {
    const p = document.createElement('p'); p.className = 'history-empty'; p.textContent = 'No chats yet.'; els.history.append(p); return;
  }
  for (const c of store.chats) {
    const row = document.createElement('div'); row.className = 'history-item' + (c.id === store.activeId ? ' active' : '');
    const open = document.createElement('button'); open.type = 'button'; open.className = 'open'; open.textContent = c.title || 'New chat';
    if (c.id === store.activeId) open.setAttribute('aria-current', 'true');
    open.addEventListener('click', () => { if (running) return; store.activeId = c.id; saveStore(); renderAll(); closeDrawer(); });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.setAttribute('aria-label', 'Delete chat: ' + (c.title || 'New chat'));
    del.append(icon('i-trash'));
    del.addEventListener('click', () => {
      if (running && c.id === store.activeId) return;
      store.chats = store.chats.filter(x => x.id !== c.id);
      if (store.activeId === c.id) store.activeId = null;
      saveStore(); renderAll();
    });
    row.append(open, del); els.history.append(row);
  }
}
function messageNode(msg, index, chat) {
  const wrap = document.createElement('article');
  if (msg.role === 'user') {
    wrap.className = 'msg msg-user';
    const b = document.createElement('div'); b.className = 'bubble';
    const p = document.createElement('p'); p.className = 'text'; p.textContent = msg.text; b.append(p); wrap.append(b);
    return { wrap };
  }
  wrap.className = 'msg msg-bot';
  const av = document.createElement('div'); av.className = 'avatar'; av.append(icon('bloom-mark'));
  const body = document.createElement('div'); body.className = 'body';
  const who = document.createElement('div'); who.className = 'who';
  const nm = document.createElement('b'); nm.textContent = msg.modelName || 'Bloom';
  who.append(nm, document.createTextNode(msg.kind === 'text' ? ' · continued your text' : msg.modelVersion ? ' · ' + msg.modelVersion : ''));
  const p = document.createElement('p'); p.className = 'text'; p.textContent = msg.text;
  const meta = document.createElement('div'); meta.className = 'meta';
  body.append(who, p, meta); wrap.append(av, body);
  fillMeta(meta, msg, index, chat);
  return { wrap, p, meta };
}
function fillMeta(meta, msg, index, chat) {
  meta.replaceChildren();
  if (msg.pending) return;
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'act'; copy.append(icon('i-copy'), document.createTextNode('Copy'));
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(msg.text); copy.lastChild.textContent = 'Copied'; setTimeout(() => { copy.lastChild.textContent = 'Copy'; }, 1400); } catch { /* clipboard blocked */ }
  });
  meta.append(copy);
  if (chat && index === chat.messages.length - 1) {
    const again = document.createElement('button'); again.type = 'button'; again.className = 'act'; again.append(icon('i-retry'), document.createTextNode('Retry'));
    again.addEventListener('click', () => regenerate());
    again.disabled = !ready || running;
    meta.append(again);
  }
  if (msg.stats) {
    const s = document.createElement('span'); s.className = msg.stopped ? 'stopped' : ''; s.textContent = msg.stats; meta.append(s);
  }
}
function renderThread() {
  const chat = activeChat();
  els.messages.replaceChildren();
  const has = chat && chat.messages.length;
  els.empty.hidden = !!has;
  if (!has) return;
  chat.messages.forEach((m, i) => els.messages.append(messageNode(m, i, chat).wrap));
  scrollToBottom(true);
}
function renderAll() { renderHistory(); renderThread(); syncControls(); }

/* ---------- scrolling ---------- */
let stick = true;
const nearBottom = () => els.thread.scrollHeight - els.thread.scrollTop - els.thread.clientHeight < 80;
function scrollToBottom(force) {
  if (force || stick) {
    els.thread.style.scrollBehavior = 'auto';
    els.thread.scrollTop = els.thread.scrollHeight;
    els.thread.style.scrollBehavior = '';
  }
  els.jump.hidden = nearBottom();
}
els.thread.addEventListener('scroll', () => { stick = nearBottom(); els.jump.hidden = stick; }, { passive: true });
els.jump.addEventListener('click', () => { stick = true; els.thread.scrollTo({ top: els.thread.scrollHeight, behavior: 'smooth' }); });

/* ---------- generation ---------- */
function buildPrompt(chat, upto, text) {
  if (current.kind !== 'chat') return text;
  let prompt = `User: ${text}\nAssistant:`;
  if (!prefs.memory) return prompt;
  for (let i = upto - 1; i > 0; i--) {
    const bot = chat.messages[i], user = chat.messages[i - 1];
    if (bot.role !== 'bot' || user.role !== 'user' || bot.kind !== 'chat' || !bot.text) { i--; continue; }
    const pair = `User: ${user.text}\nAssistant: ${bot.text}\n`;
    if (pair.length + prompt.length > MEMORY_CHARS) break;
    prompt = pair + prompt; i--;
  }
  return prompt;
}
function syncControls() {
  const hasText = els.input.value.trim().length > 0;
  els.send.classList.toggle('stop', running);
  els.send.replaceChildren(icon(running ? 'i-stop' : 'i-send'));
  els.send.setAttribute('aria-label', running ? 'Stop generating' : 'Send');
  els.send.disabled = running ? false : !(ready && hasText);
  els.modelButton.disabled = running;
  els.starters.querySelectorAll('button').forEach(b => { b.disabled = !ready; });
  document.querySelectorAll('[data-new-chat]').forEach(b => { b.disabled = running; });
  els.messages.querySelectorAll('.meta .act:last-of-type').forEach(b => { if (b.textContent === 'Retry') b.disabled = !ready || running; });
}
function newChat() {
  if (running) return;
  store.activeId = null; saveStore(); renderAll(); closeDrawer();
  els.input.focus();
}
async function runGeneration(chat, botIndex, userText) {
  const msg = chat.messages[botIndex];
  const node = els.messages.children[botIndex];
  const p = node.querySelector('.text'), meta = node.querySelector('.meta');
  node.classList.add('generating');
  p.replaceChildren();
  const dots = document.createElement('span'); dots.className = 'thinking'; dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  p.append(dots);
  running = true; stick = true; syncControls();
  backend.setHidden(document.hidden);
  const chatMode = current.kind === 'chat';
  try {
    const res = await backend.generate({
      prompt: buildPrompt(chat, botIndex - 1, userText), chat: chatMode,
      temp: Number(prefs.temp), limit: Number(prefs.length), economy: !!prefs.economy
    }, ev => {
      const t = chatMode ? ev.text.replace(/^\s+/, '') : ev.text;
      if (t) { p.textContent = t; msg.text = t; }
      scrollToBottom();
    });
    msg.text = (chatMode ? res.text : res.text) || '';
    if (!msg.text.trim()) msg.text = chatMode ? '(No reply. Try again or raise the temperature.)' : '(No text generated.)';
    msg.stopped = res.reason === 'Stopped';
    msg.stats = `${res.reason} · ${res.count} ${res.units} · ${res.rate.toFixed(1)}/s`;
  } catch (err) {
    msg.text = msg.text || 'Generation failed.';
    msg.stats = 'Error: ' + err.message;
  }
  delete msg.pending;
  p.textContent = msg.text;
  node.classList.remove('generating');
  running = false;
  chat.updated = Date.now(); saveStore();
  fillMeta(meta, msg, botIndex, chat);
  renderHistory(); syncControls(); scrollToBottom();
}
async function submit() {
  const text = els.input.value.trim();
  if (!text || !ready || running) return;
  let chat = activeChat();
  if (!chat) {
    chat = { id: uid(), title: text.slice(0, 60), created: Date.now(), updated: Date.now(), messages: [] };
    store.chats.unshift(chat); store.activeId = chat.id;
  }
  els.input.value = ''; autosize();
  chat.messages.push({ role: 'user', text });
  chat.messages.push({ role: 'bot', text: '', pending: true, modelId: current.id, modelName: current.name, modelVersion: current === BASELINE ? '' : current.versionLabel, kind: current.kind });
  chat.updated = Date.now(); saveStore();
  renderHistory();
  els.empty.hidden = true;
  const len = chat.messages.length;
  els.messages.append(messageNode(chat.messages[len - 2], len - 2, chat).wrap, messageNode(chat.messages[len - 1], len - 1, chat).wrap);
  scrollToBottom(true);
  await runGeneration(chat, len - 1, text);
}
async function regenerate() {
  const chat = activeChat();
  if (!chat || running || !ready) return;
  const i = chat.messages.length - 1;
  if (i < 1 || chat.messages[i].role !== 'bot') return;
  const userText = chat.messages[i - 1].text;
  chat.messages[i] = { role: 'bot', text: '', pending: true, modelId: current.id, modelName: current.name, modelVersion: current === BASELINE ? '' : current.versionLabel, kind: current.kind };
  const old = els.messages.children[i];
  old.replaceWith(messageNode(chat.messages[i], i, chat).wrap);
  await runGeneration(chat, i, userText);
}

/* ---------- composer ---------- */
function autosize() {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, 192) + 'px';
  syncControls();
}
els.input.addEventListener('input', autosize);
els.input.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  submit();
});
els.form.addEventListener('submit', e => {
  e.preventDefault();
  if (running) { backend.stop(); return; }
  submit();
});
document.querySelectorAll('[data-new-chat]').forEach(b => b.addEventListener('click', newChat));

/* ---------- menus, drawer, settings ---------- */
function closeMenus() {
  els.modelMenu.hidden = true; els.modelButton.setAttribute('aria-expanded', 'false');
  els.settings.hidden = true; els.settingsButton.setAttribute('aria-expanded', 'false');
}
els.modelButton.addEventListener('click', e => {
  e.stopPropagation();
  const open = els.modelMenu.hidden;
  closeMenus();
  if (open) {
    els.modelMenu.hidden = false; els.modelButton.setAttribute('aria-expanded', 'true');
    (els.modelMenu.querySelector('[aria-current="true"]') || els.modelMenu.querySelector('button'))?.focus();
  }
});
els.settingsButton.addEventListener('click', e => {
  e.stopPropagation();
  const open = els.settings.hidden;
  closeMenus();
  if (open) { els.settings.hidden = false; els.settingsButton.setAttribute('aria-expanded', 'true'); }
});
[els.modelMenu, els.settings].forEach(el => el.addEventListener('click', e => e.stopPropagation()));
document.addEventListener('click', closeMenus);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeMenus(); closeDrawer(); }
  if (!els.modelMenu.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const opts = [...els.modelMenu.querySelectorAll('.model-option')];
    const i = opts.indexOf(document.activeElement);
    const next = opts[(i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length];
    if (next) { e.preventDefault(); next.focus(); }
  }
});
function openDrawer() { app.classList.add('drawer-open'); els.scrim.hidden = false; els.openSide.setAttribute('aria-expanded', 'true'); }
function closeDrawer() { app.classList.remove('drawer-open'); els.scrim.hidden = true; els.openSide.setAttribute('aria-expanded', 'false'); }
els.openSide.addEventListener('click', openDrawer);
els.closeSide.addEventListener('click', closeDrawer);
els.scrim.addEventListener('click', closeDrawer);

els.length.value = prefs.length; els.temp.value = prefs.temp; els.memory.checked = !!prefs.memory; els.economy.checked = !!prefs.economy;
els.length.addEventListener('change', () => { prefs.length = els.length.value; savePrefs(); });
els.temp.addEventListener('change', () => { prefs.temp = els.temp.value; savePrefs(); });
els.memory.addEventListener('change', () => { prefs.memory = els.memory.checked; savePrefs(); });
els.economy.addEventListener('change', () => { prefs.economy = els.economy.checked; savePrefs(); });
els.clearCache.addEventListener('click', async () => {
  if (!backend) return;
  const r = await backend.clearCache().catch(() => ({ ok: false }));
  els.clearCache.textContent = r.ok ? 'Downloaded models removed' : 'Nothing to remove';
  setTimeout(() => { els.clearCache.textContent = 'Remove downloaded models from this browser'; }, 2000);
});
document.addEventListener('visibilitychange', () => { if (backend) backend.setHidden(document.hidden); });

/* ---------- start ---------- */
async function start() {
  renderAll();
  renderStarters();
  showLoad('Finding Bloom models on Hugging Face…', null);
  try { families = await discover(); }
  catch { families = [{ name: 'baseline-001', kind: 'text', size: '118.5K', desc: '', versions: [BASELINE] }]; }
  models.clear();
  families.forEach(f => f.versions.forEach(v => models.set(v.id, v)));
  const params = new URLSearchParams(location.search);
  const wanted = params.get('model');
  const pick = (wanted && [...models.values()].find(m => m.id === wanted || m.name.toLowerCase().replace(/\s+/g, '-') === wanted.toLowerCase()))
    || families[0].versions[0];
  // Newest model is always the default; ?model= picks another (for links).
  selectModel(pick.id);
}
start();
