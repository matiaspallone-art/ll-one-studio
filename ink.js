// Chapter VI — "Ink & Silk": thick primary oils on black that mix like real paint, played as falling water drops.
// Fluid: stable-fluids solver on the GPU (WebGL2). Ink is stored as amounts of red, yellow and blue pigment
// and shown through an RYB colour cube, so red + yellow becomes orange, yellow + blue green, blue + red violet.
// Sound: dense water drops (pre-rendered to assets/sound) in D Mixolydian; the top third of the canvas lets two more drops fall.
(function(){
  var canvas = document.getElementById('ink');
  if(!canvas) return;
  var hint = document.getElementById('ink-hint');
  var noteLabel = document.getElementById('ink-note');

  // ---------- sound ----------
  var NAMES = ['D','E','F♯','G','A','B','C'], SEMI = [0,2,4,5,7,9,10];   // D Mixolydian
  var notes = [];
  for(var o=0;o<3;o++) for(var k=0;k<7;k++) notes.push({ name: NAMES[k]+(3+o), midi: 50 + o*12 + SEMI[k] });
  notes = notes.slice(0, 16);                                             // D3 to E5

  function initAudio(){ if(window.LLONE_SOUND) LLONE_SOUND.unlock(); }
  function pluck(midi, double){ if(window.LLONE_SOUND) LLONE_SOUND.play('water-' + midi + '-' + (double ? 'double' : 'single')); }
  if(window.LLONE_SOUND) LLONE_SOUND.preload(notes.reduce(function(a, n){ return a.concat(['water-'+n.midi+'-single', 'water-'+n.midi+'-double']); }, []));

  // ---------- fluid ----------
  var gl = canvas.getContext('webgl2', { alpha:false, depth:false, stencil:false, antialias:false, preserveDrawingBuffer:false });
  var fallback = document.getElementById('ink-fallback');
  if(!gl || !gl.getExtension('EXT_color_buffer_float')){ if(fallback) fallback.hidden = false; gl = null; }
  if(gl) gl.getExtension('OES_texture_float_linear');

  var VS = '#version 300 es\nprecision highp float;in vec2 aPos;out vec2 vUv,vL,vR,vT,vB;uniform vec2 texel;' +
    'void main(){vUv=aPos*.5+.5;vL=vUv-vec2(texel.x,0.);vR=vUv+vec2(texel.x,0.);vT=vUv+vec2(0.,texel.y);vB=vUv-vec2(0.,texel.y);gl_Position=vec4(aPos,0.,1.);}';
  var HEAD = '#version 300 es\nprecision highp float;precision highp sampler2D;in vec2 vUv,vL,vR,vT,vB;out vec4 o;';
  var FS = {
    splat: HEAD + 'uniform sampler2D uTarget;uniform float aspect,radius;uniform vec3 color;uniform vec2 point;' +
      'void main(){vec2 p=vUv-point;p.x*=aspect;vec3 s=exp(-dot(p,p)/radius)*color;o=vec4(texture(uTarget,vUv).xyz+s,1.);}',
    advect: HEAD + 'uniform sampler2D uVelocity,uSource;uniform vec2 texel;uniform float dt,dissipation;' +
      'void main(){vec2 c=vUv-dt*texture(uVelocity,vUv).xy*texel;o=texture(uSource,c)/(1.+dissipation*dt);o.a=1.;}',
    divergence: HEAD + 'uniform sampler2D uVelocity;' +
      'void main(){float L=texture(uVelocity,vL).x,R=texture(uVelocity,vR).x,T=texture(uVelocity,vT).y,B=texture(uVelocity,vB).y;' +
      'vec2 C=texture(uVelocity,vUv).xy;if(vL.x<0.)L=-C.x;if(vR.x>1.)R=-C.x;if(vT.y>1.)T=-C.y;if(vB.y<0.)B=-C.y;o=vec4(.5*(R-L+T-B),0.,0.,1.);}',
    curl: HEAD + 'uniform sampler2D uVelocity;' +
      'void main(){float L=texture(uVelocity,vL).y,R=texture(uVelocity,vR).y,T=texture(uVelocity,vT).x,B=texture(uVelocity,vB).x;o=vec4(.5*(R-L-T+B),0.,0.,1.);}',
    vorticity: HEAD + 'uniform sampler2D uVelocity,uCurl;uniform float curl,dt;' +
      'void main(){float L=texture(uCurl,vL).x,R=texture(uCurl,vR).x,T=texture(uCurl,vT).x,B=texture(uCurl,vB).x,C=texture(uCurl,vUv).x;' +
      'vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+1e-4;f*=curl*C;f.y*=-1.;' +
      'vec2 v=texture(uVelocity,vUv).xy+f*dt;o=vec4(clamp(v,-1000.,1000.),0.,1.);}',
    pressure: HEAD + 'uniform sampler2D uPressure,uDivergence;' +
      'void main(){float L=texture(uPressure,vL).x,R=texture(uPressure,vR).x,T=texture(uPressure,vT).x,B=texture(uPressure,vB).x;' +
      'o=vec4((L+R+B+T-texture(uDivergence,vUv).x)*.25,0.,0.,1.);}',
    gradient: HEAD + 'uniform sampler2D uPressure,uVelocity;' +
      'void main(){float L=texture(uPressure,vL).x,R=texture(uPressure,vR).x,T=texture(uPressure,vT).x,B=texture(uPressure,vB).x;' +
      'vec2 v=texture(uVelocity,vUv).xy-vec2(R-L,T-B);o=vec4(v,0.,1.);}',
    scale: HEAD + 'uniform sampler2D uTexture;uniform float value;void main(){o=value*texture(uTexture,vUv);}',
    // pigment -> colour through the RYB cube (Gossett & Chen) on a black ground, then lit as thick impasto oil
    display: HEAD + 'uniform sampler2D uDye;uniform vec2 dyeTexel;uniform float frame;' +
      'vec3 ryb(vec3 c){' +
      ' vec3 W=vec3(.012,.012,.016),Rd=vec3(1.,.03,.09),Ye=vec3(1.,.82,0.),Bl=vec3(0.,.28,1.),' +
      ' Or=vec3(1.,.38,0.),Vi=vec3(.56,.05,.95),Gr=vec3(0.,.82,.3),K=vec3(.42,.17,.07);' +
      ' vec3 x0=mix(W,Rd,c.r),x1=mix(Ye,Or,c.r),x2=mix(Bl,Vi,c.r),x3=mix(Gr,K,c.r);' +
      ' return mix(mix(x0,x1,c.g),mix(x2,x3,c.g),c.b);}' +
      'float hh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}' +
      'float H(vec2 uv){vec3 a=1.-exp(-max(texture(uDye,uv).rgb,0.)*2.6);return dot(a,vec3(1.));}' +
      'void main(){vec3 d=texture(uDye,vUv).rgb;vec3 a=1.-exp(-max(d,0.)*2.6);' +
      ' float m=max(a.r,max(a.g,a.b));' +
      ' vec3 hue=a/max(m,1e-4);' +                                   // the mix of pigments, at full strength
      ' vec3 col=mix(ryb(vec3(0.)),ryb(hue),smoothstep(.02,.32,m));' +   // opaque paint: crisp edge onto black
      ' float h0=H(vUv),e=1.5;' +
      ' float hx=H(vUv+vec2(dyeTexel.x*e,0.))-H(vUv-vec2(dyeTexel.x*e,0.)),hy=H(vUv+vec2(0.,dyeTexel.y*e))-H(vUv-vec2(0.,dyeTexel.y*e));' +
      ' vec3 N=normalize(vec3(-hx*14.,-hy*14.,1.));vec3 L=normalize(vec3(-.45,.6,.65));' +
      ' float cover=smoothstep(0.,.35,h0);' +
      ' float dif=.62+.5*max(dot(N,L),0.);' +
      ' float spec=pow(max(dot(reflect(-L,N),vec3(0,0,1)),0.),70.)*cover;' +
      ' float rim=pow(1.-N.z,1.5)*cover;' +
      ' col=col*mix(1.,dif,cover)*(1.+.15*rim)+spec*vec3(1.,.97,.92)*.55;' +
      ' col+=(hh(gl_FragCoord.xy+frame)-.5)/255.;' +
      ' o=vec4(col,1.);}'
  };

  var programs = {}, quad, velocity, dye, divergence, curlTex, pressure, simW, simH, dyeW, dyeH;
  // oil is thick: velocity dies out fast (viscous), pigment barely fades.
  // Highest quality the device can hold: phones get a lighter start, and if a device can't keep up
  // in the first second, quality steps down once (see loop below).
  var SMALL = window.innerWidth < 700 || matchMedia('(pointer:coarse)').matches;
  var CFG = { SIM: SMALL ? 192 : 256, DYE: SMALL ? 1280 : 2048, PRESSURE_ITER: SMALL ? 28 : 36, CURL: 6,
    VEL_DISS: .9, DYE_DISS: .03, SPLAT_RADIUS: .0035, FORCE: 5200 };

  function compile(type, src){ var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function program(fs){
    var p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for(var i=0;i<n;i++){ var name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p: p, u: u };
  }
  function fbo(w, h, ifmt, fmt, filter){
    gl.activeTexture(gl.TEXTURE0);
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.HALF_FLOAT, null);
    var fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: tex, fb: fb, w: w, h: h, tx: 1/w, ty: 1/h,
      bind: function(unit){ gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); return unit; } };
  }
  function double(w, h, ifmt, fmt, filter){
    var a = fbo(w, h, ifmt, fmt, filter), b = fbo(w, h, ifmt, fmt, filter);
    return { w: w, h: h, tx: 1/w, ty: 1/h, get read(){ return a; }, get write(){ return b; }, swap: function(){ var t = a; a = b; b = t; } };
  }
  function res(base){
    var ar = canvas.width / canvas.height; if(ar < 1) ar = 1/ar;
    var max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    var lo = Math.round(base), hi = Math.min(max, Math.round(base * ar));
    return canvas.width > canvas.height ? { w: hi, h: lo } : { w: lo, h: hi };
  }
  function initTargets(){
    var s = res(CFG.SIM), d = res(CFG.DYE);
    simW = s.w; simH = s.h; dyeW = d.w; dyeH = d.h;
    velocity = double(simW, simH, gl.RG16F, gl.RG, gl.LINEAR);
    dye = double(dyeW, dyeH, gl.RGBA16F, gl.RGBA, gl.LINEAR);
    divergence = fbo(simW, simH, gl.R16F, gl.RED, gl.NEAREST);
    curlTex = fbo(simW, simH, gl.R16F, gl.RED, gl.NEAREST);
    pressure = double(simW, simH, gl.R16F, gl.RED, gl.NEAREST);
  }
  function blit(target){
    if(target){ gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  var DPR = Math.min(window.devicePixelRatio || 1, 3);   // full Retina sharpness, up to 3x phones
  function sizeCanvas(){
    var w = Math.round(canvas.clientWidth * DPR), h = Math.round(canvas.clientHeight * DPR);
    if(canvas.width === w && canvas.height === h) return false;
    canvas.width = w; canvas.height = h; return true;
  }

  if(gl){
    try{ for(var k in FS) programs[k] = program(FS[k]); }catch(err){ gl = null; if(fallback) fallback.hidden = false; }
  }
  if(gl){
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
    sizeCanvas(); initTargets();
    addEventListener('resize', function(){ if(sizeCanvas()) initTargets(); });
  }

  function use(name, texel){ var pr = programs[name]; gl.useProgram(pr.p); if(pr.u.texel && texel) gl.uniform2f(pr.u.texel, texel[0], texel[1]); return pr.u; }

  function splat(x, y, dx, dy, color, radius){
    var u = use('splat', [velocity.tx, velocity.ty]);
    gl.uniform1i(u.uTarget, velocity.read.bind(0));
    gl.uniform1f(u.aspect, canvas.width / canvas.height);
    gl.uniform2f(u.point, x, y);
    gl.uniform3f(u.color, dx, dy, 0);
    gl.uniform1f(u.radius, radius || CFG.SPLAT_RADIUS * 1.6);
    blit(velocity.write); velocity.swap();
    gl.uniform1i(u.uTarget, dye.read.bind(0));
    gl.uniform3f(u.color, color[0], color[1], color[2]);
    gl.uniform1f(u.radius, radius || CFG.SPLAT_RADIUS);
    blit(dye.write); dye.swap();
  }

  function step(dt){
    gl.disable(gl.BLEND);
    var u;
    u = use('curl', [velocity.tx, velocity.ty]); gl.uniform1i(u.uVelocity, velocity.read.bind(0)); blit(curlTex);
    u = use('vorticity', [velocity.tx, velocity.ty]); gl.uniform1i(u.uVelocity, velocity.read.bind(0)); gl.uniform1i(u.uCurl, curlTex.bind(1));
    gl.uniform1f(u.curl, CFG.CURL); gl.uniform1f(u.dt, dt); blit(velocity.write); velocity.swap();
    u = use('divergence', [velocity.tx, velocity.ty]); gl.uniform1i(u.uVelocity, velocity.read.bind(0)); blit(divergence);
    u = use('scale', [velocity.tx, velocity.ty]); gl.uniform1i(u.uTexture, pressure.read.bind(0)); gl.uniform1f(u.value, .8); blit(pressure.write); pressure.swap();
    u = use('pressure', [velocity.tx, velocity.ty]); gl.uniform1i(u.uDivergence, divergence.bind(0));
    for(var i=0;i<CFG.PRESSURE_ITER;i++){ gl.uniform1i(u.uPressure, pressure.read.bind(1)); blit(pressure.write); pressure.swap(); }
    u = use('gradient', [velocity.tx, velocity.ty]); gl.uniform1i(u.uPressure, pressure.read.bind(0)); gl.uniform1i(u.uVelocity, velocity.read.bind(1));
    blit(velocity.write); velocity.swap();
    u = use('advect', [velocity.tx, velocity.ty]);
    gl.uniform1i(u.uVelocity, velocity.read.bind(0)); gl.uniform1i(u.uSource, velocity.read.bind(0));
    gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, CFG.VEL_DISS); blit(velocity.write); velocity.swap();
    gl.uniform1i(u.uVelocity, velocity.read.bind(0)); gl.uniform1i(u.uSource, dye.read.bind(1));
    gl.uniform1f(u.dissipation, CFG.DYE_DISS); blit(dye.write); dye.swap();
  }

  var frameNo = 0;
  function render(){
    var u = use('display', [1/canvas.width, 1/canvas.height]);
    gl.uniform1i(u.uDye, dye.read.bind(0)); gl.uniform2f(u.dyeTexel, dye.tx, dye.ty); gl.uniform1f(u.frame, (frameNo++ % 64));
    blit(null);
  }

  // ---------- inks ----------
  var pointers = new Map();
  var PRIMARY = [[1.1,0,0],[0,1.1,0],[0,0,1.1]];   // red, yellow, blue pigment
  var PRIMARY_NAMES = ['Red','Yellow','Blue'];
  var nextInk = 0;

  if(gl){
    // the bowl is never empty: three drops already drifting when the page opens
    function seed(){
      splat(.3, .55, 220, -90, PRIMARY[0], .011);
      splat(.52, .42, -60, 200, PRIMARY[1], .011);
      splat(.72, .6, -230, -40, PRIMARY[2], .011);
    }
    seed();
    var visible = true, last = performance.now(), probe = 0, probeTime = 0, tuned = false;
    if('IntersectionObserver' in window) new IntersectionObserver(function(en){ visible = en[0].isIntersecting; }).observe(canvas);
    (function loop(now){
      var raw = now - last, dt = Math.min(raw / 1000, 1/30); last = now;
      if(visible && !tuned){
        // measure 60 frames; if the device averages under ~40 fps, step down once and start again
        probe++; if(probe > 10) probeTime += raw;              // skip the first frames, they include page start-up
        if(probe === 70){
          tuned = true;
          if(probeTime / 60 > 25){
            CFG.DYE = Math.round(CFG.DYE * .625); CFG.SIM = Math.round(CFG.SIM * .75); CFG.PRESSURE_ITER = 20;
            DPR = Math.min(DPR, 2); sizeCanvas(); initTargets(); seed();
          }
        }
      }
      if(visible){
        pointers.forEach(function(p){ if(p.moved){ p.moved = false; splat(p.x, p.y, p.dx*CFG.FORCE, p.dy*CFG.FORCE, p.color.map(function(c){ return c*.15; })); } });
        step(dt); render();
      }
      requestAnimationFrame(loop);
    })(performance.now());
  }

  // ---------- touch ----------
  function rel(e){ var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left)/r.width, y: (e.clientY - r.top)/r.height }; }
  function noteAt(x, y, id, force, p){
    var cell = Math.min(notes.length-1, Math.max(0, Math.floor(x * notes.length)));
    if(!force && p.cell === cell) return;
    p.cell = cell;
    var n = notes[cell];
    pluck(n.midi, y < .33, x);
    noteLabel.textContent = n.name;
    noteLabel.style.left = (x*100) + '%'; noteLabel.style.top = (y*100) + '%';
    noteLabel.style.color = ['#ff2a3d','#ffd21a','#3a7bff'][p.ink];
    noteLabel.classList.remove('show'); void noteLabel.offsetWidth; noteLabel.classList.add('show');
  }
  canvas.addEventListener('pointerdown', function(e){
    e.preventDefault(); initAudio();
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
    var q = rel(e), ink = nextInk; nextInk = (nextInk + 1) % 3;
    var p = { x: q.x, y: 1 - q.y, dx: 0, dy: 0, moved: false, color: PRIMARY[ink], ink: ink, cell: -1 };
    pointers.set(e.pointerId, p);
    if(gl){
      var a = Math.random() * Math.PI * 2;                       // each drop lands with a small swirl of its own
      splat(p.x, p.y, Math.cos(a)*240, Math.sin(a)*240, PRIMARY[ink], .0065);
    }
    noteAt(q.x, q.y, e.pointerId, true, p);
    if(hint) hint.classList.add('gone');
    canvas.setAttribute('aria-label', 'Interactive paint instrument. Last drop: ' + PRIMARY_NAMES[ink] + ' paint.');
  });
  canvas.addEventListener('pointermove', function(e){
    var p = pointers.get(e.pointerId); if(!p) return;
    var q = rel(e), ny = 1 - q.y;
    p.dx = q.x - p.x; p.dy = ny - p.y; p.x = q.x; p.y = ny; p.moved = true;
    noteAt(q.x, q.y, e.pointerId, false, p);
  });
  function up(e){ pointers.delete(e.pointerId); }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  var KEYS = 'asdfghjkl;';
  canvas.addEventListener('keydown', function(e){
    var i = KEYS.indexOf(e.key.toLowerCase()); if(i < 0) return;
    initAudio();
    var x = (i + .5) / notes.length, ink = nextInk; nextInk = (nextInk + 1) % 3;
    if(gl) splat(x, .5, 0, 300, PRIMARY[ink], .0045);
    noteAt(x, .5, 'k', true, { ink: ink, cell: -1 });
  });
})();
