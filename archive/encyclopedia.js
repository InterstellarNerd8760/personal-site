"use strict";
const get = id => document.getElementById(id);
const node = (tag, text, cls) => {const e=document.createElement(tag); if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const search=get("enc-search"), categories=get("enc-categories"), body=get("enc-body");
let data, photos=new Map(), records=new Map(), articleMap=new Map(), current=null;
const articleCache = new Map();
const pageSize = 24;
let selection = 0;
let bodyIndex;
let indexRequest;

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error("Request failed: " + url);
  return response.json();
}

function loadSearch() {
  if (indexRequest) return;
  indexRequest = Promise.all(data.categories.map(category =>
    getJSON("knowledge/search-" + category.id + ".json")
  )).then(shards => {
    bodyIndex = Object.assign({}, ...shards);
    showCategories();
  }).catch(() => {
    get("enc-search-note").textContent = "Full-text search is temporarily unavailable. Titles and categories are searchable.";
    indexRequest = null;
  });
}

function appendPage(list, start, into) {
  const count = Math.min(start + pageSize, list.length);
  for (const article of list.slice(start, count)) into.append(articleLink(article, "enc-article-link"));
  if (count >= list.length) return;
  const more = node("button", "Show " + Math.min(pageSize, list.length - count) + " more", "enc-more");
  more.type = "button";
  more.addEventListener("click", () => {
    const firstNew = into.children.length - 1;
    more.remove();
    appendPage(list, count, into);
    into.children[firstNew]?.focus();
  }, { once: true });
  into.append(more);
}
function articleLink(article, cls) {
  const a=node("a",article.title,cls);a.href="?article="+encodeURIComponent(article.id);
  a.dataset.article=article.id;if(current===article.id)a.setAttribute("aria-current","page");
  a.addEventListener("click",event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();select(article.id,true);});return a;
}
function showCategories(){
  const query=search.value.trim().toLowerCase();categories.replaceChildren();let count=0;
  for(const category of data.categories){
    const list=data.articles.filter(article => article.category === category.id &&
      (!query || [article.id, article.title, article.subcategory, category.title,
        category.description, bodyIndex?.[article.id]].join(" ").toLowerCase().includes(query)));
    if(!list.length)continue;count+=list.length;
    const detail=node("details",null,"enc-category");detail.open=Boolean(query)||list.some(a=>a.id===current);
    const summary=node("summary"), symbol=node("span",category.symbol,"enc-symbol");symbol.setAttribute("aria-hidden","true");
    const copy=node("span");copy.append(node("span",category.id+" — "+category.title,"enc-category-name"),node("span",category.description,"enc-category-description"));
    summary.append(symbol,copy);detail.append(summary);
    const listBody = node("div");
    const selectedIndex = list.findIndex(article => article.id === current);
    const start = selectedIndex < 0 ? 0 : Math.floor(selectedIndex / pageSize) * pageSize;
    appendPage(start ? [...list.slice(start), ...list.slice(0, start)] : list, 0, listBody);
    detail.append(listBody);
    categories.append(detail);
  }
  get("enc-count").textContent=count+" / "+data.articles.length+" articles";
  if(!count)categories.append(node("p", query && !bodyIndex ? "Checking article text…" : "No matching articles."));
  if (bodyIndex) get("enc-search-note").textContent = "Searching titles, topics, terms and article text.";
}
function listLinks(title,items){if(!items.length)return;body.append(node("h3",title));const ul=node("ul");for(const item of items){const li=node("li");li.append(item);ul.append(li);}body.append(ul);}
function renderParagraphs(article) {
  article.body.forEach((text, index) => {
    const paragraph = node("p", text);
    article.sources.forEach((source, sourceIndex) => {
      if (!source.paragraphs?.includes(index + 1)) return;
      const link = node("a", "[" + (sourceIndex + 1) + "]");
      link.href = "#enc-source-" + (sourceIndex + 1);
      link.setAttribute("aria-label", "Source " + (sourceIndex + 1));
      const reference = node("sup");
      reference.append(" ", link);
      paragraph.append(reference);
    });
    body.append(paragraph);
  });
}
function renderTerms(terms) {
  if (!terms?.length) return;
  const list = node("dl", null, "enc-terms");
  for (const {term, definition} of terms) list.append(node("dt", term), node("dd", definition));
  body.append(node("h3", "Key terms"), list);
}
function renderReferences(article) {
  body.append(node("h3", "References and review"));
  if (article.review_stage === "ai-drafted") {
    body.append(node("p", article.sources.length
      ? "These source leads await a claim-by-claim check."
      : "Source verification is pending. Supplementary archive records provide context."));
  }
  if (article.sources.length) {
    const list = node("ol");
    article.sources.forEach((source, index) => {
      const item = node("li");
      item.id = "enc-source-" + (index + 1);
      const link = node("a", source.label);
      try {
        const url = new URL(source.url);
        if (url.protocol === "https:") link.href = url.href;
      } catch {}
      item.append(link);
      if (source.accessed) item.append(" · Accessed " + source.accessed);
      list.append(item);
    });
    body.append(list);
  }
  body.append(node("p", article.credit + " · " + article.rights, "enc-meta"));
  const history = node("details", null, "enc-history");
  const revisions = node("ul");
  for (const revision of article.revision_history ?? []) {
    const date = revision.date ? " · " + revision.date : "";
    revisions.append(node("li", "Revision " + revision.revision + date + " · " + revision.change));
  }
  history.append(node("summary", "Revision history"), revisions);
  body.append(history);
}
function renderDiagrams(paths) {
  const diagrams = paths.filter(path => path.endsWith(".svg"));
  if (!diagrams.length) return;
  body.append(node("h3", "Explanatory diagrams"));
  for (const path of diagrams) {
    const record = records.get(path);
    const link = node("a", null, "enc-diagram");
    link.href = "records/" + path;
    const image = node("img");
    image.src = link.href;
    image.alt = record?.alt ?? record?.title ?? path;
    image.loading = "lazy";
    link.append(image);
    const figure = node("figure");
    figure.append(link, node("figcaption", record?.caption ?? record?.summary ?? ""));
    body.append(figure);
  }
}
async function select(id,push=false){
  if (!articleMap.has(id)) return;
  const request = ++selection;
  let a;
  try {
    if (!articleCache.has(id)) {
      const pending = getJSON("knowledge/articles/" + encodeURIComponent(id) + ".json");
      articleCache.set(id, pending);
      // Keep a few recently opened records for navigation.
      if (articleCache.size > 12) articleCache.delete(articleCache.keys().next().value);
    }
    a = await articleCache.get(id);
    if (a.id !== id) throw Error("Unexpected article identifier");
  } catch {
    articleCache.delete(id);
    if (request === selection) body.textContent = "Unable to load this article. Choose a record to try again.";
    return;
  }
  if (request !== selection) return;
  current=id;
  get("enc-id").textContent=a.id+" / "+data.categories.find(c=>c.id===a.category).title;
  get("enc-title").textContent=a.title;body.replaceChildren();
  body.append(node("p",a.subcategory+" · Revision "+a.revision+" · "+a.status,"enc-meta"));
  if (a.purpose) body.append(node("p", a.purpose, "enc-purpose"));
  renderParagraphs(a);
  renderTerms(a.terms);
  body.append(node("h3","Interpretation and limitations"),node("p",a.limitations));
  listLinks("Prerequisite concepts",a.prerequisites.map(id=>articleLink(articleMap.get(id))));
  listLinks("Continue learning",data.articles.filter(b=>b.prerequisites.includes(id)).map(b=>articleLink(b)));
  listLinks("Related concepts", (a.related ?? []).map(id => articleLink(articleMap.get(id))));
  listLinks("Visual vocabulary", (a.vocabulary ?? []).map(id => {
    const link = node("a", id);
    link.href = "vocabulary.html#" + encodeURIComponent(id);
    return link;
  }));
  const related=a.images.map(id=>photos.get(id)).filter(p=>p&&p.asset);
  if(related.length){body.append(node("h3","Related photographic records"));const grid=node("div",null,"enc-images");for(const p of related){const link=node("a",null,"enc-image");link.href="images.html?record="+encodeURIComponent(p.asset);const img=node("img");img.src="records/"+p.asset;img.alt=p.title;img.loading="lazy";img.decoding="async";link.append(img,node("span",p.id+" · "+p.title));grid.append(link);}body.append(grid);}
  renderDiagrams(a.records);
  listLinks("Supplementary archive records",a.records.filter(path=>!path.endsWith(".svg")).map(path=>{const link=node("a",records.get(path)?.title ?? path);link.href="records/"+path;return link;}));
  renderReferences(a);
  showCategories();
  if(push){const url=new URL(location.href);url.searchParams.set("article",id);url.hash="";history.pushState({}, "", url);get("enc-title").focus({preventScroll:true});get("enc-reader").scrollIntoView({block:"start"});}
}
function renderCoverage(){
  const root=get("enc-coverage"), summary=get("enc-review-summary");
  if(!root||!summary)return;
  root.replaceChildren();
  const checked=a=>a.review_stage==="source-checked";
  const categories=data.categories.map(c=>({category:c, articles:data.articles.filter(a=>a.category===c.id)}));
  const max=Math.max(1,...categories.map(c=>c.articles.length));
  const count=data.articles.filter(checked).length;
  summary.textContent=data.articles.length+" articles · "+count+" source-checked drafts · "+(data.articles.length-count)+" in other review stages.";
  for(const {category,articles} of categories){
    const n=articles.filter(checked).length;
    const row=node("div"), head=node("div",null,"explain-bar-head"), track=node("div",null,"explain-track");
    head.append(node("span",category.title),node("span",n+" checked / "+articles.length));
    track.setAttribute("aria-hidden","true");
    const done=node("span"), pending=node("span",null,"explain-pending");
    done.style.width=(100*n/max)+"%"; pending.style.width=(100*(articles.length-n)/max)+"%";
    track.append(done,pending); row.append(head,track);root.append(row);
  }
}
async function init(){
  try{
    const [knowledge, plan, catalog] = await Promise.all([
      getJSON("knowledge/catalog.json"), getJSON("image-plan.json"), getJSON("records/catalog.json"),
    ]);
    data = knowledge;
    photos=new Map(plan.records.map(p=>[p.id,p]));articleMap=new Map(data.articles.map(a=>[a.id,a]));
    records=new Map(catalog.records.map(record=>[record.path,record]));
    renderCoverage();
    const requested=new URL(location.href).searchParams.get("article");select(articleMap.has(requested)?requested:data.articles[0].id);
    search.addEventListener("input", () => {
      if (search.value.trim() && !bodyIndex) loadSearch();
      showCategories();
    });
    addEventListener("popstate",()=>{
      const id=new URL(location.href).searchParams.get("article");
      const selected=articleMap.has(id)?id:data.articles[0].id;
      select(selected);
    });
  }catch(e){get("enc-count").textContent="Unavailable";categories.textContent="Unable to load the encyclopedia.";body.textContent="The source dataset is available in the downloadable archive.";}
}
init();
