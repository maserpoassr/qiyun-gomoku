<template>
  <div class="game-scene">
    <!-- 玻璃质感顶栏 -->
    <header class="glass-header">
      <div class="brand">棋<span class="accent">韵</span></div>
      <div class="header-actions">
        <span class="engine-badge" :class="{ ready: engineReady }">
          {{ engineReady ? '引擎就绪' : '加载中' }}
        </span>
      </div>
    </header>

    <!-- 游戏 HUD -->
    <div class="game-hud">
      <div class="hud-pill">
        <div
          class="turn-indicator"
          :class="{ active: !aiThinking && !gameOver }"
        >
          <span class="dot black" />
          <span>黑</span>
        </div>
        <span class="turn-divider">|</span>
        <div
          class="turn-indicator"
          :class="{ active: !aiThinking && !gameOver }"
        >
          <span class="dot white" />
          <span>白</span>
        </div>
        <span class="move-count">第{{ moveCount }}手</span>
      </div>

      <div
        class="hud-status"
        :class="{
          'ai-thinking': aiThinking,
          'game-over': gameOver,
        }"
      >
        <span v-if="!engineReady" class="loading-pulse" />
        <span v-else-if="aiThinking" class="thinking-pulse" />
        <span>{{ statusText }}</span>
        <span v-if="gameOver && winner" class="result-text">
          {{ winner === 1 ? '● 黑胜' : '○ 白胜' }}
        </span>
      </div>
    </div>

    <!-- 棋盘区域 -->
    <div class="board-stage">
      <div class="board-container">
        <canvas
          ref="boardCanvas"
          :width="canvasSize"
          :height="canvasSize"
          @click="handleClick"
          @touchstart.prevent="handleTouch"
        />
      </div>
    </div>

    <!-- 底部控制栏 -->
    <div class="control-dock">
      <div class="dock-wrapper">
        <button class="dock-btn" @click="undoMove" :disabled="aiThinking || moveCount === 0">
          <div class="icon-circle">↩</div>
          <span>悔棋</span>
        </button>
        <button class="dock-btn" @click="newGame">
          <div class="icon-circle gold">⟳</div>
          <span>新局</span>
        </button>
        <button class="dock-btn" @click="toggleAIMode">
          <div class="icon-circle green">🤖</div>
          <span>{{ aiMode ? '人机' : '双人' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { useGame } from '../composables/useGame.js';

const props = defineProps({
  engine: { type: Object, default: null },
  engineReady: { type: Boolean, default: false },
});

const emit = defineEmits(['command']);

const {
  board,
  currentPlayer,
  gameOver,
  moveCount,
  aiThinking,
  statusText,
  engineReady: localReady,
  placeStone,
  newGame: resetGame,
  undo: undoOne,
  BOARD_SIZE,
} = useGame();

const boardCanvas = ref(null);
const aiMode = ref(true);
const canvasSize = ref(480);
const cellSize = computed(() => canvasSize.value / (BOARD_SIZE + 1));

// ─── Canvas 渲染 ───
function drawBoard() {
  const canvas = boardCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = canvasSize.value;
  const cs = cellSize.value;

  // 清空
  ctx.clearRect(0, 0, size, size);

  // 背景
  ctx.fillStyle = '#c8a25c';
  ctx.fillRect(0, 0, size, size);

  // 网格线
  ctx.strokeStyle = '#5a3e1b';
  ctx.lineWidth = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const pos = cs * (i + 1);
    ctx.beginPath();
    ctx.moveTo(cs, pos);
    ctx.lineTo(cs * BOARD_SIZE, pos);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos, cs);
    ctx.lineTo(pos, cs * BOARD_SIZE);
    ctx.stroke();
  }

  // 星位（天元 + 四隅）
  const starPoints = [3, 7, 11];
  ctx.fillStyle = '#5a3e1b';
  for (const r of starPoints) {
    for (const c of starPoints) {
      ctx.beginPath();
      ctx.arc(cs * (c + 1), cs * (r + 1), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 棋子
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const val = board[r][c];
      if (val === null) continue;
      const x = cs * (c + 1);
      const y = cs * (r + 1);
      const radius = cs * 0.42;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);

      if (val === 1) {
        // 黑子
        const grad = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, radius);
        grad.addColorStop(0, '#555');
        grad.addColorStop(1, '#111');
        ctx.fillStyle = grad;
      } else {
        // 白子
        const grad = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(1, '#ccc');
        ctx.fillStyle = grad;
      }
      ctx.fill();
      ctx.strokeStyle = val === 1 ? '#000' : '#999';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// ─── 交互 ───
function getGridPos(clientX, clientY) {
  const rect = boardCanvas.value.getBoundingClientRect();
  const scaleX = canvasSize.value / rect.width;
  const scaleY = canvasSize.value / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  const cs = cellSize.value;

  const col = Math.round(x / cs - 1);
  const row = Math.round(y / cs - 1);
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
  return { row, col };
}

function handleClick(e) {
  const pos = getGridPos(e.clientX, e.clientY);
  if (!pos) return;
  if (aiMode.value && currentPlayer.value === -1) return; // AI 回合
  placeStone(pos.row, pos.col);
}

function handleTouch(e) {
  const touch = e.touches[0];
  const pos = getGridPos(touch.clientX, touch.clientY);
  if (!pos) return;
  if (aiMode.value && currentPlayer.value === -1) return;
  placeStone(pos.row, pos.col);
}

function undoMove() {
  if (aiMode.value && moveCount.value >= 2) {
    undoOne();
    undoOne(); // 人机模式撤销两步（玩家 + AI）
  } else {
    undoOne();
  }
}

function toggleAIMode() {
  aiMode.value = !aiMode.value;
}

function newGame() {
  resetGame();
}

// ─── 响应渲染 ───
watch([board, currentPlayer, gameOver], () => {
  drawBoard();
}, { deep: true });

onMounted(() => {
  // 自适应棋盘大小
  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = vw - 32;
    const maxH = vh - 180;
    const s = Math.min(maxW, maxH, 560);
    canvasSize.value = Math.max(240, s);
  }
  resize();
  window.addEventListener('resize', resize);
  drawBoard();
});
</script>

<style scoped>
.game-scene {
  display: flex; flex-direction: column;
  height: 100vh; padding-top: 60px;
  box-sizing: border-box;
  background: transparent;
}

.glass-header {
  position: fixed; top: 0; left: 0;
  width: 100%; height: 60px;
  display: flex; justify-content: space-between;
  align-items: center; padding: 0 24px;
  box-sizing: border-box; z-index: 100;
  backdrop-filter: blur(12px);
  background: rgba(18,18,18,.6);
  border-bottom: 1px solid hsla(0,0%,100%,.05);
}
.brand { font-size: 20px; letter-spacing: 6px; font-weight: 300; color: var(--text-main); }
.brand .accent { font-weight: 800; color: #d4af37; }
.engine-badge {
  font-size: 11px; padding: 4px 10px;
  border-radius: 12px; background: rgba(255,255,255,.05);
  color: #888; border: 1px solid rgba(255,255,255,.08);
}
.engine-badge.ready { color: #4caf50; border-color: rgba(76,175,80,.3); }

.game-hud {
  display: flex; justify-content: space-between;
  padding: 0 20px; margin-bottom: 16px;
  max-width: 600px; width: 100%;
  margin-left: auto; margin-right: auto;
  box-sizing: border-box; align-items: center;
  flex-wrap: wrap; gap: 8px;
}
.hud-pill {
  display: flex; align-items: center;
  background: rgba(30,30,30,.6);
  backdrop-filter: blur(20px);
  border-radius: 20px; padding: 6px 14px;
  border: 1px solid hsla(0,0%,100%,.08);
  font-size: 12px; color: #aaa;
}
.turn-indicator {
  display: flex; align-items: center; gap: 5px;
  opacity: .3; transition: all .3s;
}
.turn-indicator.active { opacity: 1; color: #fff; font-weight: 700; }
.turn-divider { margin: 0 8px; font-size: 10px; opacity: .2; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.black { background: #000; border: 1px solid #444; }
.dot.white { background: #fff; }
.move-count { margin-left: 10px; font-size: 10px; opacity: .5; }

.hud-status {
  display: flex; align-items: center; gap: 8px;
  background: rgba(30,30,30,.6);
  backdrop-filter: blur(20px);
  border-radius: 8px; padding: 6px 12px;
  border: 1px solid hsla(0,0%,100%,.08);
  font-size: 13px; color: #ccc;
}
.hud-status.ai-thinking { border-color: rgba(212,175,55,.4); color: #d4af37; }
.thinking-pulse, .loading-pulse {
  width: 8px; height: 8px; border-radius: 50%;
  animation: pulse 1.5s infinite;
}
.thinking-pulse { background: #d4af37; }
.loading-pulse { background: #4caf50; }
@keyframes pulse {
  0% { opacity: .4; transform: scale(.8); }
  50% { opacity: 1; transform: scale(1.2); }
  100% { opacity: .4; transform: scale(.8); }
}
.result-text { color: #d4af37; font-weight: 700; letter-spacing: 1px; }

.board-stage {
  flex: 1; display: flex;
  justify-content: center; align-items: center;
  position: relative; overflow: hidden;
  padding: 8px;
}
.board-container {
  box-shadow: 0 20px 50px rgba(0,0,0,.6);
  border-radius: 4px; position: relative; z-index: 10;
  line-height: 0;
}
.board-container canvas { display: block; border-radius: 4px; }

.control-dock {
  padding-bottom: env(safe-area-inset-bottom, 20px);
  margin-bottom: 16px;
  display: flex; justify-content: center;
}
.dock-wrapper {
  background: rgba(20,20,20,.8);
  backdrop-filter: blur(25px);
  border: 1px solid hsla(0,0%,100%,.08);
  border-radius: 24px; padding: 10px 20px;
  display: flex; gap: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,.3);
}
.dock-btn {
  background: transparent; border: none;
  display: flex; flex-direction: column;
  align-items: center; gap: 6px;
  cursor: pointer; padding: 0; width: 50px;
  color: inherit;
}
.dock-btn span { font-size: 10px; color: #888; transition: color .3s; }
.dock-btn:hover span { color: #ccc; }
.dock-btn:disabled { opacity: .3; cursor: not-allowed; }
.icon-circle {
  width: 40px; height: 40px; border-radius: 50%;
  background: hsla(0,0%,100%,.05);
  display: flex; justify-content: center;
  align-items: center; font-size: 16px; color: #ccc;
  transition: all .2s;
  border: 1px solid hsla(0,0%,100%,.05);
}
.dock-btn:active:not(:disabled) .icon-circle {
  transform: scale(.9);
  background: hsla(0,0%,100%,.1);
}
.icon-circle.gold {
  background: linear-gradient(135deg,rgba(212,175,55,.2),transparent);
  border-color: rgba(212,175,55,.3); color: #d4af37;
}
.icon-circle.green {
  background: linear-gradient(135deg,rgba(76,175,80,.3),transparent);
  border-color: rgba(76,175,80,.4); color: #4caf50;
}

/* 响应式 */
@media (max-width: 480px) {
  .game-scene { padding-top: 50px; }
  .glass-header { height: 50px; padding: 0 16px; }
  .glass-header .brand { font-size: 18px; letter-spacing: 4px; }
  .game-hud { padding: 0 10px; margin-bottom: 10px; }
  .hud-pill { font-size: 10px; padding: 4px 10px; }
  .hud-status { font-size: 11px; padding: 4px 8px; }
  .dock-wrapper { padding: 8px 12px; gap: 12px; border-radius: 20px; }
  .dock-btn { width: 42px; }
  .dock-btn span { font-size: 9px; }
  .icon-circle { width: 34px; height: 34px; font-size: 13px; }
}

@media (max-width: 375px) {
  .game-scene { padding-top: 45px; }
  .glass-header { height: 45px; }
  .brand { font-size: 16px; letter-spacing: 3px; }
}
</style>
