// One shared AudioContext for both instruments, unlocked the way iPhones need it:
// - Safari only starts audio from a "touchend"/"click", not from the first touch-down;
// - the side silent switch mutes Web Audio unless the page plays as media, so we ask for the
//   "playback" audio session and keep a silent <audio> loop running after the first tap.
(function(){
  var ac = null;
  function silentWav(){
    // 0.5 s of silence, 8 kHz mono 8-bit
    var n = 4000, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
    function s(o, t){ for(var i=0;i<t.length;i++) b[o+i] = t.charCodeAt(i); }
    s(0,'RIFF'); v.setUint32(4, 36+n, true); s(8,'WAVEfmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,8000,true); v.setUint32(28,8000,true); v.setUint16(32,1,true); v.setUint16(34,8,true); s(36,'data'); v.setUint32(40,n,true);
    for(var i=0;i<n;i++) b[44+i] = 128;
    var bin = ''; for(var j=0;j<b.length;j++) bin += String.fromCharCode(b[j]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  var tag = null;
  function unlock(){
    if(!ac) return;
    try{ if(navigator.audioSession) navigator.audioSession.type = 'playback'; }catch(e){}
    if(ac.state !== 'running') ac.resume();
    // a one-sample buffer started inside the gesture wakes the output on older iOS
    try{ var src = ac.createBufferSource(); src.buffer = ac.createBuffer(1, 1, 22050); src.connect(ac.destination); src.start(0); }catch(e){}
    if(!tag){
      tag = document.createElement('audio');
      tag.setAttribute('playsinline', ''); tag.setAttribute('x-webkit-airplay', 'deny');
      tag.loop = true; tag.preload = 'auto'; tag.src = silentWav();
    }
    if(tag.paused){ var p = tag.play(); if(p && p.catch) p.catch(function(){}); }
  }
  ['touchend', 'pointerup', 'click', 'keydown'].forEach(function(ev){ document.addEventListener(ev, unlock, true); });
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && ac && ac.state !== 'running') ac.resume(); });

  window.LLONE_AUDIO = function(){
    if(!ac){
      var AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null;
      try{ if(navigator.audioSession) navigator.audioSession.type = 'playback'; }catch(e){}
      ac = new AC({ latencyHint: 'interactive' });
    }
    unlock();
    return ac;
  };
})();
