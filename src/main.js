import { createApp } from 'vue';
import App from './App.vue';
import { initEngine } from './engine/loader.js';

const app = createApp(App);
app.mount('#gomoku-root');

// 引擎加载（mount 后启动）
setTimeout(async () => {
  try {
    const result = await initEngine((pct) => {
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
    console.error('[App] 引擎加载失败:', err);
    window.dispatchEvent(new CustomEvent('engine-error', {
      detail: { message: err.message },
    }));
  }
}, 50);
