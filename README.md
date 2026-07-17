# 棋韵 - 五子棋 AI 对弈

基于 WebAssembly 的五子棋 AI，使用 Rapfi 引擎。

## 部署

本项目已配置好 Cloudflare Pages 和 EdgeOne 部署。

### Cloudflare Pages

```bash
npx wrangler pages deploy . --project-name=qiyun-gomoku
```

### 安全配置

- HSTS: max-age=63072000
- CSP: default-src 'self'
- X-Frame-Options: DENY
- Service Worker: 本地 Workbox（无外部 CDN 依赖）

## 文件说明

| 目录 | 说明 |
|------|------|
| `js/` | 前端 JS 文件（已修补） |
| `build/` | Rapfi 引擎 WASM/JS |
| `workbox/` | 本地的 Workbox 库 |
| `functions/` | Pages Function |
| `_headers` | 安全头配置 |
