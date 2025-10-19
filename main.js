// =================== MentaPet - main.js (Vercel version) ===================

let petRef = null; // holds { setEmotion }

// ---------- Crisis + mood keywords (instant local safety) ----------
const CRISIS = [
  "suicide","kill myself","end it","i want to die","i wanna die","don't want to live","don’t want to live",
  "self-harm","cut myself","hopeless","worthless","no reason to live","give up","i want to disappear"
];

// ---------- Local keywords -> mood (fallback if AI unavailable) ----------
const MOODS = {
  happy:["happy","good","great","excited","grateful","proud","hopeful"],
  calm:["okay","fine","calm","neutral","alright","chillin"],
  sad:["sad","down","lonely","tired","upset","depressed","cry"],
  stressed:["stressed","anxious","overwhelmed","panic","angry","worried","nervous"]
};

const REPLIES = {
  happy:"Love that energy. One tiny win you’re excited about today?",
  calm:"Steady is good. One gentle act of care?",
  sad:"That sounds heavy. Your feelings make sense. Small steps count.",
  stressed:"You’ve carried a lot. Let’s breathe together for a moment."
};

const AFFIRMATIONS = [
  "You’ve survived 100% of your hard days.",
  "Small steps still move you forward.",
  "Your feelings are valid and temporary.",
  "Rest is productive when you need it."
];

const qs = s => document.querySelector(s);

// ---------------------------------------------------------------------------
// Speech helpers (nicer voice + mood-aware tone)
async function getVoicesReady(timeoutMs = 2000){
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (voices && voices.length) return voices;

  return await new Promise(resolve=>{
    const done=()=>resolve(synth.getVoices());
    let tm=setTimeout(done, timeoutMs);

    const handler=()=>{ clearTimeout(tm); synth.removeEventListener('voiceschanged', handler); done(); };
    synth.addEventListener('voiceschanged', handler);

    let tries=0;
    const poll=setInterval(()=>{
      tries++;
      voices=synth.getVoices();
      if(voices && voices.length){
        clearInterval(poll); clearTimeout(tm); synth.removeEventListener('voiceschanged', handler); resolve(voices);
      }
      if(tries>10) clearInterval(poll);
    },200);
  });
}
async function pickVoiceByName(name){
  const voices = await getVoicesReady();
  if (name){
    const v = voices.find(v => v.name === name);
    if (v) return v;
  }
  // sensible fallbacks
  const preferred = [
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Google UK English Female",
    "Google US English",
    "Samantha","Joanna","Luna"
  ];
  let v = voices.find(v => preferred.includes(v.name));
  if (v) return v;

  v = voices.find(v => v.lang?.startsWith('en') && /female|samantha|aria|jenny|joanna|luna/i.test(v.name));
  if (v) return v;

  v = voices.find(v => v.lang?.startsWith('en'));
  return v || voices[0];
}

function getVoicePrefs(){
  return {
    autoSpeak: (localStorage.getItem('mentapet:autoSpeak') ?? 'true') === 'true',
    rate: parseFloat(localStorage.getItem('mentapet:rate') || '1'),
    voiceName: localStorage.getItem('mentapet:voice') || ''   // ✅ matches settings modal
  };
}

async function speak(text, mood='calm'){
  try{
    const prefs = getVoicePrefs();
    if (!('speechSynthesis' in window)) return;

    // If you want the toggle to gate *all* speaking by default,
    // only call speak() when autoSpeak is on:
    if (!prefs.autoSpeak) return;

    const synth = window.speechSynthesis;
    synth.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';

    // base from user pref
    const baseRate  = Math.min(1.5, Math.max(0.5, prefs.rate || 1));
    const basePitch = 1.05;

    // gentle mood tweaks
    if (mood === 'happy'){ u.rate = baseRate + 0.05; u.pitch = basePitch + 0.10; }
    else if (mood === 'sad'){ u.rate = Math.max(0.5, baseRate - 0.05); u.pitch = basePitch - 0.05; }
    else if (mood === 'stressed'){ u.rate = baseRate; u.pitch = basePitch; }
    else { u.rate = baseRate; u.pitch = basePitch; }

    const v = await pickVoiceByName(prefs.voiceName);
    if (v) u.voice = v;

    synth.speak(u);
  }catch(e){
    console.error('Speech error:', e);
  }
}



// ---------------------------------------------------------------------------
// API: analyze text with OpenAI via Vercel serverless function (/api/ai)
// Supports JSON or SSE streaming responses.
// Returns { mood, risk, reply, actions[] }.
async function analyzeTextWithAI(text){
  const pet = localStorage.getItem('mentapet:pet') || 'nova';
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, pet })
  });

  // If server streams (text/event-stream), read line-by-line and update UI
  const ctype = res.headers.get('content-type') || '';
  if (ctype.includes('text/event-stream') || (!ctype.includes('application/json') && res.body)) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let reply = '';
    let mood = 'calm', risk = false, actions = [];

    while(true){
      const { value, done } = await reader.read();
      if(done) break;
      const chunk = decoder.decode(value, { stream:true });
      const lines = chunk.split('\n').filter(l=>l.trim()!=='');
      for(const line of lines){
        if(!line.startsWith('data:')) continue;
        // each event expected like: data: {"type":"content"|"meta", ...}
        try{
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.content){
            reply += evt.content;
            setReply(reply, false);         // incremental update
          }
          if (evt.mood) mood = evt.mood;
          if (typeof evt.risk === 'boolean') risk = evt.risk;
          if (Array.isArray(evt.actions)) actions = evt.actions;
        }catch{}
      }
    }
    return { mood, risk, reply, actions };
  }

  // Otherwise plain JSON:
  const data = await res.json();
  return {
    mood: data.mood || 'calm',
    risk: !!data.risk,
    reply: data.reply || REPLIES.calm,
    actions: Array.isArray(data.actions) ? data.actions : []
  };
}

// ================== Pet builders (HTML-only) ==================
function mountDog(container){
  container.innerHTML = `
    <div class="dog">
      <div class="head">
        <div class="ear left"></div>
        <div class="ear right"></div>
        <div class="eye left"></div>
        <div class="eye right"></div>
        <div class="snout"><div class="nose"></div><div class="mouth"></div></div>
      </div>
      <div class="body"></div>
      <div class="tail"></div>
    </div>
  `;
  const mouth = container.querySelector('.mouth');
  const tail  = container.querySelector('.tail');

  function setEmotion(state){
    mouth.classList.remove('happy','sad');
    tail.style.animation = '';
    tail.style.transform  = 'translateX(-10px) translateZ(-50px) rotateZ(0deg)';
    if(state==='happy'){
      mouth.classList.add('happy');
      tail.style.animation = 'wag .6s ease-in-out infinite alternate';
    }else if(state==='sad'){
      mouth.classList.add('sad');
      tail.style.transform  = 'translateX(-10px) translateZ(-50px) rotateZ(-12deg) rotateX(10deg)';
    }
  }
  setEmotion('neutral');
  return { setEmotion };
}

function mountCat(container){
  container.innerHTML = `
    <div class="animal cat">
      <div class="head">
        <div class="ear left"></div><div class="ear right"></div>
        <div class="eye left"></div><div class="eye right"></div>
        <div class="nose"></div><div class="mouth"></div>
        <div class="whisker left1"></div><div class="whisker left2"></div>
        <div class="whisker right1"></div><div class="whisker right2"></div>
      </div>
      <div class="body"></div>
    </div>
  `;
  const mouth = container.querySelector('.mouth');
  function setEmotion(state){
    // simple: smile (curved) when happy, flat otherwise
    mouth.style.borderBottom = (state==='happy') ? '3px solid #000' : '3px solid #000';
    mouth.style.transform     = (state==='sad') ? 'translateX(-50%) rotate(180deg)' : 'translateX(-50%)';
  }
  setEmotion('neutral');
  return { setEmotion };
}

function mountBear(container){
  container.innerHTML = `
    <div class="animal panda">
      <div class="head">
        <div class="ear left"></div><div class="ear right"></div>
        <div class="eye-spot left"></div><div class="eye-spot right"></div>
        <div class="eye left"></div><div class="eye right"></div>
        <div class="nose"></div><div class="mouth"></div>
      </div>
      <div class="body">
        <div class="arm left"></div><div class="arm right"></div>
      </div>
    </div>
  `;
  const mouth = container.querySelector('.mouth');
  const armsL = container.querySelector('.arm.left');
  const armsR = container.querySelector('.arm.right');
  function setEmotion(state){
    // wave arms when happy, neutral otherwise, tiny droop when sad
    armsL.style.transform = armsR.style.transform = '';
    mouth.style.transform = 'translateX(-50%)';
    if(state==='happy'){
      armsL.style.animation = armsR.style.animation = 'pandaWave .9s ease-in-out infinite';
    }else{
      armsL.style.animation = armsR.style.animation = '';
      if(state==='sad') mouth.style.transform = 'translateX(-50%) rotate(180deg)';
    }
  }
  setEmotion('neutral');
  return { setEmotion };
}


function updatePetEmotionFromMood(mood){
  if (!petRef || !petRef.setEmotion) return;
  const state = mood==='happy' ? 'happy' : mood==='sad' ? 'sad' : 'neutral';
  petRef.setEmotion(state);
}

// tiny wave keyframes (can live in JS via <style> if you prefer)
(function ensureBearAnim(){
  const id='pandaWaveKey';
  if(document.getElementById(id)) return;
  const style=document.createElement('style');
  style.id=id;
  style.textContent=`@keyframes pandaWave{0%{transform:rotate(0deg)}50%{transform:rotate(-18deg)}100%{transform:rotate(0deg)}}`;
  document.head.appendChild(style);
})();


// ---------------------------------------------------------------------------
// Page init
window.addEventListener('DOMContentLoaded', ()=>{

  window.addEventListener('DOMContentLoaded', () => {
  const chosen = localStorage.getItem('mentapet:pet') || 'dog'; // values: 'dog' | 'cat' | 'bear'
  const slot   = document.getElementById('petSlot');
  if (slot) {
    if (chosen === 'dog' || chosen === 'lumi') {        // if you previously saved 'lumi' for dog
      petRef = mountDog(slot);
    } else if (chosen === 'cat' || chosen === 'nova') { // if you previously saved 'nova' for cat
      petRef = mountCat(slot);
    } else if (chosen === 'bear' || chosen === 'bub') { // if you previously saved 'bub' for bear
      petRef = mountBear(slot);
    } else {
      petRef = mountDog(slot); // fallback
    }
  }

  hookUI();
  initSTT();        // <— ADD THIS LINE

  try {
    const last = localStorage.getItem('mentapet:lastMood');
    if (last) renderMood(last);
  } catch (e) {}
  loadHelplines();

  // ... your existing hookUI(), loadHelplines(), etc.
});

  const pet = localStorage.getItem('mentapet:pet') || 'nova';
  const petAnim = qs('#petAnim');
  if(petAnim){
    petAnim.src = pet==='lumi'
      ? 'https://assets1.lottiefiles.com/packages/lf20_b3xkpv.json'
      : pet==='bub'
      ? 'https://assets8.lottiefiles.com/packages/lf20_4kx2q32n.json'
      : 'https://assets2.lottiefiles.com/packages/lf20_hy4txr.json';
  }
  hookUI();
  try{
    const last = localStorage.getItem('mentapet:lastMood');
    if(last) renderMood(last);
  }catch(e){}
  loadHelplines();
});

function hookUI(){
  qs('#analyzeBtn')?.addEventListener('click', onAnalyze);
  qs('#affirmBtn')?.addEventListener('click', showAffirmation);
  qs('#breatheBtn')?.addEventListener('click', startBreathing);
  qs('#learnBtn')?.addEventListener('click', learnTip);
  qs('#openCare')?.addEventListener('click', openCareMode);
  qs('#resourcesBtn')?.addEventListener('click', () => {
    window.location.href = 'resources.html';
  });
  qs('#closeCare')?.addEventListener('click', ()=> qs('#careModal').classList.add('hidden'));
  qs('#groundBtn')?.addEventListener('click', startBreathing);
  qs('#stopBreath')?.addEventListener('click', stopBreathing);
  qs('#contrastBtn')?.addEventListener('click', ()=> document.body.classList.toggle('a11y-contrast'));
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') qs('#careModal')?.classList.add('hidden'); });
}

// ---------------------------------------------------------------------------
// Analyze user input -> AI (with instant crisis fallback)
async function onAnalyze(){
  const raw = (qs('#moodInput')?.value || '').trim();
  if(!raw){ setReply("Try typing a sentence about how you feel."); return; }

  const lower = raw.toLowerCase();

  // 0) Instant local crisis detection (works even if API down)
  if (CRISIS.some(k => lower.includes(k))) {
    renderMood('sad');
    setReply("I’m really concerned about your safety. You deserve support from a real person.");
    openCareMode();
    return;
  }

  // 1) Ask AI for mood + reply
  setReply("…thinking with your pet");
  try {
    const { mood, risk, reply, actions } = await analyzeTextWithAI(raw);

    // 2) Mood styling
    renderMood(mood || 'calm');

    // 3) Care Mode if risk
    if (risk) {
      setReply("I’m really concerned about your safety. You deserve support from a real person.");
      openCareMode();
      return;
    }

    // 4) Show reply + voice + optional action suggestions
    setReply(reply || empathy(mood || 'calm'), false);
    if (typeof petTalk === 'function') petTalk(reply, mood);
    speak(reply, mood);

    const replyBox = qs('#reply');
    if (replyBox && Array.isArray(actions) && actions.length){
      const wrap = document.createElement('div');
      wrap.style.marginTop = '8px';
      actions.slice(0,3).forEach(a=>{
        const b = document.createElement('button');
        b.className = 'ghost small';
        b.textContent = a;
        b.onclick = ()=>{
          const al = a.toLowerCase();
          if(al.includes('breathe')) startBreathing();
          else if(al.includes('affirm')) showAffirmation();
          else setReply(`${a} — nice tiny step.`, false);
        };
        wrap.appendChild(b);
      });
      replyBox.appendChild(wrap);
    }

    try{ localStorage.setItem('mentapet:lastMood', mood || 'calm'); }catch(e){}
  } catch (err) {
    console.error('AI error/fallback:', err);
    // 5) Fallback: simple local classification + gentle message
    const { mood } = classify(lower);
    renderMood(mood);
    setReply(`${empathy(mood)} Try a 60-second breath?`, false);
  }
}

// ---------- Local classifier (fallback only) ----------
function classify(text){
  for(const k of CRISIS) if(text.includes(k)) return { mood:'sad', crisis:true };
  let scores = {happy:0, calm:0, sad:0, stressed:0};
  for(const [label, words] of Object.entries(MOODS)){
    for(const w of words){ if(text.includes(w)) scores[label]++; }
  }
  const top = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
  return { mood: (top && top[1]>0) ? top[0] : 'calm', crisis:false };
}

// ---------- Mood rendering / animation ----------
function renderMood(mood){
  document.body.classList.remove('mood-happy','mood-calm','mood-sad','mood-stressed');
  document.body.classList.add(`mood-${mood}`);
  updatePetEmotionFromMood(mood);

  const statusText = {
    happy:"Your pet is joyful and playful.",
    calm:"Your pet feels calm.",
    sad:"Your pet looks a little sad—staying with you.",
    stressed:"Your pet is tense—ready to breathe with you."
  }[mood] || "Your pet is here with you.";

  const statusEl = qs('#petStatus');
  if(statusEl) statusEl.textContent = statusText;

  const player = qs('#petAnim');
  if(player && typeof player.setSpeed === 'function'){
    player.setSpeed(mood==='sad' ? 0.7 : mood==='stressed' ? 1.15 : 1);
  }

  // ---------- Dog roll + sounds ----------
if (mood === 'happy') {
  player.classList.add('roll');
  setTimeout(() => player.classList.remove('roll'), 2000);

  // 🐕 Bark sound
  const bark = new Audio('bark.mp3');
  bark.play().catch(err => console.log('Audio blocked by browser:', err));
}

if (mood === 'sad') {
  // 🐾 Whine sound
  const whine = new Audio('whine.mp3');
  whine.play().catch(err => console.log('Audio blocked by browser:', err));
}

}

function empathy(mood){ return REPLIES[mood] || REPLIES.calm; }

// ---------- Reply box + TTS ----------
function setReply(text, speakIt=false){
  const el = qs('#reply');
  if(!el) return;
  // preserve newlines; allow long paragraphs
  el.innerHTML = String(text).replace(/\n/g,'<br>');
  if(speakIt) speak(text);
}

// ---------- Care Mode ----------
async function loadHelplines(){
  try{
    const res = await fetch('data/helplines.json');
    const list = await res.json();
    const wrap = qs('#hotlines');
    if(!wrap) return;
    wrap.innerHTML = '';
    list.forEach(item=>{
      if(item.type==='web'){
        const a=document.createElement('a'); a.href=item.url; a.target='_blank'; a.rel='noopener';
        a.textContent = item.name; a.className='hotline'; wrap.appendChild(a);
      }else{
        const a=document.createElement('a'); a.href=`tel:${item.contact}`; a.textContent=`Call ${item.name}`;
        a.className='hotline'; wrap.appendChild(a);
      }
    });
  }catch(e){}
}

function openCareMode(){
  setReply("I’m worried about you. You deserve support from a real person.");
  qs('#careModal')?.classList.remove('hidden');
  if(navigator.vibrate) try{ navigator.vibrate([60,40,60]); }catch(e){}
}

// ---------- Breathing ----------
let breathTimer=null, breathT=0, autoStop=null;
function startBreathing(){
  qs('#breathOverlay')?.classList.remove('hidden');
  breathT=0; updateBreathText();
  clearInterval(breathTimer);
  breathTimer=setInterval(()=>{
    breathT=(breathT+1)%8; updateBreathText();
  },1000);
  clearTimeout(autoStop); autoStop=setTimeout(stopBreathing, 60000);
}
function updateBreathText(){
  const el = qs('#breathText');
  if(el) el.textContent = (breathT<4) ? "Inhale…" : "Exhale…";
}
function stopBreathing(){
  clearInterval(breathTimer);
  clearTimeout(autoStop);
  qs('#breathOverlay')?.classList.add('hidden');
}

// ---------- Affirmations ----------
function showAffirmation(){
  const msg = AFFIRMATIONS[Math.floor(Math.random()*AFFIRMATIONS.length)];
  setReply(`💖 ${msg}`, true);
}

// ---------- Learn Mode ----------
async function learnTip(){
  try{
    const res = await fetch('data/lessons.json');
    const tips = await res.json();
    const tip = tips[Math.floor(Math.random()*tips.length)];
    setReply(`📘 ${tip}`, true);
  }catch(e){
    setReply("📘 Inclusive tip: Use clear color contrast for readability.", true);
  }
}

// ---------- Speech to Text (Web Speech API) ----------
let rec = null;
let recActive = false;

function supportsSTT() {
  return ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
}

function initSTT() {
  const micBtn = qs('#micBtn');
  const hint   = qs('#micHint');
  const input  = qs('#moodInput');

  if (!micBtn) return; // no button on page

  if (!supportsSTT()) {
    micBtn.disabled = true;
    micBtn.title = 'Speech input not supported in this browser';
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = true;   // show partial text while speaking
  rec.continuous = false;      // single utterance (end on pause)
  rec.maxAlternatives = 1;

  function setUI(listening) {
    recActive = listening;
    if (listening) {
      micBtn.classList.add('recording');
      micBtn.setAttribute('aria-pressed', 'true');
      if (hint) { hint.style.display = 'inline'; hint.textContent = 'Listening…'; }
    } else {
      micBtn.classList.remove('recording');
      micBtn.setAttribute('aria-pressed', 'false');
      if (hint) hint.style.display = 'none';
    }
  }

  function start() {
    try { rec.start(); } catch (_) { /* already started */ }
  }
  function stop() {
    try { rec.stop(); } catch (_) {}
    setUI(false);
  }

  rec.onstart = () => setUI(true);

  rec.onresult = (evt) => {
    let finalText = '';
    let interim = '';
    for (let i = evt.resultIndex; i < evt.results.length; i++) {
      const chunk = evt.results[i][0].transcript;
      if (evt.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }
    if (input) input.value = (finalText || interim);
  };

  rec.onerror = (e) => {
    // Common: 'no-speech', 'audio-capture', 'not-allowed'
    console.warn('STT error:', e);
    setUI(false);
    if (e.error !== 'no-speech') setReply('Microphone error. You can still type.');
  };

  rec.onend = () => {
    setUI(false);
    const text = (input?.value || '').trim();
    if (text) {
      // Auto-run analysis when you finish speaking
      onAnalyze();
    }
  };

  micBtn.addEventListener('click', () => {
    if (!rec) return;
    if (recActive) stop();
    else start();
  });

  // (Optional) Press Ctrl+M to toggle mic
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      if (recActive) stop();
      else start();
    }
  });

  return { start, stop };
}
// =================== End of main.js ========================================
