let bets = [];
let alavancagens = [];
let currentAlavId = null;
let saques = [];
let editingId = null;
let _suppressRenderUntil = 0;
let deletingId = null;
let deletingType = 'bet';
let bingoCount = 0;
let selectedBetType = 'normal';
let selectedCasa = '';
let currentProfile = 'laudel';

const expandedCards = new Set();
let _customOrder = [];
let _drag = null;
let _pressTimer = null;

const PROFILE_LABELS = {
  laudel: 'Laudel Conjunto',
  paulo:  'Paulo',
  hammel: 'Hammel'
};
const PROFILE_COLORS = {
  laudel: 'var(--gold)',
  paulo:  'var(--blue)',
  hammel: 'var(--purple)'
};

/* ── PROFILE SWITCHER ── */
function loadBetOrder(){
  try { return JSON.parse(localStorage.getItem('betOrder_'+currentProfile)||'[]'); } catch{ return []; }
}
function saveBetOrder(order){
  localStorage.setItem('betOrder_'+currentProfile, JSON.stringify(order));
}
function applyCustomOrder(betsArr){
  let order = loadBetOrder();
  if(!order.length) return betsArr;
  const newIds = betsArr.map(b=>b.id).filter(id=>!order.includes(id));
  if(newIds.length){ order = [...order, ...newIds]; saveBetOrder(order); }
  return [...betsArr].sort((a,b)=>{
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    return (ai===-1?9999:ai) - (bi===-1?9999:bi);
  });
}
function updateOrderAfterDrag(newIds){
  const order = loadBetOrder();
  const existPositions = newIds.map(id=>order.indexOf(id)).filter(i=>i>=0).sort((a,b)=>a-b);
  const newOrder = [...order];
  existPositions.forEach((pos,i)=>{ newOrder[pos] = newIds[i]; });
  newIds.forEach(id=>{ if(!newOrder.includes(id)) newOrder.push(id); });
  _customOrder = newOrder;
  saveBetOrder(newOrder);
}

function switchProfile(profile){
  if(profile === currentProfile) return;
  currentProfile = profile;
  _customOrder = loadBetOrder();
  ['laudel','paulo','hammel'].forEach(p => {
    const btn = document.getElementById('pbtn-'+p);
    btn.className = 'profile-btn' + (p === profile ? ' active-'+p : '');
  });
  bets = [];
  alavancagens = [];
  currentAlavId = null;
  saques = [];
  renderAll();
  renderAlavancagem();
  const loading = document.getElementById('firebase-loading');
  if(loading){
    loading.style.display = 'flex';
    loading.innerHTML = `
      <div style="font-size:48px;animation:spin 2s linear infinite;display:inline-block;">⚽</div>
      <div style="font-size:28px;letter-spacing:3px;color:#e8b94b;">LAUDEL TIPS</div>
      <div style="font-size:13px;opacity:0.5;font-family:'DM Sans',sans-serif;font-weight:400;letter-spacing:1px;">CARREGANDO: ${PROFILE_LABELS[profile].toUpperCase()}...</div>
      <div style="width:38px;height:38px;border:2px solid rgba(255,255,255,0.08);border-top-color:#e8b94b;border-radius:50%;animation:spin 0.8s linear infinite;margin-top:4px"></div>
    `;
  }
  if(window._startProfileListener) window._startProfileListener(profile);
  showToast('👤 ' + PROFILE_LABELS[profile]);
}

/* ── STORAGE (Firebase) ── */
async function saveOneBet(bet){
  try{
    const { doc, setDoc } = window._firestoreFns;
    const colName = window._profileCollections[currentProfile] || "copa_bets";
    await setDoc(doc(window._db, colName, bet.id), bet);
  } catch(e){ console.error("Erro ao salvar aposta:", e); showToast("⚠️ Erro ao salvar"); }
}

async function deleteOneBet(id){
  try{
    const { doc, deleteDoc } = window._firestoreFns;
    const colName = window._profileCollections[currentProfile] || "copa_bets";
    await deleteDoc(doc(window._db, colName, id));
  } catch(e){ console.error("Erro ao excluir aposta:", e); showToast("⚠️ Erro ao excluir"); }
}

function genId(){ return Date.now().toString(36)+Math.random().toString(36).substr(2,4); }

/* ── CASA SELECTOR ── */
function selectCasa(casa){
  selectedCasa = casa;
  ['betano','bet365','outra'].forEach(c=>{
    const btn = document.getElementById('casa-btn-'+c);
    if(btn) btn.className = 'casa-btn' + (c===casa?' selected-'+c:'');
  });
  const outraInput = document.getElementById('f-casa-outra');
  if(outraInput) outraInput.style.display = casa==='outra'?'block':'none';
}

/* ── CASA BADGE (cards + drawer) ── */
function casaBadge(casa, cls){
  const c = (casa||'').toLowerCase().replace(/\s/g,'');
  if(c==='betano') return `<span class="${cls} casa-betano casa-logo-img">
    <img src="betano-logo.png" alt="betano" class="casa-img"
         onerror="this.parentElement.classList.add('casa-img-failed');this.remove()"/>
  </span>`;
  if(c==='bet365') return `<span class="${cls} casa-bet365 casa-logo-img">
    <img src="bet365-logo.png" alt="bet365" class="casa-img"
         onerror="this.parentElement.classList.add('casa-img-failed');this.remove()"/>
  </span>`;
  return `<span class="${cls}">${escHtml(casa||'—')}</span>`;
}

/* ── BET TYPE SELECTOR ── */
function selectBetType(type){
  selectedBetType = type;
  document.getElementById('type-normal').className = 'type-btn' + (type==='normal'?' selected-normal':'');
  document.getElementById('type-longterm').className = 'type-btn' + (type==='longterm'?' selected-longterm':'');
  document.getElementById('f-resolucao-group').style.display = type==='longterm' ? 'block' : 'none';
}

/* ── TABS ── */
let currentTab = 'emjogo';
function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===tab);
  });
  document.querySelectorAll('.tab-panel').forEach(p=>{
    p.classList.toggle('active', p.id==='tab-'+tab);
  });
}

/* ── RENDER ── */
function getBetStatus(bet){
  if(bet.status==='ganhou') return 'won';
  if(bet.status==='perdeu') return 'lost';
  if(bet.status==='cashout') return 'cashout';
  if(bet.bingos && bet.bingos.length>0){
    const checked = bet.bingos.filter(b=>b.checked).length;
    if(checked>0 && checked<bet.bingos.length) return 'partial';
  }
  return 'pending';
}

function isLongTerm(bet){ return bet.betType === 'longterm'; }

function statusLabel(s, isLT){
  if(isLT && s==='pending') return '<span class="bet-status-pill status-longterm">🎯 Aguardando</span>';
  if(s==='won')      return '<span class="bet-status-pill status-won">✓ Ganhou</span>';
  if(s==='lost')     return '<span class="bet-status-pill status-lost">✗ Perdeu</span>';
  if(s==='cashout')  return '<span class="bet-status-pill status-cashout">💰 Cashout</span>';
  if(s==='partial')  return '<span class="bet-status-pill status-partial">⏳ Parcial</span>';
  return '<span class="bet-status-pill status-pending">● Em Jogo</span>';
}

function fmtDate(d){
  if(!d) return '—';
  const [y,m,day]=d.split('-');
  return `${day}/${m}/${y}`;
}
function fmtMoney(v){
  const n=parseFloat(v)||0;
  return 'R$ '+n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtMoneySign(v){
  const n=parseFloat(v)||0;
  return (n>=0?'+':'')+n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace('R$ ','R$ ');
}

function renderBet(bet, index){
  const status = getBetStatus(bet);
  const lt = isLongTerm(bet);
  const odd = parseFloat(bet.odd)||0;
  const valor = parseFloat(bet.valor)||0;
  const retorno = parseFloat(bet.retorno)||(odd*valor)||0;
  const hasBingos = bet.bingos && bet.bingos.length>0;
  const checkedCount = hasBingos ? bet.bingos.filter(b=>b.checked).length : 0;
  const totalBingos = hasBingos ? bet.bingos.length : 0;
  const pct = totalBingos>0 ? Math.round(checkedCount/totalBingos*100) : 0;

  const cashoutValue = parseFloat(bet.cashoutValue)||0;
  let cardClass = 'bet-card';
  if(lt && status==='pending') cardClass += ' card-longterm';
  else if(status==='pending') cardClass += ' card-pending';
  else if(status==='won') cardClass += ' card-won';
  else if(status==='lost') cardClass += ' card-lost';
  else if(status==='partial') cardClass += ' card-partial';
  else if(status==='cashout') cardClass += ' card-cashout';

  let longtHtml = '';
  if(lt && bet.resolucao){
    longtHtml = `<div class="longt-meta"><div class="longt-timeline">📅 Resolução: ${fmtDate(bet.resolucao)}</div></div>`;
  }

  let bingosHtml = '';
  if(hasBingos){
    bingosHtml = `
    <div class="bingos-title">Eventos (${checkedCount}/${totalBingos} bateram)</div>
    <div class="bet-progress"><div class="bet-progress-fill" style="width:${pct}%"></div></div>
    <div class="bingo-list" style="margin-top:8px">
    ${bet.bingos.map((b,i)=>`
      <div class="bingo-item${b.checked?' checked':''}" onclick="toggleBingo('${bet.id}',${i})">
        <div class="bingo-check">
          <svg viewBox="0 0 12 12" fill="none"><polyline points="1.5,6 4.5,9 10.5,3"/></svg>
        </div>
        <span class="bingo-text">${escHtml(b.text)}</span>
      </div>`).join('')}
    </div>`;
  }

  const footerBtns = status==='pending'||status==='partial' ? `
    <div class="footer-main-btns">
      <button class="btn-result btn-won" onclick="markBet('${bet.id}','ganhou')">GREEN</button>
      <button class="btn-result btn-lost" onclick="markBet('${bet.id}','perdeu')">RED</button>
      <button class="btn-result btn-cashout" onclick="openCashout('${bet.id}')">CASHOUT</button>
    </div>
    <div class="footer-icon-btns">
      <button class="btn-icon btn-edit" onclick="editBet('${bet.id}')" title="Editar">✏️</button>
      <button class="btn-icon btn-delete" onclick="askDelete('${bet.id}')" title="Excluir">🗑</button>
    </div>` : `
    <div class="footer-main-btns">
      <button class="btn-result btn-reopen" onclick="markBet('${bet.id}','pendente')">↩ Reabrir</button>
    </div>
    <div class="footer-icon-btns">
      <button class="btn-icon btn-edit" onclick="editBet('${bet.id}')" title="Editar">✏️</button>
      <button class="btn-icon btn-delete" onclick="askDelete('${bet.id}')" title="Excluir">🗑</button>
    </div>`;

  const isExpanded = expandedCards.has(bet.id);
  const chevron = `<div class="card-chevron${isExpanded?' open':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="6,9 12,15 18,9"/></svg></div>`;

  const alreadyInDom = !!document.getElementById('card-'+bet.id);
  const delay = alreadyInDom ? 0 : Math.min((index||0) * 0.055, 0.35);
  const animStyle = alreadyInDom ? 'animation:none' : `animation-delay:${delay}s`;

  const bodyHtml = isExpanded ? `
    <div class="bet-card-body bet-body-animated">
      ${longtHtml}
      <div class="bet-desc">${escHtml(bet.desc||'Sem descrição')}</div>
      ${bingosHtml}
      <div class="bet-financials">
        <div class="fin-box"><div class="fin-label">Odd</div><div class="fin-val gold">${odd?odd.toFixed(2):'—'}</div></div>
        <div class="fin-box"><div class="fin-label">Apostado</div><div class="fin-val">${fmtMoney(valor)}</div></div>
        <div class="fin-box"><div class="fin-label">${status==='cashout'?'Cashout':'Retorno'}</div><div class="fin-val ${status==='cashout'?(cashoutValue>=valor?'green':'red'):'green'}">${status==='cashout'?fmtMoney(cashoutValue):fmtMoney(retorno)}</div></div>
      </div>
    </div>` : `
    <div class="bet-card-compact">
      <div class="bet-compact-desc">${escHtml(bet.desc||'Sem descrição')}</div>
      <div class="bet-compact-nums">
        <span class="cn-odd">@ ${odd?odd.toFixed(2):'—'}</span>
        <span class="cn-sep">·</span>
        <span class="cn-val">${fmtMoney(valor)}</span>
        ${hasBingos?`<span class="cn-sep">·</span><span class="cn-bingo">${checkedCount}/${totalBingos} ✓</span>`:''}
      </div>
    </div>`;

  return `<div class="${cardClass}" id="card-${bet.id}" style="${animStyle}">
    <div class="bet-card-header" onclick="toggleCardExpand('${bet.id}')">
      <div class="bet-meta">
        ${casaBadge(bet.casa,'bet-house')}
        <span class="bet-date">${fmtDate(bet.data)}</span>
      </div>
      <div class="bet-header-end">
        ${statusLabel(status, lt)}
        ${chevron}
      </div>
    </div>
    ${bodyHtml}
    <div class="bet-card-footer">${footerBtns}</div>
  </div>`;
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toggleCardExpand(id){
  if(expandedCards.has(id)) expandedCards.delete(id);
  else expandedCards.add(id);
  const bet = bets.find(b=>b.id===id);
  if(!bet) return;
  const card = document.getElementById('card-'+id);
  if(!card) return;
  const siblings = [...card.parentElement.querySelectorAll('.bet-card')];
  const idx = siblings.indexOf(card);
  const tmp = document.createElement('div');
  tmp.innerHTML = renderBet(bet, idx);
  card.replaceWith(tmp.firstElementChild);
}

/* ── MICRO-ANIMATIONS ── */
function animateSaldo(el, toValue, duration=700){
  if(!el) return;
  const fromValue = parseFloat(el.dataset.saldoVal)||0;
  el.dataset.saldoVal = toValue;
  if(Math.abs(fromValue-toValue)<0.005){
    const fv = Math.abs(toValue).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    el.textContent = (toValue>=0?'+':'-')+' R$ '+fv;
    el.className = 'hstat-val'+(toValue>0?' positive':toValue<0?' negative':'');
    return;
  }
  const start = performance.now();
  function tick(now){
    const p = Math.min((now-start)/duration, 1);
    const ease = 1-Math.pow(1-p,3);
    const val = fromValue+(toValue-fromValue)*ease;
    const fv = Math.abs(val).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    el.textContent = (val>=0?'+':'-')+' R$ '+fv;
    el.className = 'hstat-val'+(toValue>0?' positive':toValue<0?' negative':'');
    if(p<1) requestAnimationFrame(tick);
    else {
      const ff = Math.abs(toValue).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
      el.textContent = (toValue>=0?'+':'-')+' R$ '+ff;
    }
  }
  requestAnimationFrame(tick);
}

function animateCounter(el, to, duration=520){
  if(!el) return;
  const from = parseFloat(el.dataset.animVal)||0;
  el.dataset.animVal = to;
  if(from === to) return;
  const start = performance.now();
  function tick(now){
    const p = Math.min((now-start)/duration, 1);
    const ease = 1 - Math.pow(1-p, 3);
    el.textContent = Math.round(from + (to-from)*ease);
    if(p < 1) requestAnimationFrame(tick);
    else el.textContent = to;
  }
  requestAnimationFrame(tick);
}

function bumpScoreVal(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('score-bump');
  void el.offsetWidth;
  el.classList.add('score-bump');
  el.addEventListener('animationend', ()=>el.classList.remove('score-bump'), {once:true});
}

function spawnBingoConfetti(cx, cy){
  const colors = ['#00e87a','#b4ffde','#e8b94b','#4f8ef7','#a78bfa','#ffb020'];
  for(let i=0; i<18; i++){
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    const angle = (i/18)*360 + Math.random()*20;
    const dist = 20 + Math.random()*32;
    const size = 3 + Math.random()*5;
    dot.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${colors[i%colors.length]};--dx:${(Math.cos(angle*Math.PI/180)*dist).toFixed(1)}px;--dy:${(Math.sin(angle*Math.PI/180)*dist).toFixed(1)}px;`;
    document.body.appendChild(dot);
    setTimeout(()=>dot.remove(), 750);
  }
}

/* ── GREEN CELEBRATION ── */
let _gcTimer = null;
let _gcRaf = null;

function showGreenCelebration(){
  const cel = document.getElementById('green-celebration');
  const canvas = document.getElementById('gc-canvas');
  cel.classList.remove('active');
  void cel.offsetWidth;
  cel.classList.add('active');

  // Canvas confetti
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#00e87a','#b4ffde','#e8b94b','#4f8ef7','#a78bfa','#ffb020','#00c95a','#ffffff'];
  const particles = Array.from({length:90}, ()=>({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 60,
    w: 4 + Math.random() * 9,
    h: 4 + Math.random() * (Math.random()>.5 ? 4 : 12),
    color: colors[Math.floor(Math.random()*colors.length)],
    vx: (Math.random()-.5) * 3.5,
    vy: 3 + Math.random() * 4.5,
    rot: Math.random()*360,
    vr: (Math.random()-.5)*8,
    alpha: 1,
    isRect: Math.random()>.45,
  }));

  if(_gcRaf) cancelAnimationFrame(_gcRaf);
  const startTime = performance.now();
  function draw(now){
    const t = (now - startTime) / 1000;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.vy += 0.08; // gravity
      p.alpha = Math.max(0, 1 - Math.max(0, t - 1.8) * 1.2);
      if(p.y < canvas.height + 20) alive = true;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI/180);
      ctx.fillStyle = p.color;
      if(p.isRect){
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.w/2, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    });
    if(alive && t < 3.2) _gcRaf = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  _gcRaf = requestAnimationFrame(draw);

  if(_gcTimer) clearTimeout(_gcTimer);
  _gcTimer = setTimeout(()=>cel.classList.remove('active'), 3000);
}

function dismissCelebration(){
  const cel = document.getElementById('green-celebration');
  cel.classList.remove('active');
  if(_gcTimer) clearTimeout(_gcTimer);
  if(_gcRaf){ cancelAnimationFrame(_gcRaf); _gcRaf = null; }
}

function renderAll(){
  if(Date.now() < _suppressRenderUntil) return;
  const filters = {
    emjogo:     b=>!isLongTerm(b) && (getBetStatus(b)==='pending'||getBetStatus(b)==='partial'),
    longoprazo: b=>isLongTerm(b)  && (getBetStatus(b)==='pending'||getBetStatus(b)==='partial'),
    ganhas:     b=>getBetStatus(b)==='won' || (getBetStatus(b)==='cashout' && (parseFloat(b.cashoutValue)||0) > (parseFloat(b.valor)||0)),
    perdidas:   b=>getBetStatus(b)==='lost' || (getBetStatus(b)==='cashout' && (parseFloat(b.cashoutValue)||0) <= (parseFloat(b.valor)||0)),
    todas:      ()=>true
  };
  const emptyMsgs = {
    emjogo:'Nenhuma aposta em jogo agora',
    longoprazo:'Nenhuma aposta de longo prazo',
    ganhas:'Nenhuma aposta ganha ainda',
    perdidas:'Nenhuma aposta perdida',
    todas:'Nenhuma aposta cadastrada'
  };
  const tabs = ['emjogo','longoprazo','ganhas','perdidas','todas'];
  tabs.forEach(tab=>{
    const filtered = applyCustomOrder(bets.filter(filters[tab]));
    const el = document.getElementById('tab-'+tab);
    if(!filtered.length){
      el.innerHTML=`<div class="empty"><div class="empty-icon">⚽</div><div class="empty-title">${emptyMsgs[tab]}</div><div class="empty-sub">Adicione uma aposta usando o botão +</div></div>`;
    } else {
      el.innerHTML = filtered.map((b,i) => renderBet(b,i)).join('');
    }
    const badge = document.getElementById('badge-'+tab);
    if(badge) badge.textContent = filtered.length;
  });
  updateStats();
}

function updateStats(){
  const ganhas = bets.filter(b=>getBetStatus(b)==='won' || (getBetStatus(b)==='cashout' && (parseFloat(b.cashoutValue)||0) > (parseFloat(b.valor)||0))).length;
  const perdidas = bets.filter(b=>getBetStatus(b)==='lost' || (getBetStatus(b)==='cashout' && (parseFloat(b.cashoutValue)||0) <= (parseFloat(b.valor)||0))).length;
  const pendentes = bets.filter(b=>!isLongTerm(b)&&(getBetStatus(b)==='pending'||getBetStatus(b)==='partial')).length;
  const longtermPending = bets.filter(b=>isLongTerm(b)&&(getBetStatus(b)==='pending'||getBetStatus(b)==='partial')).length;
  const saldo = bets.reduce((acc,b)=>{
    const status = getBetStatus(b);
    const valor = parseFloat(b.valor)||0;
    const retorno = parseFloat(b.retorno)||0;
    const cashoutValue = parseFloat(b.cashoutValue)||0;
    if(status==='won') return acc + (retorno - valor);
    if(status==='cashout') return acc + (cashoutValue - valor);
    return acc - valor;
  },0);

  animateSaldo(document.getElementById('h-lucro'), saldo);
  animateCounter(document.getElementById('s-pendentes'), pendentes);
  animateCounter(document.getElementById('s-longterm'), longtermPending);
  animateCounter(document.getElementById('s-ganhas'), ganhas);
  animateCounter(document.getElementById('s-perdidas'), perdidas);

}

/* ── SALDO CHART ── */
function renderSaldoChart(points){
  if(!points||!points.length) return '<div class="chart-empty-msg">Adicione apostas finalizadas para ver o gráfico</div>';

  const W=560,H=165;
  const pad={t:14,r:14,b:26,l:58};
  const iW=W-pad.l-pad.r, iH=H-pad.t-pad.b;
  const uid=Math.random().toString(36).substr(2,5);

  const allVals=[0,...points.map(p=>p.value)];
  const rawMin=Math.min(...allVals), rawMax=Math.max(...allVals);
  const span=(rawMax-rawMin)||10;
  const minV=rawMin-span*0.08, maxV=rawMax+span*0.08;
  const vRange=maxV-minV;

  const sy=v=>+(pad.t+(1-(v-minV)/vRange)*iH).toFixed(1);
  const sx=i=>+(pad.l+(i/points.length)*iW).toFixed(1);

  const allPts=[{value:0},...points];
  const coords=allPts.map((p,i)=>[sx(i),sy(p.value)]);
  const zeroY=sy(0);

  const linePts=coords.map(([x,y],i)=>`${i===0?'M':'L'}${x} ${y}`).join(' ');
  const areaD=linePts+` L${coords[coords.length-1][0]} ${H+20} L${coords[0][0]} ${H+20} Z`;

  const fmtY=v=>{
    if(v===0) return 'R$0';
    const a=Math.abs(v), s=a>=1000?(a/1000).toFixed(1).replace('.0','')+'k':a.toFixed(0);
    return (v>0?'+':'-')+'R$'+s;
  };

  const yVals=[...new Set([rawMin,0,rawMax])];
  const yLbls=yVals.map(v=>{
    const y=sy(v), isZ=v===0;
    const clr=isZ?'rgba(255,255,255,0.4)':v>0?'rgba(0,232,122,0.65)':'rgba(255,61,90,0.65)';
    return `<line x1="${pad.l}" y1="${y}" x2="${pad.l+iW}" y2="${y}" stroke="${isZ?'rgba(255,255,255,0.14)':'rgba(255,255,255,0.05)'}" stroke-width="1"${isZ?' stroke-dasharray="4 3"':''}/>
    <text x="${pad.l-7}" y="${y}" dy="4" text-anchor="end" font-size="9" fill="${clr}" font-family="Space Mono,monospace">${fmtY(v)}</text>`;
  });

  const dotEls=points.map((p,i)=>{
    const[x,y]=coords[i+1];
    const clr=p.value>0?'#00e87a':p.value<0?'#ff3d5a':'rgba(255,255,255,0.4)';
    const valStr=(p.value>=0?'+':'')+p.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="${clr}" stroke="#09091a" stroke-width="1.5"><title>${p.date}: ${valStr}</title></circle>`;
  });

  const xLbls=[];
  if(points.length>=1){
    xLbls.push(`<text x="${coords[1][0]}" y="${H-3}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.28)" font-family="Space Mono,monospace">${points[0].date}</text>`);
    if(points.length>1) xLbls.push(`<text x="${coords[coords.length-1][0]}" y="${H-3}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.28)" font-family="Space Mono,monospace">${points[points.length-1].date}</text>`);
  }

  return `<div class="saldo-chart-wrap">
  <svg class="saldo-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs>
      <clipPath id="ca${uid}"><rect x="${pad.l}" y="${pad.t}" width="${iW}" height="${Math.max(0,zeroY-pad.t)}"/></clipPath>
      <clipPath id="cb${uid}"><rect x="${pad.l}" y="${zeroY}" width="${iW}" height="${Math.max(0,H-pad.b-zeroY)}"/></clipPath>
    </defs>
    ${yLbls.join('\n    ')}
    <path d="${areaD}" fill="rgba(0,232,122,0.1)" clip-path="url(#ca${uid})"/>
    <path d="${areaD}" fill="rgba(255,61,90,0.1)" clip-path="url(#cb${uid})"/>
    <path d="${linePts}" fill="none" stroke="#00e87a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#ca${uid})"/>
    <path d="${linePts}" fill="none" stroke="#ff3d5a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#cb${uid})"/>
    ${dotEls.join('\n    ')}
    ${xLbls.join('\n    ')}
  </svg>
</div>`;
}

/* ── FLUXO DE CAIXA (apostado / retorno / sacado / depositado) ── */
function computeFinanceSummary(){
  const events = [];
  bets.forEach(b=>{
    const status = getBetStatus(b);
    const valor = parseFloat(b.valor)||0;
    let retornoEvent = 0;
    if(status==='won') retornoEvent = parseFloat(b.retorno)||0;
    else if(status==='cashout') retornoEvent = parseFloat(b.cashoutValue)||0;
    events.push({ date: b.createdAt||0, type:'bet', valor, retornoEvent });
  });
  saques.forEach(s=>{
    events.push({ date: s.createdAt||0, type:'saque', valor: parseFloat(s.valor)||0 });
  });
  events.sort((a,b)=>a.date-b.date);

  let pool = 0, totalApostado=0, totalRetorno=0, totalSacado=0, totalDepositado=0;
  events.forEach(e=>{
    if(e.type==='bet'){
      totalApostado += e.valor;
      pool -= e.valor;
      if(pool < 0){ totalDepositado += -pool; pool = 0; }
      if(e.retornoEvent > 0){
        pool += e.retornoEvent;
        totalRetorno += e.retornoEvent;
      }
    } else {
      totalSacado += e.valor;
      pool -= e.valor;
    }
  });
  return { totalApostado, totalRetorno, totalSacado, totalDepositado, poolDisponivel: pool };
}

/* ── SAQUES ── */
async function saveSaque(saque){
  try{
    const { doc, setDoc } = window._firestoreFns;
    const colName = window._saqueCollections[currentProfile];
    await setDoc(doc(window._db, colName, saque.id), saque);
  } catch(e){ console.error("Erro ao salvar saque:", e); showToast("⚠️ Erro ao salvar"); }
}

async function deleteSaqueDoc(id){
  try{
    const { doc, deleteDoc } = window._firestoreFns;
    const colName = window._saqueCollections[currentProfile];
    await deleteDoc(doc(window._db, colName, id));
  } catch(e){ console.error("Erro ao excluir saque:", e); }
}

function openSaqueModal(){
  document.getElementById('f-saque-valor').value = '';
  document.getElementById('f-saque-data').value = new Date().toISOString().slice(0,10);
  document.getElementById('f-saque-desc').value = '';
  document.getElementById('saque-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSaqueModal(){
  document.getElementById('saque-overlay').classList.remove('open');
  document.body.style.overflow = '';
}
function handleSaqueOverlay(e){
  if(e.target === document.getElementById('saque-overlay')) closeSaqueModal();
}
function confirmSaque(){
  const valor = parseFloat(document.getElementById('f-saque-valor').value);
  const data = document.getElementById('f-saque-data').value;
  const desc = document.getElementById('f-saque-desc').value.trim();

  if(!valor || valor<=0){ showToast('⚠️ Informe um valor válido'); return; }
  if(!data){ showToast('⚠️ Informe a data'); return; }

  const saque = { id: genId(), valor, data, desc, createdAt: Date.now() };
  saques.unshift(saque);
  saveSaque(saque);
  closeSaqueModal();
  showToast('💸 Saque registrado');
  openSaldoDrawer();
}

function askDeleteSaque(id){
  deletingId = id;
  deletingType = 'saque';
  document.getElementById('confirm-icon').textContent = '🗑️';
  document.getElementById('confirm-title').textContent = 'Excluir Saque?';
  document.getElementById('confirm-msg').textContent = 'Este registro de saque será removido permanentemente.';
  document.getElementById('confirm-ok-btn').textContent = 'Excluir';
  document.getElementById('confirm-modal').classList.add('open');
}

function deleteSaqueEntry(id){
  saques = saques.filter(s=>s.id!==id);
  deleteSaqueDoc(id);
  openSaldoDrawer();
  showToast('🗑️ Saque removido');
}

/* ── SALDO DRAWER ── */
function openSaldoDrawer(){
  const drawer = document.getElementById('saldo-drawer');

  const titleEl = document.getElementById('sd-title');
  titleEl.textContent = 'Saldo — ' + PROFILE_LABELS[currentProfile];
  titleEl.className = 'sd-title sd-title-' + currentProfile;

  const finalizadas = bets
    .filter(b => getBetStatus(b)==='won' || getBetStatus(b)==='lost' || getBetStatus(b)==='cashout')
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  const totalInvestido = bets.reduce((acc,b)=>acc+(parseFloat(b.valor)||0),0);
  const totalRetorno = bets.filter(b=>getBetStatus(b)==='won').reduce((acc,b)=>acc+(parseFloat(b.retorno)||0),0);
  const totalPerdido = bets.filter(b=>getBetStatus(b)==='lost').reduce((acc,b)=>acc+(parseFloat(b.valor)||0),0);
  const saldo = bets.reduce((acc,b)=>{
    const status = getBetStatus(b);
    const valor = parseFloat(b.valor)||0;
    const retorno = parseFloat(b.retorno)||0;
    const cashoutValue = parseFloat(b.cashoutValue)||0;
    if(status==='won') return acc + (retorno - valor);
    if(status==='cashout') return acc + (cashoutValue - valor);
    return acc - valor;
  },0);
  const saldoClass = saldo>0?'positive':saldo<0?'negative':'neutral';
  const saldoStr = (saldo>=0?'+':'')+saldo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace('R$ ','R$ ');

  document.getElementById('sd-summary').innerHTML = `
    <div class="sd-sum-card">
      <div class="sd-sum-val ${saldoClass}">${saldoStr}</div>
      <div class="sd-sum-lbl">Saldo Total</div>
    </div>
    <div class="sd-sum-card">
      <div class="sd-sum-val neutral">${fmtMoney(totalRetorno)}</div>
      <div class="sd-sum-lbl">Total Ganho</div>
    </div>
    <div class="sd-sum-card">
      <div class="sd-sum-val" style="color:var(--red)">${fmtMoney(totalPerdido)}</div>
      <div class="sd-sum-lbl">Total Perdido</div>
    </div>
  `;

  const ganhasCount = bets.filter(b=>getBetStatus(b)==='won'||(getBetStatus(b)==='cashout'&&(parseFloat(b.cashoutValue)||0)>(parseFloat(b.valor)||0))).length;
  const perdidasCount = bets.filter(b=>getBetStatus(b)==='lost'||(getBetStatus(b)==='cashout'&&(parseFloat(b.cashoutValue)||0)<=(parseFloat(b.valor)||0))).length;
  const finCnt = ganhasCount + perdidasCount;
  const taxa = finCnt > 0 ? Math.round(ganhasCount / finCnt * 100) : null;
  const taxaStr = taxa !== null ? taxa+'%' : '—';
  const taxaClass = taxa !== null ? (taxa >= 50 ? 'positive' : 'negative') : 'neutral';

  const finalBets = bets.filter(b=>{ const s=getBetStatus(b); return s==='won'||s==='lost'||s==='cashout'; });
  const totalInv = finalBets.reduce((a,b)=>a+(parseFloat(b.valor)||0), 0);
  const profitFin = finalBets.reduce((a,b)=>{
    const s=getBetStatus(b),v=parseFloat(b.valor)||0,r=parseFloat(b.retorno)||0,cv=parseFloat(b.cashoutValue)||0;
    if(s==='won') return a+(r-v); if(s==='cashout') return a+(cv-v); return a-v;
  }, 0);
  const roi = totalInv > 0 ? profitFin/totalInv*100 : null;
  const roiStr = roi !== null ? (roi>=0?'+':'')+roi.toFixed(1)+'%' : '—';
  const roiClass = roi !== null ? (roi > 0 ? 'positive' : roi < 0 ? 'negative' : 'neutral') : 'neutral';

  document.getElementById('sd-perf').innerHTML = `
    <div class="sd-perf-cell">
      <div class="sd-perf-lbl">Taxa de Acerto</div>
      <div class="sd-perf-val ${taxaClass}">${taxaStr}</div>
      <div class="sd-perf-sub">${finCnt > 0 ? ganhasCount+' de '+finCnt+' finalizadas' : 'Sem apostas finalizadas'}</div>
    </div>
    <div class="sd-perf-divider"></div>
    <div class="sd-perf-cell">
      <div class="sd-perf-lbl">ROI</div>
      <div class="sd-perf-val ${roiClass}">${roiStr}</div>
      <div class="sd-perf-sub">${totalInv > 0 ? 'investido: '+fmtMoney(totalInv) : 'Sem apostas finalizadas'}</div>
    </div>
  `;

  const flow = computeFinanceSummary();
  document.getElementById('sd-flow').innerHTML = `
    <div class="sd-flow-title">💰 Fluxo de Caixa</div>
    <div class="sd-flow-grid">
      <div class="sd-flow-card">
        <div class="sd-flow-lbl">Total Apostado</div>
        <div class="sd-flow-val">${fmtMoney(flow.totalApostado)}</div>
      </div>
      <div class="sd-flow-card">
        <div class="sd-flow-lbl">Total Retorno</div>
        <div class="sd-flow-val green">${fmtMoney(flow.totalRetorno)}</div>
      </div>
      <div class="sd-flow-card">
        <div class="sd-flow-lbl">Total Sacado</div>
        <div class="sd-flow-val amber">${fmtMoney(flow.totalSacado)}</div>
      </div>
      <div class="sd-flow-card">
        <div class="sd-flow-lbl">Total Depositado</div>
        <div class="sd-flow-val purple">${fmtMoney(flow.totalDepositado)}</div>
      </div>
    </div>
    ${flow.poolDisponivel > 0.005 ? `<div class="sd-flow-pool">💵 Lucro disponível para reinvestir ou sacar: <strong>${fmtMoney(flow.poolDisponivel)}</strong></div>` : ''}
    <button class="sd-saque-btn" onclick="openSaqueModal()">💸 Realizar Saque</button>
  `;

  // Build chronological running balance for chart + bet rows
  const ordered = [...finalizadas].reverse();
  let running = 0;
  const runningMap = {};
  const chartPoints = [];
  ordered.forEach(b => {
    const status = getBetStatus(b);
    if(status==='won'){
      running += (parseFloat(b.retorno)||0) - (parseFloat(b.valor)||0);
    } else if(status==='cashout'){
      running += (parseFloat(b.cashoutValue)||0) - (parseFloat(b.valor)||0);
    } else {
      running -= (parseFloat(b.valor)||0);
    }
    runningMap[b.id] = running;
    chartPoints.push({ value: running, date: fmtDate(b.data) });
  });

  let bodyHtml = renderSaldoChart(chartPoints);

  bodyHtml += `<div class="sd-section-title">Histórico de Saques</div>`;
  if(!saques.length){
    bodyHtml += `<div class="sd-empty sd-empty-sm"><div class="sd-empty-icon">💸</div>Nenhum saque registrado ainda</div>`;
  } else {
    [...saques].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(s=>{
      bodyHtml += `
        <div class="sd-saque-row">
          <div class="sd-saque-left">
            <span class="sd-saque-icon">💸</span>
            <div>
              <div class="sd-saque-desc">${s.desc?escHtml(s.desc):'Saque'}</div>
              <div class="sd-saque-date">${fmtDate(s.data)}</div>
            </div>
          </div>
          <div class="sd-saque-right">
            <span class="sd-saque-val">${fmtMoney(s.valor)}</span>
            <button class="sd-saque-del" onclick="askDeleteSaque('${s.id}')" title="Excluir">🗑</button>
          </div>
        </div>`;
    });
  }

  bodyHtml += `<div class="sd-section-title">Apostas Finalizadas</div>`;

  if(!finalizadas.length){
    bodyHtml += `<div class="sd-empty"><div class="sd-empty-icon">📋</div>Nenhuma aposta finalizada ainda</div>`;
  } else {
    finalizadas.forEach(bet => {
      const status = getBetStatus(bet);
      const isWon = status === 'won';
      const isCashout = status === 'cashout';
      const valor = parseFloat(bet.valor)||0;
      const retorno = parseFloat(bet.retorno)||0;
      const cashoutValue = parseFloat(bet.cashoutValue)||0;
      const odd = parseFloat(bet.odd)||0;
      const impacto = isWon ? retorno - valor : isCashout ? cashoutValue - valor : -valor;
      const impactoStr = (impacto>=0?'+':'')+impacto.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace('R$ ','R$ ');
      const runSaldo = runningMap[bet.id] || 0;
      const runSaldoStr = (runSaldo>=0?'+':'')+runSaldo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace('R$ ','R$ ');
      const runClass = runSaldo>0?'positive':runSaldo<0?'negative':'zero';

      const rowClass = isWon ? 'row-won' : isCashout ? 'row-cashout' : 'row-lost';
      bodyHtml += `
        <div class="sd-bet-row ${rowClass}">
          <div class="sd-bet-top">
            <div class="sd-bet-left">
              ${casaBadge(bet.casa,'sd-bet-casa')}
              <span class="sd-bet-desc">${escHtml(bet.desc||'Sem descrição')}</span>
            </div>
            <span class="sd-bet-date">${fmtDate(bet.data)}</span>
          </div>
          <div class="sd-bet-pills">
            <span class="sd-pill ${isWon?'won':isCashout?'cashout':'lost'}">${isWon?'✓ Ganhou':isCashout?'💰 Cashout':'✗ Perdeu'}</span>
          </div>
          <div class="sd-bet-nums">
            <div class="sd-num">
              <div class="sd-num-lbl">Odd</div>
              <div class="sd-num-val gold">${odd?odd.toFixed(2):'—'}</div>
            </div>
            <div class="sd-num">
              <div class="sd-num-lbl">Apostado</div>
              <div class="sd-num-val neutral">${fmtMoney(valor)}</div>
            </div>
            <div class="sd-num">
              <div class="sd-num-lbl">${isCashout?'Cashout':'Retorno'}</div>
              <div class="sd-num-val ${isWon?'green':isCashout?(cashoutValue>=valor?'green':'red'):'red'}">${isWon?fmtMoney(retorno):isCashout?fmtMoney(cashoutValue):fmtMoney(0)}</div>
            </div>
            <div class="sd-num">
              <div class="sd-num-lbl">Impacto</div>
              <div class="sd-num-val ${impacto>=0?'green':'red'}">${impactoStr}</div>
            </div>
          </div>
          <div class="sd-impact ${impacto>=0?'positive':'negative'}">
            <span class="sd-impact-icon">${impacto>=0?'↑':'↓'}</span>
            <span>Impacto no saldo: <strong>${impactoStr}</strong></span>
          </div>
          <div class="sd-running">
            <span class="sd-running-lbl">Saldo acumulado após esta aposta</span>
            <span class="sd-running-val ${runClass}">${runSaldoStr}</span>
          </div>
        </div>`;
    });
  }

  document.getElementById('sd-body').innerHTML = bodyHtml;
  drawer.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSaldoDrawer(){
  document.getElementById('saldo-drawer').classList.remove('open');
  document.body.style.overflow = '';
}
function handleSaldoOverlay(e){
  if(e.target === document.getElementById('saldo-drawer')) closeSaldoDrawer();
}

/* ── ALAVANCAGEM ── */
function getCurrentAlav(){
  return alavancagens.find(a=>a.id===currentAlavId) || null;
}

function fmtAlavDate(ts){
  if(!ts) return '—';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

async function saveAlavancagem(seq){
  try{
    const { doc, setDoc } = window._firestoreFns;
    const colName = window._alavCollections[currentProfile];
    await setDoc(doc(window._db, colName, seq.id), seq);
  } catch(e){ console.error("Erro ao salvar alavancagem:", e); showToast("⚠️ Erro ao salvar"); }
}

async function deleteAlavancagemDoc(id){
  try{
    const { doc, deleteDoc } = window._firestoreFns;
    const colName = window._alavCollections[currentProfile];
    await deleteDoc(doc(window._db, colName, id));
  } catch(e){ console.error("Erro ao excluir alavancagem:", e); }
}

function openAlavancagem(id){
  currentAlavId = id;
  renderAlavancagem();
}

function backToAlavList(){
  currentAlavId = null;
  renderAlavancagem();
}

function startAlavancagem(){
  const input = document.getElementById('alav-valor-inicial');
  const valor = parseFloat(input.value);
  if(!valor || valor<=0){ showToast('⚠️ Informe um valor inicial válido'); return; }

  const seq = {
    id: genId(),
    valorInicial: valor,
    steps: [{ id:genId(), valor:valor, odd:null, desc:'', status:'draft', retorno:null }],
    status: 'active',
    createdAt: Date.now()
  };
  alavancagens.unshift(seq);
  currentAlavId = seq.id;
  renderAlavancagem();
  saveAlavancagem(seq);
  showToast('🚀 Alavancagem iniciada!');
}

function registerStep(){
  const alav = getCurrentAlav();
  if(!alav || alav.status!=='active') return;
  const steps = alav.steps;
  const current = steps[steps.length-1];
  if(current.status!=='draft') return;

  const oddInput = document.getElementById('alav-odd-input');
  const descInput = document.getElementById('alav-desc-input');
  const odd = parseFloat(oddInput.value);
  const desc = descInput ? descInput.value.trim() : '';

  if(!odd || odd<=1){ showToast('⚠️ Informe uma odd válida'); return; }

  current.odd = odd;
  current.desc = desc;
  current.status = 'open';

  renderAlavancagem();
  saveAlavancagem(alav);
  showToast('📝 Aposta registrada — aguardando resultado');
}

function markStep(result){
  const alav = getCurrentAlav();
  if(!alav || alav.status!=='active') return;
  const steps = alav.steps;
  const current = steps[steps.length-1];
  if(current.status!=='open') return;

  current.status = result;

  if(result==='green'){
    const retorno = current.valor * current.odd;
    current.retorno = retorno;
    steps.push({ id:genId(), valor:retorno, odd:null, desc:'', status:'draft', retorno:null });
    showGreenCelebration();
    showToast('✅ Green! Nova rodada liberada');
  } else {
    current.retorno = 0;
    alav.status = 'finished';
    showToast('💀 Alavancagem encerrada');
  }

  renderAlavancagem();
  saveAlavancagem(alav);
}

/* Tooltip with bet description (registered + resolved steps) */
function infoIconHtml(desc){
  if(!desc) return '';
  return `<div class="alav-step-info" onclick="toggleStepInfo(this, event)">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.5" r="0.75" fill="currentColor" stroke="none"/></svg>
    <div class="alav-step-tooltip">${escHtml(desc)}</div>
  </div>`;
}
function toggleStepInfo(el, e){
  if(e) e.stopPropagation();
  const wasOpen = el.classList.contains('open');
  document.querySelectorAll('.alav-step-info.open').forEach(o=>o.classList.remove('open'));
  if(!wasOpen) el.classList.add('open');
}
document.addEventListener('click', ()=>{
  document.querySelectorAll('.alav-step-info.open').forEach(o=>o.classList.remove('open'));
});

function canUndoAlavancagem(){
  const alav = getCurrentAlav();
  if(!alav) return false;
  const steps = alav.steps;
  if(alav.status==='finished') return true;
  return steps.length>=2 && steps[steps.length-2].status==='green';
}

function askUndoStep(){
  deletingId='_alav_';
  deletingType='alavancagem-undo';
  document.getElementById('confirm-icon').textContent = '↩';
  document.getElementById('confirm-title').textContent = 'Reverter jogada?';
  document.getElementById('confirm-msg').textContent = 'A última jogada (green/red) será desfeita e você volta para a rodada anterior. Se a próxima rodada já tiver sido registrada, ela será descartada.';
  document.getElementById('confirm-ok-btn').textContent = 'Reverter';
  document.getElementById('confirm-modal').classList.add('open');
}

function undoLastStep(){
  const alav = getCurrentAlav();
  if(!alav) return;
  const steps = alav.steps;

  if(alav.status==='finished'){
    const last = steps[steps.length-1];
    last.status = 'open';
    last.retorno = null;
    alav.status = 'active';
  } else {
    if(steps.length<2) return;
    const prev = steps[steps.length-2];
    if(prev.status!=='green') return;
    steps.pop();
    prev.status = 'open';
    prev.retorno = null;
  }

  renderAlavancagem();
  saveAlavancagem(alav);
  showToast('↩ Jogada revertida');
}

function askDeleteAlavancagem(id){
  deletingId = id;
  deletingType = 'alavancagem-delete';
  document.getElementById('confirm-icon').textContent = '🗑️';
  document.getElementById('confirm-title').textContent = 'Excluir Alavancagem?';
  document.getElementById('confirm-msg').textContent = 'Esta alavancagem e todo o seu histórico serão removidos permanentemente.';
  document.getElementById('confirm-ok-btn').textContent = 'Excluir';
  document.getElementById('confirm-modal').classList.add('open');
}

function deleteAlavancagemSeq(id){
  alavancagens = alavancagens.filter(a=>a.id!==id);
  if(currentAlavId===id) currentAlavId = null;
  renderAlavancagem();
  deleteAlavancagemDoc(id);
  showToast('🗑️ Alavancagem excluída');
}

function renderAlavancagem(){
  const el = document.getElementById('tab-alavancagem');
  if(!el) return;
  const badge = document.getElementById('badge-alavancagem');
  if(badge) badge.textContent = alavancagens.length || '–';

  const alav = getCurrentAlav();
  if(!alav){
    currentAlavId = null;
    renderAlavList(el);
    return;
  }
  renderAlavDetail(el, alav);
}

function renderAlavList(el){
  const cardsHtml = alavancagens.map(a=>{
    const steps = a.steps;
    const finished = a.status === 'finished';
    const current = !finished ? steps[steps.length-1] : null;
    const bancaAtual = finished ? 0 : current.valor;
    const mult = a.valorInicial>0 ? (bancaAtual/a.valorInicial) : 0;
    const aguardando = !finished && current.status==='open' && current.odd;
    const proximoVal = aguardando ? current.valor * current.odd : 0;
    return `
    <div class="alav-card" onclick="openAlavancagem('${a.id}')">
      <button class="alav-card-del" onclick="event.stopPropagation();askDeleteAlavancagem('${a.id}')" title="Excluir">🗑</button>
      <div class="alav-card-top">
        <span class="alav-card-status ${finished?'finished':'active'}">${finished?'Encerrada':'● Ativa'}</span>
        <span class="alav-card-date">${fmtAlavDate(a.createdAt)}</span>
      </div>
      <div class="alav-card-nums">
        <div class="alav-card-num">
          <div class="alav-card-lbl">Inicial</div>
          <div class="alav-card-val">${fmtMoney(a.valorInicial)}</div>
        </div>
        <div class="alav-card-arrow">→</div>
        <div class="alav-card-num">
          <div class="alav-card-lbl">${finished?'Final':'Atual'}</div>
          <div class="alav-card-val ${finished?'red':'gold'}">${fmtMoney(bancaAtual)}</div>
          ${aguardando?`<div class="alav-card-proj">🎯 ${fmtMoney(proximoVal)}</div>`:''}
        </div>
        <div class="alav-card-num">
          <div class="alav-card-lbl">Mult.</div>
          <div class="alav-card-val">${mult.toFixed(2)}x</div>
          ${aguardando?`<div class="alav-card-proj">${(proximoVal/a.valorInicial).toFixed(2)}x</div>`:''}
        </div>
      </div>
      <div class="alav-card-foot">${steps.length} rodada${steps.length===1?'':'s'}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="alav-list-wrap">
      <div class="alav-new-card">
        <div class="alav-new-title">🚀 Nova Alavancagem</div>
        <div class="form-group">
          <label class="form-label">Valor Inicial (R$)</label>
          <input class="form-input" id="alav-valor-inicial" type="number" step="0.01" min="0" placeholder="100.00"/>
        </div>
        <button class="btn-save" onclick="startAlavancagem()">COMEÇAR ALAVANCAGEM</button>
      </div>
      ${alavancagens.length ? `<div class="alav-list">${cardsHtml}</div>` : `<div class="alav-empty">Nenhuma alavancagem criada ainda. Comece uma acima ☝️</div>`}
    </div>`;
}

function renderAlavDetail(el, alav){
  const steps = alav.steps;
  const finished = alav.status === 'finished';
  const current = !finished ? steps[steps.length-1] : null;
  const bancaAtual = finished ? 0 : current.valor;
  const mult = alav.valorInicial>0 ? (bancaAtual/alav.valorInicial) : 0;

  const stepsHtml = steps.map((s,i)=>{
    if(s.status==='draft'){
      return `
      <div class="alav-step alav-step-current">
        <div class="alav-step-num">${i+1}</div>
        <div class="alav-step-current-body">
          <div class="alav-step-current-top">
            <div class="alav-step-val-big">${fmtMoney(s.valor)}</div>
            <input class="form-input alav-odd-input" id="alav-odd-input" type="number" step="0.01" min="1.01" placeholder="Odd"/>
          </div>
          <input class="form-input alav-desc-input" id="alav-desc-input" type="text" placeholder="Descrição da bet (opcional, só registro)"/>
          <button class="alav-btn-add" onclick="registerStep()">+ ADICIONAR APOSTA</button>
        </div>
      </div>`;
    }
    if(s.status==='open'){
      return `
      <div class="alav-step alav-step-current alav-step-open">
        <div class="alav-step-num">${i+1}</div>
        <div class="alav-step-current-body">
          <div class="alav-step-current-top">
            <div class="alav-step-val-big">${fmtMoney(s.valor)}</div>
            <div class="alav-step-odd-display">@ ${s.odd.toFixed(2)}</div>
            ${infoIconHtml(s.desc)}
          </div>
          <div class="alav-step-btns">
            <button class="btn-result btn-won" onclick="markStep('green')">GREEN</button>
            <button class="btn-result btn-lost" onclick="markStep('red')">RED</button>
          </div>
        </div>
      </div>`;
    }
    const isGreen = s.status==='green';
    return `
    <div class="alav-step alav-step-${isGreen?'green':'red'}">
      <div class="alav-step-num">${i+1}</div>
      <div class="alav-step-main">
        <div class="alav-step-val">${fmtMoney(s.valor)}</div>
        <div class="alav-step-odd">@ ${s.odd?s.odd.toFixed(2):'—'}</div>
      </div>
      <div class="alav-step-arrow">→</div>
      <div class="alav-step-retorno ${isGreen?'green':'red'}">${fmtMoney(s.retorno||0)}</div>
      ${infoIconHtml(s.desc)}
      <div class="alav-step-badge ${isGreen?'green':'red'}">${isGreen?'✓ GREEN':'✗ RED'}</div>
    </div>`;
  }).join('');

  const finishedHtml = finished ? `
    <div class="alav-finished">
      <div class="alav-finished-icon">💀</div>
      <div class="alav-finished-title">Alavancagem encerrada na rodada ${steps.length}</div>
      <div class="alav-finished-sub">Banca final: ${fmtMoney(0)}</div>
    </div>` : '';

  el.innerHTML = `
    <div class="alav-wrap">
      <button class="alav-back-btn" onclick="backToAlavList()">← Minhas Alavancagens</button>
      <div class="alav-header">
        <div class="alav-banca-box">
          <div class="alav-banca-label">Inicial</div>
          <div class="alav-banca-val">${fmtMoney(alav.valorInicial)}</div>
        </div>
        <div class="alav-banca-box highlight">
          <div class="alav-banca-label">Banca Atual</div>
          <div class="alav-banca-val gold">${fmtMoney(bancaAtual)}</div>
        </div>
        <div class="alav-banca-box">
          <div class="alav-banca-label">Multiplicador</div>
          <div class="alav-banca-val">${mult.toFixed(2)}x</div>
        </div>
      </div>
      <div class="alav-steps">${stepsHtml}</div>
      ${finishedHtml}
      <div class="alav-actions">
        ${canUndoAlavancagem() ? `<button class="alav-undo-btn" onclick="askUndoStep()">↩ Reverter Jogada</button>` : ''}
        <button class="alav-reset-btn" onclick="askDeleteAlavancagem(currentAlavId)">🗑 Excluir Alavancagem</button>
      </div>
    </div>`;
}

/* ── BINGO ── */
function toggleBingo(id,idx){
  const bet = bets.find(b=>b.id===id);
  if(!bet||!bet.bingos) return;

  const newChecked = !bet.bingos[idx].checked;
  bet.bingos[idx].checked = newChecked;

  // Update DOM directly — no full re-render
  const card = document.getElementById('card-'+id);
  if(card){
    const items = card.querySelectorAll('.bingo-item');
    const item = items[idx];
    if(item){
      item.classList.toggle('checked', newChecked);
      if(newChecked){
        const checkEl = item.querySelector('.bingo-check');
        if(checkEl){
          const r = checkEl.getBoundingClientRect();
          spawnBingoConfetti(r.left + r.width/2, r.top + r.height/2);
        }
      }
    }
    const checkedCnt = bet.bingos.filter(b=>b.checked).length;
    const total = bet.bingos.length;
    const pct = total > 0 ? Math.round(checkedCnt/total*100) : 0;
    const fill = card.querySelector('.bet-progress-fill');
    if(fill) fill.style.width = pct+'%';
    const title = card.querySelector('.bingos-title');
    if(title) title.textContent = `Eventos (${checkedCnt}/${total} bateram)`;
  }

  // Suppress Firebase-triggered re-render (roundtrip ~800ms)
  _suppressRenderUntil = Date.now() + 1500;
  saveOneBet(bet);
  showToast(newChecked ? '✅ Evento marcado!' : '↩ Evento desmarcado');
}

/* ── STATUS ── */
function markBet(id, status){
  const bet = bets.find(b=>b.id===id);
  if(!bet) return;

  bet.status = status;
  if(status==='pendente') bet.cashoutValue = null;

  // Render imediato na memória — não espera Firebase confirmar
  _suppressRenderUntil = 0;
  renderAll();

  const cardEl = document.getElementById('card-'+id);
  saveOneBet(bet);

  if(status==='ganhou'){
    showGreenCelebration();
    setTimeout(()=>bumpScoreVal('s-ganhas'), 400);
  } else if(status==='perdeu'){
    if(cardEl){ cardEl.classList.add('flash-lost'); setTimeout(()=>cardEl.classList.remove('flash-lost'),800); }
    showToast('💀 Aposta marcada como perdida');
    setTimeout(()=>bumpScoreVal('s-perdidas'), 300);
  } else {
    showToast('↩ Aposta reaberta');
  }
}

/* ── MODAL ── */
function openModal(id){
  editingId = id||null;
  const ov = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = id ? 'Editar Aposta' : 'Nova Aposta';
  clearForm();

  if(id){
    const bet = bets.find(b=>b.id===id);
    if(bet){
      selectBetType(bet.betType==='longterm'?'longterm':'normal');
      const casaLow=(bet.casa||'').toLowerCase().replace(/\s/g,'');
      if(casaLow==='betano') selectCasa('betano');
      else if(casaLow==='bet365') selectCasa('bet365');
      else { selectCasa('outra'); document.getElementById('f-casa-outra').value=bet.casa||''; }
      document.getElementById('f-data').value = bet.data||'';
      document.getElementById('f-desc').value = bet.desc||'';
      document.getElementById('f-odd').value = bet.odd||'';
      document.getElementById('f-valor').value = bet.valor||'';
      document.getElementById('f-retorno').value = bet.retorno||'';
      if(bet.resolucao) document.getElementById('f-resolucao').value = bet.resolucao;
      if(bet.bingos) bet.bingos.forEach(b=>addBingo(b.text));
    }
  } else {
    selectBetType('normal');
    document.getElementById('f-data').value = new Date().toISOString().split('T')[0];
    addBingo();
  }
  ov.classList.add('open');
  document.querySelector('.fab').classList.add('fab-open');
  document.getElementById('f-desc').focus();
}
function editBet(id){ openModal(id); }
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('open');
  document.querySelector('.fab').classList.remove('fab-open');
  editingId=null;
}
function handleOverlayClick(e){
  if(e.target===document.getElementById('modal-overlay')) closeModal();
}

/* ── FORM BINGO ── */
function clearForm(){
  ['f-casa','f-data','f-desc','f-odd','f-valor','f-retorno','f-resolucao'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.value='';
  });
  document.getElementById('bingo-builder').innerHTML='';
  bingoCount=0;
  selectedCasa='';
  ['betano','bet365','outra'].forEach(c=>{
    const btn=document.getElementById('casa-btn-'+c);
    if(btn) btn.className='casa-btn';
  });
  const outraInput=document.getElementById('f-casa-outra');
  if(outraInput){outraInput.style.display='none';outraInput.value='';}
}
function addBingo(txt){
  const container = document.getElementById('bingo-builder');
  const idx = bingoCount++;
  const div = document.createElement('div');
  div.className='bingo-entry';
  div.id='bingo-row-'+idx;
  div.innerHTML=`<input class="form-input" type="text" placeholder="Ex: Brasil marca primeiro..." value="${txt?escHtml(txt):''}"/><button class="btn-remove-bingo" onclick="removeBingo('bingo-row-${idx}')" title="Remover">✕</button>`;
  container.appendChild(div);
}
function removeBingo(id){
  const el = document.getElementById(id);
  if(el) el.remove();
}

/* ── SAVE ── */
function saveBet(){
  const casa = selectedCasa==='outra'
    ? (document.getElementById('f-casa-outra').value.trim())
    : selectedCasa;
  const data = document.getElementById('f-data').value;
  const desc = document.getElementById('f-desc').value.trim();
  const odd = parseFloat(document.getElementById('f-odd').value)||0;
  const valor = parseFloat(document.getElementById('f-valor').value)||0;
  const retorno = parseFloat(document.getElementById('f-retorno').value)||(odd*valor)||0;
  const resolucao = document.getElementById('f-resolucao').value||null;

  if(!desc){ showToast('⚠️ Adicione uma descrição'); return; }
  if(!casa){ showToast('⚠️ Informe a casa de apostas'); return; }

  const bingos = [];
  document.querySelectorAll('#bingo-builder .bingo-entry input').forEach(inp=>{
    if(inp.value.trim()) bingos.push({text:inp.value.trim(),checked:false});
  });

  if(editingId){
    const old = bets.find(b=>b.id===editingId);
    if(old&&old.bingos){
      bingos.forEach(b=>{
        const match = old.bingos.find(ob=>ob.text===b.text);
        if(match) b.checked = match.checked;
      });
    }
  }

  if(editingId){
    const idx = bets.findIndex(b=>b.id===editingId);
    if(idx>-1){
      bets[idx]={...bets[idx], casa, data, desc, odd, valor, retorno, bingos, betType:selectedBetType, resolucao};
      saveOneBet(bets[idx]);
    }
    showToast('✅ Aposta atualizada!');
  } else {
    const newBet = {
      id:genId(), casa, data, desc, odd, valor, retorno, bingos,
      status:'pendente', betType:selectedBetType, resolucao,
      createdAt: Date.now()
    };
    saveOneBet(newBet);
    showToast('🎯 Aposta adicionada!');
  }
  closeModal();
}

/* ── CASHOUT ── */
let cashoutBetId = null;

function openCashout(id){
  cashoutBetId = id;
  const bet = bets.find(b=>b.id===id);
  if(!bet) return;
  const odd = parseFloat(bet.odd)||0;
  const valor = parseFloat(bet.valor)||0;
  const retornoMax = parseFloat(bet.retorno)||(odd*valor)||0;
  document.getElementById('cashout-bet-info').innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px;line-height:1.4">${escHtml(bet.desc||'Sem descrição')}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
      <div style="text-align:center;">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-family:'Space Mono',monospace;margin-bottom:4px">Apostado</div>
        <div style="font-family:'Anton',sans-serif;font-size:15px;color:var(--text)">${fmtMoney(valor)}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-family:'Space Mono',monospace;margin-bottom:4px">Odd</div>
        <div style="font-family:'Anton',sans-serif;font-size:15px;color:var(--gold)">${odd?odd.toFixed(2):'—'}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-family:'Space Mono',monospace;margin-bottom:4px">Retorno Max</div>
        <div style="font-family:'Anton',sans-serif;font-size:15px;color:var(--green)">${fmtMoney(retornoMax)}</div>
      </div>
    </div>`;
  document.getElementById('f-cashout-val').value = '';
  document.getElementById('cashout-preview').innerHTML = '';
  document.getElementById('cashout-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('f-cashout-val').focus(), 100);
}

function closeCashout(){
  document.getElementById('cashout-overlay').classList.remove('open');
  cashoutBetId = null;
}

function handleCashoutOverlay(e){
  if(e.target===document.getElementById('cashout-overlay')) closeCashout();
}

function updateCashoutPreview(){
  const bet = bets.find(b=>b.id===cashoutBetId);
  if(!bet) return;
  const valor = parseFloat(bet.valor)||0;
  const cashoutVal = parseFloat(document.getElementById('f-cashout-val').value);
  const preview = document.getElementById('cashout-preview');
  if(isNaN(cashoutVal)){ preview.innerHTML=''; return; }
  const resultado = cashoutVal - valor;
  const resStr = (resultado>=0?'+':'')+resultado.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace('R$ ','R$ ');
  const cls = resultado>0?'profit':resultado<0?'loss':'neutral';
  const icon = resultado>0?'↑':resultado<0?'↓':'→';
  const emoji = resultado>0?'💚':resultado<0?'🔴':'⚪';
  preview.innerHTML = `
    <div class="cashout-preview ${cls}">
      <div>
        <div class="cashout-preview-label">Resultado da operação</div>
        <div class="cashout-preview-val">${icon} ${resStr}</div>
      </div>
      <div style="font-size:26px;">${emoji}</div>
    </div>`;
}

function confirmCashout(){
  const bet = bets.find(b=>b.id===cashoutBetId);
  if(!bet) return;
  const cashoutVal = parseFloat(document.getElementById('f-cashout-val').value);
  if(isNaN(cashoutVal) || cashoutVal < 0){ showToast('⚠️ Informe o valor do cashout'); return; }
  bet.status = 'cashout';
  bet.cashoutValue = cashoutVal;
  _suppressRenderUntil = 0;
  renderAll();
  saveOneBet(bet);
  closeCashout();
  const resultado = cashoutVal - (parseFloat(bet.valor)||0);
  showToast(resultado >= 0 ? '💰 Cashout com lucro!' : '💰 Cashout realizado');
}

/* ── DELETE ── */
function askDelete(id){
  deletingId=id;
  deletingType='bet';
  document.getElementById('confirm-icon').textContent = '🗑️';
  document.getElementById('confirm-title').textContent = 'Excluir?';
  document.getElementById('confirm-msg').textContent = 'Esta ação não pode ser desfeita. A aposta será removida permanentemente.';
  document.getElementById('confirm-ok-btn').textContent = 'Excluir';
  document.getElementById('confirm-modal').classList.add('open');
}
function closeConfirm(){ document.getElementById('confirm-modal').classList.remove('open'); deletingId=null; }
function executeDelete(){
  if(!deletingId) return;
  if(deletingType==='alavancagem-delete'){
    deleteAlavancagemSeq(deletingId);
  } else if(deletingType==='alavancagem-undo'){
    undoLastStep();
  } else if(deletingType==='saque'){
    deleteSaqueEntry(deletingId);
  } else {
    deleteOneBet(deletingId);
    showToast('🗑️ Aposta removida');
  }
  closeConfirm();
}

/* ── AUTO CALC RETORNO ── */
document.addEventListener('DOMContentLoaded',()=>{
  const odd = document.getElementById('f-odd');
  const valor = document.getElementById('f-valor');
  const ret = document.getElementById('f-retorno');
  function calc(){ if(odd.value&&valor.value) ret.value=(parseFloat(odd.value)*parseFloat(valor.value)).toFixed(2); }
  odd.addEventListener('input',calc);
  valor.addEventListener('input',calc);
});

/* ── TOAST ── */
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),2400);
}

/* ── DRAG-TO-REORDER ── */
(function(){
  let startY = 0;
  let moved = false;

  document.addEventListener('touchstart', e=>{
    const card = e.target.closest('.bet-card');
    if(!card || e.target.closest('button, .bingo-item, .bet-card-header')) return;
    moved = false;
    startY = e.touches[0].clientY;
    _pressTimer = setTimeout(()=>{
      if(!moved) _startDrag(card, e.touches[0]);
    }, 480);
  }, {passive:true});

  document.addEventListener('touchmove', e=>{
    if(Math.abs(e.touches[0].clientY - startY) > 8) moved = true;
    if(!_drag){ if(moved){ clearTimeout(_pressTimer); _pressTimer=null; } return; }
    e.preventDefault();
    _moveDrag(e.touches[0]);
  }, {passive:false});

  document.addEventListener('touchend', ()=>{
    clearTimeout(_pressTimer); _pressTimer = null;
    if(_drag) _endDrag();
  });
})();

function _startDrag(card, touch){
  if(navigator.vibrate) navigator.vibrate(35);
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:600;pointer-events:none;opacity:0.88;transform:scale(1.03) rotate(0.6deg);box-shadow:0 24px 64px rgba(0,0,0,0.6);transition:none;overflow:hidden;`;
  document.body.appendChild(ghost);
  card.classList.add('card-dragging');
  _drag = { card, ghost, startTouchY: touch.clientY, startCardTop: rect.top, height: rect.height };
}

function _moveDrag(touch){
  if(!_drag) return;
  const { card, ghost, startTouchY, startCardTop, height } = _drag;
  const dy = touch.clientY - startTouchY;
  ghost.style.top = (startCardTop + dy) + 'px';
  const ghostCenter = touch.clientY;

  const parent = card.parentElement;
  const prev = card.previousElementSibling;
  if(prev && prev.classList.contains('bet-card')){
    const pr = prev.getBoundingClientRect();
    if(ghostCenter < pr.top + pr.height/2) parent.insertBefore(card, prev);
  }
  const next = card.nextElementSibling;
  if(next && next.classList.contains('bet-card')){
    const nr = next.getBoundingClientRect();
    if(ghostCenter > nr.top + nr.height/2) parent.insertBefore(next, card);
  }
}

function _endDrag(){
  const { card, ghost } = _drag;
  _drag = null;
  ghost.remove();
  card.classList.remove('card-dragging');
  const parent = card.parentElement;
  if(!parent) return;
  const newIds = [...parent.querySelectorAll('.bet-card')].map(c=>c.id.replace('card-',''));
  updateOrderAfterDrag(newIds);
  showToast('↕ Ordem salva');
}

/* ── INIT ── */
renderAll();
renderAlavancagem();
_customOrder = loadBetOrder();
