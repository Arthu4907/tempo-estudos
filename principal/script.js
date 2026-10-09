(function(){
/* ============ CONFIGURAÇÃO ============
   Supabase > Project Settings > API
   A chave "anon" pode ficar pública: quem protege os dados
   são as políticas de Row Level Security no banco. */
const SUPABASE_URL = 'https://xaixynicgamvwzndkadc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_xUr_jG92CWSVF9u3E32wLQ_VwFzkHOU';
/* ====================================== */

const DIAS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const DIAS_LONGOS = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
const CORES = ['#F6E15A','#8FD6B4','#9CC3FF','#F7A9C4','#FFC48A','#C7B5FF','#9EE3E8'];
const C = 2 * Math.PI * 116;
const $ = id => document.getElementById(id);

let sb = null;          // cliente Supabase
let user = null;        // usuário logado
let currentUid;         // undefined até a primeira verificação de sessão

const novoEstado = () => ({ blocks: [], sessions: [], done: {}, pending: [], settings: { focus: 30, brk: 5 }, timer: null });
let state = novoEstado();

/* ---------- Dados locais (só deste aparelho) ----------
   Cronômetro em andamento, ajustes de tempo e sessões que
   ainda não foram enviadas ao banco (ex.: sem internet). */
const localKey = () => 'foco-estudos-local-' + user.id;
function loadLocal(){
  try{
    const raw = localStorage.getItem(localKey());
    if(!raw) return;
    const s = JSON.parse(raw);
    if(s.settings) state.settings = { ...state.settings, ...s.settings };
    if(s.timer) state.timer = s.timer;
    if(Array.isArray(s.pending)) state.pending = s.pending;
  }catch(e){}
}
function saveLocal(){
  if(!user) return;
  try{ localStorage.setItem(localKey(), JSON.stringify({ settings: state.settings, timer: state.timer, pending: state.pending })); }catch(e){}
}

/* ---------- Utilidades ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cor(nome){ let h = 0; for(const ch of nome.toLowerCase()) h = (h*31 + ch.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; }
const hojeIdx = () => (new Date().getDay() + 6) % 7;
function inicioSemana(){ const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - hojeIdx()); return d; }
const semanaKey = () => { const d = inicioSemana(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); };
const inicioHoje = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); };
function fmtDur(secs){ const h = Math.floor(secs/3600), m = Math.floor(secs%3600/60); return h ? `${h}h${String(m).padStart(2,'0')}` : `${m} min`; }
function fmtClock(ms, countdown){
  const t = Math.max(0, countdown ? Math.ceil(ms/1000) : Math.floor(ms/1000));
  const h = Math.floor(t/3600), m = Math.floor(t%3600/60), s = t%60;
  return (h ? h + ':' + String(m).padStart(2,'0') : String(m).padStart(2,'0')) + ':' + String(s).padStart(2,'0');
}
function fimHorario(start, dur){
  const [h,m] = start.split(':').map(Number); const t = (h*60 + m + Number(dur)) % 1440;
  return String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0');
}
const doneKey = id => semanaKey() + '|' + id;
const isDone = id => !!state.done[doneKey(id)];

/* ---------- Som ---------- */
let actx = null;
function unlockAudio(){ try{ if(!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if(actx.state === 'suspended') actx.resume(); }catch(e){} }
function tocarNotas(){
  if(!actx) return;
  [660, 880, 1100, 880, 1100].forEach((freq, i) => {
    const t0 = actx.currentTime + i*0.18;
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.type = 'triangle';
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0+0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0+0.17);
    o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0+0.2);
  });
}

/* ---------- Alarme ----------
   Toca até a pessoa clicar em "Parar alarme" (ou por no máximo 1 minuto),
   vibra no celular e mostra uma notificação se a aba estiver em segundo plano. */
let alarmeTimer = null, alarmeFim = null, notif = null;
function pedirPermissaoNotificacao(){
  try{ if('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }catch(e){}
}
function tocarAlarme(msg){
  pararAlarme();
  unlockAudio();
  const repetir = () => { tocarNotas(); try{ navigator.vibrate && navigator.vibrate([300,150,300]); }catch(e){} };
  repetir();
  alarmeTimer = setInterval(repetir, 1500);
  alarmeFim = setTimeout(pararAlarme, 60000);
  $('alarmBtn').hidden = false;
  document.querySelector('.ring-box').classList.add('ringing');
  try{
    if(document.hidden && 'Notification' in window && Notification.permission === 'granted'){
      notif = new Notification('Foco Estudos', { body: msg, tag: 'foco-alarme', renotify: true });
      notif.onclick = () => { window.focus(); pararAlarme(); };
    }
  }catch(e){}
}
function pararAlarme(){
  clearInterval(alarmeTimer); clearTimeout(alarmeFim); alarmeTimer = alarmeFim = null;
  try{ navigator.vibrate && navigator.vibrate(0); }catch(e){}
  if(notif){ try{ notif.close(); }catch(e){} notif = null; }
  const btn = $('alarmBtn'); if(btn) btn.hidden = true;
  const ring = document.querySelector('.ring-box'); if(ring) ring.classList.remove('ringing');
}

/* Agenda um disparo exatamente no fim do bloco. O navegador desacelera
   o setInterval em abas de fundo, então isso garante o alarme na hora. */
let fimTimer = null;
function agendarFim(){
  clearTimeout(fimTimer); fimTimer = null;
  if(!user) return;
  const t = T();
  if(t.mode === 'pomo' && t.running) fimTimer = setTimeout(tick, Math.max(0, target() - elapsed()) + 50);
}

let toastTimer = null;
function toast(msg){ const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.classList.remove('show'), 3600); }

/* ---------- Banco de dados ---------- */
async function carregarDados(){
  const semIni = inicioSemana().toISOString();
  const [b, sw, sr, d] = await Promise.all([
    sb.from('blocks').select('id,subject,day,start,dur'),
    sb.from('sessions').select('id,subject,ended_at,secs').gte('ended_at', semIni),
    sb.from('sessions').select('id,subject,ended_at,secs').order('ended_at', { ascending: false }).limit(8),
    sb.from('block_done').select('block_id,week_key').eq('week_key', semanaKey())
  ]);
  const falha = [b, sw, sr, d].find(r => r.error);
  if(falha) throw falha.error;

  state.blocks = b.data;
  const mapa = new Map();
  [...sw.data, ...sr.data].forEach(s => mapa.set(s.id, { id: s.id, subject: s.subject, secs: s.secs, end: new Date(s.ended_at).getTime() }));
  state.sessions = [...mapa.values()];
  state.done = {};
  d.data.forEach(x => { state.done[x.week_key + '|' + x.block_id] = true; });
}

let enviando = false;
async function enviarPendentes(){
  if(enviando || !user || !state.pending.length) return;
  enviando = true;
  try{
    while(user && state.pending.length){
      const p = state.pending[0];
      const { data, error } = await sb.from('sessions')
        .insert({ user_id: user.id, subject: p.subject, secs: p.secs, ended_at: p.ended_at })
        .select('id').single();
      if(error) break; // tenta de novo quando a conexão voltar
      state.pending = state.pending.filter(x => x.tmp !== p.tmp);
      const s = state.sessions.find(x => x.id === p.tmp);
      if(s){ s.id = data.id; delete s.pending; }
      else { await sb.from('sessions').delete().eq('id', data.id); } // foi apagada enquanto enviava
      saveLocal();
    }
  }finally{
    enviando = false;
  }
  if(user) renderHist();
}

async function adicionarBloco(subject, day, start, dur){
  $('addBtn').disabled = true;
  const { data, error } = await sb.from('blocks')
    .insert({ user_id: user.id, subject, day, start, dur })
    .select('id,subject,day,start,dur').single();
  $('addBtn').disabled = false;
  if(error){ toast('Não foi possível salvar o bloco. Verifique sua conexão.'); return false; }
  state.blocks.push(data);
  renderAll();
  return true;
}

async function removerBloco(id){
  const b = state.blocks.find(x => x.id === id); if(!b) return;
  state.blocks = state.blocks.filter(x => x !== b);
  renderAll();
  const { error } = await sb.from('blocks').delete().eq('id', id);
  if(error){ state.blocks.push(b); renderAll(); toast('Não foi possível remover o bloco. Tente de novo.'); }
  else toast('Bloco removido da agenda.');
}

async function marcarFeito(id, marcado){
  const k = doneKey(id), week = semanaKey();
  if(marcado) state.done[k] = true; else delete state.done[k];
  renderHoje(); renderSemana();
  const r = marcado
    ? await sb.from('block_done').upsert({ user_id: user.id, block_id: id, week_key: week }, { ignoreDuplicates: true })
    : await sb.from('block_done').delete().eq('block_id', id).eq('week_key', week);
  if(r.error){
    if(marcado) delete state.done[k]; else state.done[k] = true;
    renderHoje(); renderSemana();
    toast('Não foi possível atualizar. Verifique sua conexão.');
  }
}

async function apagarSessao(id){
  const idx = state.sessions.findIndex(s => s.id === id); if(idx < 0) return;
  const s = state.sessions[idx];
  state.sessions.splice(idx, 1);
  if(s.pending){
    state.pending = state.pending.filter(p => p.tmp !== id);
    saveLocal(); renderHoje(); renderHist(); toast('Sessão apagada.');
    return;
  }
  renderHoje(); renderHist();
  const { error } = await sb.from('sessions').delete().eq('id', id);
  if(error){ state.sessions.push(s); renderHoje(); renderHist(); toast('Não foi possível apagar a sessão. Tente de novo.'); }
  else toast('Sessão apagada.');
}

/* ---------- Cronômetro ---------- */
function T(){ if(!state.timer) state.timer = { mode:'pomo', phase:'foco', running:false, startedAt:0, acc:0, subject:'' }; return state.timer; }
function elapsed(){ const t = T(); return t.acc + (t.running ? Date.now() - t.startedAt : 0); }
function target(){ const t = T(); return (t.phase === 'foco' ? state.settings.focus : state.settings.brk) * 60000; }

function registrar(ms){
  const secs = Math.round(ms/1000);
  if(secs < 60) return false;
  const p = { tmp: 'tmp-' + uid(), subject: T().subject.trim() || 'Sem matéria', secs, ended_at: new Date().toISOString() };
  state.pending.push(p);
  state.sessions.push({ id: p.tmp, subject: p.subject, secs, end: Date.parse(p.ended_at), pending: true });
  saveLocal();
  enviarPendentes();
  return true;
}
function iniciar(){ const t = T(); unlockAudio(); pedirPermissaoNotificacao(); pararAlarme(); t.running = true; t.startedAt = Date.now(); saveLocal(); renderTimer(); agendarFim(); }
function pausar(){ const t = T(); t.acc = elapsed(); t.running = false; saveLocal(); renderTimer(); agendarFim(); }
function encerrar(){
  const t = T();
  pararAlarme();
  if(t.phase === 'pausa'){ t.phase = 'foco'; t.running = false; t.acc = 0; saveLocal(); renderAll(); agendarFim(); toast('Pausa encerrada.'); return; }
  if(elapsed() === 0){ toast('Inicie o cronômetro antes de encerrar.'); return; }
  const ok = registrar(elapsed());
  t.running = false; t.acc = 0; t.phase = 'foco';
  saveLocal(); renderAll(); agendarFim();
  toast(ok ? 'Sessão salva no histórico.' : 'Sessões com menos de 1 minuto não são salvas.');
}
function pularPausa(){ const t = T(); pararAlarme(); t.phase = 'foco'; t.running = false; t.acc = 0; saveLocal(); renderTimer(); agendarFim(); }

function tick(){
  if(!user || $('app').hidden) return;
  const t = T();
  if(t.mode === 'pomo' && t.running && elapsed() >= target()){
    if(t.phase === 'foco'){
      registrar(target());
      t.phase = 'pausa'; t.acc = 0; t.startedAt = Date.now();
      tocarAlarme('Bloco de foco concluído. Hora da pausa!');
      toast('Bloco de foco concluído. Hora da pausa!');
    }else{
      t.phase = 'foco'; t.acc = 0; t.running = false;
      tocarAlarme('A pausa acabou. Hora de voltar a estudar!');
      toast('A pausa acabou. Comece o próximo bloco quando quiser.');
    }
    saveLocal(); renderAll(); agendarFim(); return;
  }
  renderTimer();
}

function renderTimer(){
  const t = T(), el = elapsed();
  const pomo = t.mode === 'pomo', rest = pomo && t.phase === 'pausa';
  const txt = pomo ? fmtClock(target() - el, true) : fmtClock(el, false);
  const p = pomo ? Math.min(1, el / target()) : (el % 3600000) / 3600000;
  $('digits').textContent = txt;
  $('ring').style.strokeDashoffset = C * (1 - p);
  $('ring').classList.toggle('rest', rest);
  $('phase').textContent = pomo ? (rest ? 'Pausa' : 'Foco') : 'Tempo de estudo';
  $('phase').classList.toggle('rest', rest);
  $('phaseSub').textContent = rest ? 'Levante, beba água, descanse os olhos.'
    : (pomo ? `${state.settings.focus} min de foco, depois ${state.settings.brk} min de pausa` : 'Conta o tempo até você encerrar');
  $('mainBtn').textContent = t.running ? 'Pausar' : (t.acc > 0 ? 'Continuar' : 'Iniciar');
  $('skipBtn').hidden = !rest;
  $('finishBtn').textContent = rest ? 'Encerrar pausa' : 'Encerrar e salvar';
  document.querySelectorAll('[data-action="mode"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === t.mode)));
  $('settings').hidden = !pomo;
  document.title = t.running ? `${txt} ${rest ? 'pausa' : 'foco'} | Foco Estudos` : 'Foco Estudos';
}

/* ---------- Agenda ---------- */
function blocosDoDia(i){ return state.blocks.filter(b => b.day === i).sort((a,b) => a.start.localeCompare(b.start)); }

function renderHoje(){
  const lista = blocosDoDia(hojeIdx());
  const ul = $('todayList');
  if(!lista.length){
    ul.innerHTML = '<li class="empty">Nada marcado para hoje. Adicione um bloco na agenda da semana logo abaixo.</li>';
  }else{
    ul.innerHTML = lista.map(b => `
      <li class="item ${isDone(b.id)?'done':''}" style="--c:${cor(b.subject)}">
        <input type="checkbox" class="check" data-action="done" data-id="${b.id}" ${isDone(b.id)?'checked':''} aria-label="Marcar ${esc(b.subject)} como feito">
        <div class="info"><strong>${esc(b.subject)}</strong><small>${esc(b.start)} às ${fimHorario(b.start,b.dur)}</small></div>
        <button type="button" class="btn small" data-action="study" data-id="${b.id}">Estudar agora</button>
      </li>`).join('');
  }
  const hojeIni = inicioHoje(), semIni = inicioSemana().getTime();
  const secsHoje = state.sessions.filter(s => s.end >= hojeIni).reduce((a,s) => a + s.secs, 0);
  const secsSem = state.sessions.filter(s => s.end >= semIni).reduce((a,s) => a + s.secs, 0);
  $('stToday').textContent = fmtDur(secsHoje);
  $('stWeek').textContent = fmtDur(secsSem);
  $('stDone').textContent = `${lista.filter(b => isDone(b.id)).length}/${lista.length}`;
}

function renderSemana(){
  const ini = inicioSemana(), hoje = hojeIdx();
  const fim = new Date(ini); fim.setDate(fim.getDate() + 6);
  const f = d => d.toLocaleDateString('pt-BR', { day:'numeric', month:'short' });
  $('weekRange').textContent = `${f(ini)} a ${f(fim)}`;
  $('week').innerHTML = DIAS.map((nome, i) => {
    const d = new Date(ini); d.setDate(d.getDate() + i);
    const blocos = blocosDoDia(i);
    return `<div class="day ${i===hoje?'is-today':''}">
      <h3><span>${window.innerWidth <= 900 ? DIAS_LONGOS[i] : nome}</span><span class="muted">${d.getDate()}</span></h3>
      ${blocos.length ? blocos.map(b => `
        <div class="chip ${isDone(b.id)?'done':''}" style="--c:${cor(b.subject)}">
          <small>${esc(b.start)} às ${fimHorario(b.start,b.dur)}</small>
          <strong>${esc(b.subject)}</strong>
          <div class="row">
            <label class="muted" style="display:flex;align-items:center;gap:5px;font-size:13px">
              <input type="checkbox" class="check" style="width:16px;height:16px" data-action="done" data-id="${b.id}" ${isDone(b.id)?'checked':''}> feito
            </label>
            <button type="button" class="link" data-action="remove" data-id="${b.id}" aria-label="Remover ${esc(b.subject)} de ${DIAS_LONGOS[i]}">Remover</button>
          </div>
        </div>`).join('') : '<div class="none">Livre</div>'}
    </div>`;
  }).join('');
}

function renderHist(){
  const semIni = inicioSemana().getTime();
  const por = {};
  state.sessions.filter(s => s.end >= semIni).forEach(s => { por[s.subject] = (por[s.subject] || 0) + s.secs; });
  const itens = Object.entries(por).sort((a,b) => b[1] - a[1]);
  const max = itens.length ? itens[0][1] : 1;
  $('bars').innerHTML = itens.length ? itens.map(([nome, secs]) => `
    <div class="bar-row" style="--c:${cor(nome)}">
      <span class="name">${esc(nome)}</span><span class="val">${fmtDur(secs)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, secs/max*100)}%"></div></div>
    </div>`).join('') : '<p class="empty">Quando você terminar uma sessão no cronômetro, o tempo aparece aqui separado por matéria.</p>';

  const ult = state.sessions.slice().sort((a,b) => b.end - a.end).slice(0, 8);
  $('sessions').innerHTML = ult.length ? ult.map(s => {
    const d = new Date(s.end - s.secs*1000);
    const quando = d.toLocaleDateString('pt-BR', { weekday:'short', day:'numeric' }) + ', ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    return `<div class="sess" style="--c:${cor(s.subject)}">
      <span class="dot"></span><span class="s-name">${esc(s.subject)}</span>
      <span class="s-meta">${quando}, ${fmtDur(s.secs)}${s.pending ? ', aguardando envio' : ''}</span>
      <button type="button" class="link" data-action="delsess" data-id="${s.id}" aria-label="Apagar sessão de ${esc(s.subject)}">Apagar</button>
    </div>`;
  }).join('') : '<p class="empty">Nenhuma sessão ainda. Escolha uma matéria e aperte Iniciar.</p>';
}

function renderMaterias(){
  const nomes = [...new Set([...state.blocks.map(b => b.subject), ...state.sessions.map(s => s.subject)])].filter(n => n !== 'Sem matéria');
  $('subjects').innerHTML = nomes.map(n => `<option value="${esc(n)}">`).join('');
}

function renderAll(){ renderTimer(); renderHoje(); renderSemana(); renderHist(); renderMaterias(); }

/* ---------- Eventos do app ---------- */
document.addEventListener('click', e => {
  if(!user) return;
  const el = e.target.closest('[data-action]'); if(!el) return;
  const a = el.dataset.action, t = T();
  if(a === 'toggle'){ t.running ? pausar() : iniciar(); }
  else if(a === 'finish'){ encerrar(); }
  else if(a === 'skip'){ pularPausa(); }
  else if(a === 'mode'){
    if(el.dataset.mode === t.mode) return;
    if(t.running || t.acc > 0){ toast('Encerre a sessão atual antes de trocar o modo.'); return; }
    t.mode = el.dataset.mode; t.phase = 'foco'; saveLocal(); renderTimer();
  }
  else if(a === 'done'){ marcarFeito(el.dataset.id, el.checked); }
  else if(a === 'remove'){ removerBloco(el.dataset.id); }
  else if(a === 'study'){
    const b = state.blocks.find(x => x.id === el.dataset.id); if(!b) return;
    t.subject = b.subject; $('subject').value = b.subject;
    saveLocal(); renderTimer();
    document.querySelector('.timer').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    toast(`Matéria definida: ${b.subject}. Aperte Iniciar.`);
  }
  else if(a === 'delsess'){ apagarSessao(el.dataset.id); }
  else if(a === 'stopalarm'){ pararAlarme(); }
  else if(a === 'testalarm'){
    if($('alarmBtn').hidden){ pedirPermissaoNotificacao(); tocarAlarme('Teste de alarme.'); toast('Assim vai tocar quando o tempo acabar.'); }
    else pararAlarme();
  }
});

$('subject').addEventListener('input', e => { if(!user) return; T().subject = e.target.value; saveLocal(); });

function syncSettings(){ $('focusMin').value = state.settings.focus; $('breakMin').value = state.settings.brk; }
function lerSetting(id, key, max){
  $(id).addEventListener('change', e => {
    const v = Math.round(Number(e.target.value));
    state.settings[key] = Number.isFinite(v) ? Math.min(max, Math.max(1, v)) : state.settings[key];
    syncSettings(); saveLocal(); renderTimer(); agendarFim();
  });
}
lerSetting('focusMin', 'focus', 180); lerSetting('breakMin', 'brk', 60);

$('addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const subject = $('fSubject').value.trim();
  const dur = Math.round(Number($('fDur').value));
  if(!subject){ toast('Escreva o nome da matéria.'); return; }
  if(!dur || dur < 5){ toast('A duração precisa ser de pelo menos 5 minutos.'); return; }
  const day = Number($('fDay').value);
  const ok = await adicionarBloco(subject, day, $('fStart').value || '19:00', dur);
  if(ok){
    $('fSubject').value = ''; $('fSubject').focus();
    toast(`${subject} adicionado na ${DIAS_LONGOS[day].toLowerCase()}.`);
  }
});

/* ---------- Login ---------- */
let recuperando = false; // true enquanto a pessoa cria a senha nova pelo link do e-mail
function mostrar(tela){ ['loading','auth','recovery','app'].forEach(id => { $(id).hidden = id !== tela; }); }
function authMsg(txt, ok){ const el = $('authMsg'); el.textContent = txt || ''; el.classList.toggle('ok', !!ok); }
function setAuthBusy(b){ $('authSubmit').disabled = b; $('googleBtn').disabled = b; }
const redirectUrl = () => location.origin + location.pathname;
let motivoBloqueio = '';

function traduzErro(err){
  const m = (err && err.message) || '';
  if(/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if(/email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if(/already registered|already been registered/i.test(m)) return 'Já existe uma conta com esse e-mail. Use a aba Entrar.';
  if(/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if(/password/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if(/different from the old/i.test(m)) return 'A nova senha precisa ser diferente da anterior.';
  if(/expired|invalid.*(token|link)|otp/i.test(m)) return 'Esse link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".';
  if(/provider is not enabled/i.test(m)) return 'O login com Google ainda não foi ativado no Supabase.';
  if(/fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet.';
  return 'Não foi possível concluir: ' + m;
}

let authMode = 'login';
function setAuthMode(m){
  authMode = m;
  const reset = m === 'reset';
  document.querySelectorAll('[data-auth]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.auth === m)));
  $('authSubmit').textContent = m === 'login' ? 'Entrar' : m === 'signup' ? 'Criar conta' : 'Enviar link';
  $('authPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('authTabs').hidden = reset;
  $('resetInfo').hidden = !reset;
  $('passWrap').hidden = reset;
  $('forgotBtn').hidden = m !== 'login';
  $('backLoginBtn').hidden = !reset;
  $('authDivider').hidden = reset;
  $('googleBtn').hidden = reset;
  authMsg('');
}
$('forgotBtn').addEventListener('click', () => { setAuthMode('reset'); $('authEmail').focus(); });
$('backLoginBtn').addEventListener('click', () => setAuthMode('login'));
document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));

$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  if(!sb){ authMsg(motivoBloqueio); return; }
  const email = $('authEmail').value.trim(), senha = $('authPass').value;
  if(!/^\S+@\S+\.\S+$/.test(email)){ authMsg('Digite um e-mail válido.'); $('authEmail').focus(); return; }
  if(authMode === 'reset'){
    setAuthBusy(true); authMsg('');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    setAuthBusy(false);
    if(error && /rate limit|too many|fetch|network/i.test(error.message || '')){ authMsg(traduzErro(error)); return; }
    // Mesma mensagem exista a conta ou não, para não revelar quais e-mails estão cadastrados
    authMsg('Se existir uma conta com ' + email + ', enviamos um link para criar uma senha nova. Confira também o spam.', true);
    return;
  }
  if(senha.length < 6){ authMsg('A senha precisa ter pelo menos 6 caracteres.'); $('authPass').focus(); return; }
  setAuthBusy(true); authMsg('');
  if(authMode === 'login'){
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if(error){ authMsg(traduzErro(error)); setAuthBusy(false); }
  }else{
    const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: redirectUrl() } });
    setAuthBusy(false);
    if(error) authMsg(traduzErro(error));
    else if(!data.session){ setAuthMode('login'); authMsg('Conta criada. Abra o link que enviamos para ' + email + ' para confirmar e depois entre.', true); }
  }
});

$('googleBtn').addEventListener('click', async () => {
  if(!sb){ authMsg(motivoBloqueio); return; }
  if(location.protocol === 'file:'){ authMsg('O login com Google só funciona com o site publicado (GitHub Pages), não abrindo o arquivo direto do computador.'); return; }
  setAuthBusy(true); authMsg('');
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
  if(error){ authMsg(traduzErro(error)); setAuthBusy(false); }
});

function recoveryMsg(txt, ok){ const el = $('recoveryMsg'); el.textContent = txt || ''; el.classList.toggle('ok', !!ok); }
$('recoveryForm').addEventListener('submit', async e => {
  e.preventDefault();
  const p1 = $('newPass').value, p2 = $('newPass2').value;
  if(p1.length < 6){ recoveryMsg('A senha precisa ter pelo menos 6 caracteres.'); $('newPass').focus(); return; }
  if(p1 !== p2){ recoveryMsg('As duas senhas não são iguais.'); $('newPass2').focus(); return; }
  $('recoverySubmit').disabled = true; recoveryMsg('');
  const { error } = await sb.auth.updateUser({ password: p1 });
  $('recoverySubmit').disabled = false;
  if(error){ recoveryMsg(traduzErro(error)); return; }
  recuperando = false;
  $('newPass').value = ''; $('newPass2').value = '';
  try{ history.replaceState(null, '', redirectUrl()); }catch(err){}
  if(user){ mostrar('app'); renderAll(); agendarFim(); } else mostrar('loading');
  toast('Senha alterada. Você já está conectado.');
});

$('logoutBtn').addEventListener('click', async () => {
  if(T().running && !confirm('O cronômetro está rodando. Sair mesmo assim? O tempo fica guardado neste aparelho.')) return;
  saveLocal();
  const { error } = await sb.auth.signOut();
  if(error) toast('Não foi possível sair. Tente de novo.');
});

async function trocarUsuario(u){
  pararAlarme(); clearTimeout(fimTimer);
  user = u;
  state = novoEstado();
  if(!u){
    $('authPass').value = '';
    setAuthBusy(false);
    document.title = 'Foco Estudos';
    recuperando = false;
    mostrar('auth');
    return;
  }
  if(!recuperando) mostrar('loading');
  loadLocal();
  $('userEmail').textContent = u.email || '';
  $('subject').value = T().subject || '';
  syncSettings();
  try{
    await carregarDados();
  }catch(err){
    toast('Não foi possível carregar seus dados. Verifique sua conexão e recarregue a página.');
  }
  if(user !== u) return; // trocou de conta enquanto carregava
  state.pending.forEach(p => state.sessions.push({ id: p.tmp, subject: p.subject, secs: p.secs, end: Date.parse(p.ended_at), pending: true }));
  mostrar(recuperando ? 'recovery' : 'app');
  renderAll();
  agendarFim();
  enviarPendentes();
}

/* ---------- Início ---------- */
$('fDay').innerHTML = DIAS_LONGOS.map((n,i) => `<option value="${i}" ${i===hojeIdx()?'selected':''}>${n}</option>`).join('');
$('date').textContent = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
$('ring').style.strokeDasharray = C;
setInterval(tick, 250);
let lastW = window.innerWidth <= 900;
window.addEventListener('resize', () => { const w = window.innerWidth <= 900; if(w !== lastW){ lastW = w; if(user) renderSemana(); } });
document.addEventListener('visibilitychange', () => { if(!document.hidden && user && !$('app').hidden) renderAll(); });
window.addEventListener('online', enviarPendentes);

if(!window.supabase){
  motivoBloqueio = 'Não foi possível carregar o sistema de login (biblioteca do Supabase). Verifique sua conexão e recarregue a página.';
  mostrar('auth'); authMsg(motivoBloqueio);
  return;
}
if(SUPABASE_URL.includes('SEU-PROJETO') || SUPABASE_ANON_KEY.includes('SUA_')){
  motivoBloqueio = 'Falta configurar SUPABASE_URL e SUPABASE_ANON_KEY no início do script.';
  mostrar('auth'); authMsg(motivoBloqueio);
  return;
}

// O link do e-mail volta com "type=recovery" no endereço
if(/type=recovery/.test(location.hash + location.search)){ recuperando = true; mostrar('recovery'); }

try{
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}catch(err){
  motivoBloqueio = 'SUPABASE_URL inválida. Copie o endereço completo em Project Settings > API (começa com https://).';
  mostrar('auth'); authMsg(motivoBloqueio);
  return;
}
sb.auth.onAuthStateChange((evento, sessao) => {
  if(evento === 'PASSWORD_RECOVERY'){ recuperando = true; mostrar('recovery'); setTimeout(() => $('newPass').focus(), 50); }
  const novo = sessao ? sessao.user : null;
  const id = novo ? novo.id : null;
  if(id === currentUid) return; // renovação de token, nada muda
  currentUid = id;
  // setTimeout evita chamar o Supabase de dentro do próprio callback
  setTimeout(() => trocarUsuario(novo), 0);
});
})();
