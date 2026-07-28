# 🎨 ZCode 哆啦A梦四时壁纸

> 一键给 ZCode 聊天应用注入动态壁纸系统：四时段自动切换 + 晴雨天气检测 + 视频主题 + 用户自定义上传。

## ✨ 功能

- **🕐 四时段自动切换**：清晨/白天/黄昏/夜晚 根据系统时间自动切换壁纸
- **🌧 晴雨双套壁纸**：通过 open-meteo API 自动检测天气，下雨自动切雨景
- **🎬 视频壁纸**：支持 mp4 视频作为壁纸，循环播放
- **🖼 外置主题系统**：加主题不需要重打包，直接放在 `resources/themes/` 目录即可
- **📤 主题面板**：Ctrl+Shift+W 调出，支持上传、重命名、删除、导出/导入（.zctheme）
- **🔍 智能文字适配**：根据壁纸亮度自动调整描边粗细，亮底黑字暗㡳白字
- **🌧 下雨动效**：Canvas 雨滴 + 涟漪效果

## 🚀 快速开始

### 一键重装
```bash
# 双击运行
一键重装.bat

# 或命令行
node apply.js
```

### 添加新主题
```bash
# 交互式
node add-theme.js

# 快速加视频主题
node add-theme.js video "主题名" "视频路径.mp4"

# 快速加图片主题
node add-theme.js image "主题名" "图片路径.png"
```

### 查看状态
```bash
# 双击运行
查看状态.bat

# 或命令行
node status.js
```

## ⌨ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+W` | 打开/关闭主题面板 |
| `Ctrl+Shift+R` | 手动切换晴/雨 |
| `Ctrl+Shift+S` | 打开天气配置面板 |
| `Esc` | 关闭面板 |

## 📁 项目结构

```
ZCode壁纸工具包/
├── apply.js              # 一键重装脚本（核心）
├── add-theme.js          # 添加外置主题工具
├── status.js             # 状态自检工具
├── inject/               # 注入到 index.html 的代码
│   ├── css.css           # 壁纸 + UI 透明样式
│   ├── body.html         # 壁纸层 DOM
│   ├── script.js         # 壁纸显示引擎 + 亮度自适应
│   ├── switcher.js       # 晴雨手动开关
│   ├── weather.js        # open-meteo 自动天气检测
│   ├── theme-engine.js   # 主题引擎（外部目录加载）
│   ├── theme-panel.js    # 主题管理面板 UI
│   ├── rain-effect.js    # Canvas 下雨动效
│   └── settings.js       # 天气配置面板
├── wallpapers/           # 内置哆啦A梦壁纸（晴/雨各4张）
├── themes/               # 外置主题模板
├── weather-config.json   # 天气坐标配置
└── 使用说明.md           # 详细文档
```

## ⚙ 配置天气坐标

编辑 `weather-config.json` 或在 ZCode 中按 `Ctrl+Shift+S` 修改：

```json
{
  "location": {
    "home": { "lat": 39.9042, "lon": 116.4074 },
    "work": { "lat": 39.9142, "lon": 116.4174 }
  }
}
```

> ⚠️ 坐标已脱敏为北京天安门示例，请替换为你的实际位置。

## 🏗 外置主题格式

在 `ZCode/resources/themes/` 下创建目录：

```
resources/themes/
├── _registry.json        # 主题注册表
├── my-theme/
│   ├── theme.json        # 主题元数据
│   └── bg.mp4            # 视频文件
└── doraemon/
    ├── theme.json
    ├── clear/            # 晴天壁纸
    └── rain/             # 雨天壁纸
```

### theme.json 示例

**视频主题：**
```json
{
  "id": "my-theme",
  "name": "我的主题",
  "type": "video",
  "periods": false,
  "weather": false,
  "desc": "视频壁纸描述",
  "asset": "bg.mp4"
}
```

**静态四时段主题：**
```json
{
  "id": "doraemon",
  "name": "哆啦A梦四时",
  "type": "static",
  "periods": true,
  "weather": true,
  "assets": {
    "clear": { "morning": "clear/morning.png", "day": "clear/day.png", ... },
    "rain":  { "morning": "rain/morning.png", ... }
  }
}
```

## 🔧 技术原理

1. **asar 解包/打包**：用 Node.js `asar` 模块解包 ZCode 的 `app.asar`
2. **幂等注入**：通过标记注释（MARK）系统实现可重复注入，每次运行自动替换旧版本
3. **CSS 壁纸层**：`position: fixed` + `z-index: -1` 实现壁纸置于最底，不影响 UI 交互
4. **文字描边**：`-webkit-text-stroke` + `paint-order: stroke fill` 确保浅色壁纸上白字清晰
5. **外置主题**：主题从 `file://` 外部目录加载，添加主题无需重打包 asar

## ⚠ 注意事项

- **ZCode 更新后**：需要重新运行 `apply.js`（因为 app.asar 被覆盖）
- **回滚方法**：`resources/` 下有 `.bak` 备份文件，改名为 `app.asar` 覆盖即可
- **隐私**：open-meteo API 只传坐标，不传任何身份信息
- **坐标**：请修改 `weather-config.json` 中的坐标为你的实际位置

## 📄 License

MIT
