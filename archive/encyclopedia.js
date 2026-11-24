"use strict";
const get = id => document.getElementById(id);
const node = (tag, text, cls) => {const e=document.createElement(tag); if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const search=get("enc-search"), categories=get("enc-categories"), body=get("enc-body");
let data, photos=new Map(), articleMap=new Map(), current=null;
function articleLink(article, cls) {
  const a=node("a",article.title,cls);a.href="?article="+encodeURIComponent(article.id);
  a.dataset.article=article.id;if(current===article.id)a.setAttribute("aria-current","page");
  a.addEventListener("click",event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();select(article.id,true);});return a;
}
function showCategories(){
  const query=search.value.trim().toLowerCase();categories.replaceChildren();let count=0;
  for(const category of data.categories){
    const list=data.articles.filter(a=>a.category===category.id&&[a.id,a.title,a.subcategory,category.title,category.description,...a.body,a.limitations].join(" ").toLowerCase().includes(query));
    if(!list.length)continue;count+=list.length;
    const detail=node("details",null,"enc-category");detail.open=Boolean(query)||list.some(a=>a.id===current);
    const summary=node("summary"), symbol=node("span",category.symbol,"enc-symbol");symbol.setAttribute("aria-hidden","true");
    const copy=node("span");copy.append(node("span",category.id+" — "+category.title,"enc-category-name"),node("span",category.description,"enc-category-description"));
    summary.append(symbol,copy);detail.append(summary);
    for(const a of list)detail.append(articleLink(a,"enc-article-link"));
    categories.append(detail);
  }
  get("enc-count").textContent=count+" / "+data.articles.length+" articles";
  if(!count)categories.append(node("p","No matching articles."));
}
function listLinks(title,items){if(!items.length)return;body.append(node("h3",title));const ul=node("ul");for(const item of items){const li=node("li");li.append(item);ul.append(li);}body.append(ul);}
function select(id,push=false){
  const a=articleMap.get(id);if(!a)return;current=id;
  get("enc-id").textContent=a.id+" / "+data.categories.find(c=>c.id===a.category).title;
  get("enc-title").textContent=a.title;body.replaceChildren();
  body.append(node("p",a.subcategory+" · Revision "+a.revision+" · "+a.status,"enc-meta"));
  for(const p of a.body)body.append(node("p",p));
  body.append(node("h3","Interpretation and limitations"),node("p",a.limitations));
  listLinks("Prerequisite concepts",a.prerequisites.map(id=>articleLink(articleMap.get(id))));
  listLinks("Continue learning",data.articles.filter(b=>b.prerequisites.includes(id)).map(b=>articleLink(b)));
  const related=a.images.map(id=>photos.get(id)).filter(p=>p&&p.asset);
  if(related.length){body.append(node("h3","Related photographic records"));const grid=node("div",null,"enc-images");for(const p of related){const link=node("a",null,"enc-image");link.href="images.html?record="+encodeURIComponent(p.asset);const img=node("img");img.src="records/"+p.asset;img.alt=p.title;img.loading="lazy";img.decoding="async";link.append(img,node("span",p.id+" · "+p.title));grid.append(link);}body.append(grid);}
  listLinks("Original archive records (supplementary source files)",a.records.map(path=>{const link=node("a",path);link.href="records/"+path;return link;}));
  body.append(node("h3","References and review"));
  if(!a.sources.length)body.append(node("p","Independent source verification pending. Related archive records are context, not independently verified citations."));
  else listLinks("Sources",a.sources.map(s=>{const link=node("a",s.label);try{const url=new URL(s.url);if(url.protocol==="https:")link.href=url.href;}catch{}return link;}));
  body.append(node("p",a.credit+" · "+a.rights,"enc-meta"));
  showCategories();
  if(push){const url=new URL(location.href);url.searchParams.set("article",id);history.pushState({}, "", url);get("enc-title").focus({preventScroll:true});get("enc-reader").scrollIntoView({block:"start"});}
}
async function init(){
  try{
    const responses=await Promise.all([fetch("records/encyclopedia/index.json"),fetch("image-plan.json")]);
    if(responses.some(r=>!r.ok))throw Error("Index unavailable");
    data=await responses[0].json();const plan=await responses[1].json();
    photos=new Map(plan.records.map(p=>[p.id,p]));articleMap=new Map(data.articles.map(a=>[a.id,a]));
    const requested=new URL(location.href).searchParams.get("article");select(articleMap.has(requested)?requested:data.articles[0].id);
    search.addEventListener("input",showCategories);
    addEventListener("popstate",()=>{const id=new URL(location.href).searchParams.get("article");select(articleMap.has(id)?id:data.articles[0].id);});
  }catch(e){get("enc-count").textContent="Unavailable";categories.textContent="Unable to load the encyclopedia.";body.textContent="The source dataset is available in the downloadable archive.";}
}
init();
