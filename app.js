(() => {
  'use strict';

  const DIRS = {
    N: { dx: 0, dy: -1, opposite: 'S', label: 'север' },
    E: { dx: 1, dy: 0, opposite: 'W', label: 'восток' },
    S: { dx: 0, dy: 1, opposite: 'N', label: 'юг' },
    W: { dx: -1, dy: 0, opposite: 'E', label: 'запад' }
  };
  const $ = (selector) => document.querySelector(selector);
  const setupScreen = $('#setupScreen');
  const gameScreen = $('#gameScreen');
  const playerCountInput = $('#playerCount');
  const nameFields = $('#nameFields');
  let game = null;
  let selectedAction = 'move';

  function updatePlayerSetup() {
    const count = Number(playerCountInput.value);
    const noun = count === 1 ? 'игрок' : count < 5 ? 'игрока' : 'игроков';
    $('#playerCountValue').textContent = `${count} ${noun}`;
    nameFields.innerHTML = Array.from({ length: count }, (_, i) => `<label class="name-input"><b>0${i + 1}</b><input maxlength="20" aria-label="Имя игрока ${i + 1}" placeholder="Игрок ${i + 1}" value=""></label>`).join('');
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function key(x, y) { return `${x},${y}`; }
  function inBounds(x, y, size) { return x >= 0 && y >= 0 && x < size && y < size; }
  function cellAt(x, y) { return game.cells[y][x]; }
  function openBetween(x, y, dir) {
    const d = DIRS[dir];
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(nx, ny, game.size)) return false;
    return !cellAt(x, y).walls[dir];
  }

  function generateMaze(size) {
    const cells = Array.from({ length: size }, () => Array.from({ length: size }, () => ({
      walls: { N: true, E: true, S: true, W: true }, terrain: null, item: null
    })));
    const seen = new Set();
    const stack = [{ x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) }];
    seen.add(key(stack[0].x, stack[0].y));
    while (stack.length) {
      const current = stack[stack.length - 1];
      const options = shuffle(Object.keys(DIRS).map(dir => ({ dir, x: current.x + DIRS[dir].dx, y: current.y + DIRS[dir].dy })))
        .filter(next => inBounds(next.x, next.y, size) && !seen.has(key(next.x, next.y)));
      if (!options.length) { stack.pop(); continue; }
      const next = options[0];
      cells[current.y][current.x].walls[next.dir] = false;
      cells[next.y][next.x].walls[DIRS[next.dir].opposite] = false;
      seen.add(key(next.x, next.y));
      stack.push({ x: next.x, y: next.y });
    }

    const edges = [];
    for (let x = 0; x < size; x++) { edges.push({ x, y: 0, dir: 'N' }, { x, y: size - 1, dir: 'S' }); }
    for (let y = 0; y < size; y++) { edges.push({ x: 0, y, dir: 'W' }, { x: size - 1, y, dir: 'E' }); }
    const exit = shuffle(edges)[0];
    cells[exit.y][exit.x].walls[exit.dir] = false;
    return { cells, exit };
  }

  function allCoords() {
    const coords = [];
    for (let y = 0; y < game.size; y++) for (let x = 0; x < game.size; x++) coords.push({ x, y });
    return coords;
  }

  function isExitCoord(p) { return p.x === game.exit.x && p.y === game.exit.y; }
  function availableCoords(reserved = new Set()) {
    return shuffle(allCoords().filter(p => !isExitCoord(p) && !reserved.has(key(p.x, p.y)) && !cellAt(p.x, p.y).terrain && !cellAt(p.x, p.y).item));
  }
  function takeCoord(reserved = new Set()) {
    const p = availableCoords(reserved)[0];
    if (!p) throw new Error('Недостаточно свободных клеток для выбранных настроек.');
    reserved.add(key(p.x, p.y));
    return p;
  }

  function makeRiverLoop(reserved) {
    const free = p => inBounds(p.x, p.y, game.size) && !isExitCoord(p) && !reserved.has(key(p.x, p.y)) && !cellAt(p.x, p.y).terrain && !cellAt(p.x, p.y).item;
    let loop = null;
    for (let attempt = 0; attempt < 700 && !loop; attempt++) {
      const maxWidth = Math.min(game.size, 9);
      const width = 3 + Math.floor(Math.random() * (maxWidth - 2));
      const height = 3 + Math.floor(Math.random() * (maxWidth - 2));
      const left = Math.floor(Math.random() * (game.size - width + 1));
      const top = Math.floor(Math.random() * (game.size - height + 1));
      const right = left + width - 1, bottom = top + height - 1;
      const outline = [];
      for (let x = left; x <= right; x++) outline.push({ x, y: top });
      for (let y = top + 1; y <= bottom; y++) outline.push({ x: right, y });
      for (let x = right - 1; x >= left; x--) outline.push({ x, y: bottom });
      for (let y = bottom - 1; y > top; y--) outline.push({ x: left, y });
      if (outline.some(p => !free(p))) continue;

      const bumps = [];
      for (let i = 0; i < outline.length; i++) {
        const p = outline[i], q = outline[(i + 1) % outline.length];
        let outward = null;
        if (p.y === top && q.y === top) outward = { dx: 0, dy: -1 };
        else if (p.x === right && q.x === right) outward = { dx: 1, dy: 0 };
        else if (p.y === bottom && q.y === bottom) outward = { dx: 0, dy: 1 };
        else if (p.x === left && q.x === left) outward = { dx: -1, dy: 0 };
        if (!outward) continue;
        const bumpA = { x: p.x + outward.dx, y: p.y + outward.dy };
        const bumpB = { x: q.x + outward.dx, y: q.y + outward.dy };
        if (free(bumpA) && free(bumpB)) bumps.push({ index: i, bumpA, bumpB });
      }
      if (!bumps.length) continue;
      const bump = bumps[Math.floor(Math.random() * bumps.length)];
      loop = [];
      for (let i = 0; i < outline.length; i++) {
        loop.push(outline[i]);
        if (i === bump.index) loop.push(bump.bumpA, bump.bumpB);
      }
    }
    if (!loop) return false;
    loop.forEach((p, index) => {
      const next = loop[(index + 1) % loop.length];
      const dir = Object.keys(DIRS).find(name => p.x + DIRS[name].dx === next.x && p.y + DIRS[name].dy === next.y);
      const d = DIRS[dir];
      cellAt(p.x, p.y).walls[dir] = false;
      cellAt(next.x, next.y).walls[d.opposite] = false;
      cellAt(p.x, p.y).terrain = { type: 'river', flow: dir };
      reserved.add(key(p.x, p.y));
    });
    return true;
  }

  function createGame() {
    const sizeInput = $('#mazeSize');
    const size = Number(sizeInput.value);
    if (!Number.isInteger(size) || size < Number(sizeInput.min) || size > Number(sizeInput.max)) {
      throw new Error(`Укажите размер от ${sizeInput.min} до ${sizeInput.max} клеток.`);
    }
    const count = Number(playerCountInput.value);
    const requested = {
      teleports: Math.max(0, Math.min(4, Number($('#teleporterCount').value) || 0)),
      rivers: Math.max(0, Math.min(5, Number($('#riverCount').value) || 0)),
      arsenals: Math.max(0, Math.min(6, Number($('#arsenalCount').value) || 0)),
      fakes: Math.max(0, Math.min(6, Number($('#fakeCount').value) || 0))
    };
    const generated = generateMaze(size);
    game = { size, cells: generated.cells, exit: generated.exit, players: [], turn: 0, turnNumber: 1, log: [], winner: null, running: true, revealMap: false, currentCommand: '', arsenalReusable: $('#arsenalModeReusable').checked, items: { realTreasure: null } };
    const reserved = new Set();
    game.hospital = takeCoord(reserved);
    cellAt(game.hospital.x, game.hospital.y).terrain = { type: 'hospital' };
    const names = [...nameFields.querySelectorAll('input')].map((input, i) => input.value.trim() || `Игрок ${i + 1}`);
    for (let i = 0; i < count; i++) {
      const p = takeCoord(reserved);
      game.players.push({ id: i, name: names[i], x: p.x, y: p.y, bullets: 0, dynamite: 0, cargo: null, riverEscape: 0, escaped: false, outside: false, alive: true, skipNextTurn: false });
    }
    for (let pair = 0; pair < requested.teleports; pair++) {
      const a = takeCoord(reserved), b = takeCoord(reserved), pairId = pair + 1;
      cellAt(a.x, a.y).terrain = { type: 'teleporter', pairId, mate: b };
      cellAt(b.x, b.y).terrain = { type: 'teleporter', pairId, mate: a };
    }
    let riversMade = 0;
    for (let i = 0; i < requested.rivers; i++) if (makeRiverLoop(reserved)) riversMade++;
    for (let i = 0; i < requested.arsenals; i++) {
      const p = takeCoord(reserved); cellAt(p.x, p.y).terrain = { type: 'arsenal' };
    }
    const treasure = takeCoord(reserved);
    cellAt(treasure.x, treasure.y).item = { type: 'treasure', real: true };
    game.items.realTreasure = treasure;
    for (let i = 0; i < requested.fakes; i++) {
      const p = takeCoord(reserved); cellAt(p.x, p.y).item = { type: 'treasure', real: false };
    }
    game.turn = 0;
    game.currentAction = 'move';
    setupScreen.classList.add('hidden'); gameScreen.classList.remove('hidden');
    $('#headerStatus').innerHTML = '<span class="status-dot"></span> Партия идёт';
    $('#gameTitle').textContent = `Лабиринт ${size} × ${size}`;
    $('#playersSummary').textContent = `${count} ${count === 1 ? 'игрок' : count < 5 ? 'игрока' : 'игроков'} · по очереди`;
    $('#turnBadge').textContent = 'ХОД 1';
    $('#mapPanel').classList.add('hidden');
    $('#mapToggle').querySelector('span').textContent = 'Карта ведущего';
    $('#latestReport').innerHTML = `<span class="report-ornament">✳</span><p>Лабиринт создан. ${riversMade < requested.rivers ? `Удалось разместить участков реки: ${riversMade} из ${requested.rivers}. ` : ''}${game.players[0].name} начинает путь.</p>`;
    game.log = [];
    renderLog(); renderGame(); renderMap(); selectAction('move');
  }

  function currentPlayer() { return game && game.players[game.turn]; }
  function coordinateHasPlayer(x, y, exceptId = -1) { return game.players.find(p => p.alive && !p.escaped && !p.outside && p.id !== exceptId && p.x === x && p.y === y); }

  function pushLog(player, message, type = 'normal') {
    const line = { turn: game.turnNumber, name: player ? player.name : 'Ведущий', command: game.currentCommand || '—', message, type };
    game.log.unshift(line);
    $('#latestReport').innerHTML = `<span class="report-ornament">${type === 'good' ? '✦' : type === 'bad' ? '!' : '✳'}</span><p><strong>${escapeHtml(line.name)}.</strong> ${escapeHtml(message)}</p>`;
    renderLog();
  }

  function escapeHtml(text) { return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function renderLog() {
    $('#logCount').textContent = `${game.log.length} ${game.log.length === 1 ? 'событие' : game.log.length < 5 ? 'события' : 'событий'}`;
    $('#eventLog').innerHTML = game.log.length ? game.log.map(entry => `<div class="log-entry"><span class="log-turn">${String(entry.turn).padStart(2, '0')}</span><span><strong>${escapeHtml(entry.name)}</strong><small class="log-command">${escapeHtml(entry.command || '—')}</small><span>${escapeHtml(entry.message)}</span></span></div>`).join('') : '<p class="empty-log">Здесь появятся результаты ходов.</p>';
  }

  function setReport(player, message, type = 'normal') { pushLog(player, message, type); }

  function findItemDrop(x, y) {
    if (cellAt(x, y).item) {
      const coords = allCoords().filter(p => !cellAt(p.x, p.y).item && !cellAt(p.x, p.y).terrain && !isExitCoord(p));
      const p = shuffle(coords)[0];
      if (p) { cellAt(p.x, p.y).item = cellAt(x, y).item; return p; }
    }
    return { x, y };
  }

  function dropCargo(player, x, y, drowned = false) {
    if (!player.cargo) return null;
    let place = { x, y };
    if (drowned) {
      const shore = new Map();
      let cursor = { x, y };
      for (let i = 0; i < 4; i++) {
        const terrain = cellAt(cursor.x, cursor.y).terrain;
        if (!terrain || terrain.type !== 'river') break;
        const dir = terrain.flow;
        if (!openBetween(cursor.x, cursor.y, dir)) break;
        const d = DIRS[dir]; cursor = { x: cursor.x + d.dx, y: cursor.y + d.dy };
        if (!inBounds(cursor.x, cursor.y, game.size)) break;
        if (cellAt(cursor.x, cursor.y).terrain?.type !== 'river') {
          if (!isExitCoord(cursor) && !cellAt(cursor.x, cursor.y).item) shore.set(key(cursor.x, cursor.y), cursor);
          break;
        }
        for (const bankDir of Object.keys(DIRS)) {
          const bank = { x: cursor.x + DIRS[bankDir].dx, y: cursor.y + DIRS[bankDir].dy };
          if (!inBounds(bank.x, bank.y, game.size) || isExitCoord(bank) || cellAt(bank.x, bank.y).terrain?.type === 'river' || cellAt(bank.x, bank.y).item) continue;
          shore.set(key(bank.x, bank.y), bank);
        }
      }
      const choices = [...shore.values()];
      if (choices.length) place = choices[Math.floor(Math.random() * choices.length)];
    }
    place = findItemDrop(place.x, place.y);
    cellAt(place.x, place.y).item = { type: 'treasure', real: player.cargo === 'real' };
    player.cargo = null;
    return place;
  }

  function hospitalize(player, reason, drowned = false) {
    const from = { x: player.x, y: player.y };
    const dropped = dropCargo(player, from.x, from.y, drowned);
    player.x = game.hospital.x; player.y = game.hospital.y;
    player.bullets = 0; player.dynamite = 0; player.riverEscape = 0;
    player.skipNextTurn = true;
    let message = `${reason} ${player.name} попадает в госпиталь. Патроны и динамит потеряны.`;
    if (dropped) message += ' Клад остался в лабиринте.';
    setReport(player, message, 'bad');
  }

  function processCell(player, options = {}) {
    const cell = cellAt(player.x, player.y);
    const terrain = cell.terrain;
    if (terrain?.type === 'hospital') {
      setReport(player, 'Вы прошли через госпиталь. Запасы сохранены.');
      return options.continue ? 'continue' : 'normal';
    }
    if (terrain?.type === 'teleporter') {
      player.x = terrain.mate.x; player.y = terrain.mate.y;
      setReport(player, 'Телепорт мгновенно перенёс вас в другую часть лабиринта.', 'good');
      return 'stop';
    }
    if (terrain?.type === 'arsenal') {
      if (game.arsenalReusable) {
        player.bullets = Math.max(player.bullets, 5);
        player.dynamite = Math.max(player.dynamite, 1);
        setReport(player, 'Многоразовый арсенал пополнил запас до 5 патронов и 1 динамита. Он останется доступен другим игрокам.', 'good');
      } else {
        player.bullets += 5; player.dynamite += 1; cell.terrain = null;
        setReport(player, 'Вы нашли одноразовый арсенал: +5 патронов и динамит. Он израсходован.', 'good');
      }
    }
    if (terrain?.type === 'river') {
      const traversed = [];
      let moved = 0;
      for (let i = 0; i < 3; i++) {
        const current = cellAt(player.x, player.y);
        if (!current.terrain || current.terrain.type !== 'river') break;
        const d = DIRS[current.terrain.flow];
        if (!openBetween(player.x, player.y, current.terrain.flow)) break;
        player.x += d.dx; player.y += d.dy; traversed.push({ x: player.x, y: player.y }); moved++;
      }
      const now = cellAt(player.x, player.y);
      if (now.terrain?.type === 'river') {
        player.riverEscape = 2;
        setReport(player, `Течение пронесло вас на ${moved} ${moved === 1 ? 'клетку' : 'клетки'}. Нужно выбраться; попыток: 2.`, 'bad');
      } else {
        setReport(player, `Река пронесла вас на ${moved} ${moved === 1 ? 'клетку' : 'клетки'} по течению.`, 'bad');
      }
      return 'stop';
    }
    if (cell.item && !player.cargo) {
      player.cargo = cell.item.real ? 'real' : 'fake';
      cell.item = null;
      setReport(player, 'Вы нашли клад и взяли его с собой.', 'good');
    }
    return options.continue ? 'continue' : 'normal';
  }

  function endGame(winner, message) {
    game.running = false; game.winner = winner || null; game.revealMap = true;
    $('#headerStatus').innerHTML = '<span class="status-dot"></span> Партия завершена';
    $('#mapPanel').classList.remove('hidden'); $('#mapToggle').querySelector('span').textContent = 'Карта ведущего';
    renderMap(); renderGame();
    $('#gameEyebrow').textContent = 'СОСТОЯНИЕ ПАРТИИ';
    $('#resultTitle').textContent = winner ? `${winner.name} победил!` : 'Партия завершена';
    $('#resultCopy').textContent = message;
    $('#toastTitle').textContent = 'Игра окончена';
    $('#toastMessage').textContent = winner ? `Игрок ${winner.name} победил!` : message;
    $('#gameOverToast').classList.remove('hidden');
    $('#scoreList').innerHTML = game.players.map(p => `<div class="score-item"><span>${escapeHtml(p.name)}</span><strong>${p.id === (winner?.id ?? -1) ? 'ВЫНЕС КЛАД' : p.escaped ? 'ПОБЕДИЛ' : p.outside ? 'СНАРУЖИ · МОЖЕТ ВЕРНУТЬСЯ' : p.cargo ? 'НЕСЁТ КЛАД' : 'В ЛАБИРИНТЕ'}</strong></div>`).join('');
    $('#endgamePanel').classList.remove('hidden');
  }

  function advanceTurn() {
    if (!game.running) return;
    let found = -1;
    for (let offset = 1; offset <= game.players.length * 2; offset++) {
      const i = (game.turn + offset) % game.players.length;
      const candidate = game.players[i];
      if (!candidate.alive || candidate.escaped) continue;
      if (candidate.skipNextTurn) {
        candidate.skipNextTurn = false;
        setReport(candidate, `${candidate.name} пропускает ход после смерти и возвращения в госпиталь.`, 'bad');
        continue;
      }
      found = i; break;
    }
    if (found < 0) { endGame(null, 'Все игроки покинули лабиринт. Настоящий клад так и не был вынесен.'); return; }
    if (found <= game.turn) game.turnNumber++;
    game.turn = found;
    $('#turnBadge').textContent = `ХОД ${game.turnNumber}`;
    renderGame(); renderMap();
  }

  function finishAction() {
    renderGame(); renderMap();
    if (game.running) advanceTurn();
  }

  function carryWithCurrent(player, distance, cause) {
    let moved = 0;
    for (let i = 0; i < distance; i++) {
      const terrain = cellAt(player.x, player.y).terrain;
      if (terrain?.type !== 'river' || !openBetween(player.x, player.y, terrain.flow)) break;
      const d = DIRS[terrain.flow];
      player.x += d.dx; player.y += d.dy; moved++;
    }
    if (cellAt(player.x, player.y).terrain?.type !== 'river') {
      player.riverEscape = 0;
      setReport(player, `${cause} Течение пронесло вас на ${moved} ${moved === 1 ? 'клетку' : 'клеток'} и вынесло на берег.`, 'good');
      processCell(player);
    } else {
      player.riverEscape--;
      setReport(player, `${cause} Течение пронесло вас на ${moved} ${moved === 1 ? 'клетку' : 'клеток'}, но вы остались в реке.`, 'bad');
      if (player.riverEscape <= 0) hospitalize(player, 'Вам не удалось выбраться из реки.', true);
      else $('#riverTurnsText').textContent = `Осталось попыток: ${player.riverEscape}`;
    }
    finishAction();
  }

  function refillFromReusableArsenal(player) {
    const terrain = cellAt(player.x, player.y).terrain;
    if (!game.arsenalReusable || terrain?.type !== 'arsenal') return false;
    player.bullets = Math.max(player.bullets, 5);
    player.dynamite = Math.max(player.dynamite, 1);
    return true;
  }

  function doMove(player, dir, steps) {
    if (player.outside) {
      const inward = DIRS[game.exit.dir].opposite;
      if (dir !== inward) {
        $('#actionHint').textContent = `Чтобы вернуться, выберите направление ${DIRS[inward].label}.`;
        return;
      }
      player.outside = false;
      setReport(player, 'Вы вернулись в лабиринт.');
      finishAction(); return;
    }
    if (player.riverEscape > 0) {
      const river = cellAt(player.x, player.y).terrain;
      const d = DIRS[dir], nx = player.x + d.dx, ny = player.y + d.dy;
      if (cellAt(player.x, player.y).walls[dir]) {
        carryWithCurrent(player, 3, 'Вы попытались двинуться, но упёрлись в стену.');
      } else if (dir === river.flow) {
        carryWithCurrent(player, 4, 'Вы направились по течению.');
      } else if (dir === DIRS[river.flow].opposite) {
        carryWithCurrent(player, 2, 'Вы направились против течения.');
      } else if (inBounds(nx, ny, game.size) && cellAt(nx, ny).terrain?.type !== 'river') {
        player.x = nx; player.y = ny; player.riverEscape = 0;
        setReport(player, 'Вы выбрались из реки на берег.', 'good');
        processCell(player);
        finishAction();
      } else {
        carryWithCurrent(player, 3, 'Вы попытались плыть в сторону, но не смогли покинуть реку.');
      }
      return;
    }
    let moved = 0, hitWall = false, stopped = false, exited = false;
    const logCountBefore = game.log.length;
    for (let i = 0; i < steps; i++) {
      const d = DIRS[dir], nx = player.x + d.dx, ny = player.y + d.dy;
      if (cellAt(player.x, player.y).walls[dir]) { hitWall = true; break; }
      if (!inBounds(nx, ny, game.size)) {
        if (player.cargo === 'real') { player.escaped = true; player.alive = false; setReport(player, 'Вы вынесли настоящий клад из лабиринта!', 'good'); renderGame(); renderMap(); endGame(player, `${player.name} нашёл настоящий клад и покинул лабиринт.`); return; }
        player.outside = true;
        const carriedFake = player.cargo === 'fake';
        player.cargo = null;
        setReport(player, carriedFake ? 'Вы вышли с фальшивым кладом. Победы нет; в следующий ход можно вернуться.' : 'Вы вышли без настоящего клада. В следующий ход можно вернуться.');
        stopped = true; exited = true; break;
      }
      player.x = nx; player.y = ny; moved++;
      const result = processCell(player);
      if (result === 'stop' || player.riverEscape > 0) { stopped = true; break; }
    }
    if (!moved && hitWall) setReport(player, 'Перед вами стена. Движения не было.', 'bad');
    else if (hitWall) setReport(player, `Вы прошли ${moved} ${moved === 1 ? 'клетку' : 'клетки'} и упёрлись в стену.`, 'bad');
    else if (!stopped && !exited && game.log.length === logCountBefore) setReport(player, `Вы переместились на ${moved} ${moved === 1 ? 'клетку' : 'клетки'} к ${DIRS[dir].label}.`);
    finishAction();
  }

  function doShoot(player, dir) {
    if (player.riverEscape > 0) { doMove(player, dir, 1); return; }
    if (player.bullets <= 0) { $('#actionHint').textContent = 'Нет патронов. Найдите арсенал.'; return; }
    player.bullets--;
    const refilled = refillFromReusableArsenal(player);
    const d = DIRS[dir]; let x = player.x, y = player.y, hit = null, stoppedByWall = false;
    for (let i = 0; i < game.size * 2; i++) {
      if (!openBetween(x, y, dir)) { stoppedByWall = true; break; }
      x += d.dx; y += d.dy;
      if (!inBounds(x, y, game.size)) break;
      hit = coordinateHasPlayer(x, y, player.id);
      if (hit) break;
    }
    if (hit) {
      setReport(player, `Выстрел попал в ${hit.name}. Игрок отправлен в госпиталь.${refilled ? ' Многоразовый арсенал автоматически пополнил боезапас.' : ''}`, 'bad');
      hospitalize(hit, 'Вы попали под выстрел.');
    } else setReport(player, `${stoppedByWall ? 'Вы выстрелили вслепую. Пуля остановилась о стену.' : 'Вы выстрелили вслепую. Никого не задели.'}${refilled ? ' Многоразовый арсенал автоматически пополнил боезапас.' : ''}`);
    selectAction('move');
    finishAction();
  }

  function doDynamite(player, dir) {
    if (player.riverEscape > 0) { doMove(player, dir, 1); return; }
    if (player.dynamite <= 0) { $('#actionHint').textContent = 'Нет динамита. Найдите арсенал.'; return; }
    const wall = cellAt(player.x, player.y).walls[dir];
    if (!wall) { $('#actionHint').textContent = 'В этом направлении нет стенки.'; return; }
    const d = DIRS[dir], nx = player.x + d.dx, ny = player.y + d.dy;
    cellAt(player.x, player.y).walls[dir] = false;
    if (inBounds(nx, ny, game.size)) cellAt(nx, ny).walls[d.opposite] = false;
    player.dynamite--;
    const refilled = refillFromReusableArsenal(player);
    setReport(player, `Динамит разрушил стену на ${DIRS[dir].label}.${refilled ? ' Многоразовый арсенал автоматически пополнил запас.' : ''}` , 'good');
    selectAction('move');
    finishAction();
  }

  function doPunch(player) {
    if (!player || player.outside || player.riverEscape > 0) return;
    const target = coordinateHasPlayer(player.x, player.y, player.id);
    if (!target) return;
    game.currentCommand = 'Удар кулаком';
    setReport(player, `Вы ударили ${target.name} кулаком. Игрок отправлен в госпиталь.`, 'bad');
    hospitalize(target, 'Вас ударили кулаком.');
    selectAction('move');
    finishAction();
  }

  function passWithCurrent(player) {
    if (!game?.running || !player || player.riverEscape <= 0) return;
    game.currentCommand = 'Пассивный перенос течением';
    carryWithCurrent(player, 3, 'Вы пропустили активное движение.');
  }

  function chooseDirection(dir) {
    if (!game || !game.running) return;
    const player = currentPlayer(); if (!player) return;
    if (player.outside) { game.currentCommand = `Возврат: ${DIRS[dir].label}`; doMove(player, dir, 1); return; }
    const action = player.riverEscape > 0 ? 'move' : selectedAction;
    if (action === 'move') {
      const steps = Math.max(1, Math.min(10, Number($('#steps').value) || 1));
      game.currentCommand = `Шаг: ${DIRS[dir].label}, ${steps}`;
      doMove(player, dir, steps);
    } else if (action === 'shoot') {
      game.currentCommand = `Выстрел: ${DIRS[dir].label}`;
      doShoot(player, dir);
    } else {
      game.currentCommand = `Динамит: ${DIRS[dir].label}`;
      doDynamite(player, dir);
    }
  }

  function selectAction(action) {
    const player = currentPlayer();
    if (player?.outside && action !== 'move') return;
    selectedAction = action;
    document.querySelectorAll('.action-tab').forEach(button => button.classList.toggle('active', button.dataset.action === action));
    $('#moveOptions').classList.toggle('hidden', player?.outside || action !== 'move');
    const hints = { move: 'Выберите направление. Стены остановят движение.', shoot: 'Выберите направление — пуля летит до стены или игрока.', dynamite: 'Выберите соседнюю стену, которую нужно разрушить.' };
    $('#actionHint').textContent = player?.outside ? `Вы снаружи. В свой следующий ход вернитесь направлением ${DIRS[DIRS[game.exit.dir].opposite].label}.` : hints[action];
  }

  function renderGame() {
    if (!game) return;
    const player = currentPlayer();
    if (!player) return;
    $('#currentPlayerName').textContent = player.name;
    $('#currentPlayerAvatar').textContent = player.name.slice(0, 1).toLocaleUpperCase('ru');
    $('#currentPlayerState').textContent = player.outside ? 'Снаружи · у выхода' : player.riverEscape > 0 ? 'В реке' : player.cargo ? 'Несёт клад' : 'В лабиринте';
    $('#riverAlert').classList.toggle('hidden', player.riverEscape <= 0);
    $('#riverTurnsText').textContent = `Осталось попыток: ${player.riverEscape}`;
    $('#ammoBadge').textContent = player.bullets;
    $('#dynamiteBadge').textContent = player.dynamite;
    $('#playersList').innerHTML = game.players.map((p, i) => {
      const status = p.escaped ? 'Победил' : !p.alive ? 'Вне игры' : p.skipNextTurn ? 'Пропустит следующий ход' : p.outside ? 'Снаружи · может вернуться' : p.riverEscape ? 'В реке' : p.cargo ? 'Несёт клад' : 'В лабиринте';
      return `<div class="player-card ${i === game.turn && game.running ? 'active' : ''} ${p.escaped ? 'out' : p.outside ? 'away' : ''}"><div class="avatar">${escapeHtml(p.name.slice(0, 1).toLocaleUpperCase('ru'))}</div><div class="player-info"><strong>${escapeHtml(p.name)}</strong><small>${status}</small></div><div class="inventory"><span>● ${p.bullets}</span><span>◆ ${p.dynamite}</span></div></div>`;
    }).join('');
    document.querySelectorAll('.action-tab').forEach(button => {
      button.disabled = !game.running || (player.outside && button.dataset.action !== 'move') || (player.riverEscape > 0 && button.dataset.action !== 'move') || (button.dataset.action === 'punch' && !coordinateHasPlayer(player.x, player.y, player.id));
      if (player.outside) button.classList.toggle('active', button.dataset.action === 'move');
    });
    document.querySelectorAll('.direction:not(.center)').forEach(button => { button.disabled = !game.running; });
    $('#stepMinus').disabled = $('#stepPlus').disabled = $('#steps').disabled = !game.running;
    const passButton = $('#passButton');
    passButton.disabled = !game.running || player.riverEscape <= 0;
    passButton.textContent = player.riverEscape > 0 ? '≈' : '✳';
    passButton.setAttribute('aria-label', player.riverEscape > 0 ? 'Пропустить активное движение и плыть по течению' : 'Пасс доступен только в реке');
    passButton.classList.toggle('pass-active', player.riverEscape > 0 && game.running);
    if (player.outside) {
      $('#moveOptions').classList.add('hidden');
      $('#actionHint').textContent = `Вы снаружи. В свой следующий ход вернитесь направлением ${DIRS[DIRS[game.exit.dir].opposite].label}.`;
    }
    if (player.riverEscape > 0) {
      document.querySelectorAll('.action-tab').forEach(button => button.classList.toggle('active', button.dataset.action === 'move'));
      $('#actionHint').textContent = 'К берегу — выход; по течению сносит на 4 клетки, против — на 2, стена или пас — на 3.';
    }
  }

  function renderMap() {
    if (!game) return;
    const canvas = $('#mazeCanvas'), ctx = canvas.getContext('2d');
    const size = game.size, tile = 2 * Math.max(17, Math.min(28, Math.floor(570 / size))), pad = tile + 7;
    canvas.width = size * tile + pad * 2; canvas.height = size * tile + pad * 2;
    ctx.fillStyle = '#101b1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const terrainColors = { hospital: '#e27e73', teleporter: '#bc9bef', river: '#75b9d1', arsenal: '#eaa875' };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const cell = cellAt(x, y), px = pad + x * tile, py = pad + y * tile;
      ctx.fillStyle = '#192825'; ctx.fillRect(px + 1, py + 1, tile - 2, tile - 2);
      if (cell.terrain) {
        const t = cell.terrain.type;
        if (t === 'river') {
          ctx.fillStyle = '#1d3d49'; ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
          ctx.fillStyle = terrainColors.river; ctx.font = `bold ${Math.max(9, tile * .48)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('≈', px + tile / 2, py + tile / 2);
        } else {
          const palettes = {
            hospital: { fill: '#663f43', mark: '#ffe5d9' },
            teleporter: { fill: '#493b66', mark: '#eadcff' },
            arsenal: { fill: '#654c37', mark: '#ffdfb7' }
          };
          const palette = palettes[t];
          if (palette) {
            ctx.fillStyle = palette.fill; ctx.fillRect(px + 2, py + 2, tile - 4, tile - 4);
            ctx.strokeStyle = palette.mark; ctx.fillStyle = palette.mark;
            ctx.lineWidth = Math.max(1.7, tile * .09); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            if (t === 'hospital') {
              const arm = tile * .17, thickness = tile * .24, cx = px + tile / 2, cy = py + tile / 2;
              ctx.fillRect(cx - thickness / 2, cy - arm * 1.65, thickness, arm * 3.3);
              ctx.fillRect(cx - arm * 1.65, cy - thickness / 2, arm * 3.3, thickness);
            } else if (t === 'teleporter') {
              ctx.beginPath(); ctx.arc(px + tile / 2, py + tile / 2, tile * .32, 0, Math.PI * 2); ctx.stroke();
              ctx.beginPath(); ctx.arc(px + tile / 2, py + tile / 2, tile * .16, 0, Math.PI * 2); ctx.stroke();
              ctx.beginPath(); ctx.arc(px + tile / 2, py + tile / 2, tile * .045, 0, Math.PI * 2); ctx.fill();
            } else {
              const crate = tile * .52, left = px + (tile - crate) / 2, top = py + (tile - crate) / 2;
              ctx.strokeRect(left, top, crate, crate);
              ctx.beginPath(); ctx.moveTo(left, top + crate * .34); ctx.lineTo(left + crate, top + crate * .34); ctx.moveTo(left + crate * .5, top); ctx.lineTo(left + crate * .5, top + crate); ctx.stroke();
            }
          }
        }
      }
      if (cell.item) {
        const cx = px + tile / 2, cy = py + tile / 2, radius = tile * .28;
        ctx.fillStyle = cell.item.real ? '#e6ca71' : '#84775e'; ctx.beginPath();
        ctx.moveTo(cx, cy - radius); ctx.lineTo(cx + radius, cy); ctx.lineTo(cx, cy + radius); ctx.lineTo(cx - radius, cy); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = '#91a49a'; ctx.lineWidth = Math.max(1.4, tile * .075); ctx.lineCap = 'round';
      const x0 = px, y0 = py, x1 = px + tile, y1 = py + tile;
      if (cell.walls.N) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke(); }
      if (cell.walls.E) { ctx.beginPath(); ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
      if (cell.walls.S) { ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke(); }
      if (cell.walls.W) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke(); }
      if (game.exit.x === x && game.exit.y === y) {
        ctx.strokeStyle = '#c6ee8c'; ctx.lineWidth = Math.max(2.5, tile * .14); ctx.beginPath();
        if (game.exit.dir === 'N') { ctx.moveTo(px + tile * .25, py); ctx.lineTo(px + tile * .75, py); }
        if (game.exit.dir === 'S') { ctx.moveTo(px + tile * .25, py + tile); ctx.lineTo(px + tile * .75, py + tile); }
        if (game.exit.dir === 'E') { ctx.moveTo(px + tile, py + tile * .25); ctx.lineTo(px + tile, py + tile * .75); }
        if (game.exit.dir === 'W') { ctx.moveTo(px, py + tile * .25); ctx.lineTo(px, py + tile * .75); }
        ctx.stroke();
      }
    }
    const playerColors = ['#c6ee8c', '#efaa83', '#bc9bef', '#75b9d1', '#e6ca71', '#f08b9d'];
    const visiblePlayers = game.players.map((player, index) => ({ player, index }))
      .filter(({ player }) => (player.alive && !player.escaped) || player.escaped);
    const markerGroups = new Map();
    visiblePlayers.forEach(token => {
      const { player } = token;
      const groupKey = player.outside || player.escaped ? `exit-${game.exit.x},${game.exit.y}` : key(player.x, player.y);
      if (!markerGroups.has(groupKey)) markerGroups.set(groupKey, []);
      markerGroups.get(groupKey).push(token);
    });
    markerGroups.forEach(tokens => tokens.forEach(({ player, index }, slot) => {
      let cx = pad + player.x * tile + tile / 2, cy = pad + player.y * tile + tile / 2;
      if (player.outside || player.escaped) {
        if (game.exit.dir === 'N') cy -= tile;
        if (game.exit.dir === 'S') cy += tile;
        if (game.exit.dir === 'E') cx += tile;
        if (game.exit.dir === 'W') cx -= tile;
      }
      const count = tokens.length;
      let radius = tile * .25;
      if (count > 1) {
        const orbit = tile * Math.min(.255, .15 + count * .017);
        const angle = -Math.PI / 2 + Math.PI * 2 * slot / count;
        cx += Math.cos(angle) * orbit; cy += Math.sin(angle) * orbit;
        radius = tile * (count <= 2 ? .17 : count <= 4 ? .15 : .12);
      }
      ctx.fillStyle = playerColors[index % playerColors.length];
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#101b1a'; ctx.lineWidth = Math.max(2, tile * .075); ctx.stroke();
      ctx.strokeStyle = '#e9f0e2'; ctx.lineWidth = Math.max(1, tile * .025); ctx.stroke();
      ctx.fillStyle = '#14201a'; ctx.font = `bold ${Math.max(8, radius * 1.15)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), cx, cy + .5);
    }));
    $('#playerMapLegend').innerHTML = game.players.map((player, index) => `<span><i style="--player-color:${playerColors[index % playerColors.length]}">${index + 1}</i>${escapeHtml(player.name)}</span>`).join('');
  }

  function resetToSetup() {
    $('#endgamePanel').classList.add('hidden'); gameScreen.classList.add('hidden'); setupScreen.classList.remove('hidden');
    $('#gameOverToast').classList.add('hidden');
    $('#headerStatus').innerHTML = '<span class="status-dot"></span> Новая партия'; game = null;
    $('#gameEyebrow').textContent = 'ПАРТИЯ ИДЁТ';
  }

  function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportField() {
    if (!game) return;
    $('#mazeCanvas').toBlob(blob => {
      if (blob) downloadFile(blob, `labirint-${game.size}x${game.size}-${new Date().toISOString().slice(0, 10)}.png`);
    }, 'image/png');
  }

  function exportLog() {
    if (!game) return;
    const quote = value => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [['Ход', 'Игрок', 'Команда', 'Результат'], ...game.log.slice().reverse().map(line => [line.turn, line.name, line.command || '—', line.message])];
    const csv = '\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n');
    downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `labirint-zhurnal-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  playerCountInput.addEventListener('input', updatePlayerSetup);
  $('#startGame').addEventListener('click', () => {
    try { createGame(); } catch (error) { window.alert(error.message || 'Не удалось создать лабиринт.'); }
  });
  document.querySelectorAll('.action-tab').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.action === 'punch') doPunch(currentPlayer());
    else selectAction(button.dataset.action);
  }));
  document.querySelectorAll('.direction').forEach(button => button.addEventListener('click', () => button.dataset.dir && chooseDirection(button.dataset.dir)));
  $('#passButton').addEventListener('click', () => passWithCurrent(currentPlayer()));
  $('#stepMinus').addEventListener('click', () => { $('#steps').value = Math.max(1, Number($('#steps').value) - 1); });
  $('#stepPlus').addEventListener('click', () => { $('#steps').value = Math.min(10, Number($('#steps').value) + 1); });
  $('#mapToggle').addEventListener('click', () => {
    $('#mapPanel').classList.toggle('hidden');
    $('#mapToggle').querySelector('span').textContent = $('#mapPanel').classList.contains('hidden') ? 'Карта ведущего' : 'Скрыть карту';
  });
  $('#hideMap').addEventListener('click', () => { $('#mapPanel').classList.add('hidden'); $('#mapToggle').querySelector('span').textContent = 'Карта ведущего'; });
  $('#exportField').addEventListener('click', exportField);
  $('#exportLog').addEventListener('click', exportLog);
  $('#endGame').addEventListener('click', () => { if (game?.running) endGame(null, 'Ведущий завершил партию.'); });
  $('#newGame').addEventListener('click', resetToSetup);
  $('#resultNewGame').addEventListener('click', resetToSetup);
  $('#closeGameOverToast').addEventListener('click', () => $('#gameOverToast').classList.add('hidden'));
  updatePlayerSetup();
})();
