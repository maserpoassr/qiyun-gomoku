<template>
  <div id="gomoku-root">
    <!-- 引擎加载屏 -->
    <transition name="fade">
      <div v-if="!ready && !fatal" class="loading-screen" key="loading">
        <div class="loader-logo">棋<span>韵</span></div>
        <div class="loader-bar-container">
          <div class="loader-bar-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="loader-text">{{ statusText }}</div>
        <div class="loader-detail">{{ detailText }}</div>
      </div>
    </transition>

    <!-- 致命错误 -->
    <transition name="fade">
      <div v-if="fatal" class="error-screen" key="error">
        <div class="error-icon">⚠</div>
        <div class="error-title">引擎加载失败</div>
        <div class="error-detail">{{ errorMessage }}</div>
        <button class="error-retry" @click="retry">重新加载</button>
        <div class="error-fallback">
          <p>请尝试：</p>
          <ul>
            <li>使用最新版 Chrome/Edge 浏览器</li>
            <li>关闭广告拦截插件</li>
            <li>强制刷新页面 (Ctrl+F5)</li>
          </ul>
        </div>
      </div>
    </transition>

    <!-- 新版 Vue 3 棋盘 -->
    <transition name="fade">
      <GameApp
        v-if="ready"
        :engine="engine"
        :engineReady="true"
      />
    </transition>
  </div>
</template>

<script>
import GameApp from './components/GameApp.vue';

export default {
  name: 'AppRoot',
  components: { GameApp },
  data() {
    return {
      ready: false,
      fatal: false,
      progress: 0,
      engine: null,
      errorMessage: '',
    };
  },
  computed: {
    statusText() {
      if (this.progress < 15) return '检测浏览器能力...';
      if (this.progress < 50) return '选择引擎变体...';
      if (this.progress < 70) return '下载模型文件中...';
      if (this.progress < 95) return '引擎初始化中...';
      return '引擎就绪 ✓';
    },
    detailText() {
      return `加载进度 ${this.progress}%`;
    },
  },
  mounted() {
    window.addEventListener('engine-progress', (e) => {
      this.progress = Math.min(100, Math.max(0, e.detail || 0));
    });
    window.addEventListener('engine-ready', (e) => {
      this.progress = 100;
      this.engine = e.detail;
      console.log(`[App] ✅ 引擎就绪: ${e.detail.variant} | Worker: ${e.detail.hasWorker}`);
      setTimeout(() => { this.ready = true; }, 400);
    });
    window.addEventListener('engine-error', (e) => {
      this.fatal = true;
      this.errorMessage = e.detail.message || '未知错误';
    });
    this._timeout = setTimeout(() => {
      if (!this.ready && !this.fatal) {
        this.fatal = true;
        this.errorMessage = '引擎加载超时（30s）';
      }
    }, 30000);
  },
  unmounted() {
    clearTimeout(this._timeout);
  },
  methods: {
    retry() {
      window.location.reload();
    },
  },
};
</script>

<style>
/* 全局变量 */
:root {
  --bg-dark: #121212;
  --gold-primary: #d4af37;
  --text-main: #e8e8e8;
  --text-sub: #888;
}
/* 重置 body 以为老 Vue 2 产物腾出干净环境 */
body, html {
  margin: 0; padding: 0; height: 100%;
  background-color: var(--bg-dark);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
#app { height: 100%; }
</style>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.4s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.loading-screen {
  position: fixed; inset: 0; z-index: 9999;
  background: radial-gradient(circle at center, #2a2a2a 0%, #1a1a1a 100%);
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.loader-logo {
  font-size: 28px; font-weight: 300;
  color: #e0e0e0; margin-bottom: 24px;
  letter-spacing: 8px;
}
.loader-logo span { font-weight: 700; color: #d4af37; }
.loader-bar-container {
  width: 200px; height: 3px;
  background: rgba(255,255,255,0.1);
  border-radius: 3px; overflow: hidden;
}
.loader-bar-fill {
  height: 100%; background: #d4af37;
  transition: width 0.25s ease;
  box-shadow: 0 0 12px #d4af37;
}
.loader-text {
  color: #999; font-size: 13px;
  margin-top: 12px; letter-spacing: 2px;
}
.loader-detail {
  color: #555; font-size: 11px;
  margin-top: 6px;
}
.error-screen {
  position: fixed; inset: 0; z-index: 9999;
  background: #1a1a1a; display: flex;
  flex-direction: column; justify-content: center;
  align-items: center; color: #e0e0e0;
  font-family: -apple-system, sans-serif;
  padding: 20px; text-align: center;
}
.error-icon { font-size: 48px; margin-bottom: 16px; }
.error-title { font-size: 22px; margin-bottom: 8px; }
.error-detail { color: #ff6b6b; font-size: 14px; margin-bottom: 20px; max-width: 400px; }
.error-retry {
  background: #d4af37; color: #1a1a1a;
  border: none; padding: 10px 32px;
  font-size: 15px; border-radius: 6px;
  cursor: pointer; margin-bottom: 20px;
}
.error-fallback { color: #666; font-size: 12px; }
.error-fallback ul { text-align: left; margin-top: 4px; }
</style>
