const shell = content => `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">${content}</svg>`;
const line = (x1,y1,x2,y2,stroke='#24271f',width=.7) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
const circle = (cx,cy,r,fill='#d94d28',extra='') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
export function toolArt(type) {
  const lines = (n, fn) => Array.from({length:n},(_,i)=>fn(i)).join('');
  switch(type) {
    case 'grain': return shell(lines(70,i=>circle(8+(i*19)%65,7+(i*37)%67,1+(i%3)*.45,i%4?'#24271f':'#d94d28')));
    case 'denoise': return shell(lines(40,i=>circle(5+(i*19)%33,5+(i*31)%70,.9,'#24271f'))+circle(56,40,17,'#d94d28'));
    case 'blur': return shell('<defs><radialGradient id="blur-art"><stop offset="0" stop-color="#d94d28"/><stop offset=".45" stop-color="#d94d28" stop-opacity=".8"/><stop offset="1" stop-color="#d94d28" stop-opacity="0"/></radialGradient></defs>'+circle(40,40,36,'url(#blur-art)'));
    case 'crop': return shell('<path d="M15 8v54h56M8 16h54v56" stroke="#24271f" stroke-width="2"/>'+circle(40,39,16,'#d94d28'));
    case 'picker': return shell(circle(32,29,17,'#d94d28')+circle(49,39,17,'#b9c968')+circle(30,51,17,'#585d79')+line(14,66,66,14,'#f4f2e9',1.3));
    case 'levels': return shell(lines(12,i=>`<rect x="${10+i*5}" y="${60-((i*11)%40)}" width="3" height="${10+((i*11)%40)}" fill="${i>6?'#d94d28':'#24271f'}"/>`));
    case 'layers': return shell(lines(5,i=>`<path d="m12 ${26+i*7} 28-16 28 16-28 16Z" fill="${i===2?'#d94d28':'#e8e7dc'}" stroke="#24271f" stroke-width=".8"/>`));
    case 'orbit': return shell(circle(40,40,7,'#d94d28')+'<g stroke="#24271f" stroke-width=".7"><ellipse cx="40" cy="40" rx="33" ry="13" transform="rotate(-35 40 40)"/><ellipse cx="40" cy="40" rx="33" ry="13" transform="rotate(35 40 40)"/><ellipse cx="40" cy="40" rx="13" ry="33"/></g>');
    case 'clean': return shell(lines(4,i=>`<rect x="${16+i*8}" y="${13+i*8}" width="30" height="30" fill="${i===3?'#d94d28':'#e8e7dc'}" stroke="#24271f" stroke-width=".7"/>`));
    case 'select': return shell(lines(3,i=>circle(20+i*20,40,8,i===1?'#d94d28':'#e8e7dc',`stroke="#24271f" stroke-width=".7"`))+line(20,26,40,13)+line(40,13,60,26)+line(40,13,40,26));
    case 'frame': return shell('<path d="M11 18h58v44H11zM21 10h38v60H21z" stroke="#24271f" stroke-width=".8"/>'+circle(40,40,14,'#d94d28'));
    case 'sequence': return shell(lines(4,i=>`<rect x="${9+i*15}" y="${32-i*4}" width="13" height="${19+i*8}" fill="${i===2?'#d94d28':'#24271f'}"/>`));
    case 'menu': return shell(lines(3,i=>line(16,23+i*17,63-i*9,23+i*17,i===1?'#d94d28':'#24271f',3)));
    case 'key': return shell('<rect x="12" y="12" width="56" height="56" fill="#c2d479"/>'+circle(39,29,10,'#24271f')+'<path d="M22 63c0-29 35-29 35 0" fill="#24271f"/>');
    case 'qc': return shell('<rect x="16" y="14" width="48" height="52" stroke="#24271f" stroke-width=".8"/><path d="m25 39 10 10 22-23" stroke="#d94d28" stroke-width="3"/>');
    case 'residual': return shell(circle(30,40,21,'#24271f')+circle(50,40,21,'#d94d28',`style="mix-blend-mode:multiply"`));
    default: return shell('<path d="M10 18h60v44H10zM18 26h44v28H18z" stroke="#24271f" stroke-width=".8"/>'+line(40,9,40,71)+line(2,40,78,40));
  }
}
export function heroArt() {
  let paths='';
  for(let i=0;i<37;i++) {
    const a=(i/36)*Math.PI;
    const r=166;
    const x=250+Math.cos(a)*r;
    const y=210+Math.sin(a)*r;
    const b=250-Math.cos(a)*r;
    const c=210-Math.sin(a)*r;
    paths+=`<path d="M${x.toFixed(2)} ${y.toFixed(2)}C${(110+i*5.1).toFixed(2)} ${(80-i*1.3).toFixed(2)} ${(390-i*5.1).toFixed(2)} ${(340+i*1.3).toFixed(2)} ${b.toFixed(2)} ${c.toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 420" fill="none" aria-hidden="true"><circle cx="250" cy="210" r="150" fill="#d94d28"/><g stroke="#24271f" stroke-width=".65" opacity=".9">${paths}<ellipse cx="250" cy="210" rx="218" ry="91" transform="rotate(-26 250 210)"/><ellipse cx="250" cy="210" rx="208" ry="82" transform="rotate(-26 250 210)"/><ellipse cx="250" cy="210" rx="198" ry="73" transform="rotate(-26 250 210)"/></g><circle cx="83" cy="282" r="4" fill="#24271f"/><circle cx="423" cy="142" r="5" fill="#f4f2e9" stroke="#24271f" stroke-width=".7"/></svg>`;
}
