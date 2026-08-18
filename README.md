# Rubick 翻译

Rubick 多引擎翻译插件，**开箱即用、无需 API Key**，支持 Google 与必应/微软双引擎切换。

支持 Windows 与 macOS（Apple Silicon / Intel）。

## 特性

- **Google（免费）**：调用 Google 公开翻译接口，安装即可使用
- **必应 / 微软（免费）**：通过 Edge 浏览器内置的 Microsoft Translator 授权，无需申请 Azure Key
- 自动检测源语言，支持 13 种常用语种
- Rubick 子输入框联动，输入即译
- 最近 30 条历史记录，点击回填
- 浅色 / 深色 / 跟随系统主题
- 设置与历史本地持久化（`rubick.db`）
- **自动切换引擎**：当前引擎失败时自动尝试另一引擎（可关闭）

## 唤起方式

在 Rubick 搜索框输入以下任一命令：

- `translate`
- `翻译`
- `译`

也可选中文字后通过 Rubick 快捷入口进入，原文会自动填入。

## 引擎说明

| 引擎 | 说明 | 是否需要 Key |
|------|------|-------------|
| Google | 网页端公开接口，多 endpoint 自动 fallback | 否 |
| 必应 / 微软 | `edge.microsoft.com/translate/auth` 获取临时 Token | 否 |

> 免费接口可能因官方反爬策略调整而偶发失败，可开启「自动切换」或手动切换引擎重试。

## 插件图标

Rubick **命令列表**里的图标来自 `package.json` 的 `logo` 字段，且会**原样**作为 `<img src>` 使用：

- ❌ `./logo.png` 等相对路径**不会**被解析，加载失败时显示 Rubick 默认图标
- ✅ 需使用 **http(s) 在线地址**，或本地安装时用 `file:///` 绝对路径

仓库默认 logo 为 GitHub Raw 地址（需 push 到 GitHub 后生效）。本地调试请执行：

```bash
npm run install:rubick
```

该脚本会安装插件，并把 `rubick-local-plugin.json` 中的 logo 写为本机 `file://` 路径。

## 本地调试

```bash
cd rubick-translate
npm run link

# 打开 Rubick → 插件市场 → 开发者 → 填写 rubick-translate 安装
```

安装后在 Rubick 中输入 `翻译` 即可调试。调试完成后可执行 `npm run unlink` 解除链接。

## 发布

```bash
npm publish
```

然后向 [rubick-database](https://gitcode.net/rubickcenter/rubick-database) 提交 PR 上架插件市场。

## 项目结构

```
rubick-translate/
├── logo.png       # 插件图标（200×200 正方形，需配合 https 或 file:// logo 字段）
├── package.json   # 插件元数据
├── index.html     # UI 与交互
├── preload.js     # 引擎调用、设置与历史
└── README.md
```

## 常见问题

**Google 连接失败**  
官方接口限流或网络受限，请切换「必应 / 微软」或开启自动切换。

**必应翻译失败**  
通常是临时授权获取失败，稍后重试即可；插件会自动刷新 Token。

## License

MIT
