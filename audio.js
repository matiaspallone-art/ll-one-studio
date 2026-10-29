// Sound for both instruments, played as ordinary media files (assets/sound/*.mp3).
// Media files are the most compatible way to make sound on the web: they play on iPhone with the silent
// switch on, on Android and on desktop. Phones only allow a media element to play after a real tap, so
// the first tap anywhere "unlocks" a small pool of players that every note then reuses.
(function(){
  var POOL = 12, pool = [], next = 0, unlocked = false, muted = false;
  var urls = {};     // note name -> blob URL once preloaded
  var SILENT = 'assets/sound/silence.mp3';

  function player(){
    var a = document.createElement('audio');
    a.setAttribute('playsinline', ''); a.setAttribute('webkit-playsinline', '');
    a.preload = 'auto';
    return a;
  }
  function label(){
    document.querySelectorAll('[data-sound]').forEach(function(b){
      b.textContent = muted ? 'Sound off' : (unlocked ? 'Sound on' : 'Tap for sound');
      b.setAttribute('aria-pressed', unlocked && !muted ? 'true' : 'false');
    });
  }
  // must run inside a tap
  function unlock(){
    if(unlocked) return;
    for(var i=0;i<POOL;i++){
      var a = pool[i] || (pool[i] = player());
      a.src = SILENT;
      var p = a.play(); if(p && p.catch) p.catch(function(){});
    }
    unlocked = true; label();
    document.querySelectorAll('.inst-hint').forEach(function(h){ h.classList.add('gone'); });
  }
  ['touchend', 'click', 'keydown', 'pointerup'].forEach(function(ev){
    document.addEventListener(ev, function(e){ if(!(e.target.closest && e.target.closest('[data-sound]'))) unlock(); }, true);
  });

  function preload(names){
    names.forEach(function(n){
      if(urls[n]) return; urls[n] = 'assets/sound/' + n + '.mp3';
      fetch(urls[n]).then(function(r){ return r.ok ? r.blob() : null; })
        .then(function(b){ if(b) urls[n] = URL.createObjectURL(b); }).catch(function(){});
    });
  }

  function play(name){
    if(muted) return;
    if(window.LLONE_MUSIC) LLONE_MUSIC.duck();   // background music steps aside while you play
    if(!unlocked) unlock();
    var a = pool[next++ % POOL] || player();
    try{ a.pause(); }catch(e){}
    a.src = urls[name] || ('assets/sound/' + name + '.mp3');
    try{ a.currentTime = 0; }catch(e){}
    var p = a.play(); if(p && p.catch) p.catch(function(){});
  }

  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-sound]'); if(!b) return;
    if(unlocked && !muted){ muted = true; pool.forEach(function(a){ try{ a.pause(); }catch(err){} }); }
    else { muted = false; unlock(); }
    label();
  });
  label(); document.addEventListener('DOMContentLoaded', label);

  window.LLONE_SOUND = { play: play, unlock: unlock, preload: preload };
})();
