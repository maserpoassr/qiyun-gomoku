import { reactive, ref, computed } from 'vue';

const BOARD_SIZE = 15; // 标准五子棋 15×15

/**
 * 游戏状态管理
 * 
 * 职责：棋盘逻辑、回合管理、AI 通信中间层
 */
export function useGame() {
  // ─── 核心状态 ───
  const board = reactive(
    Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))
  );
  const currentPlayer = ref(1); // 1=黑, -1=白
  const gameOver = ref(false);
  const winner = ref(null);
  const moveHistory = ref([]);
  const aiThinking = ref(false);
  const engine = ref(null);
  const engineReady = ref(false);

  // ─── 计算属性 ───
  const moveCount = computed(() => moveHistory.value.length);
  const isBlackTurn = computed(() => currentPlayer.value === 1);
  const statusText = computed(() => {
    if (!engineReady.value) return '引擎加载中...';
    if (gameOver.value) return winner.value === 1 ? '黑棋胜' : winner.value === -1 ? '白棋胜' : '平局';
    if (aiThinking.value) return 'AI 思考中...';
    return isBlackTurn.value ? '黑棋落子' : '白棋落子';
  });

  // ─── 落子 ───
  function placeStone(row, col) {
    if (gameOver.value || aiThinking.value) return false;
    if (board[row][col] !== null) return false;

    board[row][col] = currentPlayer.value;
    moveHistory.value.push({ row, col, player: currentPlayer.value });

    // 检查胜负
    if (checkWin(row, col, currentPlayer.value)) {
      gameOver.value = true;
      winner.value = currentPlayer.value;
      return true;
    }

    // 检查平局
    if (moveHistory.value.length >= BOARD_SIZE * BOARD_SIZE) {
      gameOver.value = true;
      winner.value = 0;
      return true;
    }

    // 切换玩家
    currentPlayer.value *= -1;
    return true;
  }

  // ─── 胜负判定（四方向检测） ───
  function checkWin(row, col, player) {
    const directions = [
      [0, 1],   // 水平
      [1, 0],   // 垂直
      [1, 1],   // 主对角线
      [1, -1],  // 副对角线
    ];

    for (const [dr, dc] of directions) {
      let count = 1;
      // 正方向
      for (let i = 1; i < 5; i++) {
        const r = row + dr * i, c = col + dc * i;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
        if (board[r][c] !== player) break;
        count++;
      }
      // 反方向
      for (let i = 1; i < 5; i++) {
        const r = row - dr * i, c = col - dc * i;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
        if (board[r][c] !== player) break;
        count++;
      }
      if (count >= 5) return true;
    }
    return false;
  }

  // ─── AI 走一步（调用引擎） ───
  async function aiMove() {
    if (!engine.value || aiThinking.value || gameOver.value) return;

    aiThinking.value = true;
    try {
      const command = `play ${boardToSGF()}`;
      // 通过 engine.sendCommand 发送指令（具体 API 取决于引擎封装）
      // 这里是占位，等 engine 对接完成
      if (engine.value.sendCommand) {
        engine.value.sendCommand(command);
      }
    } catch (err) {
      console.error('[Game] AI move error:', err);
    } finally {
      aiThinking.value = false;
    }
  }

  // ─── 棋盘转 SGF 格式 ───
  function boardToSGF() {
    // 简单序列化：按落子顺序输出坐标
    return moveHistory.value
      .map(m => `${String.fromCharCode(97 + m.col)}${String.fromCharCode(97 + m.row)}`)
      .join('');
  }

  // ─── 新游戏 ───
  function newGame() {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        board[r][c] = null;
      }
    }
    currentPlayer.value = 1;
    gameOver.value = false;
    winner.value = null;
    moveHistory.value = [];
    aiThinking.value = false;
  }

  // ─── 撤销一步 ───
  function undo() {
    if (moveHistory.value.length === 0 || aiThinking.value) return;
    const last = moveHistory.value.pop();
    board[last.row][last.col] = null;
    currentPlayer.value *= -1;
    gameOver.value = false;
    winner.value = null;
  }

  return {
    board,
    currentPlayer,
    gameOver,
    winner,
    moveHistory,
    aiThinking,
    engine,
    engineReady,
    moveCount,
    isBlackTurn,
    statusText,
    placeStone,
    aiMove,
    newGame,
    undo,
    BOARD_SIZE,
  };
}
