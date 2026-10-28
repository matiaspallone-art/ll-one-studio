// LL·ONE Studio — gallery, lightbox, contact form and the liquid-chrome hero.
(function(){
  var CFG = window.LLONE_CONFIG || {};
  var API = CFG.supabaseUrl + '/rest/v1/';
  var HEADERS = { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + CFG.supabaseKey };

  function ratio(a){ var p=String(a||'4/5').split('/'); var r=parseFloat(p[0])/parseFloat(p[1]||1); return r>0?r:.8; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  // Group works into rows: wide pieces travel in pairs, tall ones in threes.
  function rows(list){
    var out=[], row=[], width=0;
    list.forEach(function(w){
      row.push(w); width+=ratio(w.aspect);
      if(width>=2.2 || row.length===3){ out.push(row); row=[]; width=0; }
    });
    if(row.length) out.push(row);
    return out;
  }

  function frame(w, i){
    var r=ratio(w.aspect);
    var media = w.video_url
      ? '<video src="'+esc(w.video_url)+'" poster="'+esc(w.image_url)+'" muted loop playsinline autoplay preload="metadata"></video>'
      : '<img src="'+esc(w.image_url)+'" alt="'+esc(w.title)+'" loading="lazy" decoding="async">';
    var label = [w.year, w.series].filter(Boolean).join(' · ');
    return '<figure class="frame" style="flex:'+r+' 1 0">'
      + '<button class="open" type="button" data-i="'+i+'" aria-label="Open '+esc(w.title)+'">'
      + '<div class="plate" style="--ar:'+esc(w.aspect||'4/5')+'">'+media
      + (w.meta?'<div class="slot"><span>'+esc(w.series||'')+'</span><span>'+esc(w.meta)+'</span></div>':'')
      + '</div></button>'
      + '<figcaption><h3>'+esc(w.title)+'</h3><span class="label">'+esc(label)+'</span></figcaption></figure>';
  }

  var ALL=[];
  function render(works){
    ALL = works.slice().sort(function(a,b){return (a.sort||0)-(b.sort||0);});
    document.querySelectorAll('.reel[data-chapter]').forEach(function(reel){
      var ch=reel.getAttribute('data-chapter');
      var list=ALL.filter(function(w){return w.chapter===ch;});
      if(!list.length) return;                           // keep the "in production" studies
      reel.classList.add('justified');
      reel.innerHTML = rows(list).map(function(r){
        return '<div class="row">'+r.map(function(w){return frame(w, ALL.indexOf(w));}).join('')+'</div>';
      }).join('');
      var soon=document.querySelector('[data-soon="'+ch+'"]'); if(soon) soon.hidden=true;
    });
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)
      document.querySelectorAll('.reel video').forEach(function(v){v.removeAttribute('autoplay');v.pause();});
  }

  function load(){
    var local = window.LLONE_WORKS || [];
    if(!CFG.supabaseUrl){ render(local); return; }
    fetch(API+'works?select=*&published=eq.true&order=sort.asc', { headers: HEADERS })
      .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(rows){ render(rows && rows.length ? rows : local); })
      .catch(function(){ render(local); });
  }
  load();

  // Lightbox
  var lb=document.getElementById('lb'), stage=document.getElementById('lb-stage'), last=null;
  function openLb(w){
    stage.innerHTML = w.video_url
      ? '<video src="'+esc(w.video_url)+'" poster="'+esc(w.image_url)+'" controls autoplay loop playsinline></video>'
      : '<img src="'+esc(w.image_url)+'" alt="'+esc(w.title)+'">';
    document.getElementById('lb-title').textContent=w.title;
    document.getElementById('lb-meta').textContent=[w.series,w.year,w.meta].filter(Boolean).join(' · ');
    lb.hidden=false; document.body.style.overflow='hidden';
    document.getElementById('lb-close').focus();
  }
  function closeLb(){ lb.hidden=true; stage.innerHTML=''; document.body.style.overflow=''; if(last) last.focus(); }
  document.addEventListener('click',function(e){
    var b=e.target.closest('button.open'); if(!b) return;
    last=b; openLb(ALL[+b.getAttribute('data-i')]);
  });
  document.getElementById('lb-close').addEventListener('click',closeLb);
  lb.addEventListener('click',function(e){ if(e.target===lb||e.target===stage) closeLb(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&!lb.hidden) closeLb(); });

  // Contact form -> Supabase "inquiries"
  var form=document.getElementById('inquiry'), status=document.getElementById('f-status'), send=document.getElementById('f-send');
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var d={ name:form.name.value.trim(), email:form.email.value.trim(), project_type:form.project_type.value, message:form.message.value.trim() };
    if(!d.name||!/^\S+@\S+\.\S+$/.test(d.email)||!d.message){ status.textContent='Please add your name, a valid email and a message.'; return; }
    send.disabled=true; status.textContent='Sending…';
    fetch(API+'inquiries',{ method:'POST', headers:Object.assign({'Content-Type':'application/json',Prefer:'return=minimal'},HEADERS), body:JSON.stringify(d) })
      .then(function(r){ if(!r.ok) throw new Error(r.status); form.reset(); status.textContent='Message sent. I will reply within two days.'; })
      .catch(function(){ status.textContent='The message could not be sent. Please try again in a minute.'; })
      .then(function(){ send.disabled=false; });
  });
})();

// Liquid chrome hero (WebGL). Falls back to the CSS gradient if WebGL is unavailable.
(function(){
  var c=document.getElementById('chrome');
  var gl=c.getContext('webgl',{antialias:false,premultipliedAlpha:false});
  if(!gl){c.remove();return;}
  var vs='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var fs=[
  'precision highp float;uniform vec2 r;uniform float t;',
  'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
  'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
  'return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
  'float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}',
  'void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=(gl_FragCoord.xy-.5*r)/r.y;',
  'float T=t*.06;vec2 q=vec2(fbm(p*1.6+T),fbm(p*1.6-T+3.1));',
  'vec2 w=vec2(fbm(p*1.4+2.*q+vec2(1.7,9.2)+T*.7),fbm(p*1.4+2.*q+vec2(8.3,2.8)-T*.5));',
  'float f=fbm(p*1.2+2.4*w);',
  'float e=.004;float fx=fbm((p+vec2(e,0.))*1.2+2.4*w)-f;float fy=fbm((p+vec2(0.,e))*1.2+2.4*w)-f;',
  'vec3 N=normalize(vec3(-fx*90.,-fy*90.,1.));vec3 L=normalize(vec3(.5,.7,.6));',
  'float d=max(dot(N,L),0.);float s=pow(max(dot(reflect(-L,N),vec3(0,0,1)),0.),28.);',
  'float bands=.5+.5*sin(f*14.+N.x*3.);',
  'vec3 col=mix(vec3(.05,.055,.07),vec3(.78,.8,.83),bands*d);',
  'col+=s*vec3(1.,.97,.92);',
  'col+=vec3(.72,.58,.35)*pow(1.-abs(N.z),3.)*.35;',
  'float vig=smoothstep(1.25,.2,length((uv-vec2(.72,.5))*vec2(1.,1.3)));',
  'col*=vig;gl_FragColor=vec4(col,1.);}'
  ].join('\n');
  function sh(type,src){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return s;}
  var pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS)){c.remove();return;}
  gl.useProgram(pr);
  var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  var loc=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  var ur=gl.getUniformLocation(pr,'r'),ut=gl.getUniformLocation(pr,'t');
  var still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size(){var dpr=Math.min(devicePixelRatio||1,1.5);c.width=Math.round(c.clientWidth*dpr);c.height=Math.round(c.clientHeight*dpr);gl.viewport(0,0,c.width,c.height);}
  size();addEventListener('resize',size);
  var visible=true;
  if('IntersectionObserver' in window){new IntersectionObserver(function(en){visible=en[0].isIntersecting;}).observe(c);}
  var t0=performance.now();
  function draw(now){gl.uniform2f(ur,c.width,c.height);gl.uniform1f(ut,still?12.:(now-t0)/1000+12.);gl.drawArrays(gl.TRIANGLES,0,3);}
  if(still){draw(t0);return;}
  (function loop(now){if(visible)draw(now||t0);requestAnimationFrame(loop);})();
})();
