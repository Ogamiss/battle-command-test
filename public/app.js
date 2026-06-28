const socket = io();
let state = null;
let view = 'home';
let currentCode = '';
let playerName = localStorage.getItem('bc-name') || 'Commandant Alpha';
let joinName = localStorage.getItem('bc-join-name') || 'Stratège Bravo';
let placements = [];
let selectedType = 'carrier';
let orientation = 'v';
let selectedShot = null;
let tick = null;
let lastAnimationId = null;
let pendingFx = null;
let previewCells = [];

const app = document.getElementById('app');
const toast = document.getElementById('toast');
const UNIT_DEFS = {
  carrier:{ id:'carrier', name:'Porte-avion', short:'Porte-avion', size:4, qty:1, domain:'sea', icon:'🚢' },
  warship:{ id:'warship', name:'Bateau militaire', short:'Bateau', size:3, qty:2, domain:'sea', icon:'⛴️' },
  tank:{ id:'tank', name:'Tank', short:'Tank', size:2, qty:2, domain:'land', icon:'🛡️' },
  soldier:{ id:'soldier', name:'Militaire', short:'Soldat', size:1, qty:2, domain:'land', icon:'🪖' }
};
const UNIT_ORDER = ['carrier','warship','tank','soldier'];

socket.on('state', s => {
  state = s;
  currentCode = s.code;
  if(s.status === 'lobby') view='lobby';
  if(s.status==='placement') view='placement';
  if(s.status==='combat') view='combat';
  if(s.status==='ended') view='ended';
  if (s.lastEvent && s.lastEvent.id !== lastAnimationId) {
    lastAnimationId = s.lastEvent.id;
    pendingFx = s.lastEvent;
  }
  render();
  if (pendingFx) setTimeout(() => playShotFx(pendingFx), 80);
  if (s.status === 'combat') playSound(s.turn === s.me ? 'yourTurn' : null);
  if (s.lastEvent) playSound(s.lastEvent.hit ? (s.lastEvent.destroyed ? 'sink' : 'hit') : 'miss');
});
socket.on('errorMessage', showToast);

function showToast(msg){
  toast.textContent = msg;
  toast.style.display = 'block';
  toast.style.animation = 'none';
  void toast.offsetWidth;
  toast.style.animation = 'toastIn 0.3s ease';
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
function emit(name, data){ socket.emit(name, data); }
function countdown(){
  if(!state?.timerEndsAt) return '';
  const left = Math.max(0, Math.ceil((state.timerEndsAt - Date.now())/1000));
  const m = String(Math.floor(left / 60)).padStart(2,'0');
  const s = String(left % 60).padStart(2,'0');
  return `${m}:${s}`;
}
function isTimerWarning(){
  if(!state?.timerEndsAt) return false;
  return Math.max(0, Math.ceil((state.timerEndsAt - Date.now())/1000)) <= 10;
}
function startTicker(){ clearInterval(tick); tick = setInterval(()=>{ if(state?.timerEndsAt) render(); }, 1000); }
startTicker();

// ========== SOUND FX ==========
let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playSound(type){
  if(!type) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.08;
    const now = ctx.currentTime;
    switch(type){
      case 'hit':
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case 'miss':
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now); osc.stop(now + 0.25);
        break;
      case 'sink':
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.start(now); osc.stop(now + 0.7);
        break;
      case 'yourTurn':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.setValueAtTime(700, now + 0.1);
        osc.frequency.setValueAtTime(900, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now); osc.stop(now + 0.35);
        break;
      case 'place':
        osc.frequency.setValueAtTime(440, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now); osc.stop(now + 0.08);
        break;
      case 'remove':
        osc.frequency.setValueAtTime(220, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now); osc.stop(now + 0.08);
        break;
      case 'victory':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.15);
        osc.frequency.setValueAtTime(784, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now); osc.stop(now + 0.6);
        break;
    }
  } catch(e) { /* silent */ }
}

// ========== KEYBOARD ==========
document.addEventListener('keydown', e => {
  if(view === 'placement'){
    if(e.key >= '1' && e.key <= '5'){
      const idx = parseInt(e.key) - 1;
      if(idx < UNIT_ORDER.length){ selectUnit(UNIT_ORDER[idx]); e.preventDefault(); }
    }
    if(e.key === 'r' || e.key === 'R'){ rotateUnit(); e.preventDefault(); }
    if(e.key === 'Enter'){ submitPlacement(); e.preventDefault(); }
    if(e.key === 'Escape'){ resetPlacement(); e.preventDefault(); }
  }
  if(view === 'combat'){
    if(e.key === 'Enter' && state?.turn === state?.me && selectedShot){ fire(); e.preventDefault(); }
    if(e.key === 'Escape'){ selectedShot = null; render(); e.preventDefault(); }
  }
});

function render(){
  app.className = 'app';
  if(view==='home') return renderHome();
  if(view==='lobby') return renderLobby();
  if(view==='placement') return renderPlacement();
  if(view==='combat') return renderCombat();
  if(view==='ended') return renderEnded();
}

function renderHome(){
  app.innerHTML = `<div class="home">
    <section class="card hero"><div class="radar"></div><div class="heroContent"><div class="badge">Jeu tactique multijoueur</div><h1>BATTLE<br>COMMAND</h1><div class="credit">Créé par Les Grellet’s</div><p>Mer, terre, tanks et bombardements à distance.</p><div class="stars">★ ★ ★</div><div class="menu"><button class="green" onclick="createGame()">Créer une partie</button><button onclick="focusJoin()">Rejoindre une partie</button></div></div></section>
    <section class="forms">
      <div class="card"><h2>Créer une partie</h2><div class="field"><label>Nom du joueur</label><input id="pname" value="${esc(playerName)}"></div><div class="mapInfo" style="color:#8aadc7;font-size:13px;padding:8px 0">Carte : Île Forteresse — 10×5, avec 6 colonnes mer et 4 colonnes terre.</div><button class="green" onclick="createGame()">Créer la partie</button></div>
      <div class="card"><h2>Rejoindre une partie</h2><div class="field"><label>Nom du joueur</label><input id="jname" value="${esc(joinName)}"></div><div class="field"><label>Code de la partie</label><input id="jcode" placeholder="Ex : 7X4K9L" maxlength="6" autocomplete="off"></div><button onclick="joinGame()">Rejoindre</button></div>
    </section>
  </div>`;
  setTimeout(() => document.getElementById('pname')?.focus(), 100);
}
function focusJoin(){ document.getElementById('jcode')?.focus(); }
function createGame(){ playerName = document.getElementById('pname')?.value || playerName; localStorage.setItem('bc-name', playerName); emit('createGame', { name: playerName }); }
function joinGame(){ joinName = document.getElementById('jname')?.value || joinName; localStorage.setItem('bc-join-name', joinName); const gameCode = document.getElementById('jcode')?.value; emit('joinGame', { gameCode, name: joinName }); }
window.createGame=createGame; window.joinGame=joinGame; window.focusJoin=focusJoin;

function renderLobby(){
  const p1 = state.players.find(p=>p.slot===1), p2 = state.players.find(p=>p.slot===2);
  app.innerHTML = `<div class="lobby">
    <div class="topbar"><h1>Battle Command</h1><div class="pill">Code : <b class="code">${state.code}</b></div></div>
    <div class="card versus"><div class="playerbox"><div class="avatar">⚓</div><h2>${esc(p1?.name||'En attente')}</h2>${renameInput(p1)}</div><h1 style="font-size:36px;opacity:0.3">VS</h1><div class="playerbox red"><div class="avatar">🛡️</div><h2>${esc(p2?.name||'En attente')}</h2>${renameInput(p2)}</div></div>
    <div class="card"><h2>Règles de la partie</h2><p>Chaque joueur place : 1 porte-avion (4 cases), 2 bateaux militaires (3 cases), 2 tanks (2 cases) et 2 militaires (1 case).</p><p>La carte : mer à gauche (6 colonnes), terre à droite (4 colonnes). Les bateaux vont dans l'eau ; tanks et soldats sur la terre.</p><div class="row"><button class="green" onclick="startPlacement()" ${state.players.length<2?'disabled':''}>Démarrer la partie</button><button class="ghost" onclick="location.reload()">Retour menu</button></div></div>
  </div>`;
}
function renameInput(p){ if(!p || p.id !== state.me) return '<span class="pill">Prêt</span>'; return `<div class="row"><input id="rename" value="${esc(p.name)}" style="flex:1;min-width:120px"><button onclick="renameMe()">Renommer</button></div>`; }
function renameMe(){ const name=document.getElementById('rename').value; emit('rename',{gameCode:currentCode,name}); }
function startPlacement(){ emit('startPlacement',{gameCode:currentCode}); placements=[]; }
window.renameMe=renameMe; window.startPlacement=startPlacement;

function renderPlacement(){
  const warn = isTimerWarning();
  app.innerHTML = `<div class="placement">
    <div class="topbar"><h1>Placement des unités</h1><div class="timer ${warn?'warning':''}">${countdown()}</div></div>
    <div class="layout">
      <aside class="card side"><h3>Vos unités</h3>${unitPicker()}<button onclick="rotateUnit()" style="margin-top:8px;width:100%">Pivoter : ${orientation==='h'?'Horizontal':'Vertical'} <span class="kbd">R</span></button><br><br><button class="ghost" onclick="resetPlacement()" style="width:100%">Réinitialiser <span class="kbd">Esc</span></button><br><br><button class="green" onclick="submitPlacement()" style="width:100%">Valider <span class="kbd">↵</span></button><div class="shortcut-hint">Touches <span class="kbd">1</span>–<span class="kbd">5</span> unités · <span class="kbd">R</span> pivoter · <span class="kbd">↵</span> valider</div></aside>
      <main class="card boardWrap"><div class="boardTitle"><span>Votre carte</span><small>Mer 6×5 / Terre 4×5</small></div>${boardHtml(state.myBoard,{mode:'place'})}<p class="status">Cliquez une unité à gauche, puis une case. Re-cliquez une unité posée pour l'enlever.</p></main>
      <aside class="card help"><h3>Contrôle de zone</h3><p>🚢 Les bateaux ne peuvent être posés que dans l'eau.</p><p>🛡️ Les tanks et 🪖 militaires ne peuvent être posés que sur la terre.</p><p>Le décor est le même pour les deux joueurs, mais chacun ne voit que ses propres unités.</p></aside>
    </div>
  </div>`;
}
function unitPicker(){
  return UNIT_ORDER.map((id,idx)=>{
    const u=UNIT_DEFS[id];
    return `<div class="unitCard ${selectedType===u.id?'active':''}" onclick="selectUnit('${u.id}')"><div class="unitIcon">${u.icon}</div><b>${u.name} <span class="kbd">${idx+1}</span></b><span>${placedCount(u.id)} / ${u.qty} placé(s)</span><small>${u.size} case(s) · ${u.domain==='sea'?'eau':'terre'}</small></div>`;
  }).join('');
}
function placedCount(type){ return placements.filter(p=>p.type===type).length; }
function selectUnit(t){ selectedType=t; clearPreview(); render(); }
function rotateUnit(){ orientation = orientation === 'h' ? 'v' : 'h'; clearPreview(); render(); }
function resetPlacement(){ placements=[]; clearPreview(); render(); }
window.selectUnit=selectUnit; window.rotateUnit=rotateUnit; window.resetPlacement=resetPlacement;

function canPlace(type,r,c,o=orientation, ignoreIndex=-1){
  const u=UNIT_DEFS[type], cells=[];
  for(let i=0;i<u.size;i++){ const rr=r+(o==='v'?i:0), cc=c+(o==='h'?i:0); if(rr<0||rr>=5||cc<0||cc>=10) return null; const terrain=cc<6?'sea':'land'; if(terrain!==u.domain) return null; cells.push(`${rr}-${cc}`); }
  const used=new Set(); placements.forEach((p,idx)=>{ if(idx===ignoreIndex) return; const uu=UNIT_DEFS[p.type]; for(let i=0;i<uu.size;i++) used.add(`${p.r+(p.orientation==='v'?i:0)}-${p.c+(p.orientation==='h'?i:0)}`); });
  if(cells.some(k=>used.has(k))) return null; return cells;
}
function placeAt(r,c){
  const existing = placements.findIndex((p,idx) => canPlace(p.type,p.r,p.c,p.orientation,idx)?.includes(`${r}-${c}`));
  if(existing>=0){ placements.splice(existing,1); playSound('remove'); clearPreview(); render(); return; }
  const u=UNIT_DEFS[selectedType]; if(placedCount(selectedType)>=u.qty) return showToast(`Tous les ${u.name} sont déjà placés.`);
  if(!canPlace(selectedType,r,c)) return showToast(u.domain==='sea'?'Ce bateau doit rester entièrement dans l\u2019eau.':'Cette unité doit rester entièrement sur la terre.');
  placements.push({type:selectedType,r,c,orientation}); playSound('place'); clearPreview(); render();
}
function submitPlacement(){ const total=Object.values(UNIT_DEFS).reduce((s,u)=>s+u.qty,0); if(placements.length!==total) return showToast('Place toutes les unités avant de valider.'); emit('submitPlacement',{gameCode:currentCode,placements}); }
function clearPreview(){ previewCells = []; render(); }
window.placeAt=placeAt; window.submitPlacement=submitPlacement;

function renderCombat(){
  const turnPlayer = state.players.find(p=>p.id===state.turn); const myTurn = state.turn===state.me;
  const last = state.lastEvent ? resultLine(state.lastEvent) : 'Aucun bombardement pour le moment.';
  const allDestroyed = state.myShots.filter(s => s.destroyed).length;
  app.innerHTML = `<div class="combat ${myTurn?'your-turn':''}">
    <div class="topbar"><h1>Partie : ${state.code}</h1><div class="pill" style="${myTurn?'border-color:#2a9d6e;color:#7fdbff':''}">Tour de : <b>${esc(turnPlayer?.name||'')}</b></div></div>
    <div class="battleGrid">
      <aside class="card side"><h3>Votre base</h3>${miniBoard(state.myBoard)}<div class="legend"><span><b class="dot water"></b> Mer</span><span><b class="dot land"></b> Terre</span><span>✕ touché</span><span>• raté</span></div><div style="margin-top:12px;font-size:13px;color:#8aadc7">Unités détruites : <b style="color:#ff8888">${allDestroyed}</b> / 7</div></aside>
      <main class="card boardWrap battleMain"><div class="boardTitle"><span>${myTurn?'🎯 Cible ennemie':'⏳ Attente du tir adverse'}</span><small>${last}</small></div>${enemyBoardHtml()}<div class="row" style="justify-content:center;margin-top:14px"><button class="red ${myTurn?'fire-ready':''}" onclick="fire()" ${!myTurn||!selectedShot?'disabled':''}>${myTurn?'Lancer la bombe':'En attente...'}</button></div>${myTurn?'<div class="shortcut-hint"><span class="kbd">↵</span> Tirer · <span class="kbd">Esc</span> Annuler</div>':''}</main>
      <aside class="card"><h3>Journal de bord</h3><div class="log">${[...state.myShots].reverse().map((s,i)=>`<div style="border-left-color:${s.hit?(s.destroyed?'#ffcc00':'#ff4444'):'#4488aa'}"><b>Tour ${state.myShots.length-i}</b> ${coord(s.r,s.c)} — ${s.destroyed?'💥 Coulé : '+esc(s.destroyed):s.hit?'🎯 Touché':'💨 Raté'}</div>`).join('') || '<p style="color:#6a8da7;font-style:italic">Aucun tir pour le moment.</p>'}</div></aside>
    </div>
  </div>`;
}
function resultLine(e){
  const who = e.role === 'attacker' ? 'Votre tir' : 'Tir adverse';
  if(e.destroyed) return `${who} en ${coord(e.r,e.c)} : COULÉ (${e.destroyed})`;
  if(e.hit) return `${who} en ${coord(e.r,e.c)} : TOUCHÉ`;
  return `${who} en ${coord(e.r,e.c)} : RATÉ`;
}
function enemyBoardHtml(){
  return `<div class="board battleBoard enemyBoard" onmouseout="clearPreview()">${state.enemyKnown.flat().map(cell=>{
    const isPreview = previewCells.some(p => p.r === cell.r && p.c === cell.c);
    const previewClass = isPreview ? (previewCells._valid ? 'valid-preview' : 'invalid-preview') : '';
    return `<div data-r="${cell.r}" data-c="${cell.c}" class="cell ${cell.terrain} ${cell.hit?(cell.knownUnit?'hit':'miss'):'fog'} ${selectedShot&&selectedShot.r===cell.r&&selectedShot.c===cell.c?'selected':''} ${previewClass}" onclick="selectShot(${cell.r},${cell.c})" onmouseenter="previewShot(${cell.r},${cell.c})"><span class="coord">${coord(cell.r,cell.c)}</span>${cell.hit?(cell.knownUnit?'🔥':'•'):''}</div>`;
  }).join('')}</div>`;
}
function previewShot(r,c){
  if(state.turn !== state.me) return;
  if(state.enemyKnown[r][c].hit) return;
  previewCells = [{r,c}];
  previewCells._valid = true;
  render();
}
function selectShot(r,c){ if(state.turn!==state.me) return; if(state.enemyKnown[r][c].hit) return showToast('Case déjà bombardée.'); selectedShot={r,c}; render(); }
function fire(){ if(selectedShot) emit('fire',{gameCode:currentCode,...selectedShot}); selectedShot=null; }
window.selectShot=selectShot; window.fire=fire;

function playShotFx(e){
  pendingFx = null;
  const board = document.querySelector(e.role === 'attacker' ? '.enemyBoard' : '.miniBoard');
  if(!board) return;
  const target = board.querySelector(`[data-r="${e.r}"][data-c="${e.c}"]`);
  if(target){
    const impact = document.createElement('div');
    impact.className = `impact ${e.destroyed?'sink':e.hit?'touch':'missed'}`;
    const symbols = { sink:'💥', touch:'✦', missed:'•' };
    impact.textContent = symbols[e.destroyed?'sink':e.hit?'touch':'missed'];
    target.appendChild(impact);
    setTimeout(()=>impact.remove(), 1100);
  }
  const overlay = document.createElement('div');
  overlay.className = `resultFx ${e.destroyed?'sunk':e.hit?'hitFx':'missFx'}`;
  overlay.innerHTML = `<div class="resultWord">${e.destroyed?'COULÉ !':e.hit?'TOUCHÉ !':'RATÉ !'}</div><div class="resultSub">${e.destroyed?esc(e.destroyed):coord(e.r,e.c)}</div>`;
  document.body.appendChild(overlay);
  setTimeout(()=>overlay.remove(), 1500);
}

function renderEnded(){
  const winner = state.players.find(p=>p.id===state.winner);
  const isVictory = state.winner===state.me;
  if(isVictory) setTimeout(() => playSound('victory'), 300);
  const stats = state.stats || [];
  const statRows = state.players.map(p => {
    const st = stats.find(x => x.id === p.id) || {shots:0,hits:0,misses:0,sunk:0};
    const winnerBadge = p.id === state.winner ? '<span class="winnerBadge">Gagnant</span>' : '';
    return `<div class="statCard ${p.id===state.winner?'winnerStat':''}"><div><h3>${esc(p.name)}</h3>${winnerBadge}</div><div class="statGrid"><span>Tirs totaux</span><b>${st.shots}</b><span>Touches</span><b>${st.hits}</b><span>Ratés</span><b>${st.misses}</b><span>Unités coulées</span><b>${st.sunk}</b></div></div>`;
  }).join('');
  app.innerHTML = `<div class="victory card"><div class="victoryInner"><h1>${isVictory?'VICTOIRE !':'DÉFAITE'}</h1><h2>Le joueur gagnant est <strong>${esc(winner?.name||'Un joueur')}</strong></h2><div class="statsPanel"><h3>Résumé de la partie</h3><div class="statsCards">${statRows}</div></div><div class="row" style="justify-content:center"><button class="green" onclick="location.reload()">Rejouer</button><button class="ghost" onclick="location.reload()">Retour menu</button></div></div></div>`;
}

function boardHtml(board,{mode}){
  const placedMap = placementMap();
  const u = UNIT_DEFS[selectedType];
  return `<div class="board placementBoard" onmouseout="clearPreview()">${board.flat().map(cell=>{
    const k=`${cell.r}-${cell.c}`;
    const p=placedMap[k];
    const isPreview = previewCells.some(pr => pr.r === cell.r && pr.c === cell.c);
    const canPlaceHere = mode === 'place' && !p && placedCount(selectedType) < u.qty && canPlace(selectedType, cell.r, cell.c);
    const previewClass = isPreview ? (previewCells._valid ? 'valid-preview' : 'invalid-preview') : '';
    return `<div class="cell ${cell.terrain} ${p?'occupied':''} ${canPlaceHere?'can-place':''} ${previewClass}" onclick="${mode==='place'?`placeAt(${cell.r},${cell.c})`:''}" onmouseenter="${mode==='place'?`previewPlace(${cell.r},${cell.c})`:''}"><span class="coord">${coord(cell.r,cell.c)}</span>${cell.c===6?'<span class="coast">▐</span>':''}${p?`<div class="unitPlaced"><span>${UNIT_DEFS[p.type].icon}</span><small>${UNIT_DEFS[p.type].short}</small></div>`:''}</div>`;
  }).join('')}</div>`;
}
function previewPlace(r,c){
  const u=UNIT_DEFS[selectedType];
  if(placedCount(selectedType) >= u.qty){ previewCells = []; return; }
  const cells = canPlace(selectedType,r,c);
  if(!cells){
    const fakeCells = [];
    for(let i=0;i<u.size;i++){ const rr=r+(orientation==='v'?i:0), cc=c+(orientation==='h'?i:0); if(rr<5&&cc<10) fakeCells.push({r:rr,c:cc}); }
    previewCells = fakeCells;
    previewCells._valid = false;
  } else {
    previewCells = cells.map(k => { const [rr,cc]=k.split('-').map(Number); return {r:rr,c:cc}; });
    previewCells._valid = true;
  }
  render();
}
function placementMap(){ const map={}; placements.forEach(p=>{ const u=UNIT_DEFS[p.type]; for(let i=0;i<u.size;i++){ const r=p.r+(p.orientation==='v'?i:0), c=p.c+(p.orientation==='h'?i:0); map[`${r}-${c}`]=p; } }); return map; }
function miniBoard(board){ return `<div class="miniBoard">${board.flat().map(c=>`<div data-r="${c.r}" data-c="${c.c}" class="miniCell ${c.terrain} ${c.hit?c.unitId?'hit':'miss':''}"><span>${c.hit?(c.unitId?'✕':'•'):c.unitId?unitIconFor(c.unitId):''}</span></div>`).join('')}</div>`; }
function unitIconFor(unitId){ const type = String(unitId).split('-')[0]; return UNIT_DEFS[type]?.icon || '□'; }
function coord(r,c){ return 'ABCDE'[r]+(c+1); }
function esc(s){ return String(s||'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

render();
