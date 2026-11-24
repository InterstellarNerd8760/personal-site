// Original Codex concept illustration, restored as an explicitly non-flight study.
const canvas = document.querySelector("#carrier");
if (canvas) {
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const ctx = document.querySelector("#carrier").getContext("2d");
    function outline(x, y) {
      ctx.beginPath();
      ctx.roundRect(x, y, 438, 315, 18);
    }
    ctx.setTransform(1.13, -.46, .58, .82, 64, 323);
    for (let depth = 14; depth >= 0; depth--) {
      outline(0, depth);
      ctx.fillStyle = depth % 3 ? "#715638" : "#a68b60";
      ctx.fill();
    }
    const metal = ctx.createLinearGradient(0, 0, 430, 310);
    for (const [stop, color] of [[0,"#a48659"],[.25,"#edd7a2"],[.48,"#c3a16e"],[.76,"#e7c994"],[1,"#96754c"]]) metal.addColorStop(stop,color);
    outline(0,0);
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.lineWidth = .6;
    for (let y = 0; y < 315; y += 2) {
      ctx.strokeStyle = y % 8 ? "#59411f22" : "#fff4ce66";
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(438,y+.5); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "#57492e";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(23,23,392,269);
    for (const x of [13,425]) for (const y of [13,302]) {
      ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fillStyle="#354045"; ctx.fill();
    }
    ctx.fillStyle="#413c2e";
    ctx.font="bold 20px Georgia"; ctx.fillText("CENTAURI ARCHIVE",38,55);
    ctx.font="10px monospace"; ctx.fillText("EARTH  /  READING PLATE",39,72);
    ctx.strokeRect(38,88,220,186);
    ctx.save(); ctx.clip(new Path2D("M38 88h220v186H38Z"));
    for (const x of [91,198]) for (let r=5; r<240; r+=7) {
      ctx.beginPath();ctx.arc(x,180,r,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
    for (let row=0; row<13; row++) for(let col=0; col<15; col++){
      if (((row+1)*(col+3) ^ (row<<1) ^ col) % 5 < 2) ctx.fillRect(278+col*8,90+row*8,5,5);
    }
    for (let i=0;i<8;i++) {
      ctx.beginPath();ctx.moveTo(278,208+i*8);ctx.lineTo(397-(i%3)*12,208+i*8);ctx.stroke();
    }
    
  }
}
