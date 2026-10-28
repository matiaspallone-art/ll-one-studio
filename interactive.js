// Chapter V — "Play the Chrome": a liquid-metal surface that is also an instrument.
// Every touch plays a note (a pre-rendered metallic bell from assets/sound) and opens a ripple in the chrome (WebGL).
(function(){
  var canvas = document.getElementById('instrument');
  if(!canvas) return;
  var hint = document.getElementById('inst-hint');
  var noteLabel = document.getElementById('inst-note');

  // ---------- sound ----------
  // D minor pentatonic over three octaves: any combination of taps sounds consonant.
  var NAMES = ['D','F','G','A','C'];
  var SEMI  = [0, 3, 5, 7, 10];
  var notes = [];
  for(var o=0;o<3;o++) for(var k=0;k<5;k++) notes.push({ name: NAMES[k] + (3+o), midi: 50 + o*12 + SEMI[k] });
  notes.push({ name:'D6', midi:86 });

  function initAudio(){ if(window.LLONE_SOUND) LLONE_SOUND.unlock(); }
  function play(midi, bright){ if(window.LLONE_SOUND) LLONE_SOUND.play('chrome-' + midi + '-' + (bright > .5 ? 'bright' : 'soft')); }
  if(window.LLONE_SOUND) LLONE_SOUND.preload(notes.reduce(function(a, n){ return a.concat(['chrome-'+n.midi+'-soft', 'chrome-'+n.midi+'-bright']); }, []));

  // ---------- picture ----------
  var gl = canvas.getContext('webgl', { antialias:false, premultipliedAlpha:false, powerPreference:'high-performance' });
  var MAX = 24;
  var ripples = []; // {x,y,t,a}
  var t0 = performance.now();
  function now(){ return (performance.now() - t0) / 1000; }

  if(gl){
    var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    // Same liquid chrome as the hero. Each note pushes the metal outward with one smooth, low swell.
    var fs = [
    'precision highp float;uniform vec2 R;uniform float T;uniform vec4 RP['+MAX+'];',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    'return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
    'void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=(gl_FragCoord.xy-.5*R)/R.y;',
    'for(int i=0;i<'+MAX+';i++){vec4 r=RP[i];float age=T-r.z;if(r.w<=0.||age<0.||age>7.)continue;',
    '  vec2 d=p-r.xy;float dist=length(d)+1e-4;float front=age*.38;',
    '  float wave=exp(-age*.7)*exp(-pow((dist-front)*3.2,2.));',
    '  float core=exp(-age*1.4)*exp(-dist*dist*14.);',
    '  p-=d/dist*wave*r.w*.11+d*core*r.w*.55;}',
    'float T2=T*.06;vec2 q=vec2(fbm(p*1.6+T2),fbm(p*1.6-T2+3.1));',
    'vec2 w=vec2(fbm(p*1.4+2.*q+vec2(1.7,9.2)+T2*.7),fbm(p*1.4+2.*q+vec2(8.3,2.8)-T2*.5));',
    'float f=fbm(p*1.2+2.4*w);',
    'float e=.004;float fx=fbm((p+vec2(e,0.))*1.2+2.4*w)-f;float fy=fbm((p+vec2(0.,e))*1.2+2.4*w)-f;',
    'vec3 N=normalize(vec3(-fx*90.,-fy*90.,1.));vec3 L=normalize(vec3(.5,.7,.6));',
    'float dd=max(dot(N,L),0.);float s=pow(max(dot(reflect(-L,N),vec3(0,0,1)),0.),28.);',
    'float bands=.5+.5*sin(f*14.+N.x*3.);',
    'vec3 col=mix(vec3(.05,.055,.07),vec3(.78,.8,.83),bands*dd);',
    'col+=s*vec3(1.,.97,.92);',
    'col+=vec3(.72,.58,.35)*pow(1.-abs(N.z),3.)*.35;',
    'float vig=smoothstep(1.35,.25,length((uv-.5)*vec2(R.x/R.y,1.)*.9));',
    'col*=vig;',
    'col+=(h(gl_FragCoord.xy+fract(T))-.5)/255.;',   // dither: no banding in the dark gradients
    'gl_FragColor=vec4(col,1.);}'
    ].join('\n');
    function sh(type, src){ var s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); return s; }
    var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr, gl.LINK_STATUS)) gl = null;
  }

  if(gl){
    gl.useProgram(pr);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T'), uRP = gl.getUniformLocation(pr, 'RP');
    var data = new Float32Array(MAX*4);

    var scale = Math.min(window.devicePixelRatio || 1, 2);   // full screen resolution, up to Retina
    function size(){ canvas.width = Math.round(canvas.clientWidth*scale); canvas.height = Math.round(canvas.clientHeight*scale); gl.viewport(0,0,canvas.width,canvas.height); }
    size(); addEventListener('resize', size);

    var visible = true;
    if('IntersectionObserver' in window) new IntersectionObserver(function(en){ visible = en[0].isIntersecting; }).observe(canvas);

    (function frame(){
      if(visible){
        var T = now();
        ripples = ripples.filter(function(r){ return T - r.t < 7; });
        data.fill(0);
        ripples.slice(-MAX).forEach(function(r, i){ data[i*4]=r.x; data[i*4+1]=r.y; data[i*4+2]=r.t; data[i*4+3]=r.a; });
        gl.uniform2f(uR, canvas.width, canvas.height);
        gl.uniform1f(uT, T);
        gl.uniform4fv(uRP, data);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      requestAnimationFrame(frame);
    })();
  }

  // ---------- touch ----------
  var lastCell = {};
  function hit(e, force){
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if(x<0||x>1||y<0||y>1) return;
    var cell = Math.min(notes.length-1, Math.floor(x * notes.length));
    if(!force && lastCell[e.pointerId] === cell) return;      // dragging plays a note each time you cross into a new one
    lastCell[e.pointerId] = cell;
    var bright = 1 - y;                                          // higher on the surface = brighter, longer ring
    var n = notes[cell];
    play(n.midi, bright, x);
    // same coordinate space as the shader
    var aspect = r.width / r.height;
    ripples.push({ x: (x - .5) * aspect, y: (.5 - y), t: now(), a: .7 + bright*.5 });
    if(ripples.length > MAX) ripples.shift();
    noteLabel.textContent = n.name;
    noteLabel.style.left = (x*100) + '%'; noteLabel.style.top = (y*100) + '%';
    noteLabel.classList.remove('show'); void noteLabel.offsetWidth; noteLabel.classList.add('show');
    if(hint) hint.classList.add('gone');
  }
  canvas.addEventListener('pointerdown', function(e){
    e.preventDefault(); initAudio();
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
    hit(e, true);
  });
  canvas.addEventListener('pointermove', function(e){ if(e.buttons || e.pointerType === 'touch') hit(e, false); });
  canvas.addEventListener('pointerup', function(e){ delete lastCell[e.pointerId]; });
  canvas.addEventListener('pointercancel', function(e){ delete lastCell[e.pointerId]; });

  // keyboard: keys A to ; play the first ten notes, for people without a pointer
  var KEYS = 'asdfghjkl;';
  canvas.addEventListener('keydown', function(e){
    var i = KEYS.indexOf(e.key.toLowerCase()); if(i < 0) return;
    initAudio();
    var r = canvas.getBoundingClientRect();
    hit({ clientX: r.left + (i + .5) / notes.length * r.width, clientY: r.top + r.height*.45, pointerId: 'k' }, true);
  });
})();
