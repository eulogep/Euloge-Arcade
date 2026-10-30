(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const slug = (params.get('slug') || 'arcade').toLowerCase();
  const gameTitle = params.get('title') || slug.replace(/-/g, ' ').toUpperCase();
  const code = params.get('code') || 'EA-' + slug.replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const domLayer = document.getElementById('dom-layer');
  const scoreEl = document.getElementById('hud-score');
  const bestEl = document.getElementById('hud-best');
  const titleEl = document.getElementById('hud-title');
  const codeEl = document.getElementById('hud-code');
  const modeEl = document.getElementById('hud-mode');
  const btnRestart = document.getElementById('btn-restart');
  const btnSubmit = document.getElementById('btn-submit');

  titleEl.textContent = gameTitle;
  codeEl.textContent = code;

  const BEST_KEY = 'ea:cartridge-best:' + slug;
  let score = 0;
  let bestScore = Number(localStorage.getItem(BEST_KEY) || '0') || 0;
  let startTime = performance.now();
  let deaths = 0;

  function setScore(val) {
    score = Math.max(0, Math.round(val));
    scoreEl.textContent = score.toLocaleString('fr-FR');
    if (score > bestScore) {
      bestScore = score;
      try {
        localStorage.setItem(BEST_KEY, String(bestScore));
      } catch {}
    }
    bestEl.textContent = bestScore.toLocaleString('fr-FR');
  }
  setScore(0);

  // Web Audio Synth for arcade SFX
  let audioCtx = null;
  function beep(freq, dur, type, vol) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(freq || 440, now);
      gain.gain.setValueAtTime(vol || 0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (dur || 0.08));
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + (dur || 0.08) + 0.01);
    } catch {}
  }

  function sendRunToPlatform(victory) {
    const elapsed = Math.max(1, Math.round((performance.now() - startTime) / 1000));
    try {
      window.parent.postMessage(
        {
          source: 'euloge-arcade-game',
          version: 1,
          type: 'run-finished',
          payload: {
            score: Math.max(score, 50),
            timeElapsed: elapsed,
            victory: Boolean(victory),
            startLevel: 1,
            deaths: deaths,
          },
        },
        window.location.origin,
      );
      beep(880, 0.15, 'sine', 0.06);
    } catch {}
  }

  btnSubmit.addEventListener('click', function () {
    sendRunToPlatform(true);
  });

  // Input state
  const keys = {};
  const justPressed = {};
  function triggerKey(k, down) {
    if (down && !keys[k]) justPressed[k] = true;
    keys[k] = down;
    if (onKeyHook) onKeyHook(k, down);
  }
  window.addEventListener('keydown', function (e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'r' || e.key === 'R') {
      if (activeEngine && activeEngine.name !== 'WORDLE') {
        restartCurrent();
        return;
      }
    }
    triggerKey(e.key, true);
    triggerKey(e.code, true);
  });
  window.addEventListener('keyup', function (e) {
    triggerKey(e.key, false);
    triggerKey(e.code, false);
  });

  document.querySelectorAll('.pad-btn').forEach(function (btn) {
    const k = btn.getAttribute('data-key');
    const down = function (ev) {
      ev.preventDefault();
      triggerKey(k, true);
    };
    const up = function (ev) {
      ev.preventDefault();
      triggerKey(k, false);
    };
    btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseup', up);
    btn.addEventListener('mouseleave', up);
    btn.addEventListener('touchstart', down, {passive: false});
    btn.addEventListener('touchend', up, {passive: false});
  });

  let mouse = {x: 480, y: 280, down: false, clicked: false};
  function updateMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    if (!touch) return;
    mouse.x = ((touch.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((touch.clientY - rect.top) / rect.height) * canvas.height;
  }
  canvas.addEventListener('mousemove', updateMousePos);
  canvas.addEventListener('mousedown', function (e) {
    updateMousePos(e);
    mouse.down = true;
    mouse.clicked = true;
    canvas.focus();
  });
  window.addEventListener('mouseup', function () {
    mouse.down = false;
  });
  canvas.addEventListener(
    'touchstart',
    function (e) {
      updateMousePos(e);
      mouse.down = true;
      mouse.clicked = true;
    },
    {passive: true},
  );
  canvas.addEventListener('touchmove', updateMousePos, {passive: true});
  canvas.addEventListener('touchend', function () {
    mouse.down = false;
  });

  let onKeyHook = null;
  let activeEngine = null;

  // =========================================================================
  // ENGINE 1: 2048 HOLO-GRID
  // =========================================================================
  function create2048Engine() {
    modeEl.textContent = 'PUZZLE // 2048';
    let grid = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    let gameOver = false;

    function spawnTile() {
      const empty = [];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!grid[r][c]) empty.push([r, c]);
      if (!empty.length) return;
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    }

    function slideRow(row) {
      const arr = row.filter((x) => x > 0);
      const out = [];
      let gained = 0;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === arr[i + 1]) {
          const val = arr[i] * 2;
          out.push(val);
          gained += val;
          i++;
        } else {
          out.push(arr[i]);
        }
      }
      while (out.length < 4) out.push(0);
      return {row: out, gained};
    }

    function move(dir) {
      if (gameOver) return;
      const before = JSON.stringify(grid);
      let gainedTotal = 0;
      if (dir === 'left' || dir === 'right') {
        for (let r = 0; r < 4; r++) {
          const input = dir === 'right' ? [...grid[r]].reverse() : [...grid[r]];
          const res = slideRow(input);
          grid[r] = dir === 'right' ? res.row.reverse() : res.row;
          gainedTotal += res.gained;
        }
      } else {
        for (let c = 0; c < 4; c++) {
          const col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]];
          const input = dir === 'down' ? col.reverse() : col;
          const res = slideRow(input);
          const finalCol = dir === 'down' ? res.row.reverse() : res.row;
          for (let r = 0; r < 4; r++) grid[r][c] = finalCol[r];
          gainedTotal += res.gained;
        }
      }
      if (JSON.stringify(grid) !== before) {
        setScore(score + gainedTotal);
        spawnTile();
        beep(gainedTotal > 0 ? 520 : 300, 0.06, 'triangle', 0.04);
      }
    }

    return {
      name: '2048',
      init() {
        grid = [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ];
        gameOver = false;
        setScore(0);
        spawnTile();
        spawnTile();
        onKeyHook = function (k, down) {
          if (!down) return;
          if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'q' || k === 'Q') move('left');
          if (k === 'ArrowRight' || k === 'd' || k === 'D') move('right');
          if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'z' || k === 'Z') move('up');
          if (k === 'ArrowDown' || k === 's' || k === 'S') move('down');
        };
      },
      update() {},
      render() {
        ctx.fillStyle = '#070a18';
        ctx.fillRect(0, 0, 960, 560);
        ctx.fillStyle = '#9aa6cf';
        ctx.font = '600 14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Utilise les Flèches ou WASD / ZQSD pour fusionner les tuiles jusqu’à 2048', 480, 42);

        const size = 420;
        const x0 = (960 - size) / 2;
        const y0 = 70;
        ctx.fillStyle = '#111833';
        ctx.beginPath();
        ctx.roundRect(x0, y0, size, size, 16);
        ctx.fill();

        const cell = 90;
        const gap = 12;
        const colors = {
          0: '#1a2346',
          2: '#233266',
          4: '#2c4287',
          8: '#2f7bff',
          16: '#5c5cff',
          32: '#8b4dff',
          64: '#c43cff',
          128: '#00b8d9',
          256: '#10b981',
          512: '#f59e0b',
          1024: '#f43f5e',
          2048: '#38e1ff',
        };

        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const v = grid[r][c];
            const cx = x0 + gap + c * (cell + gap);
            const cy = y0 + gap + r * (cell + gap);
            ctx.fillStyle = colors[v] || '#38e1ff';
            ctx.beginPath();
            ctx.roundRect(cx, cy, cell, cell, 12);
            ctx.fill();
            if (v > 0) {
              ctx.fillStyle = '#ffffff';
              ctx.font = v >= 1000 ? '800 24px system-ui' : '800 30px system-ui';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(v), cx + cell / 2, cy + cell / 2);
            }
          }
        }
      },
    };
  }

  // =========================================================================
  // ENGINE 2: TETRIS HOLO-MATRIX
  // =========================================================================
  function createTetrisEngine() {
    modeEl.textContent = 'ARCADE // TETRIS MATRIX';
    const COLS = 10;
    const ROWS = 20;
    const SHAPES = [
      {c: '#38e1ff', m: [[1, 1, 1, 1]]},
      {c: '#fbbf24', m: [[1, 1], [1, 1]]},
      {c: '#a24dff', m: [[0, 1, 0], [1, 1, 1]]},
      {c: '#34d399', m: [[0, 1, 1], [1, 1, 0]]},
      {c: '#fb4c6e', m: [[1, 1, 0], [0, 1, 1]]},
      {c: '#2f7bff', m: [[1, 0, 0], [1, 1, 1]]},
      {c: '#f97316', m: [[0, 0, 1], [1, 1, 1]]},
    ];
    let board = [];
    let cur = null;
    let dropTimer = 0;
    let lines = 0;

    function newPiece() {
      const s = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      return {c: s.c, m: s.m.map((r) => [...r]), x: 3, y: 0};
    }

    function collides(p, dx, dy, mat) {
      const m = mat || p.m;
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (!m[r][c]) continue;
          const nx = p.x + c + dx;
          const ny = p.y + r + dy;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && board[ny][nx]) return true;
        }
      }
      return false;
    }

    function merge() {
      for (let r = 0; r < cur.m.length; r++) {
        for (let c = 0; c < cur.m[r].length; c++) {
          if (cur.m[r][c] && cur.y + r >= 0) {
            board[cur.y + r][cur.x + c] = cur.c;
          }
        }
      }
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every((cell) => cell !== 0)) {
          board.splice(r, 1);
          board.unshift(Array(COLS).fill(0));
          cleared++;
          r++;
        }
      }
      if (cleared > 0) {
        lines += cleared;
        setScore(score + cleared * cleared * 150);
        beep(660, 0.12, 'sine', 0.06);
      } else {
        setScore(score + 15);
        beep(240, 0.04, 'triangle', 0.03);
      }
      cur = newPiece();
      if (collides(cur, 0, 0)) {
        deaths++;
        sendRunToPlatform(false);
        board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
      }
    }

    function rotate() {
      const m = cur.m;
      const rot = m[0].map((_, idx) => m.map((row) => row[idx]).reverse());
      if (!collides(cur, 0, 0, rot)) {
        cur.m = rot;
        beep(420, 0.04, 'triangle', 0.03);
      }
    }

    return {
      name: 'TETRIS',
      init() {
        board = Array.from({length: ROWS}, () => Array(COLS).fill(0));
        lines = 0;
        setScore(0);
        cur = newPiece();
        onKeyHook = function (k, down) {
          if (!down || !cur) return;
          if ((k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'q') && !collides(cur, -1, 0)) cur.x--;
          if ((k === 'ArrowRight' || k === 'd' || k === 'D') && !collides(cur, 1, 0)) cur.x++;
          if ((k === 'ArrowDown' || k === 's' || k === 'S') && !collides(cur, 0, 1)) cur.y++;
          if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'z') rotate();
          if (k === ' ') {
            while (!collides(cur, 0, 1)) cur.y++;
            merge();
          }
        };
      },
      update(dt) {
        dropTimer += dt;
        const speed = Math.max(0.14, 0.55 - Math.floor(lines / 5) * 0.05);
        if (dropTimer >= speed) {
          dropTimer = 0;
          if (!collides(cur, 0, 1)) cur.y++;
          else merge();
        }
      },
      render() {
        ctx.fillStyle = '#070a18';
        ctx.fillRect(0, 0, 960, 560);
        const cell = 24;
        const x0 = (960 - COLS * cell) / 2;
        const y0 = 40;

        ctx.fillStyle = '#0f162e';
        ctx.fillRect(x0 - 4, y0 - 4, COLS * cell + 8, ROWS * cell + 8);
        ctx.strokeStyle = 'rgba(56,225,255,0.35)';
        ctx.strokeRect(x0 - 4, y0 - 4, COLS * cell + 8, ROWS * cell + 8);

        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const val = board[r][c];
            ctx.fillStyle = val || 'rgba(255,255,255,0.03)';
            ctx.fillRect(x0 + c * cell + 1, y0 + r * cell + 1, cell - 2, cell - 2);
          }
        }

        if (cur) {
          ctx.fillStyle = cur.c;
          for (let r = 0; r < cur.m.length; r++) {
            for (let c = 0; c < cur.m[r].length; c++) {
              if (cur.m[r][c]) {
                ctx.fillRect(x0 + (cur.x + c) * cell + 1, y0 + (cur.y + r) * cell + 1, cell - 2, cell - 2);
              }
            }
          }
        }

        ctx.fillStyle = '#eef2ff';
        ctx.font = '700 15px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText('LIGNES : ' + lines, x0 + COLS * cell + 30, y0 + 40);
        ctx.fillStyle = '#9aa6cf';
        ctx.font = '500 13px system-ui';
        ctx.fillText('←/→ : Déplacer', x0 + COLS * cell + 30, y0 + 80);
        ctx.fillText('↑ : Tourner', x0 + COLS * cell + 30, y0 + 105);
        ctx.fillText('Espace : Chute rapide', x0 + COLS * cell + 30, y0 + 130);
      },
    };
  }

  // =========================================================================
  // ENGINE 3: CHESS VS AI (Lichess / Board)
  // =========================================================================
  function createChessEngine() {
    modeEl.textContent = 'ÉCHECS // ARÈNE TACTIQUE IA';
    const SYMBOLS = {
      P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
      p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
    };
    const VALUES = {p: 100, n: 300, b: 320, r: 500, q: 900, k: 10000};
    let board = [];
    let selected = null;
    let statusMsg = 'Ton tour (Blancs) — clique une pièce puis une case.';

    function resetBoard() {
      board = [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
      ];
      selected = null;
      statusMsg = 'Ton tour (Blancs) — clique une pièce puis une case.';
    }

    function isWhite(p) {
      return p && p === p.toUpperCase();
    }
    function isBlack(p) {
      return p && p === p.toLowerCase();
    }

    function getMoves(r, c) {
      const p = board[r][c];
      if (!p) return [];
      const white = isWhite(p);
      const type = p.toLowerCase();
      const moves = [];
      const add = (nr, nc) => {
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) return false;
        const t = board[nr][nc];
        if (!t) {
          moves.push([nr, nc]);
          return true;
        }
        if (white ? isBlack(t) : isWhite(t)) {
          moves.push([nr, nc]);
        }
        return false;
      };

      if (type === 'p') {
        const dir = white ? -1 : 1;
        if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
          moves.push([r + dir, c]);
          if ((white && r === 6) || (!white && r === 1)) {
            if (!board[r + dir * 2][c]) moves.push([r + dir * 2, c]);
          }
        }
        for (const dc of [-1, 1]) {
          const nr = r + dir;
          const nc = c + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc]) {
            if (white ? isBlack(board[nr][nc]) : isWhite(board[nr][nc])) moves.push([nr, nc]);
          }
        }
      } else if (type === 'n') {
        for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(r + dr, c + dc);
      } else if (type === 'k') {
        for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) add(r + dr, c + dc);
      } else {
        const dirs = [];
        if (type === 'r' || type === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
        if (type === 'b' || type === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
        for (const [dr, dc] of dirs) {
          for (let step = 1; step < 8; step++) {
            if (!add(r + dr * step, c + dc * step)) break;
          }
        }
      }
      return moves;
    }

    function aiTurn() {
      const allMoves = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (isBlack(board[r][c])) {
            for (const [nr, nc] of getMoves(r, c)) {
              const target = board[nr][nc];
              const gain = target ? VALUES[target.toLowerCase()] || 100 : (nr - r) * 5;
              allMoves.push({r, c, nr, nc, gain: gain + Math.random() * 15});
            }
          }
        }
      }
      if (!allMoves.length) {
        statusMsg = 'Victoire ! Échec et mat contre l’IA !';
        setScore(score + 1500);
        sendRunToPlatform(true);
        return;
      }
      allMoves.sort((a, b) => b.gain - a.gain);
      const m = allMoves[0];
      board[m.nr][m.nc] = board[m.r][m.c];
      if (board[m.nr][m.nc] === 'p' && m.nr === 7) board[m.nr][m.nc] = 'q';
      board[m.r][m.c] = '';
      statusMsg = 'Ton tour (Blancs) — joue ton prochain coup.';
    }

    return {
      name: 'CHESS',
      init() {
        resetBoard();
        setScore(0);
        onKeyHook = null;
      },
      update() {
        if (!mouse.clicked) return;
        mouse.clicked = false;
        const size = 440;
        const x0 = (960 - size) / 2;
        const y0 = 64;
        const cell = size / 8;
        const c = Math.floor((mouse.x - x0) / cell);
        const r = Math.floor((mouse.y - y0) / cell);
        if (r < 0 || r >= 8 || c < 0 || c >= 8) return;

        if (selected) {
          const legal = getMoves(selected[0], selected[1]);
          const found = legal.find(([mr, mc]) => mr === r && mc === c);
          if (found) {
            const target = board[r][c];
            if (target) setScore(score + (VALUES[target.toLowerCase()] || 100));
            else setScore(score + 10);
            board[r][c] = board[selected[0]][selected[1]];
            if (board[r][c] === 'P' && r === 0) board[r][c] = 'Q';
            board[selected[0]][selected[1]] = '';
            selected = null;
            beep(500, 0.06, 'sine', 0.05);
            if (target === 'k') {
              statusMsg = 'Roi adverse capturé ! Victoire !';
              setScore(score + 2000);
              sendRunToPlatform(true);
              resetBoard();
              return;
            }
            statusMsg = 'L’IA réfléchit…';
            setTimeout(aiTurn, 240);
            return;
          }
        }
        if (isWhite(board[r][c])) {
          selected = [r, c];
          beep(340, 0.04, 'triangle', 0.03);
        } else {
          selected = null;
        }
      },
      render() {
        ctx.fillStyle = '#070a18';
        ctx.fillRect(0, 0, 960, 560);
        ctx.fillStyle = '#38e1ff';
        ctx.font = '700 15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(statusMsg, 480, 38);

        const size = 440;
        const x0 = (960 - size) / 2;
        const y0 = 64;
        const cell = size / 8;
        const legal = selected ? getMoves(selected[0], selected[1]) : [];

        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const light = (r + c) % 2 === 0;
            ctx.fillStyle = light ? '#26335e' : '#121936';
            if (selected && selected[0] === r && selected[1] === c) ctx.fillStyle = '#2f7bff';
            ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);

            if (legal.some(([mr, mc]) => mr === r && mc === c)) {
              ctx.fillStyle = 'rgba(56, 225, 255, 0.38)';
              ctx.beginPath();
              ctx.arc(x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell, 10, 0, Math.PI * 2);
              ctx.fill();
            }

            const p = board[r][c];
            if (p) {
              ctx.fillStyle = isWhite(p) ? '#ffffff' : '#fbbf24';
              ctx.font = '40px serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(SYMBOLS[p] || p, x0 + (c + 0.5) * cell, y0 + (r + 0.52) * cell);
            }
          }
        }
      },
    };
  }

  // =========================================================================
  // ENGINE 4: 3D RAYCASTER FPS & ZOMBIES ARENA
  // =========================================================================
  function createRaycasterFpsEngine(isZombies) {
    modeEl.textContent = isZombies ? 'SURVIE 3D // HORDE ZOMBIES' : 'FPS 3D // ARÈNE RAYCASTER';
    const MAP = [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
      [1,0,2,2,0,0,1,0,0,3,3,0,0,2,0,1],
      [1,0,2,0,0,0,0,0,0,0,3,0,0,2,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,1,1,0,0,0,1,1,0,0,0,0,1],
      [1,0,0,0,1,0,0,0,0,0,1,0,0,3,0,1],
      [1,0,2,0,0,0,0,0,0,0,0,0,0,3,0,1],
      [1,0,2,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,1],
      [1,0,0,0,1,1,0,0,0,1,1,0,0,2,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,2,0,1],
      [1,0,3,0,0,0,0,0,0,0,2,2,0,0,0,1],
      [1,0,3,3,0,0,1,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ];

    let px = 2.5, py = 2.5, pa = 0;
    let hp = 100;
    let wave = 1;
    let recoil = 0;
    let flash = 0;
    let enemies = [];

    function spawnWave() {
      enemies = [];
      const count = 4 + wave * 2;
      for (let i = 0; i < count; i++) {
        let ex = 8, ey = 8;
        for (let tries = 0; tries < 30; tries++) {
          const rx = 1.5 + Math.random() * 13;
          const ry = 1.5 + Math.random() * 13;
          if (MAP[Math.floor(ry)][Math.floor(rx)] === 0 && Math.hypot(rx - px, ry - py) > 3.5) {
            ex = rx;
            ey = ry;
            break;
          }
        }
        enemies.push({x: ex, y: ey, hp: isZombies ? 2 + Math.floor(wave / 2) : 2, hit: 0});
      }
    }

    function shoot() {
      recoil = 14;
      flash = 1;
      beep(190, 0.09, 'sawtooth', 0.06);
      // Find closest enemy near center crosshair
      let best = null;
      let bestDist = 99;
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - px;
        const dy = e.y - py;
        const dist = Math.hypot(dx, dy);
        let ang = Math.atan2(dy, dx) - pa;
        while (ang < -Math.PI) ang += Math.PI * 2;
        while (ang > Math.PI) ang -= Math.PI * 2;
        if (Math.abs(ang) < 0.22 && dist < bestDist) {
          best = e;
          bestDist = dist;
        }
      }
      if (best) {
        best.hp--;
        best.hit = 1;
        if (best.hp <= 0) {
          setScore(score + (isZombies ? 150 : 200));
          beep(620, 0.1, 'sine', 0.05);
          if (enemies.every((e) => e.hp <= 0)) {
            wave++;
            hp = Math.min(100, hp + 25);
            setScore(score + 500);
            spawnWave();
          }
        } else {
          setScore(score + 35);
        }
      }
    }

    return {
      name: 'FPS3D',
      init() {
        px = 2.5;
        py = 2.5;
        pa = 0.4;
        hp = 100;
        wave = 1;
        setScore(0);
        spawnWave();
        onKeyHook = function (k, down) {
          if (down && (k === ' ' || k === 'j' || k === 'J' || k === 'f' || k === 'F')) shoot();
        };
      },
      update(dt) {
        if (mouse.clicked) {
          mouse.clicked = false;
          shoot();
        }
        recoil = Math.max(0, recoil - dt * 60);
        flash = Math.max(0, flash - dt * 10);

        const rotSpeed = 2.4 * dt;
        const moveSpeed = 3.4 * dt;
        if (keys['ArrowLeft'] || keys['q'] || keys['Q']) pa -= rotSpeed;
        if (keys['ArrowRight'] || keys['e'] || keys['E']) pa += rotSpeed;

        let vx = 0, vy = 0;
        if (keys['ArrowUp'] || keys['w'] || keys['W'] || keys['z'] || keys['Z']) {
          vx += Math.cos(pa) * moveSpeed;
          vy += Math.sin(pa) * moveSpeed;
        }
        if (keys['ArrowDown'] || keys['s'] || keys['S']) {
          vx -= Math.cos(pa) * moveSpeed;
          vy -= Math.sin(pa) * moveSpeed;
        }
        if (keys['a'] || keys['A']) {
          vx += Math.cos(pa - Math.PI / 2) * moveSpeed;
          vy += Math.sin(pa - Math.PI / 2) * moveSpeed;
        }
        if (keys['d'] || keys['D']) {
          vx += Math.cos(pa + Math.PI / 2) * moveSpeed;
          vy += Math.sin(pa + Math.PI / 2) * moveSpeed;
        }

        if (MAP[Math.floor(py)][Math.floor(px + vx * 2)] === 0) px += vx;
        if (MAP[Math.floor(py + vy * 2)][Math.floor(px)] === 0) py += vy;

        for (const e of enemies) {
          if (e.hp <= 0) continue;
          e.hit = Math.max(0, e.hit - dt * 5);
          const dx = px - e.x;
          const dy = py - e.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.65) {
            const spd = (isZombies ? 1.15 : 1.35) * dt;
            const nx = e.x + (dx / dist) * spd;
            const ny = e.y + (dy / dist) * spd;
            if (MAP[Math.floor(e.y)][Math.floor(nx)] === 0) e.x = nx;
            if (MAP[Math.floor(ny)][Math.floor(e.x)] === 0) e.y = ny;
          } else {
            hp -= dt * 22;
            if (hp <= 0) {
              deaths++;
              sendRunToPlatform(false);
              this.init();
              return;
            }
          }
        }
      },
      render() {
        // Sky / Ceiling
        const ceilGrad = ctx.createLinearGradient(0, 0, 0, 280);
        ceilGrad.addColorStop(0, isZombies ? '#17081c' : '#060c24');
        ceilGrad.addColorStop(1, '#111a3a');
        ctx.fillStyle = ceilGrad;
        ctx.fillRect(0, 0, 960, 280);

        // Floor
        const floorGrad = ctx.createLinearGradient(0, 280, 0, 560);
        floorGrad.addColorStop(0, '#090d1d');
        floorGrad.addColorStop(1, isZombies ? '#1f1124' : '#122244');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, 280, 960, 280);

        const NUM_RAYS = 160;
        const FOV = Math.PI / 3;
        const zBuffer = new Array(NUM_RAYS).fill(99);
        const stripW = 960 / NUM_RAYS;

        for (let i = 0; i < NUM_RAYS; i++) {
          const rayAngle = pa - FOV / 2 + (i / NUM_RAYS) * FOV;
          const cos = Math.cos(rayAngle);
          const sin = Math.sin(rayAngle);
          let dist = 0;
          let hitWall = 1;
          while (dist < 18) {
            dist += 0.04;
            const tx = Math.floor(px + cos * dist);
            const ty = Math.floor(py + sin * dist);
            if (ty < 0 || ty >= 16 || tx < 0 || tx >= 16 || MAP[ty][tx] > 0) {
              hitWall = MAP[ty]?.[tx] || 1;
              break;
            }
          }
          const perp = dist * Math.cos(rayAngle - pa);
          zBuffer[i] = perp;
          const h = Math.min(560, 420 / Math.max(0.2, perp));
          const shade = Math.max(0.18, 1 - perp / 14);
          if (hitWall === 2) ctx.fillStyle = `rgba(47, 123, 255, ${shade})`;
          else if (hitWall === 3) ctx.fillStyle = `rgba(162, 77, 255, ${shade})`;
          else ctx.fillStyle = `rgba(38, 56, 104, ${shade})`;
          ctx.fillRect(i * stripW, 280 - h / 2, stripW + 1, h);
        }

        // Sprites (enemies sorted back-to-front)
        const visible = enemies
          .filter((e) => e.hp > 0)
          .map((e) => ({e, dist: Math.hypot(e.x - px, e.y - py)}))
          .sort((a, b) => b.dist - a.dist);

        for (const {e, dist} of visible) {
          let ang = Math.atan2(e.y - py, e.x - px) - pa;
          while (ang < -Math.PI) ang += Math.PI * 2;
          while (ang > Math.PI) ang -= Math.PI * 2;
          if (Math.abs(ang) > FOV * 0.75) continue;

          const sx = 480 + (ang / (FOV / 2)) * 480;
          const size = Math.min(360, 320 / Math.max(0.4, dist));
          const rayIdx = Math.floor(sx / stripW);
          if (rayIdx >= 0 && rayIdx < NUM_RAYS && zBuffer[rayIdx] < dist) continue;

          ctx.fillStyle = e.hit > 0 ? '#ffffff' : isZombies ? '#34d399' : '#fb4c6e';
          ctx.beginPath();
          ctx.roundRect(sx - size * 0.28, 280 - size * 0.45, size * 0.56, size * 0.9, 10);
          ctx.fill();

          // Glowing visor / eyes
          ctx.fillStyle = '#38e1ff';
          ctx.fillRect(sx - size * 0.16, 280 - size * 0.3, size * 0.32, size * 0.1);
        }

        // Crosshair
        ctx.strokeStyle = '#38e1ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(480, 280, 10, 0, Math.PI * 2);
        ctx.moveTo(464, 280);
        ctx.lineTo(496, 280);
        ctx.moveTo(480, 264);
        ctx.lineTo(480, 296);
        ctx.stroke();

        // Weapon Viewmodel
        const wy = 460 + recoil;
        if (flash > 0) {
          ctx.fillStyle = 'rgba(56, 225, 255, 0.65)';
          ctx.beginPath();
          ctx.arc(480, wy - 35, 36 * flash, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(450, wy - 20, 60, 130, 8);
        ctx.fill();
        ctx.fillStyle = '#38e1ff';
        ctx.fillRect(472, wy - 15, 16, 65);

        // HUD Overlay
        ctx.fillStyle = 'rgba(6, 8, 19, 0.78)';
        ctx.fillRect(16, 16, 250, 66);
        ctx.fillStyle = '#eef2ff';
        ctx.font = '800 14px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(`VAGUE ${wave} · ENNEMIS : ${enemies.filter((e) => e.hp > 0).length}`, 28, 38);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(28, 50, 200, 12);
        ctx.fillStyle = hp > 35 ? '#34d399' : '#fb4c6e';
        ctx.fillRect(28, 50, Math.max(0, hp * 2), 12);
      },
    };
  }

  // =========================================================================
  // ENGINE 5: ANIME KI FIGHTER (Budokai Tenkaichi 3)
  // =========================================================================
  function createFighterEngine() {
    modeEl.textContent = 'COMBAT 2.5D // TOURNOI KI';
    let p1 = {x: 240, y: 380, vy: 0, hp: 100, ki: 60, beam: 0};
    let ai = {x: 720, y: 380, vy: 0, hp: 100, ki: 50, cd: 0};
    let round = 1;
    let blasts = [];

    return {
      name: 'FIGHTER',
      init() {
        p1 = {x: 240, y: 380, vy: 0, hp: 100, ki: 60, beam: 0};
        ai = {x: 720, y: 380, vy: 0, hp: 100, ki: 50, cd: 0};
        blasts = [];
        setScore(0);
        onKeyHook = function (k, down) {
          if (!down) return;
          if ((k === 'ArrowUp' || k === 'w' || k === 'W') && p1.y >= 375) p1.vy = -480;
          if (k === ' ' || k === 'j' || k === 'J') {
            if (Math.abs(p1.x - ai.x) < 95 && Math.abs(p1.y - ai.y) < 80) {
              ai.hp -= 12;
              p1.ki = Math.min(100, p1.ki + 12);
              setScore(score + 120);
              beep(520, 0.07, 'square', 0.05);
            } else if (p1.ki >= 15) {
              p1.ki -= 15;
              blasts.push({x: p1.x + 30, y: p1.y - 30, vx: p1.x < ai.x ? 540 : -540, owner: 'p1'});
              beep(680, 0.08, 'sawtooth', 0.05);
            }
          }
          if ((k === 'k' || k === 'K' || k === 'Shift') && p1.ki >= 45) {
            p1.ki -= 45;
            p1.beam = 0.45;
            if (Math.abs(p1.y - ai.y) < 90) {
              ai.hp -= 28;
              setScore(score + 350);
            }
            beep(220, 0.25, 'sawtooth', 0.07);
          }
        };
      },
      update(dt) {
        if (mouse.clicked) {
          mouse.clicked = false;
          triggerKey(' ', true);
          triggerKey(' ', false);
        }
        const spd = 280 * dt;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) p1.x = Math.max(60, p1.x - spd);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) p1.x = Math.min(900, p1.x + spd);
        if (keys['c'] || keys['C']) p1.ki = Math.min(100, p1.ki + dt * 45);
        p1.ki = Math.min(100, p1.ki + dt * 8);
        p1.beam = Math.max(0, p1.beam - dt);

        p1.y += p1.vy * dt;
        p1.vy += 980 * dt;
        if (p1.y > 380) {
          p1.y = 380;
          p1.vy = 0;
        }

        // AI Fighter
        const dx = p1.x - ai.x;
        if (Math.abs(dx) > 80) ai.x += Math.sign(dx) * 190 * dt;
        ai.cd -= dt;
        if (ai.cd <= 0) {
          ai.cd = 0.85;
          if (Math.abs(dx) < 95) {
            p1.hp -= 8;
          } else {
            blasts.push({x: ai.x - 20, y: ai.y - 30, vx: dx < 0 ? -420 : 420, owner: 'ai'});
          }
        }

        for (let i = blasts.length - 1; i >= 0; i--) {
          const b = blasts[i];
          b.x += b.vx * dt;
          if (b.owner === 'p1' && Math.abs(b.x - ai.x) < 35 && Math.abs(b.y - (ai.y - 30)) < 45) {
            ai.hp -= 10;
            setScore(score + 90);
            blasts.splice(i, 1);
            continue;
          }
          if (b.owner === 'ai' && Math.abs(b.x - p1.x) < 35 && Math.abs(b.y - (p1.y - 30)) < 45) {
            p1.hp -= 8;
            blasts.splice(i, 1);
            continue;
          }
          if (b.x < 0 || b.x > 960) blasts.splice(i, 1);
        }

        if (ai.hp <= 0) {
          round++;
          setScore(score + 1000);
          sendRunToPlatform(true);
          ai.hp = 100 + round * 20;
          p1.hp = Math.min(100, p1.hp + 40);
        }
        if (p1.hp <= 0) {
          deaths++;
          sendRunToPlatform(false);
          this.init();
        }
      },
      render() {
        const bg = ctx.createLinearGradient(0, 0, 0, 560);
        bg.addColorStop(0, '#100a28');
        bg.addColorStop(1, '#071426');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 960, 560);

        // Arena Floor
        ctx.fillStyle = '#172554';
        ctx.fillRect(0, 420, 960, 140);

        // Health & Ki bars
        ctx.fillStyle = '#34d399';
        ctx.fillRect(40, 28, Math.max(0, p1.hp * 3), 16);
        ctx.fillStyle = '#38e1ff';
        ctx.fillRect(40, 50, Math.max(0, p1.ki * 3), 10);

        ctx.fillStyle = '#fb4c6e';
        ctx.fillRect(920 - Math.max(0, ai.hp * 3), 28, Math.max(0, ai.hp * 3), 16);

        ctx.fillStyle = '#eef2ff';
        ctx.font = '800 16px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('ROUND ' + round + '  —  Espace/J: Attaque Ki · K/Shift: Kamehameha', 480, 42);

        // Kamehameha Beam
        if (p1.beam > 0) {
          ctx.fillStyle = 'rgba(56, 225, 255, 0.85)';
          ctx.fillRect(p1.x + 20, p1.y - 52, 960, 36);
        }

        // Fighters
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.roundRect(p1.x - 24, p1.y - 76, 48, 76, 12);
        ctx.fill();

        ctx.fillStyle = '#a24dff';
        ctx.beginPath();
        ctx.roundRect(ai.x - 24, ai.y - 76, 48, 76, 12);
        ctx.fill();

        for (const b of blasts) {
          ctx.fillStyle = b.owner === 'p1' ? '#38e1ff' : '#fb4c6e';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    };
  }

  // =========================================================================
  // ENGINE 6: WORDLE CYBER-DECRYPT
  // =========================================================================
  function createWordleEngine() {
    modeEl.textContent = 'LETTRES // CYBER-WORDLE';
    const WORDS = ['LASER', 'CYBER', 'SCORE', 'PIXEL', 'ROBOT', ' MONDE', 'ARENE', 'TURBO', 'FORCE', 'PRISM'].map((w) =>
      w.trim(),
    );
    let target = WORDS[0];
    let guesses = [];
    let current = '';
    let msg = 'Devine le mot de 5 lettres (tape au clavier puis Entrée)';

    function submitGuess() {
      if (current.length !== 5) return;
      guesses.push(current);
      if (current === target) {
        setScore(score + 500 + (6 - guesses.length) * 150);
        msg = 'Bravo ! Mot décrypté : ' + target + ' ! Nouveau mot prêt.';
        sendRunToPlatform(true);
        setTimeout(() => {
          target = WORDS[Math.floor(Math.random() * WORDS.length)];
          guesses = [];
          current = '';
        }, 1200);
      } else if (guesses.length >= 6) {
        msg = 'Mot mystère : ' + target + '. Nouvelle manche !';
        setTimeout(() => {
          target = WORDS[Math.floor(Math.random() * WORDS.length)];
          guesses = [];
          current = '';
        }, 1200);
      } else {
        setScore(score + 40);
      }
      current = '';
    }

    return {
      name: 'WORDLE',
      init() {
        target = WORDS[Math.floor(Math.random() * WORDS.length)];
        guesses = [];
        current = '';
        setScore(0);
        onKeyHook = function (k, down) {
          if (!down) return;
          if (k === 'Backspace') current = current.slice(0, -1);
          else if (k === 'Enter') submitGuess();
          else if (/^[a-zA-Z]$/.test(k) && current.length < 5) {
            current += k.toUpperCase();
            beep(420, 0.03, 'triangle', 0.03);
          }
        };
      },
      update() {},
      render() {
        ctx.fillStyle = '#070a18';
        ctx.fillRect(0, 0, 960, 560);
        ctx.fillStyle = '#38e1ff';
        ctx.font = '700 15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(msg, 480, 42);

        const cell = 58;
        const gap = 10;
        const x0 = (960 - (5 * cell + 4 * gap)) / 2;
        const y0 = 72;

        for (let r = 0; r < 6; r++) {
          const word = r < guesses.length ? guesses[r] : r === guesses.length ? current : '';
          for (let c = 0; c < 5; c++) {
            const ch = word[c] || '';
            let bg = '#131b38';
            if (r < guesses.length) {
              if (target[c] === ch) bg = '#10b981';
              else if (target.includes(ch)) bg = '#f59e0b';
              else bg = '#1e293b';
            }
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.roundRect(x0 + c * (cell + gap), y0 + r * (cell + gap), cell, cell, 10);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
            ctx.stroke();

            if (ch) {
              ctx.fillStyle = '#ffffff';
              ctx.font = '800 26px system-ui';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(ch, x0 + c * (cell + gap) + cell / 2, y0 + r * (cell + gap) + cell / 2);
            }
          }
        }
      },
    };
  }

  // =========================================================================
  // ENGINE 7: UNIVERSAL NEON ARENA (Action / Sports / Racing / Arcade)
  // =========================================================================
  function createArenaActionEngine() {
    modeEl.textContent = 'ACTION // HOLO-ARÈNE';
    let player = {x: 480, y: 280, r: 16, hp: 100};
    let orbs = [];
    let foes = [];
    let bullets = [];
    let fireCd = 0;

    function spawnOrb() {
      orbs.push({x: 60 + Math.random() * 840, y: 60 + Math.random() * 440, r: 9});
    }
    function spawnFoe() {
      const side = Math.floor(Math.random() * 4);
      const x = side === 0 ? 20 : side === 1 ? 940 : Math.random() * 960;
      const y = side === 2 ? 20 : side === 3 ? 540 : Math.random() * 560;
      foes.push({x, y, r: 15, hp: 2});
    }

    return {
      name: 'ARENA',
      init() {
        player = {x: 480, y: 280, r: 16, hp: 100};
        orbs = [];
        foes = [];
        bullets = [];
        setScore(0);
        for (let i = 0; i < 8; i++) spawnOrb();
        for (let i = 0; i < 4; i++) spawnFoe();
        onKeyHook = null;
      },
      update(dt) {
        const spd = 290 * dt;
        if (keys['ArrowLeft'] || keys['a'] || keys['A'] || keys['q']) player.x = Math.max(24, player.x - spd);
        if (keys['ArrowRight'] || keys['d'] || keys['D']) player.x = Math.min(936, player.x + spd);
        if (keys['ArrowUp'] || keys['w'] || keys['W'] || keys['z']) player.y = Math.max(24, player.y - spd);
        if (keys['ArrowDown'] || keys['s'] || keys['S']) player.y = Math.min(536, player.y + spd);

        fireCd -= dt;
        if ((mouse.down || keys[' '] || keys['j'] || keys['J']) && fireCd <= 0) {
          fireCd = 0.16;
          const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
          bullets.push({x: player.x, y: player.y, vx: Math.cos(ang) * 560, vy: Math.sin(ang) * 560});
          beep(540, 0.04, 'triangle', 0.03);
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x < 0 || b.x > 960 || b.y < 0 || b.y > 560) {
            bullets.splice(i, 1);
            continue;
          }
          for (let j = foes.length - 1; j >= 0; j--) {
            const f = foes[j];
            if (Math.hypot(b.x - f.x, b.y - f.y) < f.r + 6) {
              f.hp--;
              bullets.splice(i, 1);
              if (f.hp <= 0) {
                foes.splice(j, 1);
                setScore(score + 120);
                spawnFoe();
              }
              break;
            }
          }
        }

        for (let i = orbs.length - 1; i >= 0; i--) {
          if (Math.hypot(player.x - orbs[i].x, player.y - orbs[i].y) < player.r + orbs[i].r) {
            orbs.splice(i, 1);
            setScore(score + 50);
            beep(720, 0.06, 'sine', 0.04);
            spawnOrb();
          }
        }

        for (const f of foes) {
          const ang = Math.atan2(player.y - f.y, player.x - f.x);
          f.x += Math.cos(ang) * 115 * dt;
          f.y += Math.sin(ang) * 115 * dt;
          if (Math.hypot(player.x - f.x, player.y - f.y) < player.r + f.r) {
            player.hp -= 35 * dt;
            if (player.hp <= 0) {
              deaths++;
              sendRunToPlatform(false);
              this.init();
              return;
            }
          }
        }
      },
      render() {
        ctx.fillStyle = '#070a18';
        ctx.fillRect(0, 0, 960, 560);

        // Grid lines
        ctx.strokeStyle = 'rgba(56, 225, 255, 0.07)';
        for (let x = 0; x < 960; x += 48) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 560);
          ctx.stroke();
        }
        for (let y = 0; y < 560; y += 48) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(960, y);
          ctx.stroke();
        }

        for (const o of orbs) {
          ctx.fillStyle = '#34d399';
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const b of bullets) {
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const f of foes) {
          ctx.fillStyle = '#fb4c6e';
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = '#38e1ff';
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
        ctx.fill();
      },
    };
  }

  // Pick engine based on slug
  function selectEngineForSlug(s) {
    if (s === '2048') return create2048Engine();
    if (s === 'tetris' || s === 'hextris') return createTetrisEngine();
    if (s === 'wordle') return createWordleEngine();
    if (s === 'lichess' || s === 'lichess-daily-puzzle') return createChessEngine();
    if (s === 'budokai-tenkaichi-3-web-online') return createFighterEngine();
    if (
      s.includes('zombies') ||
      s.includes('kino') ||
      s.includes('cheese-cube') ||
      s.includes('vibe-slops')
    ) {
      return createRaycasterFpsEngine(true);
    }
    if (
      s.includes('quake') ||
      s.includes('krunker') ||
      s.includes('halo') ||
      s.includes('half-life') ||
      s.includes('webxash') ||
      s.includes('wolfenstein') ||
      s.includes('urban-terror') ||
      s.includes('shell-shockers') ||
      s === 'surfd'
    ) {
      return createRaycasterFpsEngine(false);
    }
    return createArenaActionEngine();
  }

  function restartCurrent() {
    domLayer.style.display = 'none';
    canvas.style.display = 'block';
    startTime = performance.now();
    activeEngine = selectEngineForSlug(slug);
    activeEngine.init();
    canvas.focus();
  }

  btnRestart.addEventListener('click', restartCurrent);
  restartCurrent();

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (activeEngine) {
      activeEngine.update(dt);
      activeEngine.render();
    }
    for (const k of Object.keys(justPressed)) delete justPressed[k];
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

