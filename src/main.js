import { createApp } from 'vue';
import App from './App.vue';
import { loadEngine } from './engine/loader.js';

const app = createApp(App);

// 挂载 #gomoku-root（Vue 3 加载管理器）
app.mount('#gomoku-root');

// 引擎加载（Vue mount 后启动，不阻塞渲染）
setTimeout(async () => {
  try {
    const result = await loadEngine((pct) => {
      window.dispatchEvent(new CustomEvent('engine-progress', { detail: pct }));
    });

    app.config.globalProperties.$engine = result;
    window.dispatchEvent(new CustomEvent('engine-ready', {
      detail: {
        variant: result.variant,
        multiThread: result.multiThread,
        hasWorker: result.worker !== null,
      },
    }));
  } catch (err) {
    console.error('[App] 引擎终极失败:', err);
    window.dispatchEvent(new CustomEvent('engine-error', {
      detail: { message: err.message },
    }));
  }
}, 50);
