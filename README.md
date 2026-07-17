# 棋韵 - 五子棋 AI 对弈

基于 WebAssembly 的五子棋 AI 对弈平台，使用 Rapfi 引擎，支持多语言、多平台。

## 在线体验

- **主站 (Cloudflare Pages):** [https://5.hfive.ggff.net](https://5.hfive.ggff.net)
- **备用 (EdgeOne Makers):** 待部署

## 功能特性

- 🎮 **五子棋 AI 对弈** — 基于 Rapfi 引擎 (NNUE)，支持多级棋力
- 🌐 **多语言支持** — 中文、English、日本語、한국어、Русский、Tiếng Việt
- 📱 **响应式设计** — 桌面、平板、手机均可流畅运行
- 🧠 **多线程 + SIMD 加速** — 利用 WebAssembly 实现高性能计算
- 🔒 **安全加固** — HSTS、CSP、X-Frame-Options 等安全头部完整配置
- 📦 **离线支持** — Service Worker 预缓存，支持离线访问

## 技术架构

```
┌─────────────────────────────────────────────────────┐
│                   用户浏览器                          │
├─────────────────────────────────────────────────────┤
│  Vue 2 SPA          │  Rapfi WASM 引擎              │
│  (app.js)           │  (build/rapfi-*.wasm)         │
├─────────────────────┴───────────────────────────────┤
│  Service Worker (Workbox 本地托管)                    │
│  预缓存 JS/CSS/WASM，离线可用                        │
├─────────────────────────────────────────────────────┤
│  Pages Function (备用)                               │
│  /model/rapfi.data → R2 代理                        │
├────────────────────────┬────────────────────────────┤
│  R2 存储 (公开)         │  Pages 静态文件             │
│  rapfi.data (40MB)     │  JS/CSS/HTML/WASM          │
└────────────────────────┴────────────────────────────┘
```

### 数据流

1. 用户加载页面 → Cloudflare Pages 提供 HTML/JS/CSS
2. Service Worker 注册并预缓存静态资源
3. JS 检测浏览器能力（SIMD/多线程）
4. 加载对应 WASM 变体（`/build/rapfi-*.wasm`）
5. 从 R2 下载权重文件 `rapfi.data`（40MB）
6. 引擎初始化完成，开始对弈

### 权重文件加载路径

| 路径 | 说明 |
|------|------|
| `https://pub-48ebff44fc3541d08f962a38d5a56563.r2.dev/rapfi.data` | R2 公开端点（主要） |
| `https://cdn.hfive.ggff.net/rapfi.data` | R2 自定义域名（备用） |
| `/model/rapfi.data` | Pages Function 代理（兜底） |

## 部署指南

### 前置要求

- Node.js 18+
- [Cloudflare 账号](https://dash.cloudflare.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Cloudflare Pages 部署

#### 方式一：Wrangler CLI 部署

```bash
# 1. 安装 wrangler
npm install -g wrangler

# 2. 登录 Cloudflare
npx wrangler login

# 3. 在项目目录执行部署
cd /path/to/qiyun-gomoku
npx wrangler pages deploy . --project-name=qiyun-gomoku --branch=main
```

#### 方式二：Git 集成部署

1. Fork 本仓库
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
3. 进入 **Workers & Pages** → **创建** → **Pages** → **连接到 Git**
4. 选择本仓库，设置分支为 `main`
5. 构建设置：
   - 构建设置: **无**（直接部署静态文件）
   - 构建输出目录: `.`（项目根目录）
6. 点击 **保存并部署**

#### 方式三：直接上传

1. 下载仓库代码
2. 登录 [Cloudflare Pages](https://pages.cloudflare.com/)
3. 创建项目 → **直接上传**
4. 将项目根目录所有文件拖入上传

### EdgeOne Makers 部署

1. 登录 [EdgeOne Makers](https://pages.edgeone.ai/)
2. 创建项目 → **导入 Git 仓库**
3. 选择本仓库
4. 部署设置：输出目录为 `.`
5. 部署完成后绑定自定义域名

### R2 存储配置

权重文件 `rapfi.data`（40MB）存储在 R2 桶 `wzqai-cdn` 中：

```bash
# 安装 wrangler（如未安装）
npm install -g wrangler

# 验证 R2 桶状态
npx wrangler r2 bucket list

# 查看桶策略
curl -s \
  -H "Authorization: Bearer 你的CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/你的账户ID/r2/buckets/wzqai-cdn/policy"
```

### 自定义域名

1. 在 Cloudflare Pages 项目设置中添加自定义域名
2. DNS 解析通过 Cloudflare 托管
3. 自动申请 SSL 证书

## 安全配置

本项目已部署以下安全头部：

| 头部 | 值 | 说明 |
|------|-----|------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HSTS 2 年 |
| `Content-Security-Policy` | `default-src 'self'; ...` | 严格 CSP |
| `X-Frame-Options` | `DENY` | 防止点击劫持 |
| `X-Content-Type-Options` | `nosniff` | 防 MIME 嗅探 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 限制 Referer |
| `Permissions-Policy` | 全部禁用 | 限制 API 权限 |

### 安全审计

已完成全方位安全审计，详情见 [安全审计报告](#)。

## 项目结构

```
qiyun-gomoku/
├── index.html              # 入口页面
├── _headers                # 安全头配置
├── robots.txt              # 爬虫规则
├── service-worker.js       # Service Worker（本地 Workbox）
├── wrangler.toml           # Wrangler 配置
├── manifest.json           # PWA 清单
├── js/
│   ├── app.815f6a6d.js         # 主应用（已修补）
│   ├── chunk-vendors.906392e8.js  # 依赖库（已修补）
│   └── engine-warpper.worker.*.js  # Worker 线程引擎
├── build/
│   ├── rapfi-single.js/.wasm       # 单线程引擎
│   ├── rapfi-single-simd128.js/.wasm  # SIMD 引擎
│   ├── rapfi-multi.js/.wasm        # 多线程引擎
│   ├── rapfi-multi-simd128.js/.wasm   # 多线程 SIMD 引擎
│   └── fallback/                   # 回退版本
├── workbox/                 # 本地托管 Workbox v4.3.1
├── functions/
│   └── model/[[path]].js   # Pages Function R2 代理
├── css/                     # 样式文件
├── fonts/                   # 字体文件
├── img/                     # 图片资源
├── lib/                     # 第三方库
└── .well-known/
    └── security.txt         # 安全漏洞报告渠道
```

## 修复的兼容性问题

本项目对原始构建产物进行了以下补丁：

### Vue/vux i18n 兼容性

- **Vue.use(VueI18n)** — 确保 `$t` 函数安装在 Vue.prototype 上
- **全局 Mixin** — 为所有 Vue 实例注入 `_i18n` 回退
- **$t null 检查** — 在 `chunk-vendors` 中添加防御性空值检查

### SIMD 引擎加载

- **禁用 relaxed SIMD 检测** — 跳过不存在的 `-relaxed` 变体加载

### 安全加固

- **Workbox 本地化** — 移除 Google CDN 依赖，所有 Workbox 模块同域托管
- **CORS 收紧** — 移除通配符域名，仅保留实际使用域名
- **HSTS 配置** — 强制 HTTPS，有效期 2 年

## 许可

本项目基于 MIT 许可证开源。

Rapfi 引擎版权归原作者所有。
