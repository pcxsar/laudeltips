let bets = [];
let editingId = null;
let deletingId = null;
let bingoCount = 0;
let selectedBetType = 'normal';
let selectedCasa = '';
let currentProfile = 'laudel';

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
function switchProfile(profile){
  if(profile === currentProfile) return;
  currentProfile = profile;
  ['laudel','paulo','hammel'].forEach(p => {
    const btn = document.getElementById('pbtn-'+p);
    btn.className = 'profile-btn' + (p === profile ? ' active-'+p : '');
  });
  bets = [];
  renderAll();
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
    <button class="btn-action btn-won" onclick="markBet('${bet.id}','ganhou')">🏆 Ganhou</button>
    <button class="btn-action btn-lost" onclick="markBet('${bet.id}','perdeu')">💀 Perdeu</button>
    <button class="btn-action btn-cashout" onclick="openCashout('${bet.id}')">💰</button>
    <button class="btn-action btn-edit" onclick="editBet('${bet.id}')">✏️</button>
    <button class="btn-action btn-delete" onclick="askDelete('${bet.id}')">🗑</button>` : `
    <button class="btn-action btn-edit" onclick="editBet('${bet.id}')">✏️ Editar</button>
    <button class="btn-action" onclick="markBet('${bet.id}','pendente')">↩ Reabrir</button>
    <button class="btn-action btn-delete" onclick="askDelete('${bet.id}')">🗑</button>`;

  const delay = Math.min((index||0) * 0.055, 0.35);
  return `<div class="${cardClass}" id="card-${bet.id}" style="animation-delay:${delay}s">
    <div class="bet-card-header">
      <div class="bet-meta">
        ${casaBadge(bet.casa,'bet-house')}
        <span class="bet-date">${fmtDate(bet.data)}</span>
        ${lt ? '<span class="longt-badge">Longo Prazo</span>' : ''}
      </div>
      ${statusLabel(status, lt)}
    </div>
    <div class="bet-card-body">
      ${longtHtml}
      <div class="bet-desc">${escHtml(bet.desc||'Sem descrição')}</div>
      ${bingosHtml}
      <div class="bet-financials">
        <div class="fin-box">
          <div class="fin-label">Odd</div>
          <div class="fin-val gold">${odd?odd.toFixed(2):'—'}</div>
        </div>
        <div class="fin-box">
          <div class="fin-label">Apostado</div>
          <div class="fin-val">${fmtMoney(valor)}</div>
        </div>
        <div class="fin-box">
          <div class="fin-label">${status==='cashout'?'Cashout':'Retorno'}</div>
          <div class="fin-val ${status==='cashout'?(cashoutValue>=valor?'green':'red'):'green'}">${status==='cashout'?fmtMoney(cashoutValue):fmtMoney(retorno)}</div>
        </div>
      </div>
    </div>
    <div class="bet-card-footer">${footerBtns}</div>
  </div>`;
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderAll(){
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
    const filtered = bets.filter(filters[tab]);
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
  const total = bets.length;
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

  const lucroEl = document.getElementById('h-lucro');
  lucroEl.textContent = (saldo>=0?'+':'')+saldo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace('R$ ','R$ ');
  lucroEl.className = 'hstat-val' + (saldo>0?' positive':saldo<0?' negative':'');

  document.getElementById('h-total-bets').textContent = total;
  document.getElementById('s-pendentes').textContent = pendentes;
  document.getElementById('s-longterm').textContent = longtermPending;
  document.getElementById('s-ganhas').textContent = ganhas;
  document.getElementById('s-perdidas').textContent = perdidas;
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

  let bodyHtml = `<div class="sd-section-title">Apostas Finalizadas</div>`;

  if(!finalizadas.length){
    bodyHtml += `<div class="sd-empty"><div class="sd-empty-icon">📋</div>Nenhuma aposta finalizada ainda</div>`;
  } else {
    const ordered = [...finalizadas].reverse();
    let running = 0;
    const runningMap = {};
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
    });

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

/* ── BINGO ── */
function toggleBingo(id,idx){
  const bet = bets.find(b=>b.id===id);
  if(!bet||!bet.bingos) return;
  bet.bingos[idx].checked = !bet.bingos[idx].checked;
  saveOneBet(bet);
  showToast(bet.bingos[idx].checked ? '✅ Evento marcado!' : '↩ Evento desmarcado');
}

/* ── STATUS ── */
function markBet(id, status){
  const bet = bets.find(b=>b.id===id);
  if(!bet) return;
  bet.status = status;
  if(status==='pendente') bet.cashoutValue = null;
  saveOneBet(bet);
  if(status==='ganhou') showToast('🏆 Aposta marcada como ganha!');
  else if(status==='perdeu') showToast('💀 Aposta marcada como perdida');
  else showToast('↩ Aposta reaberta');
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
  document.getElementById('f-casa').focus();
}
function editBet(id){ openModal(id); }
function closeModal(){
  document.getElementById('modal-overlay').classList.remove('open');
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
  saveOneBet(bet);
  closeCashout();
  const resultado = cashoutVal - (parseFloat(bet.valor)||0);
  showToast(resultado >= 0 ? '💰 Cashout com lucro!' : '💰 Cashout realizado');
}

/* ── DELETE ── */
function askDelete(id){ deletingId=id; document.getElementById('confirm-modal').classList.add('open'); }
function closeConfirm(){ document.getElementById('confirm-modal').classList.remove('open'); deletingId=null; }
function executeDelete(){
  if(!deletingId) return;
  deleteOneBet(deletingId);
  closeConfirm();
  showToast('🗑️ Aposta removida');
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

/* ── INIT ── */
renderAll();
