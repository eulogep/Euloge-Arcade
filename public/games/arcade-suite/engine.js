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

  // =========================================================================
  // ENGINE: BILLARD CYBER 8 (8-ball pool vs IA)
  // =========================================================================
  function createPoolEngine() {
    modeEl.textContent = 'BILLARD // 8-BALL';
    const R = 11;
    const T = {x0: 90, y0: 80, x1: 870, y1: 480};
    const PR = 21; // pocket radius
    const POCKETS = [
      {x: T.x0, y: T.y0}, {x: (T.x0 + T.x1) / 2, y: T.y0 - 4}, {x: T.x1, y: T.y0},
      {x: T.x0, y: T.y1}, {x: (T.x0 + T.x1) / 2, y: T.y1 + 4}, {x: T.x1, y: T.y1},
    ];
    const BALL_COLORS = ['#f8fafc', '#facc15', '#2563eb', '#ef4444', '#7c3aed', '#f97316', '#16a34a', '#9f1239', '#0b0b0f'];
    const HEAD = {x: T.x0 + (T.x1 - T.x0) * 0.25, y: (T.y0 + T.y1) / 2};
    let balls = [];
    let turn = 'player'; // 'player' | 'ai'
    let groups = {player: null, ai: null}; // 'solids' | 'stripes'
    let aimAngle = 0;
    let charging = false;
    let power = 0;
    let powerDir = 1;
    let moving = false;
    let shot = null; // {shooter, firstHit, potted: []}
    let message = '';
    let messageT = 0;
    let gameOver = null; // {victory}
    let aiTimer = 0;
    let prevMouseDown = false;
    let prevSpace = false;

    const groupOf = (n) => (n === 8 ? 'eight' : n === 0 ? 'cue' : n < 8 ? 'solids' : 'stripes');
    const groupLabel = (g) => (g === 'solids' ? 'Pleines (1–7)' : g === 'stripes' ? 'Rayées (9–15)' : 'à définir');
    const cue = () => balls.find((b) => b.n === 0);
    const onTable = (n) => balls.some((b) => b.n === n && !b.potted);
    function remaining(g) {
      return balls.filter((b) => !b.potted && groupOf(b.n) === g).length;
    }
    function say(text) {
      message = text;
      messageT = 2.6;
    }

    function rack() {
      balls = [{n: 0, x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, potted: false}];
      const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
      // Keep the 8 in the center (row 3, middle) and mix the rest.
      const others = order.filter((n) => n !== 8).sort(() => Math.random() - 0.5);
      const apex = {x: T.x0 + (T.x1 - T.x0) * 0.72, y: HEAD.y};
      let k = 0;
      for (let row = 0; row < 5; row++) {
        for (let i = 0; i <= row; i++) {
          const n = row === 2 && i === 1 ? 8 : others[k++];
          balls.push({
            n,
            x: apex.x + row * (R * 2 * 0.87 + 0.6),
            y: apex.y + (i - row / 2) * (R * 2 + 0.6),
            vx: 0,
            vy: 0,
            potted: false,
          });
        }
      }
    }

    function placeCueInHand() {
      const c = cue();
      c.potted = false;
      c.vx = 0;
      c.vy = 0;
      let x = HEAD.x;
      let y = HEAD.y;
      for (let tries = 0; tries < 40; tries++) {
        const clash = balls.some((b) => b !== c && !b.potted && Math.hypot(b.x - x, b.y - y) < R * 2.2);
        if (!clash) break;
        y = HEAD.y + (Math.random() - 0.5) * (T.y1 - T.y0 - 60);
        x = HEAD.x + (Math.random() - 0.5) * 80;
      }
      c.x = x;
      c.y = y;
    }

    function shoot(angle, pw) {
      const c = cue();
      const speed = 250 + pw * 1150;
      c.vx = Math.cos(angle) * speed;
      c.vy = Math.sin(angle) * speed;
      moving = true;
      shot = {shooter: turn, firstHit: null, potted: []};
      beep(160 + pw * 260, 0.07, 'square', 0.05);
    }

    function physicsStep(dt) {
      const live = balls.filter((b) => !b.potted);
      for (const b of live) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const f = Math.pow(0.55, dt);
        b.vx *= f;
        b.vy *= f;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp < 6) {
          b.vx = 0;
          b.vy = 0;
        }
        // Pockets
        for (const p of POCKETS) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < PR) {
            b.potted = true;
            b.vx = 0;
            b.vy = 0;
            if (shot) shot.potted.push(b.n);
            beep(b.n === 0 ? 120 : 330, 0.12, 'sine', 0.06);
            break;
          }
        }
        if (b.potted) continue;
        // Cushions (open near pocket mouths)
        const nearPocket = POCKETS.some((p) => Math.hypot(b.x - p.x, b.y - p.y) < PR + R * 1.4);
        if (!nearPocket) {
          if (b.x - R < T.x0) { b.x = T.x0 + R; b.vx = Math.abs(b.vx) * 0.82; beep(220, 0.02, 'triangle', 0.015); }
          if (b.x + R > T.x1) { b.x = T.x1 - R; b.vx = -Math.abs(b.vx) * 0.82; beep(220, 0.02, 'triangle', 0.015); }
          if (b.y - R < T.y0) { b.y = T.y0 + R; b.vy = Math.abs(b.vy) * 0.82; beep(220, 0.02, 'triangle', 0.015); }
          if (b.y + R > T.y1) { b.y = T.y1 - R; b.vy = -Math.abs(b.vy) * 0.82; beep(220, 0.02, 'triangle', 0.015); }
        } else if (b.x < T.x0 - 30 || b.x > T.x1 + 30 || b.y < T.y0 - 30 || b.y > T.y1 + 30) {
          b.potted = true;
          if (shot) shot.potted.push(b.n);
        }
      }
      // Ball-ball elastic collisions (equal masses)
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        if (a.potted) continue;
        for (let j = i + 1; j < live.length; j++) {
          const b = live[j];
          if (b.potted) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 0 && d < R * 2) {
            const nx = dx / d;
            const ny = dy / d;
            const overlap = R * 2 - d;
            a.x -= nx * overlap / 2;
            a.y -= ny * overlap / 2;
            b.x += nx * overlap / 2;
            b.y += ny * overlap / 2;
            const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (rel > 0) {
              const imp = rel * 0.97;
              a.vx -= imp * nx;
              a.vy -= imp * ny;
              b.vx += imp * nx;
              b.vy += imp * ny;
              if (shot && shot.firstHit === null) {
                if (a.n === 0) shot.firstHit = b.n;
                else if (b.n === 0) shot.firstHit = a.n;
              }
              beep(500 + Math.min(400, rel), 0.025, 'triangle', Math.min(0.05, rel / 20000));
            }
          }
        }
      }
      moving = balls.some((b) => !b.potted && (b.vx !== 0 || b.vy !== 0));
    }

    function resolveShot() {
      const s = shot;
      shot = null;
      if (!s) return;
      const me = s.shooter;
      const other = me === 'player' ? 'ai' : 'player';
      const who = me === 'player' ? 'Tu' : 'L’IA';
      const scratch = s.potted.includes(0);
      const eight = s.potted.includes(8);
      let myGroup = groups[me];

      if (!myGroup) {
        const firstObj = s.potted.find((n) => n !== 0 && n !== 8);
        if (firstObj !== undefined && !scratch) {
          myGroup = groupOf(firstObj);
          groups[me] = myGroup;
          groups[other] = myGroup === 'solids' ? 'stripes' : 'solids';
          say(`${who} ${me === 'player' ? 'joues' : 'joue'} les ${groupLabel(myGroup)}`);
        }
      }

      if (eight) {
        const cleared = myGroup && remaining(myGroup) === 0;
        const win = cleared && !scratch;
        const playerWins = (me === 'player') === win;
        gameOver = {victory: playerWins};
        if (playerWins) setScore(score + 1500);
        say(playerWins ? 'VICTOIRE ! La 8 est empochée.' : 'DÉFAITE… la 8 est tombée trop tôt.');
        beep(playerWins ? 880 : 140, 0.4, 'sine', 0.07);
        sendRunToPlatform(playerWins);
        return;
      }

      if (me === 'player') {
        const mine = s.potted.filter((n) => myGroup && groupOf(n) === myGroup).length;
        setScore(score + mine * 120);
      }

      const wrongFirst =
        s.firstHit === null ||
        (myGroup && groupOf(s.firstHit) !== myGroup && !(groupOf(s.firstHit) === 'eight' && remaining(myGroup) === 0));
      const foul = scratch || wrongFirst;
      const pottedOwn = s.potted.some((n) => n !== 0 && n !== 8 && (!myGroup || groupOf(n) === myGroup));

      if (scratch) placeCueInHand();
      if (foul) {
        say(scratch ? `Faute : bille blanche empochée !` : s.firstHit === null ? 'Faute : aucune bille touchée' : 'Faute : mauvaise bille touchée en premier');
        turn = other;
      } else if (pottedOwn) {
        if (!message) say(`${who} ${me === 'player' ? 'rejoues' : 'rejoue'} !`);
        turn = me;
      } else {
        turn = other;
      }
      aiTimer = 0.9;
    }

    function pathClear(x0, y0, x1, y1, ignore) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      for (const b of balls) {
        if (b.potted || ignore.includes(b)) continue;
        const t = Math.max(0, Math.min(1, ((b.x - x0) * dx + (b.y - y0) * dy) / (len * len)));
        const px = x0 + dx * t;
        const py = y0 + dy * t;
        if (Math.hypot(b.x - px, b.y - py) < R * 2.05) return false;
      }
      return true;
    }

    function aiShoot() {
      const c = cue();
      const g = groups.ai;
      let targets = balls.filter((b) => !b.potted && b.n !== 0 && b.n !== 8 && (!g || groupOf(b.n) === g));
      if (targets.length === 0) targets = balls.filter((b) => !b.potted && b.n === 8);
      let best = null;
      for (const t of targets) {
        for (const p of POCKETS) {
          const tx = p.x - t.x;
          const ty = p.y - t.y;
          const tl = Math.hypot(tx, ty);
          const gx = t.x - (tx / tl) * R * 2;
          const gy = t.y - (ty / tl) * R * 2;
          const cx = gx - c.x;
          const cy = gy - c.y;
          const cl = Math.hypot(cx, cy);
          const cut = (cx * tx + cy * ty) / (cl * tl);
          if (cut < 0.25) continue;
          if (!pathClear(c.x, c.y, gx, gy, [c, t])) continue;
          if (!pathClear(t.x, t.y, p.x, p.y, [t])) continue;
          const value = cut * 2 - (cl + tl) / 900;
          if (!best || value > best.value) best = {value, angle: Math.atan2(cy, cx), dist: cl + tl};
        }
      }
      if (best) {
        const noise = (Math.random() - 0.5) * 0.035;
        shoot(best.angle + noise, Math.max(0.35, Math.min(0.95, best.dist / 1000 + 0.25)));
      } else {
        const t = targets[Math.floor(Math.random() * targets.length)] || balls.find((b) => !b.potted && b.n !== 0);
        shoot(Math.atan2(t.y - c.y, t.x - c.x) + (Math.random() - 0.5) * 0.05, 0.6);
      }
    }

    function rayPreview(angle) {
      const c = cue();
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let bestT = Infinity;
      let hit = null;
      for (const b of balls) {
        if (b.potted || b === c) continue;
        const fx = c.x - b.x;
        const fy = c.y - b.y;
        const bq = fx * dx + fy * dy;
        const cq = fx * fx + fy * fy - 4 * R * R;
        const disc = bq * bq - cq;
        if (disc < 0) continue;
        const t = -bq - Math.sqrt(disc);
        if (t > 0 && t < bestT) {
          bestT = t;
          hit = b;
        }
      }
      // cushion
      const tx = dx > 0 ? (T.x1 - R - c.x) / dx : dx < 0 ? (T.x0 + R - c.x) / dx : Infinity;
      const ty = dy > 0 ? (T.y1 - R - c.y) / dy : dy < 0 ? (T.y0 + R - c.y) / dy : Infinity;
      const wallT = Math.min(tx, ty);
      if (bestT < wallT && hit) {
        const gx = c.x + dx * bestT;
        const gy = c.y + dy * bestT;
        return {x: gx, y: gy, hit, nx: (hit.x - gx) / (2 * R), ny: (hit.y - gy) / (2 * R)};
      }
      return {x: c.x + dx * wallT, y: c.y + dy * wallT, hit: null};
    }

    function drawBall(b) {
      const col = BALL_COLORS[b.n > 8 ? b.n - 8 : b.n];
      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = b.n > 8 ? '#f8fafc' : col;
      ctx.fillRect(b.x - R, b.y - R, R * 2, R * 2);
      if (b.n > 8) {
        ctx.fillStyle = col;
        ctx.fillRect(b.x - R, b.y - R * 0.55, R * 2, R * 1.1);
      }
      const shine = ctx.createRadialGradient(b.x - R * 0.4, b.y - R * 0.45, 1, b.x, b.y, R * 1.2);
      shine.addColorStop(0, 'rgba(255,255,255,0.75)');
      shine.addColorStop(0.35, 'rgba(255,255,255,0.05)');
      shine.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = shine;
      ctx.fillRect(b.x - R, b.y - R, R * 2, R * 2);
      ctx.restore();
      if (b.n > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, R * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0b0b0f';
        ctx.font = '700 8px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.n), b.x, b.y + 0.5);
      }
    }

    return {
      name: 'POOL',
      init() {
        rack();
        turn = 'player';
        groups = {player: null, ai: null};
        aimAngle = Math.PI;
        charging = false;
        power = 0;
        moving = false;
        shot = null;
        gameOver = null;
        message = '';
        setScore(0);
        say('Casse ! Vise avec la souris, maintiens puis relâche pour tirer.');
        onKeyHook = null;
      },
      update(dt) {
        if (messageT > 0) messageT -= dt;
        const spaceDown = Boolean(keys[' '] || keys['Space']);
        const mouseEdgeDown = mouse.down && !prevMouseDown;
        const mouseEdgeUp = !mouse.down && prevMouseDown;
        const spaceEdgeDown = spaceDown && !prevSpace;
        const spaceEdgeUp = !spaceDown && prevSpace;
        prevMouseDown = mouse.down;
        prevSpace = spaceDown;

        if (gameOver) {
          if (mouseEdgeDown || spaceEdgeDown) this.init();
          return;
        }
        if (moving) {
          const steps = 6;
          for (let i = 0; i < steps; i++) physicsStep(dt / steps);
          if (!moving) resolveShot();
          return;
        }
        if (turn === 'ai') {
          aiTimer -= dt;
          if (aiTimer <= 0) aiShoot();
          return;
        }
        // Player aiming
        const c = cue();
        if (keys['ArrowLeft'] || keys['a'] || keys['q']) aimAngle -= 1.6 * dt;
        if (keys['ArrowRight'] || keys['d']) aimAngle += 1.6 * dt;
        if (keys['ArrowUp'] || keys['ArrowDown'] || keys['w'] || keys['z'] || keys['s']) {
          aimAngle += (keys['ArrowUp'] || keys['w'] || keys['z'] ? -0.25 : 0.25) * dt;
        }
        if (!charging && (mouse.x !== 480 || mouse.y !== 280) && !(keys['ArrowLeft'] || keys['ArrowRight'])) {
          const mx = mouse.x - c.x;
          const my = mouse.y - c.y;
          if (Math.hypot(mx, my) > 14 && this._mouseMoved) aimAngle = Math.atan2(my, mx);
        }
        if (mouseEdgeDown || spaceEdgeDown) {
          charging = true;
          power = 0;
          powerDir = 1;
        }
        if (charging) {
          power += powerDir * dt * 0.9;
          if (power >= 1) { power = 1; powerDir = -1; }
          if (power <= 0) { power = 0; powerDir = 1; }
          if (mouseEdgeUp || spaceEdgeUp) {
            charging = false;
            shoot(aimAngle, Math.max(0.05, power));
          }
        }
      },
      render() {
        if (!this._mouseHooked) {
          this._mouseHooked = true;
          canvas.addEventListener('mousemove', () => { this._mouseMoved = true; });
          canvas.addEventListener('touchmove', () => { this._mouseMoved = true; }, {passive: true});
        }
        ctx.fillStyle = '#060813';
        ctx.fillRect(0, 0, 960, 560);
        // Rail
        ctx.fillStyle = '#1b1029';
        ctx.beginPath();
        ctx.roundRect(T.x0 - 34, T.y0 - 34, T.x1 - T.x0 + 68, T.y1 - T.y0 + 68, 26);
        ctx.fill();
        ctx.strokeStyle = 'rgba(162,77,255,0.65)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#a24dff';
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Felt
        const felt = ctx.createRadialGradient(480, 280, 40, 480, 280, 520);
        felt.addColorStop(0, '#0e5a7a');
        felt.addColorStop(1, '#062437');
        ctx.fillStyle = felt;
        ctx.fillRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0);
        ctx.strokeStyle = 'rgba(56,225,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(HEAD.x, T.y0);
        ctx.lineTo(HEAD.x, T.y1);
        ctx.stroke();
        // Diamonds
        ctx.fillStyle = 'rgba(56,225,255,0.55)';
        for (let i = 1; i < 8; i++) {
          if (i === 4) continue;
          const x = T.x0 + ((T.x1 - T.x0) / 8) * i;
          ctx.fillRect(x - 2, T.y0 - 20, 4, 4);
          ctx.fillRect(x - 2, T.y1 + 16, 4, 4);
        }
        // Pockets
        for (const p of POCKETS) {
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.arc(p.x, p.y, PR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(56,225,255,0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        // Aim guide
        const c = cue();
        if (!moving && !gameOver && turn === 'player' && !c.potted) {
          const pr = rayPreview(aimAngle);
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(pr.x, pr.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, R, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.stroke();
          if (pr.hit) {
            ctx.strokeStyle = 'rgba(56,225,255,0.85)';
            ctx.beginPath();
            ctx.moveTo(pr.hit.x, pr.hit.y);
            ctx.lineTo(pr.hit.x + pr.nx * 70, pr.hit.y + pr.ny * 70);
            ctx.stroke();
          }
          // Cue stick
          const back = 18 + power * 70;
          const sx = c.x - Math.cos(aimAngle) * back;
          const sy = c.y - Math.sin(aimAngle) * back;
          const ex = sx - Math.cos(aimAngle) * 260;
          const ey = sy - Math.sin(aimAngle) * 260;
          const grad = ctx.createLinearGradient(sx, sy, ex, ey);
          grad.addColorStop(0, '#e2e8f0');
          grad.addColorStop(0.08, '#38e1ff');
          grad.addColorStop(1, '#3b1d5c');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.lineCap = 'butt';
        }
        for (const b of balls) if (!b.potted) drawBall(b);

        // HUD
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '700 14px system-ui';
        ctx.fillStyle = turn === 'player' ? '#38e1ff' : '#9aa6cf';
        ctx.fillText(`TOI · ${groupLabel(groups.player)}`, 30, 30);
        ctx.textAlign = 'right';
        ctx.fillStyle = turn === 'ai' ? '#ff3b6b' : '#9aa6cf';
        ctx.fillText(`IA · ${groupLabel(groups.ai)}`, 930, 30);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(moving ? '…' : turn === 'player' ? 'À TOI DE JOUER' : 'L’IA RÉFLÉCHIT…', 480, 30);
        // Potted trays
        const tray = (g, x, dir) => {
          let i = 0;
          for (const b of balls) {
            if (b.potted && groups[g] && groupOf(b.n) === groups[g]) {
              drawBall({n: b.n, x: x + dir * i * 24, y: 530});
              i++;
            }
          }
        };
        tray('player', 40, 1);
        tray('ai', 920, -1);
        // Power gauge
        if (charging) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(380, 516, 200, 14);
          const pg = ctx.createLinearGradient(380, 0, 580, 0);
          pg.addColorStop(0, '#34d399');
          pg.addColorStop(0.6, '#fbbf24');
          pg.addColorStop(1, '#ff3b6b');
          ctx.fillStyle = pg;
          ctx.fillRect(380, 516, 200 * power, 14);
        }
        if (messageT > 0 && message) {
          ctx.globalAlpha = Math.min(1, messageT);
          ctx.fillStyle = 'rgba(6,8,19,0.85)';
          ctx.beginPath();
          ctx.roundRect(260, 250, 440, 46, 12);
          ctx.fill();
          ctx.fillStyle = '#eef2ff';
          ctx.font = '700 16px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(message, 480, 279);
          ctx.globalAlpha = 1;
        }
        if (gameOver) {
          ctx.fillStyle = 'rgba(6,8,19,0.8)';
          ctx.fillRect(0, 0, 960, 560);
          ctx.fillStyle = gameOver.victory ? '#34d399' : '#ff3b6b';
          ctx.font = '900 46px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(gameOver.victory ? 'VICTOIRE' : 'DÉFAITE', 480, 260);
          ctx.fillStyle = '#9aa6cf';
          ctx.font = '600 16px system-ui';
          ctx.fillText('Clique ou appuie sur Espace pour une nouvelle partie', 480, 300);
        }
      },
    };
  }

  // =========================================================================
  // ENGINE: NÉON GLOUTON (maze chase with 4 ghosts)
  // =========================================================================
  function createMazeChaseEngine() {
    modeEl.textContent = 'ARCADE // LABYRINTHE';
    const MAP = [
      '###################',
      '#........#........#',
      '#o##.###.#.###.##o#',
      '#.................#',
      '#.##.#.#####.#.##.#',
      '#....#...#...#....#',
      '####.### # ###.####',
      '   #.#   B   #.#   ',
      '####.# ##-## #.####',
      '    .  #PIC#  .    ',
      '####.# ##### #.####',
      '   #.#       #.#   ',
      '####.# ##### #.####',
      '#........#........#',
      '#.##.###.#.###.##.#',
      '#o.#.....@.....#.o#',
      '##.#.#.#####.#.#.##',
      '#....#...#...#....#',
      '#.######.#.######.#',
      '#.................#',
      '###################',
    ];
    const COLS = 19;
    const ROWS = MAP.length;
    const TILE = 25;
    const OX = (960 - COLS * TILE) / 2;
    const OY = (560 - ROWS * TILE) / 2 + 6;
    const DIRS = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]};
    const OPP = {up: 'down', down: 'up', left: 'right', right: 'left'};
    const DOOR = {c: 9, r: 8};
    const EXIT = {c: 9, r: 7};
    const HOUSE = {c: 9, r: 9};

    let grid = [];
    let pellets = 0;
    let pac;
    let ghosts = [];
    let lives = 3;
    let level = 1;
    let frightT = 0;
    let eatChain = 0;
    let modeT = 0;
    let scatter = true;
    let state = 'ready'; // ready | play | dying | over
    let stateT = 0;
    let time = 0;
    let queued = null;

    const cell = (c, r) => {
      if (r < 0 || r >= ROWS) return '#';
      c = ((c % COLS) + COLS) % COLS;
      return grid[r][c];
    };
    const wrapC = (c) => ((c % COLS) + COLS) % COLS;
    const pacCan = (c, r) => {
      const ch = cell(c, r);
      return ch !== '#' && ch !== '-';
    };
    const ghostCan = (g, c, r) => {
      const ch = cell(c, r);
      if (ch === '#') return false;
      if (ch === '-') return g.inHouse || g.mode === 'eaten';
      return true;
    };

    function buildGrid() {
      grid = MAP.map((row) => row.padEnd(COLS, ' ').split('').map((ch) => (ch === '@' || 'BPIC'.includes(ch) ? ' ' : ch)));
      pellets = 0;
      for (const row of grid) for (const ch of row) if (ch === '.' || ch === 'o') pellets++;
    }

    function resetActors() {
      pac = {c: 9, r: 15, dir: 'left', p: 0, mouth: 0};
      queued = 'left';
      const mk = (name, color, c, r, inHouse, release, corner) => ({
        name, color, c, r, dir: 'up', p: 0, inHouse, release, corner, mode: 'normal', home: {c, r},
      });
      ghosts = [
        mk('Blinky', '#ff3b6b', 9, 7, false, 0, {c: 18, r: -2}),
        mk('Pinky', '#ff7ad9', 8, 9, true, 2.5, {c: 0, r: -2}),
        mk('Inky', '#38e1ff', 9, 9, true, 6, {c: 18, r: ROWS + 1}),
        mk('Clyde', '#ffb020', 10, 9, true, 9.5, {c: 0, r: ROWS + 1}),
      ];
      ghosts[0].dir = 'left';
      frightT = 0;
      modeT = 0;
      scatter = true;
      time = 0;
    }

    function pos(e) {
      const [dx, dy] = DIRS[e.dir];
      return {x: e.c + dx * e.p, y: e.r + dy * e.p};
    }

    function eatAt(c, r) {
      const ch = grid[r][wrapC(c)];
      if (ch === '.') {
        grid[r][wrapC(c)] = ' ';
        pellets--;
        setScore(score + 10);
        if (pellets % 2 === 0) beep(620, 0.03, 'square', 0.02);
      } else if (ch === 'o') {
        grid[r][wrapC(c)] = ' ';
        pellets--;
        setScore(score + 50);
        frightT = Math.max(3, 8 - level * 0.7);
        eatChain = 0;
        for (const g of ghosts) {
          if (g.mode === 'normal') {
            g.mode = 'fright';
            if (!g.inHouse && g.p > 0) {
              // reverse direction on fright
              const [dx, dy] = DIRS[g.dir];
              g.c = wrapC(g.c + dx);
              g.r += dy;
              g.dir = OPP[g.dir];
              g.p = 1 - g.p;
            }
          }
        }
        beep(220, 0.25, 'sawtooth', 0.04);
      }
      if (pellets <= 0) {
        setScore(score + 1000);
        level++;
        beep(880, 0.3, 'sine', 0.06);
        buildGrid();
        resetActors();
        state = 'ready';
        stateT = 1.6;
      }
    }

    function stepPac(dt) {
      const speed = (6.2 + level * 0.3) * (frightT > 0 ? 1.08 : 1);
      if (queued && queued === OPP[pac.dir] && pac.p > 0) {
        const [dx, dy] = DIRS[pac.dir];
        pac.c = wrapC(pac.c + dx);
        pac.r += dy;
        pac.dir = queued;
        pac.p = 1 - pac.p;
      }
      const [dx, dy] = DIRS[pac.dir];
      if (pac.p === 0) {
        if (queued && pacCan(pac.c + DIRS[queued][0], pac.r + DIRS[queued][1])) pac.dir = queued;
        const [ndx, ndy] = DIRS[pac.dir];
        if (!pacCan(pac.c + ndx, pac.r + ndy)) return;
      }
      pac.p += speed * dt;
      pac.mouth += dt * 14;
      if (pac.p >= 1) {
        const [mdx, mdy] = DIRS[pac.dir];
        pac.c = wrapC(pac.c + mdx);
        pac.r += mdy;
        pac.p = 0;
        eatAt(pac.c, pac.r);
      }
      void dx;
      void dy;
    }

    function ghostTarget(g) {
      if (g.mode === 'eaten') return HOUSE;
      if (g.inHouse) return EXIT;
      if (scatter) return g.corner;
      const [pdx, pdy] = DIRS[pac.dir];
      if (g.name === 'Blinky') return {c: pac.c, r: pac.r};
      if (g.name === 'Pinky') return {c: pac.c + pdx * 4, r: pac.r + pdy * 4};
      if (g.name === 'Inky') {
        const b = ghosts[0];
        const ax = pac.c + pdx * 2;
        const ay = pac.r + pdy * 2;
        return {c: ax * 2 - b.c, r: ay * 2 - b.r};
      }
      const d = Math.hypot(pac.c - g.c, pac.r - g.r);
      return d > 7 ? {c: pac.c, r: pac.r} : g.corner;
    }

    function chooseDir(g) {
      const options = [];
      for (const d of ['up', 'left', 'down', 'right']) {
        if (!g.inHouse && g.mode !== 'eaten' && d === OPP[g.dir]) continue;
        const [dx, dy] = DIRS[d];
        if (ghostCan(g, g.c + dx, g.r + dy)) options.push(d);
      }
      if (options.length === 0) return OPP[g.dir];
      if (g.mode === 'fright') return options[Math.floor(Math.random() * options.length)];
      const t = ghostTarget(g);
      let best = options[0];
      let bestD = Infinity;
      for (const d of options) {
        const [dx, dy] = DIRS[d];
        const dd = (g.c + dx - t.c) ** 2 + (g.r + dy - t.r) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = d;
        }
      }
      return best;
    }

    function stepGhost(g, dt) {
      if (g.inHouse && time < g.release) {
        g.bob = (g.bob || 0) + dt * 6;
        return;
      }
      const inTunnel = g.r === 9 && (g.c <= 3 || g.c >= 15);
      let speed = g.mode === 'eaten' ? 13 : g.mode === 'fright' ? 3.6 : (5.6 + level * 0.3) * (inTunnel ? 0.55 : 1);
      if (g.inHouse) speed = 4;
      if (g.p === 0) {
        if (g.mode === 'eaten' && g.c === HOUSE.c && g.r === HOUSE.r) {
          g.mode = 'normal';
          g.inHouse = true;
          g.release = 0;
        }
        if (g.inHouse && g.c === EXIT.c && g.r === EXIT.r) g.inHouse = false;
        g.dir = chooseDir(g);
      }
      g.p += speed * dt;
      if (g.p >= 1) {
        const [dx, dy] = DIRS[g.dir];
        g.c = wrapC(g.c + dx);
        g.r += dy;
        g.p = 0;
      }
    }

    function checkCollisions() {
      const pp = pos(pac);
      for (const g of ghosts) {
        const gp = pos(g);
        let dx = Math.abs(gp.x - pp.x);
        dx = Math.min(dx, COLS - dx);
        if (dx < 0.6 && Math.abs(gp.y - pp.y) < 0.6) {
          if (g.mode === 'fright') {
            g.mode = 'eaten';
            eatChain++;
            setScore(score + 200 * Math.pow(2, eatChain - 1));
            beep(1040, 0.12, 'square', 0.05);
          } else if (g.mode === 'normal') {
            state = 'dying';
            stateT = 1.4;
            lives--;
            deaths++;
            beep(160, 0.6, 'sawtooth', 0.05);
            return;
          }
        }
      }
    }

    function drawGhost(g) {
      const gp = pos(g);
      const bob = g.inHouse && time < g.release ? Math.sin(g.bob || 0) * 0.15 : 0;
      const x = OX + (gp.x + 0.5) * TILE;
      const y = OY + (gp.y + 0.5 + bob) * TILE;
      const s = TILE * 0.46;
      if (g.mode !== 'eaten') {
        const flashing = g.mode === 'fright' && frightT < 2 && Math.floor(frightT * 6) % 2 === 0;
        const col = g.mode === 'fright' ? (flashing ? '#f8fafc' : '#2f4bff') : g.color;
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(x, y - s * 0.15, s, Math.PI, 0);
        ctx.lineTo(x + s, y + s * 0.85);
        const waves = 4;
        for (let i = waves; i >= 0; i--) {
          const wx = x - s + (2 * s * i) / waves;
          const wy = y + s * 0.85 + (i % 2 === 0 ? 0 : -s * 0.28) + Math.sin(time * 12 + i) * 1.2;
          ctx.lineTo(wx, wy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (g.mode === 'fright') {
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(x - s * 0.45, y - s * 0.3, 3, 3);
        ctx.fillRect(x + s * 0.3, y - s * 0.3, 3, 3);
        return;
      }
      const [ex, ey] = DIRS[g.dir];
      for (const side of [-1, 1]) {
        const cx = x + side * s * 0.38;
        const cy = y - s * 0.25;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath();
        ctx.arc(cx + ex * s * 0.12, cy + ey * s * 0.12, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return {
      name: 'MAZE',
      init() {
        lives = 3;
        level = 1;
        setScore(0);
        buildGrid();
        resetActors();
        state = 'ready';
        stateT = 1.8;
        onKeyHook = function (k, down) {
          if (!down) return;
          if (k === 'ArrowLeft' || k === 'a' || k === 'q') queued = 'left';
          if (k === 'ArrowRight' || k === 'd') queued = 'right';
          if (k === 'ArrowUp' || k === 'w' || k === 'z') queued = 'up';
          if (k === 'ArrowDown' || k === 's') queued = 'down';
        };
      },
      update(dt) {
        if (mouse.clicked) {
          mouse.clicked = false;
          if (state === 'over') {
            this.init();
            return;
          }
          // Tap/click steering relative to Pac position
          const pp = pos(pac);
          const px = OX + (pp.x + 0.5) * TILE;
          const py = OY + (pp.y + 0.5) * TILE;
          const dx = mouse.x - px;
          const dy = mouse.y - py;
          queued = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        }
        if (state === 'over') {
          if (keys[' ']) this.init();
          return;
        }
        if (state === 'ready') {
          stateT -= dt;
          if (stateT <= 0) state = 'play';
          return;
        }
        if (state === 'dying') {
          stateT -= dt;
          if (stateT <= 0) {
            if (lives <= 0) {
              state = 'over';
              sendRunToPlatform(level > 1);
            } else {
              resetActors();
              state = 'ready';
              stateT = 1.4;
            }
          }
          return;
        }
        time += dt;
        if (frightT > 0) {
          frightT -= dt;
          if (frightT <= 0) for (const g of ghosts) if (g.mode === 'fright') g.mode = 'normal';
        } else {
          modeT += dt;
          const limit = scatter ? 6 : 20;
          if (modeT > limit) {
            modeT = 0;
            scatter = !scatter;
          }
        }
        const sub = 3;
        for (let i = 0; i < sub; i++) {
          stepPac(dt / sub);
          for (const g of ghosts) stepGhost(g, dt / sub);
          checkCollisions();
          if (state !== 'play') break;
        }
      },
      render() {
        ctx.fillStyle = '#04050d';
        ctx.fillRect(0, 0, 960, 560);
        // Walls with neon edges
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const ch = grid[r][c];
            const x = OX + c * TILE;
            const y = OY + r * TILE;
            if (ch === '#') {
              ctx.fillStyle = '#0b1030';
              ctx.fillRect(x, y, TILE, TILE);
              ctx.strokeStyle = '#2f7bff';
              ctx.shadowColor = '#2f7bff';
              ctx.shadowBlur = 8;
              ctx.lineWidth = 2;
              ctx.beginPath();
              const open = (cc, rr) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && grid[rr][cc] !== '#';
              if (open(c, r - 1)) { ctx.moveTo(x, y + 1); ctx.lineTo(x + TILE, y + 1); }
              if (open(c, r + 1)) { ctx.moveTo(x, y + TILE - 1); ctx.lineTo(x + TILE, y + TILE - 1); }
              if (open(c - 1, r)) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + TILE); }
              if (open(c + 1, r)) { ctx.moveTo(x + TILE - 1, y); ctx.lineTo(x + TILE - 1, y + TILE); }
              ctx.stroke();
              ctx.shadowBlur = 0;
            } else if (ch === '-') {
              ctx.fillStyle = '#ff7ad9';
              ctx.fillRect(x, y + TILE / 2 - 2, TILE, 4);
            } else if (ch === '.') {
              ctx.fillStyle = '#fde68a';
              ctx.fillRect(x + TILE / 2 - 2, y + TILE / 2 - 2, 4, 4);
            } else if (ch === 'o') {
              const pulse = 4 + Math.sin(time * 8) * 1.6;
              ctx.fillStyle = '#fbbf24';
              ctx.shadowColor = '#fbbf24';
              ctx.shadowBlur = 12;
              ctx.beginPath();
              ctx.arc(x + TILE / 2, y + TILE / 2, pulse + 2, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          }
        }
        // Pac
        const pp = pos(pac);
        const px = OX + (pp.x + 0.5) * TILE;
        const py = OY + (pp.y + 0.5) * TILE;
        const ang = {right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2}[pac.dir];
        let mouth = (Math.sin(pac.mouth) + 1) * 0.22 + 0.04;
        let radius = TILE * 0.46;
        if (state === 'dying') {
          const k = 1 - Math.max(0, stateT - 0.2) / 1.2;
          mouth = Math.min(Math.PI * 0.98, 0.2 + k * Math.PI);
        }
        ctx.fillStyle = '#facc15';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.arc(px, py, radius, ang + mouth * Math.PI * (state === 'dying' ? 1 / Math.PI : 1), ang - mouth * Math.PI * (state === 'dying' ? 1 / Math.PI : 1) + Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        if (state !== 'dying') for (const g of ghosts) drawGhost(g);

        // HUD
        ctx.textAlign = 'left';
        ctx.font = '700 14px system-ui';
        ctx.fillStyle = '#9aa6cf';
        ctx.fillText(`NIVEAU ${level}`, 24, 34);
        for (let i = 0; i < lives; i++) {
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.moveTo(30 + i * 24, 58);
          ctx.arc(30 + i * 24, 58, 8, 0.6, Math.PI * 2 - 0.6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = '#9aa6cf';
        ctx.fillText('Flèches / ZQSD / clic pour diriger', 936, 34);
        ctx.textAlign = 'center';
        if (state === 'ready') {
          ctx.fillStyle = '#facc15';
          ctx.font = '900 22px system-ui';
          ctx.fillText('PRÊT !', OX + 9.5 * TILE, OY + 11.75 * TILE);
        }
        if (state === 'over') {
          ctx.fillStyle = 'rgba(4,5,13,0.8)';
          ctx.fillRect(0, 0, 960, 560);
          ctx.fillStyle = '#ff3b6b';
          ctx.font = '900 44px system-ui';
          ctx.fillText('PARTIE TERMINÉE', 480, 260);
          ctx.fillStyle = '#9aa6cf';
          ctx.font = '600 16px system-ui';
          ctx.fillText('Clique ou appuie sur Espace pour rejouer', 480, 300);
        }
      },
    };
  }

  // =========================================================================
  // ENGINE: NÉON DASH (rhythm auto-runner)
  // =========================================================================
  function createNeonDashEngine() {
    modeEl.textContent = 'RYTHME // NÉON DASH';
    const FLOOR = 440;
    const CEIL = 120;
    const SIZE = 36;
    const PX = 220;
    const GRAV = 2700;
    const JUMP = 830;
    const PAD = 1120;
    const LEVEL_CHUNKS = 26;
    let obstacles = [];
    let camX = 0;
    let speed = 380;
    let player;
    let attempts = 1;
    let level = 1;
    let levelLen = 0;
    let levelBase = 0;
    let dead = false;
    let deadT = 0;
    let particles = [];
    let trail = [];
    let completeT = 0;
    let time = 0;

    function rnd(seed) {
      let s = seed >>> 0;
      return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }

    function buildLevel() {
      obstacles = [];
      const r = rnd(1337 + level * 97);
      let x = 900;
      let flipped = false;
      const patterns = ['spike', 'double', 'block', 'triple', 'platform', 'pad', 'stairs', 'portal'];
      for (let i = 0; i < LEVEL_CHUNKS; i++) {
        const pool = i < 3 ? ['spike', 'spike', 'double', 'block'] : patterns;
        let p = pool[Math.floor(r() * pool.length)];
        if (p === 'triple' && level === 1 && i < 8) p = 'double';
        const add = (o) => obstacles.push({...o, x: x + o.dx, flipped});
        switch (p) {
          case 'spike':
            add({type: 'spike', dx: 0});
            x += 36;
            break;
          case 'double':
            add({type: 'spike', dx: 0});
            add({type: 'spike', dx: 36});
            x += 72;
            break;
          case 'triple':
            add({type: 'spike', dx: 0});
            add({type: 'spike', dx: 36});
            add({type: 'spike', dx: 72});
            x += 108;
            break;
          case 'block':
            add({type: 'block', dx: 0, w: 36, h: 36});
            add({type: 'block', dx: 150, w: 36, h: 36});
            x += 186;
            break;
          case 'platform':
            add({type: 'block', dx: 0, w: 216, h: 36});
            add({type: 'spike', dx: 108, h0: 36});
            x += 216;
            break;
          case 'stairs':
            add({type: 'block', dx: 0, w: 72, h: 36});
            add({type: 'block', dx: 144, w: 72, h: 72});
            add({type: 'block', dx: 288, w: 72, h: 36});
            x += 360;
            break;
          case 'pad':
            add({type: 'pad', dx: 0});
            for (let k = 0; k < 4; k++) add({type: 'spike', dx: 70 + k * 36});
            x += 70 + 4 * 36;
            break;
          case 'portal':
            flipped = !flipped;
            obstacles.push({type: 'portal', x: x + 20, flipped, toFlipped: flipped});
            x += 60;
            break;
        }
        x += 300 + r() * 160 + (p === 'portal' ? 120 : 0);
      }
      if (flipped) {
        obstacles.push({type: 'portal', x: x + 20, flipped: false, toFlipped: false});
        x += 300;
      }
      levelLen = x + 200;
    }

    function resetRun() {
      camX = 0;
      speed = 360 + level * 25;
      player = {y: FLOOR - SIZE, vy: 0, g: 1, grounded: true, rot: 0};
      dead = false;
      particles = [];
      trail = [];
      for (const o of obstacles) o.used = false;
      time = 0;
    }

    function surfaceTop(o) {
      // Returns the rect of an obstacle in absolute screen-y.
      const h0 = o.h0 || 0;
      if (o.type === 'block') {
        return o.flipped ? {y0: CEIL + h0, y1: CEIL + h0 + o.h} : {y0: FLOOR - h0 - o.h, y1: FLOOR - h0};
      }
      if (o.type === 'spike') {
        return o.flipped ? {y0: CEIL + h0, y1: CEIL + h0 + 36} : {y0: FLOOR - h0 - 36, y1: FLOOR - h0};
      }
      if (o.type === 'pad') {
        return o.flipped ? {y0: CEIL, y1: CEIL + 8} : {y0: FLOOR - 8, y1: FLOOR};
      }
      return {y0: CEIL, y1: FLOOR};
    }

    function die() {
      if (dead) return;
      dead = true;
      deadT = 0.9;
      deaths++;
      beep(140, 0.35, 'sawtooth', 0.06);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 120 + Math.random() * 320;
        particles.push({x: PX + SIZE / 2, y: player.y + SIZE / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8});
      }
    }

    return {
      name: 'DASH',
      init() {
        level = 1;
        attempts = 1;
        levelBase = 0;
        completeT = 0;
        setScore(0);
        buildLevel();
        resetRun();
        onKeyHook = null;
      },
      update(dt) {
        time += dt;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 600 * dt;
          p.life -= dt;
          if (p.life <= 0) particles.splice(i, 1);
        }
        if (completeT > 0) {
          completeT -= dt;
          if (completeT <= 0) {
            level++;
            buildLevel();
            resetRun();
          }
          return;
        }
        if (dead) {
          deadT -= dt;
          if (deadT <= 0) {
            attempts++;
            resetRun();
          }
          return;
        }
        const holding = Boolean(keys[' '] || keys['ArrowUp'] || keys['w'] || keys['z'] || keys['KeyJ'] || mouse.down);
        const prevY = player.y;
        camX += speed * dt;
        if (player.grounded && holding) {
          player.vy = -JUMP * player.g;
          player.grounded = false;
          beep(520, 0.04, 'square', 0.025);
        }
        player.vy += GRAV * player.g * dt;
        player.y += player.vy * dt;
        player.grounded = false;

        // Floor / ceiling
        if (player.g === 1) {
          if (player.y + SIZE >= FLOOR) { player.y = FLOOR - SIZE; player.vy = 0; player.grounded = true; }
          if (player.y < CEIL) { player.y = CEIL; player.vy = Math.max(0, player.vy); }
        } else {
          if (player.y <= CEIL) { player.y = CEIL; player.vy = 0; player.grounded = true; }
          if (player.y + SIZE > FLOOR) { player.y = FLOOR - SIZE; player.vy = Math.min(0, player.vy); }
        }

        const left = camX + PX;
        const right = left + SIZE;
        for (const o of obstacles) {
          if (o.x > right + 10) break;
          if (o.type === 'portal') {
            if (!o.used && right > o.x && left < o.x + 24) {
              o.used = true;
              const g = o.toFlipped ? -1 : 1;
              if (g !== player.g) {
                player.g = g;
                player.grounded = false;
                beep(760, 0.18, 'sine', 0.05);
              }
            }
            continue;
          }
          const w = o.type === 'block' ? o.w : 36;
          if (right <= o.x || left >= o.x + w) continue;
          const rect = surfaceTop(o);
          if (o.type === 'spike') {
            const inset = 11;
            if (right - 4 > o.x + inset && left + 4 < o.x + w - inset) {
              const spikeTipZone = o.flipped ? {y0: rect.y0, y1: rect.y1 - 12} : {y0: rect.y0 + 12, y1: rect.y1};
              if (player.y + SIZE - 4 > spikeTipZone.y0 && player.y + 4 < spikeTipZone.y1) die();
            }
          } else if (o.type === 'pad') {
            if (!o.used && player.y + SIZE >= rect.y0 - 2 && player.y <= rect.y1 + 2) {
              o.used = true;
              player.vy = -PAD * player.g;
              player.grounded = false;
              beep(980, 0.08, 'triangle', 0.05);
            }
          } else if (o.type === 'block') {
            const overlapY = player.y + SIZE > rect.y0 && player.y < rect.y1;
            if (!overlapY) continue;
            if (player.g === 1 && prevY + SIZE <= rect.y0 + 6 && player.vy >= 0) {
              player.y = rect.y0 - SIZE;
              player.vy = 0;
              player.grounded = true;
            } else if (player.g === -1 && prevY >= rect.y1 - 6 && player.vy <= 0) {
              player.y = rect.y1;
              player.vy = 0;
              player.grounded = true;
            } else {
              die();
            }
          }
          if (dead) break;
        }

        // Rotation
        if (player.grounded) {
          const q = Math.PI / 2;
          player.rot = Math.round(player.rot / q) * q;
        } else {
          player.rot += 6.2 * dt * player.g;
        }
        trail.push({x: camX + PX + SIZE / 2, y: player.y + SIZE / 2});
        if (trail.length > 18) trail.shift();

        const dist = Math.min(camX, levelLen);
        setScore(levelBase + dist / 10);
        if (camX >= levelLen) {
          levelBase += Math.round(levelLen / 10) + 500;
          setScore(levelBase);
          completeT = 2;
          beep(880, 0.4, 'sine', 0.06);
          sendRunToPlatform(true);
        }
      },
      render() {
        const hue = (level * 70 + time * 8) % 360;
        const bg = ctx.createLinearGradient(0, 0, 0, 560);
        bg.addColorStop(0, `hsl(${hue}, 70%, 12%)`);
        bg.addColorStop(1, `hsl(${(hue + 40) % 360}, 70%, 5%)`);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 960, 560);
        // Parallax grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        const off = (camX * 0.3) % 60;
        for (let x = -off; x < 960; x += 60) {
          ctx.beginPath();
          ctx.moveTo(x, CEIL);
          ctx.lineTo(x, FLOOR);
          ctx.stroke();
        }
        // Floor & ceiling
        const accent = `hsl(${(hue + 180) % 360}, 95%, 62%)`;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, FLOOR, 960, 560 - FLOOR);
        ctx.fillRect(0, 0, 960, CEIL);
        ctx.strokeStyle = accent;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 16;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, FLOOR);
        ctx.lineTo(960, FLOOR);
        ctx.moveTo(0, CEIL);
        ctx.lineTo(960, CEIL);
        ctx.stroke();
        ctx.shadowBlur = 0;

        for (const o of obstacles) {
          const sx = o.x - camX;
          if (sx < -400) continue;
          if (sx > 1000) break;
          const rect = surfaceTop(o);
          if (o.type === 'spike') {
            ctx.fillStyle = '#0b0b14';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (o.flipped) {
              ctx.moveTo(sx, rect.y0);
              ctx.lineTo(sx + 36, rect.y0);
              ctx.lineTo(sx + 18, rect.y1);
            } else {
              ctx.moveTo(sx, rect.y1);
              ctx.lineTo(sx + 36, rect.y1);
              ctx.lineTo(sx + 18, rect.y0);
            }
            ctx.closePath();
            ctx.fill();
            ctx.shadowColor = accent;
            ctx.shadowBlur = 10;
            ctx.stroke();
            ctx.shadowBlur = 0;
          } else if (o.type === 'block') {
            ctx.fillStyle = 'rgba(10,10,24,0.9)';
            ctx.fillRect(sx, rect.y0, o.w, rect.y1 - rect.y0);
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 1, rect.y0 + 1, o.w - 2, rect.y1 - rect.y0 - 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            for (let gx = sx + 36; gx < sx + o.w; gx += 36) {
              ctx.beginPath();
              ctx.moveTo(gx, rect.y0);
              ctx.lineTo(gx, rect.y1);
              ctx.stroke();
            }
          } else if (o.type === 'pad') {
            ctx.fillStyle = '#facc15';
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.ellipse(sx + 18, o.flipped ? rect.y0 + 4 : rect.y1 - 4, 18, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          } else if (o.type === 'portal') {
            const col = o.toFlipped ? '#c084fc' : '#38e1ff';
            ctx.strokeStyle = col;
            ctx.shadowColor = col;
            ctx.shadowBlur = 20;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.ellipse(sx + 12, (CEIL + FLOOR) / 2, 14, (FLOOR - CEIL) / 2 - 20, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }

        // Trail
        for (let i = 0; i < trail.length; i++) {
          const t = trail[i];
          ctx.globalAlpha = (i / trail.length) * 0.5;
          ctx.fillStyle = accent;
          ctx.fillRect(t.x - camX - 5, t.y - 5, 10, 10);
        }
        ctx.globalAlpha = 1;

        // Player cube
        if (!dead) {
          ctx.save();
          ctx.translate(PX + SIZE / 2, player.y + SIZE / 2);
          ctx.rotate(player.rot);
          ctx.fillStyle = '#facc15';
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = 18;
          ctx.fillRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#0b0b14';
          ctx.fillRect(-SIZE / 2 + 6, -SIZE / 2 + 6, SIZE - 12, SIZE - 12);
          ctx.fillStyle = '#38e1ff';
          ctx.fillRect(-7, -7, 14, 14);
          ctx.restore();
        }
        for (const p of particles) {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
        }
        ctx.globalAlpha = 1;

        // Progress bar
        const prog = Math.min(1, camX / levelLen);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(280, 24, 400, 10);
        ctx.fillStyle = accent;
        ctx.fillRect(280, 24, 400 * prog, 10);
        ctx.fillStyle = '#eef2ff';
        ctx.font = '700 13px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.floor(prog * 100)} %`, 480, 54);
        ctx.textAlign = 'left';
        ctx.fillText(`NIVEAU ${level}`, 24, 34);
        ctx.textAlign = 'right';
        ctx.fillText('Espace / clic : sauter', 936, 34);

        if (camX < 700 && completeT <= 0) {
          ctx.globalAlpha = Math.max(0, 1 - camX / 700);
          ctx.textAlign = 'left';
          ctx.font = '900 34px system-ui';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(`TENTATIVE ${attempts}`, 420 - camX * 0.6, 260);
          ctx.globalAlpha = 1;
        }
        if (completeT > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(0, 0, 960, 560);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#34d399';
          ctx.font = '900 44px system-ui';
          ctx.fillText('NIVEAU TERMINÉ !', 480, 270);
          ctx.fillStyle = '#9aa6cf';
          ctx.font = '600 16px system-ui';
          ctx.fillText(`${attempts} tentative${attempts > 1 ? 's' : ''} · niveau suivant…`, 480, 305);
        }
      },
    };
  }

  // Pick engine based on slug
  function selectEngineForSlug(s) {
    if (s === '8-ball-pool' || s.includes('pool') || s.includes('billard')) return createPoolEngine();
    if (s === 'pac-man-neon' || s.includes('pac-man') || s.includes('pacman')) return createMazeChaseEngine();
    if (s === 'geometry-neon-dash' || s.includes('geometry') || s.includes('neon-dash')) return createNeonDashEngine();
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

