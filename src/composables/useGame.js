import { reactive, ref, computed } from 'vue';

const BOARD_SIZE = 15;

/**
 * 棋韵游戏状态管理 — Rapfi UCT 协议完整版
 *
 * 协议格式（逆向自旧版 app.815f6a6d.js）:
 *   TX: YXBOARD\n<size>\n<row,col,player>\n...
 *   TX: GO / YXSTOP / INFO <KEY> <VALUE>
 *   RX: <col>,<row>           落子决定
 *   RX: INFO <KEY> <VALUE>    搜索信息
 *   RX: MESSAGE REALTIME ...  实时更新
 */

export function useGame() {
  // ─── 核心状态 ───
  const board = reactive(
    Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))
  );
  const currentPlayer = ref(1);  // 1=黑, -1=白
  const gameOver = ref(false);
  const winner = ref(null);
  const moveHistory = ref([]);
  const aiThinking = ref(false);
  const engineReady = ref(false);
  const engineWorker = ref(null);
  const lastAIMove = ref(null);

  // ─── 消息缓冲区（防粘包） ───
  let msgBuffer = '';

  // ─── 计算属性 ───
  const moveCount = computed(() => moveHistory.value.length);
  const isBlackTurn = computed(() => currentPlayer.value === 1);
  const statusText = computed(() => {
    if (!engineReady.value) return '引擎加载中...';
    if (gameOver.value) {
      if (winner.value === 1) return '黑棋胜 🏆';
      if (winner.value === -1) return '白棋胜 🏆';
      return '平局';
    }
    if (aiThinking.value) return 'AI 思考中...';
    return isBlackTurn.value ? '黑棋落子' : '白棋落子';
  });

  // ─── 引擎通信 ───
  function sendCommand(cmd) {
    if (engineWorker.value) {
      engineWorker.value.postMessage({ type: 'command', data: cmd });
    } else if (typeof window !== 'undefined' && window.RapfiEngine?.sendCommand) {
      window.RapfiEngine.sendCommand(cmd);
    }
  }

  /** 发送 YXBOARD 局面（严格按旧产物格式序列化） */
  function sendBoard() {
    // 按 Rapfi 协议要求: 每行 <row>,<col>,<player>
    // player 编码: 1=黑, 2=白 (注意: 与 useGame 中 1/-1 不同)
    const lines = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== null) {
          const player = board[r][c] > 0 ? '1' : '2';
          lines.push(`${r},${c},${player}`);
        }
      }
    }
    const payload = `YXBOARD\n${BOARD_SIZE}\n${lines.join('\n')}`;
    sendCommand(payload);
  }

  /** 发送 INFO 配置 */
  function sendInfo(key, value) {
    sendCommand(`INFO ${key} ${value}`);
  }

  /** 通知 AI 开始思考 */
  function triggerAI() {
    if (aiThinking.value || gameOver.value) return;
    aiThinking.value = true;
    sendBoard();
    // 先停止旧搜索，再开始新搜索
    sendCommand('YXSTOP');
    // 微任务队列确保 YXSTOP 先到达
    setTimeout(() => sendCommand('GO'), 0);
  }

  // ─── 消息解析（缓冲区 + 按行处理） ───
  const outputHandlers = [];

  function feedEngineOutput(chunk) {
    msgBuffer += chunk;
    const lines = msgBuffer.split('\n');
    // 最后一段可能不完整，保留在缓冲区
    msgBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      dispatchLine(trimmed);
    }
  }

  function dispatchLine(line) {
    // 1. 通知外部 handler（如 doAIMove 的 Promise）
    for (const h of outputHandlers) {
      try { h(line); } catch (e) { console.error('[Game] handler error:', e); }
    }

    // 2. 内置解析
    parseEngineLine(line);
  }

  function parseEngineLine(trimmed) {
    // 落子: 严格匹配纯 "<col>,<row>" 格式
    // 注意: line 中不能含有其他字符，INFO/MESSAGE 等前辍都不行
    const moveMatch = trimmed.match(/^(\d+),(\d+)$/);
    if (moveMatch) {
      const col = parseInt(moveMatch[1], 10);
      const row = parseInt(moveMatch[2], 10);
      if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
        aiThinking.value = false;
        lastAIMove.value = [row, col];
        // 外部循环通过 watch lastAIMove 触发落子
        return;
      }
    }

    // INFO 消息
    if (trimmed.startsWith('INFO ')) {
      const rest = trimmed.slice(5);
      const sp = rest.indexOf(' ');
      if (sp > 0) {
        // const key = rest.slice(0, sp);
        // const val = rest.slice(sp + 1);
        // 可在此触发 UI 更新：深度/节点/评估
      }
      return;
    }

    // MESSAGE 消息（含 REALTIME 分析）
    if (trimmed.startsWith('MESSAGE ')) return;

    // 特殊状态
    switch (trimmed) {
      case 'OK': break;
      case 'SWAP': console.log('[Game] 引擎要求交换黑白'); break;
      default:
        if (trimmed.startsWith('ERROR')) {
          console.error('[Engine]', trimmed);
          aiThinking.value = false;
        } else if (trimmed.startsWith('FORBID')) {
          // 禁手坐标列表
        }
    }
  }

  // ─── 注册/注销一次性输出监听 ───
  function onEngineOutput(handler) {
    outputHandlers.push(handler);
    return () => {
      const idx = outputHandlers.indexOf(handler);
      if (idx >= 0) outputHandlers.splice(idx, 1);
    };
  }

  // ─── 落子 ───
  function placeStone(row, col) {
    if (gameOver.value || aiThinking.value) return false;
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return false;
    if (board[row][col] !== null) return false;

    board[row][col] = currentPlayer.value;
    moveHistory.value.push({ row, col, player: currentPlayer.value });

    if (checkWin(row, col, currentPlayer.value)) {
      gameOver.value = true;
      winner.value = currentPlayer.value;
      return true;
    }

    if (moveHistory.value.length >= BOARD_SIZE * BOARD_SIZE) {
      gameOver.value = true;
      winner.value = 0;
      return true;
    }

    currentPlayer.value *= -1;
    return true;
  }

  // ─── AI 走棋（Promise 封装，含超时） ───
  function requestAIMove() {
    if (aiThinking.value || gameOver.value || !engineReady.value) {
      return Promise.reject(new Error('AI not available'));
    }

    return new Promise((resolve, reject) => {
      triggerAI();

      const unsub = onEngineOutput((line) => {
        const m = line.match(/^(\d+),(\d+)$/);
        if (m) {
          clearTimeout(timer);
          unsub();
          const col = parseInt(m[1], 10);
          const row = parseInt(m[2], 10);
          if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
            resolve([row, col]);
          } else {
            reject(new Error(`Invalid AI move: ${line}`));
          }
        }
      });

      const timer = setTimeout(() => {
        unsub();
        sendCommand('YXSTOP');
        aiThinking.value = false;
        reject(new Error('AI 思考超时'));
      }, 60000); // 60 秒超时
    });
  }

  /** 简化的 AI 走棋：外部调用，自动完成思考和落子 */
  async function doAIMove() {
    try {
      const move = await requestAIMove();
      if (move) {
        placeStone(move[0], move[1]);
      }
      return move;
    } catch (err) {
      console.warn('[Game] AI move failed:', err.message);
      aiThinking.value = false;
      return null;
    }
  }

  // ─── 胜负判定 ───
  function checkWin(row, col, player) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr, dc] of dirs) {
      let count = 1;
      for (let i = 1; i < 5; i++) {
        const r = row + dr * i, c = col + dc * i;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
        if (board[r][c] !== player) break;
        count++;
      }
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

  // ─── 新游戏 ───
  function newGame() {
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        board[r][c] = null;
    currentPlayer.value = 1;
    gameOver.value = false;
    winner.value = null;
    moveHistory.value = [];
    aiThinking.value = false;
    lastAIMove.value = null;
    msgBuffer = '';
  }

  // ─── 悔棋 ───
  function undo(aiMode = true) {
    if (moveHistory.value.length === 0 || aiThinking.value) return;
    const steps = aiMode ? 2 : 1;
    for (let i = 0; i < steps && moveHistory.value.length > 0; i++) {
      const last = moveHistory.value.pop();
      board[last.row][last.col] = null;
      currentPlayer.value *= -1;
    }
    gameOver.value = false;
    winner.value = null;
  }

  // ─── 注入引擎 ───
  function setEngine(worker, mode) {
    engineWorker.value = worker;
    engineReady.value = true;

    // 如果 worker 有 onmessage，自动接管输出流
    if (worker && mode === 'worker') {
      worker.onmessage = (e) => {
        const { type, data } = e.data;
        if (type === 'stdout') {
          feedEngineOutput(data);
        } else if (type === 'stderr') {
          console.error('[Rapfi]', data);
        }
      };
    }
  }

  return {
    board,
    currentPlayer,
    gameOver,
    winner,
    moveHistory,
    aiThinking,
    engineReady,
    lastAIMove,
    moveCount,
    isBlackTurn,
    statusText,
    placeStone,
    doAIMove,
    requestAIMove,
    sendCommand,
    sendInfo,
    feedEngineOutput,
    onEngineOutput,
    newGame,
    undo,
    setEngine,
    BOARD_SIZE,
  };
}
