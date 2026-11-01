// Chapter VII "Resonance": a vibrating metal plate covered in golden sand (Chladni figures).
// Each note shakes the plate in its own pattern: grains are thrown off the parts that move and settle on the
// lines that stay still, so every note draws its own figure. ~410,000 grains are simulated on the graphics card
// (WebGL 2). The sound is made live with the Web Audio API from the partials of a thin square metal plate,
// in D Dorian. Tap = struck plate; hold = bowed plate that keeps ringing until you let go.
(()=>{
'use strict';
const cvs=document.getElementById('resonance');if(!cvs)return;
const gl=cvs.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:location.search.includes('manual'),powerPreference:'high-performance'});
const fail=()=>{const f=document.getElementById('res-fallback');if(f)f.hidden=false;cvs.style.display='none';};
if(!gl){fail();return;}
const cbf=gl.getExtension('EXT_color_buffer_float');
if(!cbf){fail();return;}
gl.getExtension('EXT_float_blend');

/* ---------- parameters ---------- */
const params=new URLSearchParams('');
const mobile=matchMedia('(max-width:700px)').matches||/iPhone|Android/i.test(navigator.userAgent);
const SIDE=+(params.get('grains')||(mobile?384:640));   // grains = SIDE²
const N=SIDE*SIDE;
const MAXV=6;

/* ---------- scale + modes ---------- */
// D Dorian over two octaves + top D (15 notes). Low notes draw simple figures, high notes complex ones.
const NAMES=['C','C♯','D','E♭','E','F','F♯','G','G♯','A','B♭','B'];
const DOR=[0,2,3,5,7,9,10];
const notes=[];
for(let o=0;o<3;o++)for(const s of DOR){const midi=50+o*12+s;if(notes.length<15)notes.push(midi);}
const modes=[];
for(let n=1;n<=10;n++)for(let m=n+1;m<=12;m++){if((n+m)%2===0){modes.push([n,m,1],[n,m,-1]);}else{modes.push([n,m,-1]);}}
modes.sort((a,b)=>(a[0]*a[0]+a[1]*a[1])-(b[0]*b[0]+b[1]*b[1])||b[2]-a[2]);
// pick 15 visually distinct, spread through the list
const picked=[];
const want=[[1,2,-1],[1,3,1],[1,3,-1],[2,3,-1],[1,4,-1],[1,5,1],[2,5,-1],[3,4,-1],[1,6,-1],[3,5,1],[2,7,-1],[4,5,-1],[3,7,-1],[5,6,-1],[4,9,-1]];
for(const w of want)picked.push(w);

/* ---------- GL helpers ---------- */
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)+'\n'+src);return s;}
function prog(vs,fs){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));const u={};const n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name.replace(/\[0\]$/,'')]=gl.getUniformLocation(p,a.name);}return{p,u};}
function tex(w,h,fmt,ifmt,type,data,filter){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,ifmt,w,h,0,fmt,type,data||null);const f=filter||gl.NEAREST;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,f);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
function fbo(t){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);return f;}

const QUAD=`#version 300 es
in vec2 a;out vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0,1);}`;
const FIELD=`
uniform vec4 uM[${MAXV}];
const float PI=3.14159265;
float field(vec2 p){float u=0.;for(int i=0;i<${MAXV};i++){vec4 m=uM[i];if(m.w<=0.)continue;
 u+=m.w*(cos(m.x*PI*p.x)*cos(m.y*PI*p.y)+m.z*cos(m.y*PI*p.x)*cos(m.x*PI*p.y));}return u;}
vec2 grad(vec2 p){float u=0.;vec2 g=vec2(0);for(int i=0;i<${MAXV};i++){vec4 m=uM[i];if(m.w<=0.)continue;
 float cx=cos(m.x*PI*p.x),sx=sin(m.x*PI*p.x),cy=cos(m.y*PI*p.y),sy=sin(m.y*PI*p.y);
 float cX=cos(m.y*PI*p.x),sX=sin(m.y*PI*p.x),cY=cos(m.x*PI*p.y),sY=sin(m.x*PI*p.y);
 g.x+=m.w*(-m.x*PI*sx*cy - m.z*m.y*PI*sX*cY);
 g.y+=m.w*(-m.y*PI*cx*sy - m.z*m.x*PI*cX*sY);}return g;}
`;
const SIM=`#version 300 es
precision highp float;in vec2 v;out vec4 o;
uniform sampler2D uP;uniform float uE,uNorm,uSeed,uDt;
${FIELD}
uint h(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
float r(inout uint s){s=h(s);return float(s)/4294967295.;}
void main(){
 ivec2 ij=ivec2(gl_FragCoord.xy);vec4 P=texelFetch(uP,ij,0);vec2 p=P.xy;
 uint s=uint(ij.x)*1973u+uint(ij.y)*9277u+uint(uSeed)*26699u;
 float u=field(p)*uNorm;float A=abs(u);
 vec2 g=grad(p)*uNorm;
 // bouncing: grains at antinodes are thrown around; grains on nodal lines stay still
 float a=6.2831853*r(s);float rr=sqrt(-2.*log(max(r(s),1e-6)));
 vec2 kick=vec2(cos(a),sin(a))*rr;
 float amp=uE*pow(A,1.15);
 p+=kick*(amp*0.011+uE*0.0007)*uDt;
 // gentle drift down the energy slope (toward the lines)
 // Newton step toward the nearest nodal line, same speed for simple and complex figures
 p-=u*g/(dot(g,g)+2.)*uE*0.014*uDt;
 // reflect at the plate edges
 p=abs(p);p=1.-abs(1.-p);
 o=vec4(clamp(p,0.,1.),P.zw);
}`;
const PTS_VS=`#version 300 es
precision highp float;uniform sampler2D uP;uniform int uSide;uniform vec4 uRect;uniform float uSize;
out float vB;
uint h(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
void main(){int id=gl_VertexID;ivec2 ij=ivec2(id%uSide,id/uSide);vec4 P=texelFetch(uP,ij,0);
 vec2 xy=uRect.xy+P.xy*uRect.zw;gl_Position=vec4(xy*2.-1.,0,1);
 float b=float(h(uint(id)*747796405u)&1023u)/1023.;vB=.35+.65*b*b;gl_PointSize=uSize*(.75+.5*b);}`;
const PTS_FS=`#version 300 es
precision highp float;in float vB;out vec4 o;void main(){vec2 c=gl_PointCoord-.5;float d=dot(c,c);float a=smoothstep(.25,.0,d);o=vec4(vB*a,a,0,1);}`;
const OUT=`#version 300 es
precision highp float;in vec2 v;out vec4 o;
uniform sampler2D uA;uniform vec2 uRes;uniform vec4 uRect;uniform float uK,uE,uT;
${FIELD}
uniform float uNorm;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
 vec2 px=v;vec4 A=texture(uA,v);float d=A.x;float n=A.y;
 // plate
 vec2 q=(px-uRect.xy)/uRect.zw;float inside=step(0.,q.x)*step(0.,q.y)*step(q.x,1.)*step(q.y,1.);
 vec2 cq=q-.5;float r=length(cq);
 vec3 bg=vec3(.027,.029,.035);
 vec3 plate=mix(vec3(.060,.058,.055),vec3(.030,.030,.032),smoothstep(.0,.75,r));
 // faint brushed metal + shimmer of the vibration itself
 float brush=hash(vec2(floor(q.y*1400.),0.))*.012;
 float vib=abs(field(clamp(q,0.,1.))*uNorm);
 plate+=brush+vec3(.10,.08,.05)*uE*vib*.06;
 vec3 col=mix(bg*(1.-.5*length(px-.5)),plate,inside);
 // edge hairline
 vec2 e=min(q,1.-q)*uRect.zw*uRes;float edge=inside*(1.-smoothstep(0.,1.2,min(e.x,e.y)));
 col+=vec3(.16,.14,.11)*edge*.5;
 // sand: gold → pale where dense
 vec3 gold=vec3(.725,.584,.349);
 vec3 sand=gold*(1.-exp(-d*uK))*1.15;
 sand+=vec3(.92,.87,.76)*smoothstep(1.2,6.,d*uK)*.35;
 col=col*exp(-n*uK*.9)+sand;
 // grain
 col+=(hash(px*uRes+uT)-.5)*.012;
 o=vec4(pow(max(col,0.),vec3(1./1.05)),1);
}`;

const sim=prog(QUAD,SIM),pts=prog(PTS_VS,PTS_FS),out=prog(QUAD,OUT);
const vao=gl.createVertexArray();gl.bindVertexArray(vao);
const qb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,qb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
const emptyVao=gl.createVertexArray();

function sprinkle(){const a=new Float32Array(N*4);for(let i=0;i<N;i++){a[i*4]=Math.random();a[i*4+1]=Math.random();a[i*4+2]=0;a[i*4+3]=0;}return a;}
let PT=[tex(SIDE,SIDE,gl.RGBA,gl.RGBA32F,gl.FLOAT,sprinkle()),tex(SIDE,SIDE,gl.RGBA,gl.RGBA32F,gl.FLOAT,null)];
let PF=[fbo(PT[0]),fbo(PT[1])];let cur=0;
function resprinkle(){gl.bindTexture(gl.TEXTURE_2D,PT[cur]);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,SIDE,SIDE,gl.RGBA,gl.FLOAT,sprinkle());}

let W=0,H=0,dpr=1,accT=null,accF=null,rect=[0,0,1,1];
function resize(){
 dpr=Math.min(window.devicePixelRatio||1,2);
 W=Math.max(2,Math.round(cvs.clientWidth*dpr));H=Math.max(2,Math.round(cvs.clientHeight*dpr));if(W===cvs.width&&H===cvs.height&&accT)return;cvs.width=W;cvs.height=H;
 if(accT){gl.deleteTexture(accT);gl.deleteFramebuffer(accF);}
 accT=tex(W,H,gl.RGBA,gl.RGBA16F,gl.HALF_FLOAT,null,gl.LINEAR);accF=fbo(accT);
 const s=Math.min(W,H)*(W<H?0.9:0.8);rect=[(W-s)/2/W,(H-s)/2/H,s/W,s/H];
}
addEventListener('resize',resize);resize();

/* ---------- voices (visual + audio share the same envelope) ---------- */
const voices=[];// {mode,env,held,t,decay,audio}
let energy=0;
function noteName(m){return NAMES[m%12]+(Math.floor(m/12)-1);}
const noteEl=document.getElementById('res-note');let noteTimer=0;
function strike(i,held){
 i=Math.max(0,Math.min(notes.length-1,i));
 const v={i,mode:picked[i],env:0,att:1,held,decay:held?0:1,age:0,audio:null};
 voices.push(v);while(voices.length>MAXV){const o=voices.shift();if(o.audio)o.audio.stop(0.4);}
 v.audio=audio.play(notes[i],held);if(window.LLONE_MUSIC)LLONE_MUSIC.duck();
 const md=picked[i];noteEl.textContent=noteName(notes[i])+'  ·  '+md[0]+':'+md[1];noteEl.classList.add('on');clearTimeout(noteTimer);noteTimer=setTimeout(()=>noteEl.classList.remove('on'),1600);
 return v;
}
function release(v){if(!v)return;v.held=false;if(v.audio)v.audio.release();}

/* ---------- audio: a struck / bowed metal plate ---------- */
const audio={ctx:null,master:null,dest:null,
 init(){if(this.ctx)return;try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch(e){}const C=window.AudioContext||window.webkitAudioContext;const c=this.ctx=new C({latencyHint:'interactive'});
  const comp=c.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=3;comp.attack.value=.004;comp.release.value=.25;
  const master=this.master=c.createGain();master.gain.value=.55;
  const dry=c.createGain();dry.gain.value=.8;const wet=c.createGain();wet.gain.value=.42;
  const rev=c.createConvolver();rev.buffer=this.ir(c,4.2);
  const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=9000;
  master.connect(dry).connect(lp);master.connect(rev).connect(wet).connect(lp);lp.connect(comp);comp.connect(c.destination);
  this.dest=c.createMediaStreamDestination();comp.connect(this.dest);
 },
 ir(c,sec){const len=Math.floor(c.sampleRate*sec);const b=c.createBuffer(2,len,c.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);let lp=0;for(let i=0;i<len;i++){const t=i/len;lp=lp*.6+(Math.random()*2-1)*.4;d[i]=lp*Math.pow(1-t,3.2)*(i<c.sampleRate*.012?i/(c.sampleRate*.012):1);}}return b;},
 play(midi,held){
  if(!this.ctx)return null;const c=this.ctx,t=c.currentTime;
  const f0=440*Math.pow(2,(midi-69)/12);
  // inharmonic partials of a thin square plate
  const R=[1,1.503,1.934,2.716,3.191,4.062,5.287,6.04];
  const G=[1,.5,.36,.24,.17,.11,.07,.045];
  const out=c.createGain();out.gain.value=1;out.connect(this.master);
  const pan=c.createStereoPanner?c.createStereoPanner():null;if(pan){pan.pan.value=(midi-62)/40;out.disconnect();out.connect(pan).connect(this.master);}
  const oscs=[],gains=[];const base=Math.min(1,.38*Math.pow(220/f0,.25));
  const T=5.5*Math.pow(146/f0,.45);
  R.forEach((r,k)=>{const f=f0*r;if(f>15000)return;const o=c.createOscillator();o.type='sine';o.frequency.value=f*(1+(Math.random()-.5)*.0016);
   const g=c.createGain();const a=base*G[k];g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(a,t+.004+k*.0015);
   const tau=T/(1+k*.85);
   if(held){g.gain.setTargetAtTime(a*.55,t+.01,.4);}else{g.gain.setTargetAtTime(0,t+.01,tau);}
   o.connect(g).connect(out);o.start(t);oscs.push(o);gains.push([g,a,tau]);});
  // the bow: soft band-passed noise riding on the fundamental while held
  let bow=null;
  if(held){const nb=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
   const ns=c.createBufferSource();ns.buffer=nb;ns.loop=true;const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f0*2;bp.Q.value=30;
   const bg=c.createGain();bg.gain.setValueAtTime(0,t);bg.gain.linearRampToValueAtTime(.05,t+.6);ns.connect(bp).connect(bg).connect(out);ns.start(t);bow={ns,bg};}
  let stopped=false;
  const api={release(){if(stopped)return;const t2=c.currentTime;gains.forEach(([g,a,tau])=>{g.gain.cancelScheduledValues(t2);g.gain.setValueAtTime(g.gain.value,t2);g.gain.setTargetAtTime(0,t2,tau*.55);});
    if(bow){bow.bg.gain.cancelScheduledValues(t2);bow.bg.gain.setValueAtTime(bow.bg.gain.value,t2);bow.bg.gain.setTargetAtTime(0,t2,.15);}
    const end=t2+T*3;oscs.forEach(o=>o.stop(end));if(bow)bow.ns.stop(end);},
   stop(fade){if(stopped)return;stopped=true;const t2=c.currentTime;out.gain.setTargetAtTime(0,t2,fade/3);oscs.forEach(o=>o.stop(t2+fade*2));if(bow)bow.ns.stop(t2+fade*2);}};
  if(!held){oscs.forEach(o=>o.stop(t+T*3.2));}
  return api;
 }};

/* ---------- input ---------- */
const hintEl=document.getElementById('res-hint');
function wake(){audio.init();if(audio.ctx.state!=='running')audio.ctx.resume();if(hintEl)hintEl.classList.add('gone');}
function idxFromPointer(e){const r=cvs.getBoundingClientRect();const x=(e.clientX-r.left)/r.width;const y=1-(e.clientY-r.top)/r.height;
 // left→right = low→high; a little vertical spread so the whole plate is playable
 return Math.floor(Math.max(0,Math.min(.9999,x*.85+y*.15))*notes.length);}
const ptr=new Map();
cvs.addEventListener('pointerdown',e=>{e.preventDefault();try{cvs.focus({preventScroll:true});}catch(_){}wake();cvs.setPointerCapture(e.pointerId);const i=idxFromPointer(e);ptr.set(e.pointerId,{i,v:strike(i,true)});});
cvs.addEventListener('pointermove',e=>{const p=ptr.get(e.pointerId);if(!p)return;const i=idxFromPointer(e);if(i!==p.i){release(p.v);p.i=i;p.v=strike(i,true);}});
const up=e=>{const p=ptr.get(e.pointerId);if(p){release(p.v);ptr.delete(e.pointerId);}};
cvs.addEventListener('pointerup',up);cvs.addEventListener('pointercancel',up);
const KEYS='asdfghjkl;qwertyuiop';const KMAP={};
// bottom row a..; = notes 0..9, top row q..p = notes 5..14
for(let k=0;k<10;k++)KMAP['asdfghjkl;'[k]]=k;for(let k=0;k<10;k++)KMAP['qwertyuiop'[k]]=Math.min(14,k+5);
const held=new Map();
cvs.addEventListener('keydown',e=>{if(e.repeat||e.metaKey||e.ctrlKey)return;const k=e.key.toLowerCase();
 if(k===' '||k==='backspace'){e.preventDefault();resprinkle();return;}
 if(k in KMAP){e.preventDefault();wake();held.set(k,strike(KMAP[k],true));}});
cvs.addEventListener('keyup',e=>{const k=e.key.toLowerCase();if(held.has(k)){release(held.get(k));held.delete(k);}});

/* ---------- frame loop ---------- */
const M=new Float32Array(MAXV*4);
let duckT=0,last=performance.now(),seed=0,tAll=0,touched=false;
function step(dt){
 // envelopes: fast attack, sustain while held, slow fade after release
 for(const v of voices){v.age+=dt;
  if(v.held){v.env+=(1-v.env)*Math.min(1,dt*14);}
  else{v.env+=(v.age<.06?(1-v.env)*Math.min(1,dt*30):0);v.env*=Math.exp(-dt/(v.age<.06?9:1.6));}}
 for(let i=voices.length-1;i>=0;i--)if(!voices[i].held&&voices[i].env<.003&&voices[i].age>.1)voices.splice(i,1);
 // the newest voice dominates the figure, like a new note taking over the plate
 let sum=0;M.fill(0);
 voices.forEach((v,k)=>{const rank=voices.length-1-k;const w=v.env*Math.pow(.35,rank);const m=v.mode;M[k*4]=m[0];M[k*4+1]=m[1];M[k*4+2]=m[2];M[k*4+3]=w;sum+=w;});
 const target=voices.reduce((a,v)=>Math.max(a,v.env),0);
 energy+=(target-energy)*Math.min(1,dt*10);
 if(target>.2&&window.LLONE_MUSIC&&(duckT+=dt)>4){duckT=0;LLONE_MUSIC.duck();}
 return sum>1e-5?1/sum*.5:0;
}
function simulate(dt){
 tAll+=dt;const norm=step(dt);lastNorm=norm;
 gl.bindVertexArray(vao);gl.useProgram(sim.p);gl.viewport(0,0,SIDE,SIDE);gl.disable(gl.BLEND);
 gl.uniform4fv(sim.u.uM,M);gl.uniform1f(sim.u.uE,energy);gl.uniform1f(sim.u.uNorm,norm);
 const SUB=3;
 for(let s=0;s<SUB;s++){
  gl.bindFramebuffer(gl.FRAMEBUFFER,PF[1-cur]);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,PT[cur]);gl.uniform1i(sim.u.uP,0);
  gl.uniform1f(sim.u.uSeed,++seed);gl.uniform1f(sim.u.uDt,dt*60/SUB);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);cur=1-cur;}
}
let lastNorm=0;
function render(){
 const norm=lastNorm;
 gl.bindFramebuffer(gl.FRAMEBUFFER,accF);gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
 gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
 gl.useProgram(pts.p);gl.bindVertexArray(emptyVao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,PT[cur]);gl.uniform1i(pts.u.uP,0);
 gl.uniform1i(pts.u.uSide,SIDE);gl.uniform4f(pts.u.uRect,rect[0],rect[1],rect[2],rect[3]);
 const plateCss=rect[2]*W;const grainPx=Math.max(1.2,plateCss/SIDE*1.15);gl.uniform1f(pts.u.uSize,grainPx);
 gl.drawArrays(gl.POINTS,0,N);gl.disable(gl.BLEND);
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(out.p);gl.bindVertexArray(vao);gl.viewport(0,0,W,H);
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,accT);gl.uniform1i(out.u.uA,0);
 gl.uniform2f(out.u.uRes,W,H);gl.uniform4f(out.u.uRect,rect[0],rect[1],rect[2],rect[3]);
 gl.uniform1f(out.u.uK,.55);gl.uniform1f(out.u.uE,energy);gl.uniform1f(out.u.uT,tAll%10);
 gl.uniform4fv(out.u.uM,M);gl.uniform1f(out.u.uNorm,norm);
 gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}
let visible=true;
if('IntersectionObserver' in window)new IntersectionObserver(en=>{const v=en[0].isIntersecting;if(v&&!visible){visible=true;last=performance.now();requestAnimationFrame(frame);}else visible=v;}).observe(cvs);
if('ResizeObserver' in window)new ResizeObserver(()=>resize()).observe(cvs);
const manual=false;
function frame(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;
 simulate(dt);render();
 if(visible)requestAnimationFrame(frame);
}
if(!manual)requestAnimationFrame(frame);
})();
