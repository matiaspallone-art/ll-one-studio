// Background music: "The Seventh Gate" (made with Gemini): only its opening, cut to a seamless 18.9 s loop. Played with the Web Audio API so the loop is
// seamless: the file carries one extra second of the loop's end before its start and one of its start after
// its end, so jumping from loopEnd back to loopStart lands on the same sound even if the decoder adds a few
// milliseconds of silence at the beginning. Browsers forbid sound before the visitor touches the page, so the
// music starts on the first tap, click or key press, or with the Music button. Turning it off is remembered.
// It steps aside while an instrument (Play the Chrome, Oil & Water) or a video with sound is playing.
(function(){
  var SRC = 'assets/music/seventh-gate-intro-v1.mp3';
  var LOOP = 832722 / 44100, PAD = 1; // loop length and the margin on each side, in seconds
  var LEVEL = 0.8, KEY = 'llone-music';
  var btn = document.getElementById('music');
  if(!btn || !(window.AudioContext || window.webkitAudioContext)){ if(btn) btn.hidden = true; return; }

  var ctx = null, gain = null, src = null, buffer = null, loading = null;
  var on = false, startedAt = 0, offset = 0, ducked = false, duckTimer = 0, held = [];
  var userOff = false;
  try{ userOff = localStorage.getItem(KEY) === 'off'; }catch(e){}

  function load(){
    if(loading) return loading;
    loading = fetch(SRC).then(function(r){ if(!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
    return loading;
  }
  function decode(){
    return load().then(function(data){
      if(buffer) return buffer;
      return new Promise(function(res, rej){ ctx.decodeAudioData(data.slice(0), res, rej); })
        .then(function(b){ buffer = b; return b; });
    });
  }
  function ensureCtx(){                // must run inside a tap or key press the first time
    if(!ctx){
      try{ if(navigator.audioSession) navigator.audioSession.type = 'playback'; }catch(e){}
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
    }
    if(ctx.state !== 'running'){ var p = ctx.resume(); if(p && p.catch) p.catch(function(){}); }
  }
  function playing(){ return !!src; }
  function fade(to, secs){
    var t = ctx.currentTime, g = gain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + secs);
  }
  function startSource(fadeIn){
    if(src || !buffer || !on || ducked || videoBusy() || document.hidden) return;
    src = ctx.createBufferSource(); src.buffer = buffer;
    src.loop = true; src.loopStart = PAD; src.loopEnd = PAD + LOOP;
    src.connect(gain);
    src.start(0, PAD + offset);
    startedAt = ctx.currentTime - offset;
    fade(LEVEL, fadeIn);
    label();
  }
  function stopSource(fadeOut){
    if(!src) return;
    offset = (ctx.currentTime - startedAt) % LOOP;     // resume where it left off
    var s = src; src = null;
    fade(0, fadeOut);
    try{ s.stop(ctx.currentTime + fadeOut + .05); }catch(e){}
    label();
  }
  function label(){
    var live = on && !userOff;
    btn.setAttribute('aria-pressed', live ? 'true' : 'false');
    btn.classList.toggle('is-playing', playing());
    btn.querySelector('.music-state').textContent = live ? 'on' : 'off';
  }

  function turnOn(fadeIn){
    on = true; userOff = false;
    try{ localStorage.removeItem(KEY); }catch(e){}
    ensureCtx(); label();
    decode().then(function(){ startSource(fadeIn); }).catch(function(){ on = false; label(); });
  }
  function turnOff(){
    on = false; userOff = true;
    try{ localStorage.setItem(KEY, 'off'); }catch(e){}
    stopSource(.8); label();
  }

  btn.addEventListener('click', function(){ if(on) turnOff(); else turnOn(1.5); });

  // first real interaction anywhere starts the music, unless the visitor turned it off before
  // or the tap is on an instrument (that sound comes first)
  var first = function(e){
    if(on || userOff) return done();
    var t = e.target;
    if(t.closest && (t.closest('#music') || t.closest('.instrument') || t.closest('.lb'))) return;
    turnOn(4); done();
  };
  var evs = ['touchend', 'click', 'keydown', 'pointerup'];
  function done(){ evs.forEach(function(ev){ document.removeEventListener(ev, first, true); }); }
  evs.forEach(function(ev){ document.addEventListener(ev, first, true); });

  // step aside for the instruments; come back a few seconds after the last note
  function duck(){
    if(!on) return;
    ducked = true; stopSource(.35);
    clearTimeout(duckTimer);
    duckTimer = setTimeout(function(){ ducked = false; startSource(3); }, 7000);
  }
  // and for any video playing with sound (the lightbox). A closed lightbox removes its video without a
  // pause event reaching the page, so a slow check brings the music back once no such video is playing.
  function videoBusy(){
    held = held.filter(function(v){ return v.isConnected && !v.paused && !v.ended && !v.muted; });
    return held.length > 0;
  }
  document.addEventListener('play', function(e){
    var v = e.target; if(v.tagName !== 'VIDEO' || v.muted) return;
    if(held.indexOf(v) < 0) held.push(v);
    if(on) stopSource(.5);
  }, true);
  setInterval(function(){ if(on && !src && !ducked && buffer) startSource(2); }, 1500);

  document.addEventListener('visibilitychange', function(){
    if(!on) return;
    if(document.hidden) stopSource(.2); else { ensureCtx(); startSource(1.5); }
  });

  // fetch the file quietly once the page has loaded, so the music can start right away
  if(!userOff) window.addEventListener('load', function(){ setTimeout(function(){ load().catch(function(){}); }, 1500); });
  label();

  window.LLONE_MUSIC = { duck: duck };
})();
