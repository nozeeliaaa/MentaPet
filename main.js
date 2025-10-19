// =================== MentaPet - main.js (Vercel version) ===================

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

// ==========================================================================
// API: analyze text with OpenAI via Vercel serverless function (/api/ai)
// Returns { mood, risk, reply, actions[] }
async function analyzeTextWithAI(text){
  const pet = localStorage.getItem('mentapet:pet') || 'nova';
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, pet })
  });
  // If function not found or other error, this will throw; caught in onAnalyze
  return await res.json();
}

// ==========================================================================
// Page init
window.addEventListener('DOMContentLoaded', ()=>{
  const pet = localStorage.getItem('mentapet:pet') || 'nova';
  const petAnim = qs('#petAnim');
  if(petAnim){
    // default lottie per pet
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
  qs('#closeCare')?.addEventListener('click', ()=> qs('#careModal').classList.add('hidden'));
  qs('#groundBtn')?.addEventListener('click', startBreathing);
  qs('#stopBreath')?.addEventListener('click', stopBreathing);
  qs('#contrastBtn')?.addEventListener('click', ()=> document.body.classList.toggle('a11y-contrast'));

  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') qs('#careModal')?.classList.add('hidden'); });
}

// ==========================================================================
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
    if (typeof petTalk === 'function') petTalk(reply, mood); else speak(reply);

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
}

function empathy(mood){ return REPLIES[mood] || REPLIES.calm; }

// ---------- Reply box + TTS ----------
function setReply(text, speakIt=false){
  const el = qs('#reply');
  if(!el) return;
  el.textContent = text;
  if(speakIt) speak(text);
}

function speak(text){
  try{
    const u = new SpeechSynthesisUtterance(text);
    u.lang='en-US'; u.rate=1; u.pitch=1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch(e){}
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

// =================== End of main.js ========================================
