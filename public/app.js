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

const app = document.getElementById('app');
const toast = document.getElementById('toast');
const UNIT_DEFS = {
  carrier:{ id:'carrier', name:'Porte-avion', size:4, qty:1, domain:'sea', icon:'🚢' },
  warship:{ id:'warship', name:'Bateau militaire', size:3, qty:2, domain:'sea', icon:'⛴️' },
  tank:{ id:'tank', name:'Tank', size:2, qty:2, domain:'land', icon:'🛡️' },
  soldier:{ id:'soldier', name:'Militaire', size:1, qty:2, domain:'land', icon:'🪖' }
};

socket.on('state', s => { state = s; currentCode = s.code; if(s.status === 'lobby') view='lobby'; if(s.status==='placement') view='placement'; if(s.status==='combat') view='combat'; if(s.status==='ended') view='ended'; render(); });
socket.on('errorMessage', showToast);

function showToast(msg){ toast.textContent = msg; toast.style.display = 'block'; setTimeout(()=>toast.style.display='none', 3000); }
function emit(name, data){ socket.emit(name, data); }
function countdown(){ if(!state?.timerEndsAt) return ''; const left = Math.max(0, Math.ceil((state.timerEndsAt - Date.now())/1000)); return `00:${String(left).padStart(2,'0')}`; }
function startTicker(){ clearInterval(tick); tick = setInterval(()=>{ if(state?.timerEndsAt) render(); }, 1000); }
startTicker();

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
    <section class="card hero"><div><h1>BATTLE<br>COMMAND</h1><div class="stars">★ ★ ★</div><div class="menu"><button class="green" onclick="createGame()">Créer une partie</button><button onclick="focusJoin()">Rejoindre une partie</button></div></div></section>
    <section class="forms">
      <div class="card"><h2>Créer une partie</h2><div class="field"><label>Nom du joueur</label><input id="pname" value="${esc(playerName)}"></div><div class="mapInfo">Carte : Île Forteresse — grille 10×5 avec 6 colonnes mer et 4 colonnes terre.</div><br><button class="green" onclick="createGame()">Créer la partie</button></div>
      <div class="card"><h2>Rejoindre une partie</h2><div class="field"><label>Nom du joueur</label><input id="jname" value="${esc(joinName)}"></div><div class="field"><label>Code de la partie</label><input id="jcode" placeholder="Ex : 7X4K9L" maxlength="6"></div><button onclick="joinGame()">Rejoindre</button></div>
    </section>
  </div>`;
}
function focusJoin(){ document.getElementById('jcode')?.focus(); }
function createGame(){ playerName = document.getElementById('pname')?.value || playerName; localStorage.setItem('bc-name', playerName); emit('createGame', { name: playerName }); }
function joinGame(){ joinName = document.getElementById('jname')?.value || joinName; localStorage.setItem('bc-join-name', joinName); const gameCode = document.getElementById('jcode')?.value; emit('joinGame', { gameCode, name: joinName }); }
window.createGame=createGame; window.joinGame=joinGame; window.focusJoin=focusJoin;

function renderLobby(){
  const p1 = state.players.find(p=>p.slot===1), p2 = state.players.find(p=>p.slot===2);
  app.innerHTML = `<div class="lobby">
    <div class="topbar"><h1>Battle Command</h1><div class="pill">Code : <b class="code">${state.code}</b></div></div>
    <div class="card versus"><div class="playerbox"><div>⚓</div><h2>${esc(p1?.name||'En attente')}</h2>${renameInput(p1)}</div><h1>VS</h1><div class="playerbox red"><div>🛡️</div><h2>${esc(p2?.name||'En attente')}</h2>${renameInput(p2)}</div></div>
    <div class="card"><h2>Règles de la partie</h2><p>Chaque joueur place exactement : 1 porte-avion de 4 cases, 2 bateaux militaires de 3 cases, 2 tanks de 2 cases et 2 militaires de 1 case.</p><p>La carte est identique pour les deux joueurs : 6×5 mer à gauche, 4×5 terre à droite. Les bateaux vont uniquement dans l’eau, les tanks et militaires uniquement sur terre.</p><div class="row"><button class="green" onclick="startPlacement()" ${state.players.length<2?'disabled':''}>Démarrer la partie</button><button class="ghost" onclick="location.reload()">Retour menu</button></div></div>
  </div>`;
}
function renameInput(p){ if(!p || p.id !== state.me) return '<span class="pill">Prêt</span>'; return `<div class="row"><input id="rename" value="${esc(p.name)}"><button onclick="renameMe()">Renommer</button></div>`; }
function renameMe(){ const name=document.getElementById('rename').value; emit('rename',{gameCode:currentCode,name}); }
function startPlacement(){ emit('startPlacement',{gameCode:currentCode}); placements=[]; }
window.renameMe=renameMe; window.startPlacement=startPlacement;

function renderPlacement(){
  app.innerHTML = `<div class="placement">
    <div class="topbar"><h1>Placement des unités</h1><div class="timer">${countdown()}</div></div>
    <div class="layout">
      <aside class="card side"><h3>Vos unités</h3>${unitPicker()}<button onclick="rotateUnit()">Pivoter (${orientation==='h'?'horizontal':'vertical'})</button><br><br><button class="ghost" onclick="resetPlacement()">Réinitialiser</button><br><br><button class="green" onclick="submitPlacement()">Valider</button></aside>
      <main class="card boardWrap"><div class="boardTitle">Votre carte — mer 6×5 / terre 4×5</div>${boardHtml(state.myBoard,{mode:'place'})}<p class="status">Cliquez une unité à gauche, puis une case. Re-cliquez une unité posée pour l’enlever.</p></main>
      <aside class="card help"><h3>Comment placer ?</h3><p>🚢 Les bateaux ne peuvent être posés que dans les 6 colonnes d’eau.</p><p>🛡️ Les tanks et 🪖 militaires ne peuvent être posés que dans les 4 colonnes de terre.</p><p>Les deux joueurs ont exactement la même carte. Si le timer arrive à zéro, un placement automatique est généré.</p></aside>
    </div>
  </div>`;
}
function unitPicker(){ return Object.values(UNIT_DEFS).map(u=>`<div class="unitCard ${selectedType===u.id?'active':''}" onclick="selectUnit('${u.id}')"><div class="unitIcon">${u.icon}</div><b>${u.name}</b><span>${placedCount(u.id)} / ${u.qty} placé(s)</span><small>${u.size} case(s)</small></div>`).join(''); }
function placedCount(type){ return placements.filter(p=>p.type===type).length; }
function selectUnit(t){ selectedType=t; render(); }
function rotateUnit(){ orientation = orientation === 'h' ? 'v' : 'h'; render(); }
function resetPlacement(){ placements=[]; render(); }
window.selectUnit=selectUnit; window.rotateUnit=rotateUnit; window.resetPlacement=resetPlacement;

function canPlace(type,r,c,o=orientation, ignoreIndex=-1){
  const u=UNIT_DEFS[type], cells=[];
  for(let i=0;i<u.size;i++){ const rr=r+(o==='v'?i:0), cc=c+(o==='h'?i:0); if(rr<0||rr>=5||cc<0||cc>=10) return null; const terrain=cc<6?'sea':'land'; if(terrain!==u.domain) return null; cells.push(`${rr}-${cc}`); }
  const used=new Set(); placements.forEach((p,idx)=>{ if(idx===ignoreIndex) return; const uu=UNIT_DEFS[p.type]; for(let i=0;i<uu.size;i++) used.add(`${p.r+(p.orientation==='v'?i:0)}-${p.c+(p.orientation==='h'?i:0)}`); });
  if(cells.some(k=>used.has(k))) return null; return cells;
}
function placeAt(r,c){
  const existing = placements.findIndex(p => canPlace(p.type,p.r,p.c,p.orientation,placements.indexOf(p))?.includes(`${r}-${c}`));
  if(existing>=0){ placements.splice(existing,1); render(); return; }
  const u=UNIT_DEFS[selectedType]; if(placedCount(selectedType)>=u.qty) return showToast(`Tous les ${u.name} sont déjà placés.`);
  if(!canPlace(selectedType,r,c)) return showToast(u.domain==='sea'?'Ce bateau doit rester entièrement dans l’eau.':'Cette unité doit rester entièrement sur la terre.');
  placements.push({type:selectedType,r,c,orientation}); render();
}
function submitPlacement(){ const total=Object.values(UNIT_DEFS).reduce((s,u)=>s+u.qty,0); if(placements.length!==total) return showToast('Place toutes les unités avant de valider.'); emit('submitPlacement',{gameCode:currentCode,placements}); }
window.placeAt=placeAt; window.submitPlacement=submitPlacement;

function renderCombat(){
  const me = state.players.find(p=>p.id===state.me); const turnPlayer = state.players.find(p=>p.id===state.turn); const myTurn = state.turn===state.me;
  app.innerHTML = `<div class="combat">
    <div class="topbar"><h1>Partie : ${state.code}</h1><div class="pill">Tour de : <b>${esc(turnPlayer?.name||'')}</b></div></div>
    <div class="layout">
      <aside class="card side"><h3>Votre grille</h3>${miniBoard(state.myBoard)}<div class="legend"><span>● Tir manqué</span><span>✕ Touché</span><span>Case visible = unité touchée</span></div></aside>
      <main class="card boardWrap"><div class="boardTitle">${myTurn?'Choisissez une case à bombarder':'En attente du tir adverse'}</div>${enemyBoardHtml()}<div class="row" style="justify-content:center;margin-top:14px"><button class="red" onclick="fire()" ${!myTurn||!selectedShot?'disabled':''}>Lancer la bombe</button></div></main>
      <aside class="card"><h3>Journal de bord</h3><div class="log">${[...state.myShots].reverse().map((s,i)=>`<div>Tour ${state.myShots.length-i} : ${coord(s.r,s.c)} — ${s.destroyed?'💥 Détruit : '+s.destroyed:s.hit?'🎯 Touché':'⚪ Manqué'}</div>`).join('') || '<p>Aucun tir pour le moment.</p>'}</div></aside>
    </div>
  </div>`;
}
function enemyBoardHtml(){ return `<div class="board">${state.enemyKnown.flat().map(cell=>`<div class="cell ${cell.terrain} ${cell.hit?(cell.knownUnit?'hit':'miss'):'fog'}" onclick="selectShot(${cell.r},${cell.c})">${selectedShot&&selectedShot.r===cell.r&&selectedShot.c===cell.c?'⌖':''}</div>`).join('')}</div>`; }
function selectShot(r,c){ if(state.turn!==state.me) return; if(state.enemyKnown[r][c].hit) return showToast('Case déjà bombardée.'); selectedShot={r,c}; render(); }
function fire(){ if(selectedShot) emit('fire',{gameCode:currentCode,...selectedShot}); selectedShot=null; }
window.selectShot=selectShot; window.fire=fire;

function renderEnded(){
  const winner = state.players.find(p=>p.id===state.winner);
  app.innerHTML = `<div class="victory card"><div><h1>${state.winner===state.me?'VICTOIRE !':'DÉFAITE'}</h1><h2>${esc(winner?.name||'Un joueur')} a remporté la partie.</h2><div class="row" style="justify-content:center"><button class="green" onclick="location.reload()">Rejouer</button><button class="ghost" onclick="location.reload()">Retour menu</button></div></div></div>`;
}

function boardHtml(board,{mode}){
  const placedMap = placementMap();
  return `<div class="board">${board.flat().map(cell=>{ const k=`${cell.r}-${cell.c}`; const p=placedMap[k]; return `<div class="cell ${cell.terrain}" onclick="${mode==='place'?`placeAt(${cell.r},${cell.c})`:''}">${p?`<div class="unitPlaced">${UNIT_DEFS[p.type].icon}</div>`:''}</div>`; }).join('')}</div>`;
}
function placementMap(){ const map={}; placements.forEach(p=>{ const u=UNIT_DEFS[p.type]; for(let i=0;i<u.size;i++){ const r=p.r+(p.orientation==='v'?i:0), c=p.c+(p.orientation==='h'?i:0); map[`${r}-${c}`]=p; } }); return map; }
function miniBoard(board){ return `<div class="miniBoard">${board.flat().map(c=>`<div class="${c.terrain}" style="background:${c.terrain==='sea'?'#0b5574':'#50642e'}">${c.hit?(c.unitId?'✕':'•'):c.unitId?'□':''}</div>`).join('')}</div>`; }
function coord(r,c){ return 'ABCDE'[r]+(c+1); }
function esc(s){ return String(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

render();
