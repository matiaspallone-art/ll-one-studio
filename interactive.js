// Chapter V — "Play the Chrome": a liquid-metal surface that is also an instrument.
// Every touch plays a note (Web Audio, metallic FM bell) and opens a ripple in the chrome (WebGL).
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

  var ac = null, master = null, reverb = null;
  function initAudio(){
    if(ac) { if(ac.state==='suspended') ac.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = .55;
    var comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    // synthetic hall: decaying stereo noise as impulse response
    reverb = ac.createConvolver();
    var len = ac.sampleRate * 3.2, ir = ac.createBuffer(2, len, ac.sampleRate);
    for(var ch=0;ch<2;ch++){ var d = ir.getChannelData(ch); for(var i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 3.2); }
    reverb.buffer = ir;
    var wet = ac.createGain(); wet.gain.value = .42;
    master.connect(comp); reverb.connect(wet); wet.connect(comp); comp.connect(ac.destination);
  }

  // metallic bell: carrier + inharmonic FM modulator, with a soft sine body underneath
  function play(midi, bright, x){
    if(!ac) return;
    var t = ac.currentTime, f = 440 * Math.pow(2, (midi-69)/12);
    var out = ac.createGain(); out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(.32, t + .006);
    out.gain.exponentialRampToValueAtTime(.0008, t + 2.8 + bright*1.4);
    var pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if(pan){ pan.pan.value = (x*2-1)*.7; out.connect(pan); pan.connect(master); pan.connect(reverb); }
    else { out.connect(master); out.connect(reverb); }

    var car = ac.createOscillator(); car.frequency.value = f;
    var mod = ac.createOscillator(); mod.frequency.value = f * 3.507;
    var idx = ac.createGain();
    idx.gain.setValueAtTime(f * (1.2 + bright*2.4), t);
    idx.gain.exponentialRampToValueAtTime(f * .02, t + 1.6);
    mod.connect(idx); idx.connect(car.frequency); car.connect(out);

    var body = ac.createOscillator(); body.type = 'sine'; body.frequency.value = f;
    var bg = ac.createGain(); bg.gain.value = .5; body.connect(bg); bg.connect(out);

    var shimmer = ac.createOscillator(); shimmer.frequency.value = f * 2.756;
    var sg = ac.createGain(); sg.gain.setValueAtTime(.12*bright, t); sg.gain.exponentialRampToValueAtTime(.0005, t + .9);
    shimmer.connect(sg); sg.connect(out);

    var end = t + 4.5;
    [car, mod, body, shimmer].forEach(function(o){ o.start(t); o.stop(end); });
  }

  // ---------- picture ----------
  var gl = canvas.getContext('webgl', { antialias:false, premultipliedAlpha:false });
  var MAX = 24;
  var ripples = []; // {x,y,t,a}
  var t0 = performance.now();
  function now(){ return (performance.now() - t0) / 1000; }

  if(gl){
    var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    var fs = [
    'precision highp float;',
    'uniform vec2 R;uniform float T;uniform vec4 RP['+MAX+'];',
    'float h1(vec2 p){p=fract(p*vec2(443.897,441.423));p+=dot(p,p.yx+19.19);return fract((p.x+p.y)*p.x);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1,0)),f.x),mix(h1(i+vec2(0,1)),h1(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<4;i++){v+=a*n(p);p=m*p+3.1;a*=.5;}return v;}',
    'float field(vec2 p){',
    '  vec2 L=vec2(cos(T*.07),sin(T*.07))*.6;',
    '  vec2 q=vec2(fbm(p*.9+L),fbm(p*.9-L+5.2));',
    '  float h=fbm(p*.9+2.*q)*.55;',
    '  for(int i=0;i<'+MAX+';i++){',
    '    vec4 r=RP[i]; float age=T-r.z; if(r.w<=0.||age<0.||age>6.)continue;',
    '    vec2 d=p-r.xy; float dist=length(d); float front=age*.55;',
    '    float env=exp(-age*.75)*exp(-pow((dist-front)*2.4,2.));',
    '    h+=r.w*env*cos((dist-front)*22.)*.32;',
    '    h+=r.w*exp(-age*2.)*exp(-dist*dist*30.)*.25;',   // the dimple where the finger lands
    '  }',
    '  return h;',
    '}',
    'vec3 env(vec3 d){float y=d.y;',
    '  vec3 sky=vec3(.55,.58,.62);',
    '  vec3 c=mix(vec3(.02,.022,.028)+sky*.06*smoothstep(-1.,-.1,y),sky*.5,smoothstep(-.07,.07,y))+sky*.5*smoothstep(0.,.9,y);',
    '  c+=vec3(1.)*smoothstep(.2,.12,abs(d.x-.35))*smoothstep(-.1,.3,y)*2.1;',
    '  c+=vec3(1.,.82,.55)*smoothstep(.07,.03,abs(d.x+.55))*smoothstep(-.5,.2,y)*1.6;',
    '  return c;}',
    'vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}',
    'void main(){',
    '  vec2 p=(gl_FragCoord.xy-.5*R)/R.y*1.6;',
    '  float e=.004; float f=field(p);',
    '  float fx=field(p+vec2(e,0.))-f, fy=field(p+vec2(0.,e))-f;',
    '  vec3 N=normalize(vec3(-fx/e*.42,-fy/e*.42,1.));',
    '  vec3 Rf=reflect(vec3(0.,0.,-1.),N);',
    '  vec3 c=env(Rf)*(.6+.4*pow(1.-N.z,3.));',
    '  vec2 uv=gl_FragCoord.xy/R; c*=mix(1.,smoothstep(1.2,.3,length((uv-.5)*vec2(R.x/R.y,1.))),.6);',
    '  c=pow(aces(c*1.15),vec3(1./2.2));',
    '  gl_FragColor=vec4(c,1.);}'
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

    var scale = Math.min(window.devicePixelRatio || 1, 1.25) * (window.innerWidth < 700 ? .8 : 1);
    function size(){ canvas.width = Math.round(canvas.clientWidth*scale); canvas.height = Math.round(canvas.clientHeight*scale); gl.viewport(0,0,canvas.width,canvas.height); }
    size(); addEventListener('resize', size);

    var visible = true;
    if('IntersectionObserver' in window) new IntersectionObserver(function(en){ visible = en[0].isIntersecting; }).observe(canvas);

    (function frame(){
      if(visible){
        var T = now();
        ripples = ripples.filter(function(r){ return T - r.t < 6; });
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
    ripples.push({ x: (x - .5) * aspect * 1.6, y: (.5 - y) * 1.6, t: now(), a: .6 + bright*.6 });
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
