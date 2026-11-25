const root=document.querySelector('#bloom-playground');
const digest='f44d8fa110384e32eb917cd6e102924e8af5a006fa4f8d32f9c47314d8f84027';
let W;
const status=root.querySelector('[role=status]'), go=root.querySelector('button');
async function load(buf){
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf)),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==digest)throw Error('Not the verified baseline checkpoint');
 const dv=new DataView(buf), n=Number(dv.getBigUint64(0,true)), h=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,8,n)));
 W={};for(const [k,v] of Object.entries(h)){if(k==='__metadata__')continue;W[k]=new Float32Array(buf.slice(8+n+v.data_offsets[0],8+n+v.data_offsets[1]));}
 status.textContent='Verified baseline loaded. Ready to generate.';go.disabled=false;
}
function linear(x,w,b,o){const y=new Float64Array(o);for(let i=0;i<o;i++){let s=b?b[i]:0;for(let j=0;j<x.length;j++)s+=x[j]*w[i*x.length+j];y[i]=s;}return y;}
function norm(x,p){let m=x.reduce((a,b)=>a+b,0)/64,v=x.reduce((a,b)=>a+(b-m)**2,0)/64;return x.map((a,i)=>(a-m)/Math.sqrt(v+1e-5)*W[p+'.weight'][i]+W[p+'.bias'][i]);}
function add(a,b){return a.map((x,i)=>x+b[i]);}
function gelu(x){const a=Math.abs(x)/Math.SQRT2,t=1/(1+.3275911*a),e=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a);return .5*x*(1+Math.sign(x)*e);}
function logits(ids){
 let x=ids.map((id,i)=>Float64Array.from({length:64},(_,j)=>W['tokens.weight'][id*64+j]+W['positions.weight'][i*64+j]));
 for(let l=0;l<2;l++){
 const p='blocks.layers.'+l+'.',q=x.map(a=>linear(norm(a,p+'norm1'),W[p+'self_attn.in_proj_weight'],W[p+'self_attn.in_proj_bias'],192));
 x=x.map((a,i)=>{const z=new Float64Array(64);for(let h=0;h<4;h++){const scores=[];for(let j=0;j<=i;j++){let s=0;for(let k=0;k<16;k++)s+=q[i][h*16+k]*q[j][64+h*16+k];scores.push(s/4);}const m=Math.max(...scores),ex=scores.map(s=>Math.exp(s-m)),sum=ex.reduce((a,b)=>a+b,0);for(let j=0;j<=i;j++)for(let k=0;k<16;k++)z[h*16+k]+=ex[j]/sum*q[j][128+h*16+k];}return add(a,linear(z,W[p+'self_attn.out_proj.weight'],W[p+'self_attn.out_proj.bias'],64));});
 x=x.map(a=>add(a,linear(linear(norm(a,p+'norm2'),W[p+'linear1.weight'],W[p+'linear1.bias'],256).map(gelu),W[p+'linear2.weight'],W[p+'linear2.bias'],64)));
 }return linear(norm(x[x.length-1],'norm'),W['head.weight'],null,256);
}
root.querySelector('input[type=file]').addEventListener('change',async e=>{try{await load(await e.target.files[0].arrayBuffer());}catch(err){status.textContent=err.message;}});
go.addEventListener('click',async()=>{go.disabled=true;try{const ids=Array.from(new TextEncoder().encode(root.querySelector('textarea').value||' ')),out=[],temp=Number(root.querySelector('select').value);for(let i=0;i<64;i++){const a=logits(ids.slice(-32)),m=Math.max(...a),p=Array.from(a,x=>Math.exp((x-m)/temp));let r=Math.random()*p.reduce((a,b)=>a+b,0),k=0;while(k<255&&(r-=p[k])>0)k++;ids.push(k);out.push(k);root.querySelector('pre').textContent=new TextDecoder().decode(Uint8Array.from(out));await new Promise(r=>setTimeout(r,0));}}catch(err){status.textContent=err.message;}finally{go.disabled=false;}});
fetch('https://raw.githubusercontent.com/InterstellarNerd8760/centauri-bloom/text-baseline-and-notebook/experiments/baseline-001/model.safetensors').then(r=>{if(!r.ok)throw Error('not published');return r.arrayBuffer();}).then(load).catch(()=>{status.textContent='Automatic weights unavailable. Download and extract the checkpoint, then select model.safetensors below.';});
