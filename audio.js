// One shared AudioContext for both instruments, started the way phones need it:
// - audio may only start inside a real tap (touchend / click), so every tap retries;
// - on iPhone the side silent switch mutes Web Audio, so before the context exists we start a silent
//   <audio> loop and ask for the "playback" audio session, which makes the page sound like a video does;
// - each instrument shows a sound button whose label always tells the real state.
(function(){
  var ac = null, tag = null, muted = false;

  function silentWav(){
    var n = 4000, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
    function s(o, t){ for(var i=0;i<t.length;i++) b[o+i] = t.charCodeAt(i); }
    s(0,'RIFF'); v.setUint32(4, 36+n, true); s(8,'WAVEfmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,8000,true); v.setUint32(28,8000,true); v.setUint16(32,1,true); v.setUint16(34,8,true); s(36,'data'); v.setUint32(40,n,true);
    for(var i=0;i<n;i++) b[44+i] = 128;
    var bin = ''; for(var j=0;j<b.length;j++) bin += String.fromCharCode(b[j]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  function label(){
    var on = ac && ac.state === 'running' && !muted;
    document.querySelectorAll('[data-sound]').forEach(function(b){
      b.textContent = on ? 'Sound on' : (muted ? 'Sound off' : 'Tap for sound');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // must run synchronously inside a user gesture
  function start(){
    if(muted) return ac;
    try{ if(navigator.audioSession) navigator.audioSession.type = 'playback'; }catch(e){}
    if(!tag){
      tag = document.createElement('audio');
      tag.setAttribute('playsinline', ''); tag.setAttribute('webkit-playsinline', '');
      tag.loop = true; tag.src = silentWav();
    }
    if(tag.paused){ var p = tag.play(); if(p && p.catch) p.catch(function(){}); }
    if(!ac){
      var AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null;
      ac = new AC();
      ac.onstatechange = label;
    }
    if(ac.state !== 'running'){ var r = ac.resume(); if(r && r.then) r.then(label, label); }
    try{ var src = ac.createBufferSource(); src.buffer = ac.createBuffer(1, 1, ac.sampleRate); src.connect(ac.destination); src.start(0); }catch(e){}
    label();
    return ac;
  }

  ['touchend', 'click', 'keydown'].forEach(function(ev){
    document.addEventListener(ev, function(e){
      if(ac && !muted && ac.state !== 'running') start();
    }, true);
  });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && ac && !muted && ac.state !== 'running') ac.resume(); });

  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-sound]'); if(!b) return;
    if(ac && ac.state === 'running' && !muted){ muted = true; ac.suspend(); if(tag) tag.pause(); label(); return; }
    muted = false; start();
    document.querySelectorAll('.inst-hint').forEach(function(h){ h.classList.add('gone'); });
  });
  document.addEventListener('DOMContentLoaded', label);
  label();

  window.LLONE_AUDIO = start;
})();
