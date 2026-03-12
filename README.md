# Skill Detector

一个模仿 `C:\code\github-trending-daily-tool` 思路做的独立网页工具：

- 聚合 `ClawHub` 与 `Skills.sh` 下载榜单
- 按不同方向自动归类 Skill
- 支持自选 TopN、来源切换、关键词搜索
- 展示名称、作者、分类、链接、下载量、介绍
- 提供更完整、更好看、可交互的卡片视图与榜单泳道视图

## 启动

```powershell
cd C:\code\skill-detector
npm install
npm start
```

默认地址：

- `http://localhost:3216`

## 导出静态数据

```powershell
npm run export:static
```

会生成：

- `public/data/leaderboard.json`
- `public/data/clawhub.json`
- `public/data/skillssh.json`

## 数据来源

- `Skills.sh`：主页榜单 + 单技能详情页
- `ClawHub`：公开 V1 API（通过 Convex site 域名访问更稳定）

## 页面能力

- 综合榜 / 单来源切换
- Top 6 / 12 / 24 / 36 / 48
- 自动分类：搜索、写作、前端、Agent、自动化、数据、安全、协作等
- 双榜重合 Skill 标识
- 下载量可视化泳道
- 深色 SaaS 风格交互卡片

## GitHub Pages

已包含静态导出脚本与 Pages 工作流，推送后可直接发布 `public/`。
