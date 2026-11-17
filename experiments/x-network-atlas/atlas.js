/* X Network Atlas v0.1. No API keys, external graph libraries, or archive uploads. */
(() => {
  'use strict';
  const CENTER = 'rosch_weston';
  const STORAGE_KEY = 'weston-x-network-atlas-v1';
  const MAX_IMPORT_BYTES = 60 * 1024 * 1024;
  const MAX_NODES = 20000;
  const palette = { me: '#f2f5f8', mutual: '#8fd1ae', following: '#5cc8f5', follower: '#b7a4f5', interaction: '#e8b970' };
  const $ = (id) => document.getElementById(id);
  const canvas = $('atlas-canvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const tooltip = $('atlas-tooltip');
  let nodes = new Map();
  let byHandle = new Map();
  let byId = new Map();
  let mode = 'demo';
  let selectedKey = 'center';
  let filter = 'all';
  let limit = 300;
  let visible = [];
  let view = { width: 0, height: 0, scale: 1, panX: 0, panY: 0 };
  const pointers = new Map();
  let drag = null;
  let pinchDistance = null;
  let activeHover = null;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderPending = false;

  function setStatus(message) { $('atlas-status').textContent = message; }
  function normHandle(value) {
    const handle = String(value || '').trim().replace(/^@/, '');
    return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle.toLowerCase() : '';
  }
  function safeId(value) {
    const id = String(value == null ? '' : value).trim();
    return /^\d{3,24}$/.test(id) ? id : '';
  }
  function category(n) {
    if (n.following && n.follower) return 'mutual';
    if (n.following) return 'following';
    if (n.follower) return 'follower';
    return 'interaction';
  }
  function score(n) { return n.replies * 6 + n.mentions * 2 + (n.follower && n.following ? 5 : 0) + (n.following ? 1 : 0); }
  function label(n) { return n.handle ? '@' + n.handle : n.sample ? n.name : 'Account ID ' + n.id; }
  function nodeKey(n) { return n.id ? 'id:' + n.id : 'handle:' + n.handle; }
  function findOrCreate(idValue, handleValue, sample = false) {
    const id = safeId(idValue), handle = normHandle(handleValue);
    if (!id && !handle) return null;
    if (handle === CENTER) return null;
    let existing = (id && byId.get(id)) || (handle && byHandle.get(handle));
    if (!existing && nodes.size >= MAX_NODES) return null;
    if (!existing) {
      existing = { id, handle, name: '', following: false, follower: false, mentions: 0, replies: 0, sample: !!sample, x: 0, y: 0 };
      nodes.set(nodeKey(existing), existing);
    }
    // An account ID discovered in a post can resolve an archive node with no handle.
    if (id && !existing.id) {
      const former = nodeKey(existing);
      existing.id = id;
      nodes.delete(former);
      nodes.set(nodeKey(existing), existing);
      if (selectedKey === former) selectedKey = nodeKey(existing);
    }
    if (handle) { existing.handle = handle; byHandle.set(handle, existing); }
    if (id) byId.set(id, existing);
    if (sample) existing.sample = true;
    return existing;
  }
  function clearState() { nodes = new Map(); byHandle = new Map(); byId = new Map(); selectedKey = 'center'; }
  function loadDemo() {
    clearState();
    mode = 'demo';
    const types = ['mutual', 'following', 'follower', 'interaction'];
    for (let i = 0; i < 48; i++) {
      const kind = types[i % 4], n = findOrCreate('', `sample_${String(i + 1).padStart(2, '0')}`, true);
      n.name = `Illustrative account ${i + 1}`;
      n.following = kind === 'mutual' || kind === 'following';
      n.follower = kind === 'mutual' || kind === 'follower';
      n.mentions = kind === 'interaction' ? 1 + (i % 8) : i % 9 === 0 ? 2 : 0;
      n.replies = kind === 'interaction' ? i % 3 : 0;
    }
    updateAll(true);
    setStatus('Illustrative demonstration loaded. Import archive files to replace it.');
  }
  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, mode, nodes: Array.from(nodes.values()).map(({ id, handle, name, following, follower, mentions, replies, sample }) => ({ id, handle, name, following, follower, mentions, replies, sample })) }));
    } catch {
      setStatus('Storage is unavailable or full; this graph will reset when you leave. Use Export JSON to save it.');
    }
  }
  function restore(input) {
    if (!input || !Array.isArray(input.nodes)) throw new Error('Not a network atlas JSON export.');
    if (input.nodes.length > MAX_NODES) throw new Error('Too many accounts in the JSON file.');
    clearState();
    mode = input.mode === 'demo' ? 'demo' : 'local';
    for (const item of input.nodes) {
      const n = findOrCreate(item.id, item.handle, mode === 'demo');
      if (!n) continue;
      n.name = typeof item.name === 'string' ? item.name.slice(0, 100) : '';
      n.following = !!item.following;
      n.follower = !!item.follower;
      n.mentions = Math.min(100000, Math.max(0, Number(item.mentions) || 0));
      n.replies = Math.min(100000, Math.max(0, Number(item.replies) || 0));
      n.sample = mode === 'demo';
    }
  }
  function loadSaved() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) { restore(JSON.parse(saved)); updateAll(true); setStatus('Saved graph restored from this browser.'); return; }
    } catch { /* Corrupt/blocked local storage: use demo without crashing. */ }
    loadDemo();
  }
  function graphFiltered() {
    let list = [...nodes.values()].filter(n => {
      if (filter === 'mutual') return n.follower && n.following;
      if (filter === 'following') return n.following;
      if (filter === 'follower') return n.follower;
      if (filter === 'interaction') return n.mentions > 0 || n.replies > 0;
      return true;
    });
    list.sort((a, b) => score(b) - score(a) || label(a).localeCompare(label(b)));
    return list.slice(0, limit);
  }
  function updateLayout() {
    visible = graphFiltered();
    const buckets = { mutual: [], following: [], follower: [], interaction: [] };
    visible.forEach(n => buckets[category(n)].push(n));
    const base = { mutual: 110, following: 195, follower: 265, interaction: 330 };
    const phase = { mutual: .45, following: 1.9, follower: 3.15, interaction: 4.4 };
    Object.keys(buckets).forEach(group => {
      buckets[group].forEach((n, i) => {
        const angle = phase[group] + i * 2.3999632297;
        const radius = base[group] + Math.sqrt(i) * 14;
        n.x = Math.cos(angle) * radius;
        n.y = Math.sin(angle) * radius;
      });
    });
    $('atlas-visible-count').textContent = `${visible.length.toLocaleString()} / ${nodes.size.toLocaleString()} accounts shown`;
  }
  function updateStats() {
    const all = [...nodes.values()];
    $('stat-accounts').textContent = all.length.toLocaleString();
    $('stat-following').textContent = all.filter(n => n.following).length.toLocaleString();
    $('stat-followers').textContent = all.filter(n => n.follower).length.toLocaleString();
    $('stat-mutuals').textContent = all.filter(n => n.follower && n.following).length.toLocaleString();
    $('stat-mentions').textContent = all.reduce((sum, n) => sum + n.mentions, 0).toLocaleString();
    const modeEl = $('atlas-mode');
    modeEl.classList.toggle('real', mode !== 'demo');
    modeEl.textContent = mode === 'demo'
      ? 'ILLUSTRATIVE DEMO — Fictional accounts and connections; not my actual X network.'
      : 'LOCAL DATA — Imported and manual relationships in this browser only. Nothing uploaded or published.';
  }
  function updateDetails() {
    const n = nodes.get(selectedKey);
    const self = !n;
    $('atlas-selected-name').textContent = self ? '@' + CENTER : label(n);
    $('atlas-selected-meta').textContent = self ? 'Center account / @' + CENTER : mode === 'demo' ? 'Fictional example, not a real X account' : n.name || (n.id ? 'X archive account ID: ' + n.id : 'Imported account');
    const rows = self ? [
      ['Role', 'Center account'], ['Network', mode === 'demo' ? 'Demo' : 'Local archive'], ['Scope', 'First degree']
    ] : [
      ['Relationship', category(n) === 'mutual' ? 'Mutual follow' : category(n) === 'following' ? 'Following' : category(n) === 'follower' ? 'Follower' : 'Mention / reply'],
      ['I follow', n.following ? 'Yes' : 'Not in data'],
      ['Follows me', n.follower ? 'Yes' : 'Not in data'],
      ['Mentions', n.mentions.toLocaleString()],
      ['Replies', n.replies.toLocaleString()]
    ];
    const facts = $('atlas-selected-facts');
    facts.replaceChildren();
    for (const [name, value] of rows) {
      const row = document.createElement('div');
      const k = document.createElement('span'), v = document.createElement('strong');
      k.textContent = name; v.textContent = value;
      row.append(k, v); facts.append(row);
    }
    const link = $('atlas-selected-link');
    link.hidden = !self && (mode === 'demo' || (!n.handle && !n.id));
    if (!link.hidden) link.href = self ? 'https://x.com/' + CENTER : n.handle ? 'https://x.com/' + encodeURIComponent(n.handle) : 'https://x.com/i/user/' + encodeURIComponent(n.id);
    link.textContent = self ? 'View @' + CENTER + ' on X ↗' : 'View X profile ↗';
  }
  function fit() {
    const max = Math.max(185, ...visible.map(n => Math.hypot(n.x, n.y) + 20));
    view.scale = Math.max(.19, Math.min(2, Math.min((view.width - 90) / (max * 2), (view.height - 130) / (max * 2))));
    view.panX = 0; view.panY = 0; scheduleDraw();
  }
  function updateAll(shouldFit = false) {
    updateStats(); updateLayout(); updateDetails(); updateResults();
    if (shouldFit) fit(); else scheduleDraw();
  }
  function screenPos(n) {
    return { x: view.width / 2 + view.panX + n.x * view.scale, y: view.height / 2 + view.panY + n.y * view.scale };
  }
  function visualRadius(n) { return Math.min(9.4, 4.5 + Math.sqrt(n.mentions + n.replies * 2) * .6); }
  function hitTest(x, y) {
    const cx = view.width / 2 + view.panX, cy = view.height / 2 + view.panY;
    if (Math.hypot(x - cx, y - cy) < 16) return 'center';
    for (let i = visible.length - 1; i >= 0; i--) {
      const n = visible[i], p = screenPos(n);
      if (Math.hypot(x - p.x, y - p.y) < Math.max(10, visualRadius(n) * view.scale + 5)) return nodeKey(n);
    }
    return null;
  }
  function draw() {
    renderPending = false;
    if (!view.width || !view.height) return;
    const { width: w, height: h } = view;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(w * .49, h * .49, 25, w * .5, h * .5, Math.max(w, h) * .82);
    bg.addColorStop(0, '#0b1d2b'); bg.addColorStop(.55, '#071321'); bg.addColorStop(1, '#050b13');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 190; i++) {
      const x = ((i * 157.31 + 27) % 991) / 991 * w, y = ((i * 393.71 + 93) % 997) / 997 * h;
      ctx.fillStyle = i % 7 ? 'rgba(155,186,215,.11)' : 'rgba(155,186,215,.27)';
      ctx.fillRect(x, y, i % 13 === 0 ? 1.5 : .8, i % 13 === 0 ? 1.5 : .8);
    }
    ctx.save();
    ctx.translate(w / 2 + view.panX, h / 2 + view.panY);
    ctx.scale(view.scale, view.scale);
    for (const radius of [110, 195, 265, 330, 440, 550]) {
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(128,167,193,.10)'; ctx.lineWidth = 1 / view.scale; ctx.stroke();
    }
    ctx.setLineDash([3 / view.scale, 7 / view.scale]);
    ctx.beginPath(); ctx.moveTo(-650, 0); ctx.lineTo(650, 0); ctx.moveTo(0, -650); ctx.lineTo(0, 650);
    ctx.strokeStyle = 'rgba(143,179,201,.075)'; ctx.stroke(); ctx.setLineDash([]);
    for (const n of visible) {
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(n.x,n.y);
      ctx.strokeStyle = nodeKey(n) === selectedKey ? 'rgba(242,245,248,.74)' : (n.mentions > 0 ? 'rgba(232,185,112,.24)' : 'rgba(110,163,197,.135)');
      ctx.lineWidth = (nodeKey(n) === selectedKey ? 1.6 : .75) / view.scale;
      ctx.stroke();
    }
    for (const n of visible) {
      const selected = nodeKey(n) === selectedKey, hovered = nodeKey(n) === activeHover;
      const r = visualRadius(n) / Math.sqrt(view.scale) * .9;
      const color = palette[category(n)];
      if (selected || hovered) {
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 7 / view.scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.globalAlpha = selected || hovered ? 1 : .86; ctx.fill(); ctx.globalAlpha = 1;
      if (selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4 / view.scale; ctx.stroke(); }
    }
    const centerGlow = ctx.createRadialGradient(0,0,1,0,0,55);
    centerGlow.addColorStop(0,'rgba(92,200,245,.28)');centerGlow.addColorStop(1,'rgba(92,200,245,0)');
    ctx.fillStyle=centerGlow;ctx.beginPath();ctx.arc(0,0,55,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(0,0,13 / Math.sqrt(view.scale),0,Math.PI*2);
    ctx.fillStyle='#f2f5f8';ctx.fill();ctx.strokeStyle='#5cc8f5';ctx.lineWidth=2 / view.scale;ctx.stroke();
    // Legible labels at any zoom; only annotate the most relevant accounts.
    ctx.font = `${12 / view.scale}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = 'rgba(238,246,251,.9)';
    ctx.fillText('@' + CENTER, 20 / view.scale, -12 / view.scale);
    const interesting = visible.filter(n => n.handle).slice().sort((a,b) => score(b)-score(a));
    const labelKeys = new Set(interesting.slice(0, view.scale > .75 ? 16 : 7).map(nodeKey));
    for (const n of visible) {
      if (nodeKey(n) !== selectedKey && nodeKey(n) !== activeHover && !labelKeys.has(nodeKey(n))) continue;
      ctx.fillStyle = 'rgba(231,239,248,.86)';
      ctx.font = `${11 / view.scale}px "IBM Plex Mono", monospace`;
      ctx.fillText(label(n).slice(0, 24), n.x + (11 / view.scale), n.y - 7 / view.scale);
    }
    ctx.restore();
  }
  function scheduleDraw() {
    if (!renderPending) { renderPending = true; requestAnimationFrame(draw); }
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const prev = view.width;
    view.width = Math.max(200, rect.width);
    view.height = Math.max(240, rect.height);
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!prev) fit(); else scheduleDraw();
  }
  function updateResults() {
    const query = $('atlas-search').value.trim().toLowerCase().replace(/^@/, '');
    const root = $('atlas-results'); root.replaceChildren();
    if (!query) return;
    const matches = [...nodes.values()].filter(n => (n.handle || '').includes(query) || (n.id || '').includes(query) || (n.name || '').toLowerCase().includes(query)).slice(0,8);
    if (!matches.length) {
      const msg = document.createElement('div'); msg.className = 'atlas-result'; msg.textContent = 'No matching account'; root.append(msg); return;
    }
    for (const n of matches) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'atlas-result'; b.setAttribute('role','listitem');
      const title=document.createElement('span');title.textContent=label(n);
      const rel=document.createElement('small');rel.textContent=category(n);
      b.append(title,rel); b.addEventListener('click',()=>selectNode(nodeKey(n),true));root.append(b);
    }
  }
  function selectNode(key, centerOn = false) {
    if (key !== 'center' && !nodes.has(key)) return;
    if (key !== 'center' && !visible.some(n=>nodeKey(n)===key)) {
      filter='all'; $('atlas-filter').value='all';
      // Increase the limit if possible so a searched account can be selected.
      if (!graphFiltered().some(n=>nodeKey(n)===key)) {
        limit=1200; $('atlas-limit').value='1200';
      }
      updateLayout();
    }
    selectedKey=key;updateDetails();
    if (centerOn) {
      if (key==='center') {view.panX=0;view.panY=0;}
      else {const n=nodes.get(key);view.panX=-n.x*view.scale;view.panY=-n.y*view.scale;}
    }
    scheduleDraw();
  }
  function eventXY(event) {
    const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};
  }
  function updateTooltip(key,point) {
    if (key === activeHover && !tooltip.hidden) {
      tooltip.style.left = Math.min(view.width-150, point.x+14)+'px';
      tooltip.style.top = Math.min(view.height-60, point.y+14)+'px';return;
    }
    activeHover = key;
    if (!key) {tooltip.hidden = true;canvas.style.cursor='grab';scheduleDraw();return;}
    const n=nodes.get(key);
    tooltip.textContent = !n ? '@'+CENTER+' · center' : label(n)+' · '+category(n);
    tooltip.hidden = false;
    tooltip.style.left=Math.max(5,Math.min(view.width-150,point.x+14))+'px';
    tooltip.style.top=Math.max(5,Math.min(view.height-60,point.y+14))+'px';
    canvas.style.cursor='pointer';scheduleDraw();
  }
  function zoomAround(factor, x, y) {
    const before=view.scale, next=Math.max(.12,Math.min(4.5,before*factor));
    const ax=x-view.width/2-view.panX, ay=y-view.height/2-view.panY;
    view.panX+=ax*(1-next/before);view.panY+=ay*(1-next/before);
    view.scale=next;scheduleDraw();
  }
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=eventXY(e);zoomAround(Math.exp(-e.deltaY*.0011),p.x,p.y);},{passive:false});
  canvas.addEventListener('pointerdown',e=>{
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,eventXY(e));
    if (pointers.size===1) {const p=eventXY(e);drag={id:e.pointerId,start:p,last:p,moved:false};}
    if (pointers.size===2) {const pp=[...pointers.values()];pinchDistance=Math.hypot(pp[0].x-pp[1].x,pp[0].y-pp[1].y);drag=null;}
    tooltip.hidden=true;activeHover=null;
  });
  canvas.addEventListener('pointermove',e=>{
    const p=eventXY(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId,p);
    if(pointers.size===2) {
      const ps=[...pointers.values()];const d=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);
      if (pinchDistance && d) zoomAround(d/pinchDistance,(ps[0].x+ps[1].x)/2,(ps[0].y+ps[1].y)/2);
      pinchDistance=d;return;
    }
    if(drag&&drag.id===e.pointerId) {
      if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>5)drag.moved=true;
      if(drag.moved){view.panX+=p.x-drag.last.x;view.panY+=p.y-drag.last.y;canvas.classList.add('dragging');scheduleDraw();}
      drag.last=p;return;
    }
    if(e.pointerType==='mouse')updateTooltip(hitTest(p.x,p.y),p);
  });
  function releasePointer(e) {
    const p=eventXY(e);
    if(drag&&drag.id===e.pointerId&&!drag.moved)selectNode(hitTest(p.x,p.y)||'center');
    pointers.delete(e.pointerId);drag=null;canvas.classList.remove('dragging');pinchDistance=null;
    if (pointers.size===1) {const [id, pos]=[...pointers.entries()][0];drag={id,start:pos,last:pos,moved:true};}
  }
  canvas.addEventListener('pointerup',releasePointer);
  canvas.addEventListener('pointercancel',releasePointer);
  canvas.addEventListener('pointerleave',()=>{activeHover=null;tooltip.hidden=true;scheduleDraw();});
  canvas.addEventListener('keydown',e=>{
    if(e.key==='+'||e.key==='='){e.preventDefault();zoomAround(1.15,view.width/2,view.height/2);}
    if(e.key==='-'){e.preventDefault();zoomAround(.86,view.width/2,view.height/2);}
    if(e.key==='Escape'){selectNode('center',true);}
    if(e.key.startsWith('Arrow')){
      e.preventDefault();view.panX+=e.key==='ArrowRight'?-30:e.key==='ArrowLeft'?30:0;
      view.panY+=e.key==='ArrowDown'?-30:e.key==='ArrowUp'?30:0;scheduleDraw();
    }
  });
  $('atlas-search').addEventListener('input',updateResults);
  $('atlas-filter').addEventListener('change',e=>{filter=e.target.value;updateLayout();fit();});
  $('atlas-limit').addEventListener('change',e=>{limit=Number(e.target.value)||300;updateLayout();fit();});
  $('atlas-fit').addEventListener('click',fit);
  $('atlas-demo').addEventListener('click',()=>{
    if(mode !== 'demo' && nodes.size && !confirm('Replace your local graph with illustrative demo accounts? Export your data first if needed.'))return;
    loadDemo();saveLocal();
  });
  $('atlas-clear').addEventListener('click',()=>{
    if(!confirm('Remove this network from your browser? This cannot be undone unless you exported JSON.'))return;
    clearState();mode='local';updateAll(true);saveLocal();setStatus('Local graph cleared. Add accounts or import your archive.');
  });
  $('atlas-add').addEventListener('submit',e=>{
    e.preventDefault();const handle=normHandle($('atlas-handle').value);
    if(!handle||handle===CENTER){setStatus('Enter another valid X handle (1–15 letters, numbers, or underscores).');return;}
    if(mode==='demo'){clearState();mode='local';}
    const n=findOrCreate('',handle);
    if(!n){setStatus('Account limit reached.');return;}
    const relationship=$('atlas-relation').value;
    if(relationship==='mutual'){n.following=true;n.follower=true;}
    else if(relationship==='following')n.following=true;
    else if(relationship==='follower')n.follower=true;
    else n.mentions++;
    $('atlas-handle').value='';updateAll(true);saveLocal();selectNode(nodeKey(n));setStatus('Added @'+handle+' locally.');
  });
  function stripXWrapper(text) {
    const t=text.replace(/^\uFEFF/,'').trim();
    if(t.startsWith('[')||t.startsWith('{'))return JSON.parse(t);
    const m=t.match(/^window\.YTD\.[A-Za-z0-9_]+\.part\d+\s*=\s*/);
    if(!m)throw new Error('Unsupported X archive file format.');
    return JSON.parse(t.slice(m[0].length).replace(/;\s*$/,''));
  }
  function archiveId(row) {
    const v=row.accountId||row.userId||row.id||row.id_str;
    if(safeId(v))return safeId(v);
    const link=String(row.userLink||row.url||'');
    return (link.match(/(?:user_id=|\/i\/user\/)(\d{3,24})/)||[])[1]||'';
  }
  function importArchiveList(entries, type) {
    if(!Array.isArray(entries))throw new Error('Expected a list of archive records.');
    let added=0;
    for(const row0 of entries){
      const row=(row0 && (row0[type]||row0))||{};
      const id=archiveId(row);
      const handle=normHandle(row.screen_name||row.screenName||row.handle||row.username);
      const n=findOrCreate(id,handle);
      if(!n)continue;
      if(type==='following')n.following=true;
      else n.follower=true;
      added++;
    }
    return added;
  }
  function importTweets(entries) {
    if(!Array.isArray(entries))throw new Error('Expected a list of posts.');
    let matched=0;
    for(const item of entries){
      const t=item&& (item.tweet||item);
      if(!t||typeof t!=='object')continue;
      if(t.retweeted_status||/^RT @/i.test(t.full_text||t.text||''))continue;
      const mentions=Array.isArray(t.entities?.user_mentions)?t.entities.user_mentions:[];
      const seen=new Set();
      for(const m of mentions){
        const id=archiveId(m),handle=normHandle(m.screen_name||m.screenName);
        const n=findOrCreate(id,handle);
        if(n&&!seen.has(n)){n.mentions++;seen.add(n);matched++;}
      }
      if(!mentions.length){
        const text=String(t.full_text||t.text||'');
        for(const m of text.matchAll(/(^|[^\w@])@([A-Za-z0-9_]{1,15})\b/g)){
          const n=findOrCreate('',m[2]);
          if(n&&!seen.has(n)){n.mentions++;seen.add(n);matched++;}
        }
      }
      const replyId=safeId(t.in_reply_to_user_id_str||t.in_reply_to_user_id);
      const replyHandle=normHandle(t.in_reply_to_screen_name);
      const reply=replyId||replyHandle?findOrCreate(replyId,replyHandle):null;
      if(reply){reply.replies++;if(!seen.has(reply)){reply.mentions++;matched++;}}
    }
    return matched;
  }
  function importDelimited(text) {
    const rows=text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
    let imported=0;
    for(let i=0;i<rows.length;i++){
      const [rawHandle,rawRelation]=rows[i].split(',').map(s=>s.trim().replace(/^"|"$/g,''));
      if(i===0&&/^(handle|username|account)$/i.test(rawHandle))continue;
      const handle=normHandle(rawHandle),r=String(rawRelation||'following').toLowerCase();
      if(!handle||handle===CENTER)continue;
      const n=findOrCreate('',handle);if(!n)continue;
      if(r==='mutual'||r==='both'){n.follower=true;n.following=true;}
      else if(r==='follower'||r==='followers')n.follower=true;
      else if(r==='interaction'||r==='mention')n.mentions++;
      else n.following=true;
      imported++;
    }
    return imported;
  }
  $('atlas-files').addEventListener('change',async e=>{
    const files=Array.from(e.target.files||[]);
    if(!files.length)return;
    const valid=files.filter(f=>/\.(js|json|csv|txt)$/i.test(f.name)&&f.size<=MAX_IMPORT_BYTES);
    if(valid.length!==files.length){setStatus('Skipped unsupported files or files larger than 60 MB. Select extracted data files, not a ZIP.');}
    let total=0,done=0;const errors=[];
    try{
      for(const file of valid){
        try{
          const lower=file.name.toLowerCase(),content=await file.text();
          if(/\.(csv|txt)$/.test(lower)){
            if(mode==='demo'){clearState();mode='local';}total+=importDelimited(content);done++;continue;
          }
          const data=stripXWrapper(content);
          if(data&&Array.isArray(data.nodes)){
            restore(data);total+=data.nodes.length;done++;continue;
          }
          let type;
          if(/following(?:-part\d+)?\.(js|json)$/.test(lower))type='following';
          else if(/follower(?:-part\d+)?\.(js|json)$/.test(lower))type='follower';
          else if(/(?:tweets?|tweets-part\d+)\.(js|json)$/.test(lower))type='tweets';
          else throw new Error('File name is not follower.js, following.js, tweets.js, or an atlas export');
          if(mode==='demo'){clearState();mode='local';}
          total+=type==='tweets'?importTweets(data):importArchiveList(data,type);
          done++;
        }catch(err){errors.push(file.name+': '+(err.message||'could not parse'));}
      }
      if(done){updateAll(true);saveLocal();}
      setStatus(`${done} file(s) loaded, ${total.toLocaleString()} records processed${errors.length?'. Errors: '+errors.slice(0,2).join(' | '):'.'}`);
    }finally{$('atlas-files').value='';}
  });
  $('atlas-export').addEventListener('click',()=>{
    const data={version:1,mode,nodes:Array.from(nodes.values()).map(({id,handle,name,following,follower,mentions,replies,sample})=>({id,handle,name,following,follower,mentions,replies,sample}))};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='x-network-atlas-'+(mode==='demo'?'demo':'local')+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    setStatus('JSON exported locally. It is not published to the website.');
  });
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize',resize);
  window.addEventListener('resize',resize);
  loadSaved();resize();
  if(!reducedMotion) canvas.style.transition='filter .2s ease';
})();