const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const games = new Map();
const ROWS = 5;
const COLS = 10;
const SEA_COLS = 6; // colonnes 0 à 5 = mer, colonnes 6 à 9 = terre
const UNITS = [
  { id: 'carrier', name: 'Porte-avion', size: 4, qty: 1, domain: 'sea', icon: '🚢' },
  { id: 'warship', name: 'Bateau militaire', size: 3, qty: 2, domain: 'sea', icon: '⛴️' },
  { id: 'tank', name: 'Tank', size: 2, qty: 2, domain: 'land', icon: '🛡️' },
  { id: 'soldier', name: 'Militaire', size: 1, qty: 2, domain: 'land', icon: '🪖' }
];

function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function emptyBoard() {
  return Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => ({ r, c, terrain: c < SEA_COLS ? 'sea' : 'land', unitId: null, hit: false })));
}

function newPlayer(socket, name, slot) {
  return { id: socket.id, name: String(name || `Joueur ${slot}`).slice(0, 24), slot, ready: false, board: emptyBoard(), units: [], shots: [] };
}

function publicPlayer(p) {
  return { id: p.id, name: p.name, slot: p.slot, ready: p.ready };
}

function playerStats(p) {
  return {
    id: p.id,
    name: p.name,
    shots: p.shots.length,
    hits: p.shots.filter(s => s.hit).length,
    misses: p.shots.filter(s => !s.hit).length,
    sunk: p.shots.filter(s => s.destroyed).length
  };
}

function gameState(game) {
  return {
    code: game.code,
    status: game.status,
    timerEndsAt: game.timerEndsAt,
    turn: game.turn,
    winner: game.winner,
    players: game.players.map(publicPlayer),
    stats: game.players.map(playerStats),
    rules: { rows: ROWS, cols: COLS, seaCols: SEA_COLS, units: UNITS }
  };
}

function ownState(game, player) {
  const opponent = game.players.find(p => p.id !== player.id);
  return {
    ...gameState(game),
    me: player.id,
    myBoard: player.board,
    myUnits: player.units,
    myShots: player.shots,
    enemyKnown: opponent ? opponent.board.map(row => row.map(cell => ({ r: cell.r, c: cell.c, terrain: cell.terrain, hit: cell.hit, knownUnit: cell.hit && cell.unitId ? true : false }))) : null,
    lastEvent: game.lastEvent ? { ...game.lastEvent, role: game.lastEvent.attacker === player.id ? 'attacker' : 'defender' } : null
  };
}

function emitGame(game) {
  for (const p of game.players) io.to(p.id).emit('state', ownState(game, p));
}

function validatePlacement(board, placements) {
  const expected = [];
  for (const u of UNITS) for (let i = 0; i < u.qty; i++) expected.push(u.id);
  const counts = Object.fromEntries(UNITS.map(u => [u.id, 0]));
  const used = new Set();
  const units = [];

  if (!Array.isArray(placements)) return { ok: false, error: 'Placement invalide.' };
  for (const place of placements) {
    const def = UNITS.find(u => u.id === place.type);
    if (!def) return { ok: false, error: 'Unité inconnue.' };
    counts[def.id]++;
    if (counts[def.id] > def.qty) return { ok: false, error: `Trop de ${def.name}.` };
    const orientation = place.orientation === 'v' ? 'v' : 'h';
    const cells = [];
    for (let i = 0; i < def.size; i++) {
      const r = Number(place.r) + (orientation === 'v' ? i : 0);
      const c = Number(place.c) + (orientation === 'h' ? i : 0);
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return { ok: false, error: `${def.name} sort de la carte.` };
      const terrain = c < SEA_COLS ? 'sea' : 'land';
      if (terrain !== def.domain) return { ok: false, error: `${def.name} doit être placé ${def.domain === 'sea' ? 'dans l’eau' : 'sur la terre'}.` };
      const key = `${r}-${c}`;
      if (used.has(key)) return { ok: false, error: 'Deux unités se chevauchent.' };
      used.add(key);
      cells.push({ r, c });
    }
    const unitId = `${def.id}-${counts[def.id]}`;
    units.push({ unitId, type: def.id, name: def.name, size: def.size, domain: def.domain, cells, destroyed: false });
  }
  for (const u of UNITS) if (counts[u.id] !== u.qty) return { ok: false, error: `Il manque des unités : ${u.name}.` };
  const clean = emptyBoard();
  for (const unit of units) for (const cell of unit.cells) clean[cell.r][cell.c].unitId = unit.unitId;
  return { ok: true, board: clean, units };
}

function startCombat(game) {
  game.status = 'combat';
  game.turn = game.players[0].id;
  game.lastEvent = null;
  game.timerEndsAt = null;
  emitGame(game);
}

function maybeAutoStart(game) {
  if (game.players.length === 2 && game.players.every(p => p.ready) && game.status === 'placement') startCombat(game);
}

io.on('connection', socket => {
  socket.on('createGame', ({ name } = {}) => {
    let c; do { c = code(); } while (games.has(c));
    const game = { code: c, status: 'lobby', players: [newPlayer(socket, name, 1)], turn: null, winner: null, timerEndsAt: null, lastEvent: null, createdAt: Date.now() };
    games.set(c, game);
    socket.join(c);
    emitGame(game);
  });

  socket.on('joinGame', ({ gameCode, name } = {}) => {
    const c = String(gameCode || '').trim().toUpperCase();
    const game = games.get(c);
    if (!game) return socket.emit('errorMessage', 'Partie introuvable.');
    if (game.players.length >= 2 && !game.players.some(p => p.id === socket.id)) return socket.emit('errorMessage', 'Partie déjà complète.');
    if (!game.players.some(p => p.id === socket.id)) game.players.push(newPlayer(socket, name, 2));
    socket.join(c);
    emitGame(game);
  });

  socket.on('rename', ({ gameCode, name } = {}) => {
    const game = games.get(String(gameCode || '').toUpperCase());
    if (!game) return;
    const p = game.players.find(x => x.id === socket.id);
    if (!p) return;
    p.name = String(name || p.name).slice(0, 24);
    emitGame(game);
  });

  socket.on('startPlacement', ({ gameCode } = {}) => {
    const game = games.get(String(gameCode || '').toUpperCase());
    if (!game || game.players[0]?.id !== socket.id || game.players.length !== 2 || game.status !== 'lobby') return;
    game.status = 'placement';
    game.timerEndsAt = Date.now() + 60000;
    for (const p of game.players) { p.ready = false; p.board = emptyBoard(); p.units = []; p.shots = []; }
    emitGame(game);
    setTimeout(() => {
      if (game.status === 'placement') {
        for (const p of game.players) {
          if (!p.ready) {
            const auto = randomPlacement();
            p.board = auto.board;
            p.units = auto.units;
            p.ready = true;
          }
        }
        startCombat(game);
      }
    }, 61000);
  });

  socket.on('submitPlacement', ({ gameCode, placements } = {}) => {
    const game = games.get(String(gameCode || '').toUpperCase());
    if (!game || game.status !== 'placement') return;
    const p = game.players.find(x => x.id === socket.id);
    if (!p) return;
    const valid = validatePlacement(p.board, placements);
    if (!valid.ok) return socket.emit('errorMessage', valid.error);
    p.board = valid.board; p.units = valid.units; p.ready = true;
    emitGame(game); maybeAutoStart(game);
  });

  socket.on('fire', ({ gameCode, r, c } = {}) => {
    const game = games.get(String(gameCode || '').toUpperCase());
    if (!game || game.status !== 'combat' || game.turn !== socket.id) return;
    const attacker = game.players.find(p => p.id === socket.id);
    const defender = game.players.find(p => p.id !== socket.id);
    r = Number(r); c = Number(c);
    if (!attacker || !defender || r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    const target = defender.board[r][c];
    if (target.hit) return socket.emit('errorMessage', 'Cette case a déjà été bombardée.');
    target.hit = true;
    const hit = !!target.unitId;
    let destroyed = null;
    if (hit) {
      const unit = defender.units.find(u => u.unitId === target.unitId);
      if (unit && unit.cells.every(cell => defender.board[cell.r][cell.c].hit)) { unit.destroyed = true; destroyed = unit.name; }
    }
    attacker.shots.push({ r, c, hit, destroyed });
    game.lastEvent = { id: `${Date.now()}-${attacker.id}-${r}-${c}`, attacker: attacker.id, defender: defender.id, r, c, hit, destroyed };
    if (defender.units.length && defender.units.every(u => u.destroyed)) {
      game.status = 'ended'; game.winner = attacker.id;
    } else {
      game.turn = defender.id;
    }
    emitGame(game);
  });

  socket.on('disconnect', () => {
    for (const [c, game] of games) {
      const idx = game.players.findIndex(p => p.id === socket.id);
      if (idx >= 0) {
        game.players.splice(idx, 1);
        if (game.players.length === 0) games.delete(c);
        else { game.status = 'lobby'; game.turn = null; game.winner = null; for (const p of game.players) p.ready = false; emitGame(game); }
      }
    }
  });
});

function randomPlacement() {
  const placements = [];
  const board = emptyBoard();
  function can(def, r, c, o) {
    const cells = [];
    for (let i = 0; i < def.size; i++) {
      const rr = r + (o === 'v' ? i : 0), cc = c + (o === 'h' ? i : 0);
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return null;
      if (board[rr][cc].terrain !== def.domain || board[rr][cc].unitId) return null;
      cells.push({ r: rr, c: cc });
    }
    return cells;
  }
  for (const def of UNITS) for (let n = 0; n < def.qty; n++) {
    for (let tries = 0; tries < 500; tries++) {
      const o = Math.random() > .5 ? 'h' : 'v';
      const r = Math.floor(Math.random() * ROWS), c = Math.floor(Math.random() * COLS);
      const cells = can(def, r, c, o);
      if (!cells) continue;
      const id = `${def.id}-${n+1}`;
      for (const cell of cells) board[cell.r][cell.c].unitId = id;
      placements.push({ unitId: id, type: def.id, name: def.name, size: def.size, domain: def.domain, cells, destroyed: false });
      break;
    }
  }
  return { board, units: placements };
}

server.listen(PORT, () => console.log(`Battle Command lancé sur http://localhost:${PORT}`));
