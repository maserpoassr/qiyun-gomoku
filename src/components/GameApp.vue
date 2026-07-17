<template>
  <div class="game-scene">
    <!-- 玻璃顶栏 -->
    <header class="glass-header">
      <div class="brand">棋<span class="accent">韵</span></div>
      <div class="header-actions">
        <span class="engine-badge" :class="{ ready: engineReady }">
          {{ engineReady ? 'AI 就绪' : '加载中' }}
        </span>
      </div>
    </header>

    <!-- HUD -->
    <div class="game-hud">
      <div class="hud-pill">
        <div class="turn-indicator" :class="{ active: !aiThinking && !gameOver && isBlackTurn }">
          <span class="dot black" /> 黑
        </div>
        <span class="turn-divider">VS</span>
        <div class="turn-indicator" :class="{ active: !aiThinking && !gameOver && !isBlackTurn }">
          <span class="dot white" /> 白
        </div>
        <span class="move-count">第{{ moveCount }}手</span>
      </div>

      <div class="hud-status" :class="{ 'ai-thinking': aiThinking, 'game-over': gameOver }">
        <span v-if="aiThinking" class="thinking-pulse" />
        <span>{{ statusText }}</span>
        <span v-if="gameOver && winner" class="result-text">
          {{ winner === 1 ? '● 黑胜' : '○ 白胜' }}
        </span>
      </div>
    </div>

    <!-- 棋盘 -->
    <div class="board-stage">
      <div class="board-container">
        <canvas ref="boardCanvas" class="gomoku-canvas"
          @click="handleClick" @touchstart.prevent="handleTouch" />
      </div>
    </div>

    <!-- 控制栏 -->
    <div class="control-dock">
      <div class="dock-wrapper">
        <button class="dock-btn" @click="undoMove" :disabled="aiThinking || moveCount === 0">
          <div class="icon-circle">↩</div><span>悔棋</span>
        </button>
        <button class="dock-btn" @click="newGame">
          <div class="icon-circle gold">⟳</div><span>新局</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue';
import { useGame } from '../composables/useGame.js';

const props = defineProps({
  engineReady: { type: Boolean, default: false },
});

const {
  board, currentPlayer, gameOver, winner, moveHistory,
  aiThinking, engineReady, moveCount, isBlackTurn, statusText,
  placeStone, doAIMove, newGame: resetGame, undo: undoOne,
  setEngine, feedEngineOutput, BOARD_SIZE,
} = useGame();

const boardCanvas = ref(null);

// 硬编码人机模式（AI 执白，玩家执黑）
const aiMode = true;

// 同步外部 engineReady
watch(() => props.engineReady, (v) => {
  if (v) engineReady.value = true;
});

// ─── AI 自动走棋 ───
watch([currentPlayer, aiThinking, gameOver], async ([cp, thinking, ended]) => {
  if (ended || thinking || !engineReady.value) return;
  if (aiMode && cp === -1) {
    // AI 回合（白棋）
    await doAIMove();
  }
});

const GRID_SIZE = BOARD_SIZE;
const CELL_SIZE = 40;
const MARGIN = 40;
const BOARD_PX = CELL_SIZE * (GRID_SIZE - 1) + MARGIN * 2;
let ctx = null;

// ─── Canvas 渲染（视网膜 DPR 感知）───
function initCanvas() {
  const canvas = boardCanvas.value;
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = BOARD_PX * dpr;
  canvas.height = BOARD_PX * dpr;
  canvas.style.width = BOARD_PX + 'px';
  canvas.style.height = BOARD_PX + 'px';
  ctx.scale(dpr, dpr);
  drawBoard();
}

function drawBoard() {
  if (!ctx) return;
  const size = BOARD_PX;

  // 木纹底色
  ctx.fillStyle = '#E3C193';
  ctx.fillRect(0, 0, size, size);

  // 网格线
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < GRID_SIZE; i++) {
    ctx.moveTo(MARGIN, MARGIN + i * CELL_SIZE);
    ctx.lineTo(BOARD_PX - MARGIN, MARGIN + i * CELL_SIZE);
    ctx.moveTo(MARGIN + i * CELL_SIZE, MARGIN);
    ctx.lineTo(MARGIN + i * CELL_SIZE, BOARD_PX - MARGIN);
  }
  ctx.stroke();

  // 星位
  ctx.fillStyle = '#000';
  for (const [r, c] of [[3,3],[11,3],[7,7],[3,11],[11,11]]) {
    ctx.beginPath();
    ctx.arc(MARGIN + c * CELL_SIZE, MARGIN + r * CELL_SIZE, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 棋子
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const val = board[r][c];
      if (val === null) continue;
      drawStone(r, c, val);
    }
  }
}

function drawStone(r, c, player) {
  const x = MARGIN + c * CELL_SIZE;
  const y = MARGIN + r * CELL_SIZE;
  const radius = CELL_SIZE * 0.45;

  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(
    x - radius * 0.3, y - radius * 0.3, radius * 0.1,
    x, y, radius
  );
  if (player === 1) {
    grad.addColorStop(0, '#666');
    grad.addColorStop(1, '#000');
  } else {
    grad.addColorStop(0, '#fff');
    grad.addColorStop(1, '#d1d1d1');
  }
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// ─── 交互 ───
function getGrid(clientX, clientY) {
  const rect = boardCanvas.value.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const col = Math.round((x - MARGIN) / CELL_SIZE);
  const row = Math.round((y - MARGIN) / CELL_SIZE);
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
  return { row, col };
}

function handleClick(e) {
  const pos = getGrid(e.clientX, e.clientY);
  if (!pos) return;
  if (aiMode && currentPlayer.value === -1) return;
  placeStone(pos.row, pos.col);
}

function handleTouch(e) {
  const t = e.touches[0];
  const pos = getGrid(t.clientX, t.clientY);
  if (!pos) return;
  if (aiMode && currentPlayer.value === -1) return;
  placeStone(pos.row, pos.col);
}

function undoMove() {
  undoOne(aiMode);
}

function newGame() { resetGame(); }

// 响应重绘
watch([board, currentPlayer, gameOver], () => drawBoard(), { deep: true });

onMounted(() => {
  initCanvas();
  // 接管 worker 引用
  if (window.__rapfiWorker) {
    setEngine(window.__rapfiWorker, 'worker');
  }
});

onUnmounted(() => {});
</script>

<style scoped>
.game-scene {
  display: flex; flex-direction: column;
  height: 100vh; padding-top: 60px;
  box-sizing: border-box;
}
.glass-header {
  position: fixed; top: 0; left: 0; width: 100%; height: 60px;
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 24px; box-sizing: border-box; z-index: 100;
  backdrop-filter: blur(12px); background: rgba(18,18,18,.6);
  border-bottom: 1px solid hsla(0,0%,100%,.05);
}
.brand { font-size: 20px; letter-spacing: 6px; font-weight: 300; color: #e8e8e8; }
.brand .accent { font-weight: 800; color: #d4af37; }
.engine-badge {
  font-size: 11px; padding: 4px 10px; border-radius: 12px;
  background: rgba(255,255,255,.05); color: #888;
  border: 1px solid hsla(0,0%,100%,.08);
}
.engine-badge.ready { color: #4caf50; border-color: rgba(76,175,80,.3); }

.game-hud {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0 20px; margin-bottom: 16px;
  max-width: 600px; width: 100%; margin: 0 auto 16px;
  box-sizing: border-box; flex-wrap: wrap; gap: 8px;
}
.hud-pill {
  display: flex; align-items: center; gap: 5px;
  background: rgba(30,30,30,.6); backdrop-filter: blur(20px);
  border-radius: 20px; padding: 6px 14px;
  border: 1px solid hsla(0,0%,100%,.08); font-size: 12px; color: #aaa;
}
.turn-indicator { opacity: .3; transition: all .3s; display: flex; align-items: center; gap: 4px; }
.turn-indicator.active { opacity: 1; color: #fff; font-weight: 700; }
.turn-divider { margin: 0 6px; font-size: 10px; opacity: .2; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.black { background: #000; border: 1px solid #444; }
.dot.white { background: #fff; }
.move-count { margin-left: 8px; font-size: 10px; opacity: .5; }

.hud-status {
  display: flex; align-items: center; gap: 8px;
  background: rgba(30,30,30,.6); backdrop-filter: blur(20px);
  border-radius: 8px; padding: 6px 12px;
  border: 1px solid hsla(0,0%,100%,.08); font-size: 13px; color: #ccc;
}
.hud-status.ai-thinking { border-color: rgba(212,175,55,.4); color: #d4af37; }
.thinking-pulse {
  width: 8px; height: 8px; border-radius: 50%; background: #d4af37;
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0% { opacity: .4; transform: scale(.8); }
  50% { opacity: 1; transform: scale(1.2); }
  100% { opacity: .4; transform: scale(.8); }
}
.result-text { color: #d4af37; font-weight: 700; letter-spacing: 1px; }

.board-stage {
  flex: 1; display: flex; justify-content: center; align-items: center;
  padding: 8px; overflow: hidden;
}
.board-container {
  box-shadow: 0 20px 50px rgba(0,0,0,.6); border-radius: 4px; line-height: 0;
}
.board-container canvas { display: block; border-radius: 4px; }
.gomoku-canvas { display: block; background: #E3C193; }

.control-dock {
  padding-bottom: env(safe-area-inset-bottom, 20px); margin-bottom: 16px;
  display: flex; justify-content: center;
}
.dock-wrapper {
  background: rgba(20,20,20,.8); backdrop-filter: blur(25px);
  border: 1px solid hsla(0,0%,100%,.08); border-radius: 24px;
  padding: 10px 20px; display: flex; gap: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,.3);
}
.dock-btn {
  background: transparent; border: none; display: flex;
  flex-direction: column; align-items: center; gap: 6px;
  cursor: pointer; padding: 0; width: 50px; color: inherit;
}
.dock-btn span { font-size: 10px; color: #888; }
.dock-btn:hover span { color: #ccc; }
.dock-btn:disabled { opacity: .3; cursor: not-allowed; }
.icon-circle {
  width: 40px; height: 40px; border-radius: 50%;
  background: hsla(0,0%,100%,.05); display: flex;
  justify-content: center; align-items: center;
  font-size: 16px; color: #ccc; border: 1px solid hsla(0,0%,100%,.05);
  transition: all .2s;
}
.dock-btn:active:not(:disabled) .icon-circle { transform: scale(.9); background: hsla(0,0%,100%,.1); }
.icon-circle.gold {
  background: linear-gradient(135deg,rgba(212,175,55,.2),transparent);
  border-color: rgba(212,175,55,.3); color: #d4af37;
}
.icon-circle.green {
  background: linear-gradient(135deg,rgba(76,175,80,.3),transparent);
  border-color: rgba(76,175,80,.4); color: #4caf50;
}

@media (max-width: 480px) {
  .game-scene { padding-top: 50px; }
  .glass-header { height: 50px; padding: 0 16px; }
  .brand { font-size: 18px; letter-spacing: 4px; }
  .game-hud { padding: 0 10px; margin-bottom: 10px; }
  .hud-pill { font-size: 10px; padding: 4px 10px; }
  .hud-status { font-size: 11px; padding: 4px 8px; }
  .dock-wrapper { padding: 8px 12px; gap: 12px; border-radius: 20px; }
  .dock-btn { width: 42px; } .dock-btn span { font-size: 9px; }
  .icon-circle { width: 34px; height: 34px; font-size: 13px; }
}
</style>
