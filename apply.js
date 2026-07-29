#!/usr/bin/env node
/* ==========================================================================
 * ZCode 哆啦A梦四时壁纸 - 一键重装脚本
 *
 * 作用：把"四时段壁纸自动切换 + 全透明 UI + 无框按钮"机制
 *       注入到 ZCode 的 app.asar 里。幂等，可重复运行。
 *
 * 用法：
 *   1) 双击"一键重装.bat"
 *   2) 或命令行：node apply.js
 *
 * 适用场景：ZCode 升级覆盖了 app.asar 后，重新运行本脚本即可恢复壁纸机制。
 * ========================================================================== */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ---------- 配置 ----------
const SCRIPT_DIR = __dirname;
const INJECT_DIR = path.join(SCRIPT_DIR, 'inject');
const WALLPAPER_SRC = path.join(SCRIPT_DIR, 'wallpapers');

// 幂等标记：注入的内容用这对注释包起来，重复运行时先移除旧块
const MARK_BEGIN = '/* >>> ZCODE-WALLPAPER-INJECT BEGIN >>> */';
const MARK_END = '/* <<< ZCODE-WALLPAPER-INJECT END <<< */';
const BODY_MARK_BEGIN = '<!-- >>> ZCODE-WALLPAPER-BODY BEGIN >>> -->';
const BODY_MARK_END = '<!-- <<< ZCODE-WALLPAPER-BODY END <<< -->';
const SCRIPT_MARK_BEGIN = '<!-- >>> ZCODE-WALLPAPER-SCRIPT BEGIN >>> -->';
const SCRIPT_MARK_END = '<!-- <<< ZCODE-WALLPAPER-SCRIPT END <<< -->';
	const SWITCHER_MARK_BEGIN = '<!-- >>> ZCODE-WALLPAPER-SWITCHER BEGIN >>> -->';
	const SWITCHER_MARK_END = '<!-- <<< ZCODE-WALLPAPER-SWITCHER END <<< -->';
	const WEATHER_MARK_BEGIN = '<!-- >>> ZCODE-WALLPAPER-WEATHER BEGIN >>> -->';
	const WEATHER_MARK_END = '<!-- <<< ZCODE-WALLPAPER-WEATHER END <<< -->';
	const ENGINE_MARK_BEGIN = '<!-- >>> ZCODE-WALLPAPER-ENGINE BEGIN >>> -->';
	const ENGINE_MARK_END = '<!-- <<< ZCODE-WALLPAPER-ENGINE END <<< -->';
	const PANEL_MARK_BEGIN = '<!-- >>> ZCODE-WALLPAPER-PANEL BEGIN >>> -->';
	const PANEL_MARK_END = '<!-- <<< ZCODE-WALLPAPER-PANEL END <<< -->';
	const RAIN_MARK_BEGIN = '<!-- >>> ZCODE-WALLPAPER-RAIN BEGIN >>> -->';
	const RAIN_MARK_END = '<!-- <<< ZCODE-WALLPAPER-RAIN END <<< -->';
	const SETTINGS_MARK_BEGIN = '<!-- >>> ZCODE-WALLPAPER-SETTINGS BEGIN >>> -->';
	const SETTINGS_MARK_END = '<!-- <<< ZCODE-WALLPAPER-SETTINGS END <<< -->';

// ---------- 彩色日志 ----------
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', magenta: '\x1b[35m',
};
const log = (...a) => console.log(...a);
const ok = (m) => log(`${C.green}✓${C.reset} ${m}`);
const info = (m) => log(`${C.cyan}ℹ${C.reset} ${m}`);
const step = (m) => log(`\n${C.bold}${C.magenta}▶ ${m}${C.reset}`);
const warn = (m) => log(`${C.yellow}!${C.reset} ${m}`);
const die = (m) => { console.error(`${C.red}✗ ${m}${C.reset}`); process.exit(1); };

// ---------- 工具 ----------
function read(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function rmrf(p) { if (exists(p)) fs.rmSync(p, { recursive: true, force: true }); }

// 自动定位 ZCode 安装目录
function findZCodeDir() {
  // 1) 环境变量显式指定（最高优先级）：set ZCODE_DIR=D:\应用\Zcode
  if (process.env.ZCODE_DIR && exists(path.join(process.env.ZCODE_DIR, 'resources', 'app.asar'))) {
    return process.env.ZCODE_DIR;
  }
  // 2) 常见安装路径
  const candidates = [
    'D:\\应用\\Zcode',
    'C:\\Program Files\\ZCode',
    'C:\\Program Files (x86)\\ZCode',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'ZCode'),
    path.join(os.homedir(), 'AppData', 'Local', 'ZCode'),
  ];
  for (const c of candidates) {
    if (exists(path.join(c, 'resources', 'app.asar'))) return c;
  }
  // 3) 从 PATH 里 ripgrep 路径反推（ZCode 会把 tools 加进 PATH）
  try {
    const pathVar = process.env.PATH || '';
    for (const seg of pathVar.split(/;|:/)) {
      const m = seg.match(/^(.+?)[\\/]resources[\\/]tools/i);
      if (m && exists(path.join(m[1], 'resources', 'app.asar'))) return m[1];
    }
    // 形如 D:\应用\Zcode\resources\tools\ripgrep
    for (const seg of pathVar.split(/;|:/)) {
      const m = seg.match(/^(.+?)[\\/]Zcode([\\/]|$)/i);
      if (m) {
        const base = seg.replace(/[\\/]resources.*$/i, '');
        if (exists(path.join(base, 'resources', 'app.asar'))) return base;
      }
    }
  } catch {}
  return null;
}

// asar 操作：优先用本地 asar@3.x（CommonJS，自包含、零网络依赖），失败再回退 npx
// 注意：@electron/asar@4 是纯 ESM 无法 require，故用 asar@3.2.0（CJS，稳定）。
// 返回 {ok:boolean, error:string}，调用方据此判断
let _asarLib = null;
function loadAsar() {
  if (_asarLib) return _asarLib;
  // 1) 本地工具包自带的 asar（CJS）
  const localPaths = [
    path.join(SCRIPT_DIR, 'node_modules', 'asar'),
    path.join(__dirname, 'node_modules', 'asar'),
  ];
  for (const p of localPaths) {
    if (exists(p)) {
      try { _asarLib = require(p); return _asarLib; } catch (e) {}
    }
  }
  // 2) 退化：尝试全局/npx 缓存里的 asar
  try { _asarLib = require('asar'); return _asarLib; } catch (e) {}
  return null;
}

// 同步解包：extractAll(srcAsar, destDir)
function asarExtract(srcAsar, destDir) {
  const lib = loadAsar();
  if (!lib) return { ok: false, error: '未找到 @electron/asar 依赖，请在工具包目录运行 npm install' };
  try {
    // extractAll 会抛错（如缺 .unpacked 文件）；但我们只需要 out/renderer，
    // 容错：先用 extractAll，失败则用 extractFile 单独取需要的文件
    lib.extractAll(srcAsar, destDir);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// 异步打包：createPackage 是 async function，必须 await 否则 Promise rejection 漏掉
async function asarPack(srcDir, destAsar) {
  const lib = loadAsar();
  if (!lib) return { ok: false, error: '未找到 asar 依赖' };
  try {
    await lib.createPackage(srcDir, destAsar);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// 幂等替换：移除 [begin,end] 之间的旧内容（含标记），插入新内容
//   注意：对 newContent 做 trim，保证首次插入和后续替换产出完全一致（幂等）。
function replaceBlock(text, beginMark, endMark, newContent) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc(beginMark) + '[\\s\\S]*?' + esc(endMark));
  const block = `${beginMark}\n${newContent.replace(/^\n+|\n+$/g, '')}\n${endMark}`;
  if (re.test(text)) {
    return text.replace(re, block);
  }
  return null; // 没有旧块，需要由调用方决定插入位置
}

// 清理 v1.0 遗留：v1.0 是手工注入（无标记注释），需识别其特征并移除，
// 否则升级到 v2.0（带标记）时会与旧内容并存导致重复。
// 特征锚点（与 v1.0 模板一致）：
//   CSS:  "/* ============ 四时壁纸自动切换（哆啦A梦主题）============ */" 到 "</style>"
//   body: "<!-- 四时壁纸层" 到对应 "</div>"
//   JS:   "    <script>\n      // ============ 四时壁纸自动切换" 到 "</script>"
	function stripV1Legacy(html) {
	  let out = html;
	  // CSS 块：删除 v1.0 注入的 CSS 内容（在 <style> 内的尾巴），但保留 </style>
	  const cssMark = '/* ============ 四时壁纸自动切换';
	  let i = out.indexOf(cssMark);
	  if (i >= 0) {
	    let j = out.indexOf('</style>', i);
	    if (j > i) {
	      // 仅移除从 cssMark 到 </style> 之间的内容，</style> 本身保留
	      out = out.slice(0, i) + out.slice(j);
	    }
	  }
	  // body 壁纸层
	  out = out.replace(/[ \t]*<!-- 四时壁纸层[\s\S]*?<\/div>\n/, '');
	  // JS 块：匹配 v1.0 那个 <script>（含”四时壁纸自动切换”注释）
	  const jsMark = '    <script>\n      // ============ 四时壁纸自动切换';
	  i = out.indexOf(jsMark);
	  if (i >= 0) {
	    let j = out.indexOf('</script>', i);
	    if (j > i) out = out.slice(0, i) + out.slice(j + '</script>'.length);
	  }
	  return out;
	}

	// 修复历史损坏：文档开头被截断（<head> 内 <meta>/<title> 等被 <style> 吞噬或截断）
	// 特征：文件开头不是 <!DOCTYPE 或 <html
	function repairBrokenHead(html) {
	  const trimmed = html.trimStart();
	  if (/^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed)) {
	    return html; // 没损坏
	  }
	  // 损坏了：找到 <title> 和 <style> 来重构 head
	  info('检测到 <head> 损坏，正在修复...');
	  const titleIdx = html.indexOf('<title');
	  const styleIdx = html.indexOf('<style');
	  if (titleIdx < 0 || styleIdx < 0) {
	    warn('无法修复：缺少 <title> 或 <style>');
	    return html;
	  }
	  // 从 title 开始恢复：前面补全 DOCTYPE + html + head + meta
	  const metaTag = '<meta name="viewport" content="width=device-width, initial-scale=1.0" />';
	  const headStart = '<!DOCTYPE html>\n<html>\n<head>\n' + metaTag + '\n';
	  // title 和 style 之间的部分不动
	  // 确保第一个出现的 body 之前有 </head>
	  html = headStart + html.slice(titleIdx);
	  const bodyIdx = html.indexOf('<body');
	  if (bodyIdx >= 0) {
	    const beforeBody = html.slice(0, bodyIdx);
	    if (!beforeBody.includes('</head>')) {
	      // 在 <body 前插入 </head>
	      const headEndIdx = html.lastIndexOf('>', bodyIdx - 1) + 1;
	      html = html.slice(0, headEndIdx) + '\n</head>\n' + html.slice(headEndIdx);
	    }
	  }
		  return html;
		}
	
	// ---------- 主流程 ----------
async function main() {
  log(`${C.bold}${C.cyan}╔════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.cyan}║  ZCode 哆啦A梦四时壁纸 · 一键重装工具      ║${C.reset}`);
  log(`${C.bold}${C.cyan}╚════════════════════════════════════════════╝${C.reset}`);

  // 0) 前置检查
  if (!exists(INJECT_DIR)) die('找不到 inject/ 目录，工具包不完整。');
  const cssTpl = read(path.join(INJECT_DIR, 'css.css'));
  const bodyTpl = read(path.join(INJECT_DIR, 'body.html'));
	const jsTpl = read(path.join(INJECT_DIR, 'script.js'));
		let engineTpl = exists(path.join(INJECT_DIR, 'theme-engine.js'))
		  ? read(path.join(INJECT_DIR, 'theme-engine.js')) : null;
	const panelTpl = exists(path.join(INJECT_DIR, 'theme-panel.js'))
	  ? read(path.join(INJECT_DIR, 'theme-panel.js')) : null;
	const switcherTpl = exists(path.join(INJECT_DIR, 'switcher.js'))
	  ? read(path.join(INJECT_DIR, 'switcher.js')) : null;
	const weatherTpl = exists(path.join(INJECT_DIR, 'weather.js'))
	  ? read(path.join(INJECT_DIR, 'weather.js')) : null;
	const rainTpl = exists(path.join(INJECT_DIR, 'rain-effect.js'))
	  ? read(path.join(INJECT_DIR, 'rain-effect.js')) : null;
	const settingsTpl = exists(path.join(INJECT_DIR, 'settings.js'))
	  ? read(path.join(INJECT_DIR, 'settings.js')) : null;
  // 双套壁纸矩阵：clear/ + rain/ 各 4 张
  const wpFiles = ['doraemon-morning.png', 'doraemon-day.png', 'doraemon-dusk.png', 'doraemon-night.png'];
  const wpDirs = ['clear', 'rain'];
  for (const d of wpDirs) {
    for (const f of wpFiles) {
      if (!exists(path.join(WALLPAPER_SRC, d, f))) {
        die(`缺少壁纸文件: wallpapers/${d}/${f}`);
      }
    }
  }

  // 1) 定位 ZCode
  step('1/6  定位 ZCode 安装目录');
  const zcodeDir = findZCodeDir();
  if (!zcodeDir) {
    die('找不到 ZCode 安装目录。\n请用环境变量指定：set ZCODE_DIR=你的ZCode路径，再重试。');
  }
  const resourcesDir = path.join(zcodeDir, 'resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  if (!exists(asarPath)) die(`找不到 app.asar：${asarPath}`);
  ok(`ZCode 目录：${zcodeDir}`);

  // 2) 检测 ZCode 是否在运行
  step('2/6  检测 ZCode 进程');
  const forceInstall = process.argv.includes('--force');
  let running = false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq ZCode.exe" /NH', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    running = /ZCode\.exe/i.test(out);
  } catch {}
  if (running && !forceInstall) {
    console.error(`${C.red}✗ 检测到 ZCode 正在运行。${C.reset}`);
    console.error(`${C.red}✗ 请完全退出 ZCode（任务栏右下角图标 → 右键 → 退出）后再运行本脚本。${C.reset}`);
    console.error(`${C.red}✗ 对运行中宿主文件进行非原子覆盖存在损坏风险。${C.reset}`);
    console.error(`${C.yellow}提示：如需强制继续，请运行 node apply.js --force${C.reset}`);
    process.exit(2);
  }
  if (running && forceInstall) {
    warn('ZCode 正在运行，--force 模式：将尝试覆盖 app.asar（如有旧备份可回滚）');
  } else if (!running) {
    ok('ZCode 未运行，可直接替换。');
  }

  // 3) 解包 app.asar 到临时目录
  step('3/6  解包 app.asar');
  const workDir = path.join(os.tmpdir(), 'zcode-wp-work-' + Date.now());
  rmrf(workDir);
  fs.mkdirSync(workDir, { recursive: true });
  info(`解包到临时目录（约需 2-3 分钟，请耐心等待，勿关闭窗口）...`);
  const t0 = Date.now();
  const er = asarExtract(asarPath, workDir);
  if (!er.ok) {
    rmrf(workDir);
    die('解包失败：' + er.error);
  }
  info(`解包耗时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  const idxPath = path.join(workDir, 'out', 'renderer', 'index.html');
  if (!exists(idxPath)) { rmrf(workDir); die(`解包后找不到 out/renderer/index.html，路径结构可能已变化。`); }
  ok('解包完成');

  // 3b) 同步内置主题到外部目录 + 构造 BASE token
  const themesDir = path.join(resourcesDir, 'themes');
  
  // —— syncBundledThemes: 将项目内置主题同步到 ZCode resources/themes/
  function syncBundledThemes(srcDir, destDir) {
    const BUNDLED = ['doraemon']; // 安装器管理的主题（用户主题不会被覆盖）
    fs.mkdirSync(destDir, { recursive: true });
    
    // 读取现有注册表（保护用户自建主题）
    let existing = [];
    const regPath = path.join(destDir, '_registry.json');
    if (exists(regPath)) { try { existing = JSON.parse(read(regPath)).themes || []; } catch(e){} }
    
    // 复制/更新内置主题
    for (const id of BUNDLED) {
      const src = path.join(srcDir, id), dest = path.join(destDir, id);
      if (!exists(src)) { warn(`内置主题 ${id} 源目录缺失`); continue; }
      rmrf(dest); fs.cpSync(src, dest, { recursive: true });
      info(`内置主题 ${id} → 已同步`);
    }
    
    // 合并主题列表（内置 + 用户）并校验
    const all = [...new Set([...BUNDLED, ...existing.filter(t => !BUNDLED.includes(t))])];
    const valid = [];
    for (const id of all) {
      const d = path.join(destDir, id);
      if (!exists(d)) continue;
      const tj = path.join(d, 'theme.json');
      if (!exists(tj)) { warn(`主题 ${id} 缺少 theme.json`); continue; }
      try {
        const t = JSON.parse(read(tj));
        if (!t.id || !t.name || !t.type) { warn(`主题 ${id} theme.json 缺字段`); continue; }
        valid.push(id);
      } catch(e) { warn(`主题 ${id} theme.json 解析失败`); }
    }
    const def = valid.includes('doraemon') ? 'doraemon' : (valid[0] || 'doraemon');
    fs.writeFileSync(regPath, JSON.stringify({ themes: valid, default: def }, null, 2));
    ok(`_registry.json 已更新（${valid.length} 个主题，默认: ${def}）`);
    return valid;
  }
  
  // 执行同步（项目 themes/ → ZCode resources/themes/）
  step('3c/6  部署内置主题');
  const projectThemes = path.join(SCRIPT_DIR, 'themes');
  syncBundledThemes(projectThemes, themesDir);
  
  // 构造 file:// URL
  const themesBaseUrl = 'file:///' + themesDir.replace(/\\/g, '/') + '/';
  // 读取所有外置主题的元数据作为兜底（即使 XHR 被 Electron 拦截也能切换）
  let fallbackThemes = { __default__: 'doraemon' };
  try {
    // 从 _registry.json 获取所有已注册主题
    const regPath = path.join(themesDir, '_registry.json');
    if (exists(regPath)) {
      const reg = JSON.parse(read(regPath));
      const ids = reg.themes || [];
      for (const id of ids) {
        try {
          const themePath = path.join(themesDir, id, 'theme.json');
          if (exists(themePath)) {
            const themeJson = JSON.parse(read(themePath));
            fallbackThemes[themeJson.id] = themeJson;
          }
        } catch (e) { /* 单个主题加载失败不阻断整体 */ }
      }
      if (!fallbackThemes.__default__ || !fallbackThemes[fallbackThemes.__default__]) {
        fallbackThemes.__default__ = reg.default || ids[0] || 'doraemon';
      }
    }
  } catch (e) { warn('兜底主题读取失败，使用最小配置'); }
  // 确保至少 doraemon 存在
  if (!fallbackThemes.doraemon) {
    try {
      const doraTheme = read(path.join(themesDir, 'doraemon', 'theme.json'));
      fallbackThemes[JSON.parse(doraTheme).id] = JSON.parse(doraTheme);
    } catch (e2) { /* 忽略 */ }
  }
  // 替换 engineTpl 中的占位符
  if (engineTpl) {
    engineTpl = engineTpl.replace('__BASE_TOKEN__', JSON.stringify(themesBaseUrl));
    engineTpl = engineTpl.replace('__FALLBACK_TOKEN__', JSON.stringify(fallbackThemes));
  }

  // 4) 幂等注入 index.html
  step('4/6  注入壁纸机制（幂等）');
  let html = read(idxPath);
  let changed = false;

		  // 4-0) 清理 v1.0 遗留（无标记的手工注入内容），避免升级到 v2.0 时重复
		  //      v1.0 特征：含 #doraemon-wallpaper 但无 ZCODE-WALLPAPER-INJECT 标记
		  if (html.includes('#doraemon-wallpaper') && !html.includes('ZCODE-WALLPAPER-INJECT')) {
		    info('检测到 v1.0 遗留注入，正在清理...');
		    html = stripV1Legacy(html);
		    changed = true;
		    ok('v1.0 遗留已清理');
		  }

		  // 4-0c) 清理未标记的旧主题引擎代码（残留的 <script> 含 __DW_THEMES_BASE__ 且不在 ENGINE_MARK 内）
		  const staleEngineRe = /<script>\s*\/\/\s*=+\s*主题引擎[\s\S]*?var\s+(?:__DW_THEMES_BASE__|BASE\s*=\s*typeof\s+__DW_THEMES_BASE__)[\s\S]*?<\/script>/gi;
		  const staleCount = (html.match(staleEngineRe) || []).length;
		  if (staleCount > 0 && html.includes(ENGINE_MARK_BEGIN)) {
		    // 只有在已有 ENGINE_MARK 块时才清理（说明新版已注入，旧版应移除）
		    info(`清理 ${staleCount} 个残留旧主题引擎块...`);
		    html = html.replace(staleEngineRe, '');
		    changed = true;
		    ok('旧主题引擎已清理');
		  }

	  // 4-0b) 修复历史损坏：<head> 被截断
	  const beforeRepair = html.slice(0, Math.min(100, html.length));
	  html = repairBrokenHead(html);
	  if (html.slice(0, Math.min(100, html.length)) !== beforeRepair) {
	    info('检测到 <head> 损坏，已修复');
	    changed = true;
	  }


  // 4a) CSS：注入到第一个 </style> 之前
  const cssBlock = `${MARK_BEGIN}\n${cssTpl}${MARK_END}`;
  const cssReplaced = replaceBlock(html, MARK_BEGIN, MARK_END, cssTpl);
  if (cssReplaced !== null) {
    html = cssReplaced; info('CSS 块已更新（替换旧块）');
  } else if (/<\/style>/.test(html)) {
    html = html.replace(/<\/style>/, cssBlock + '\n    </style>');
    info('CSS 块已插入'); changed = true;
  } else {
    warn('未找到 </style>，跳过 CSS 注入');
  }

	  // 4b) body 壁纸层：注入到 </body> 之前（不插在 #root 前，避免影响布局）
	  const bodyBlock = `${BODY_MARK_BEGIN}\n${bodyTpl}${BODY_MARK_END}`;
	  const bodyReplaced = replaceBlock(html, BODY_MARK_BEGIN, BODY_MARK_END, bodyTpl);
	  if (bodyReplaced !== null) {
	    html = bodyReplaced; info('壁纸层已更新（替换旧块）');
	  } else if (/<\/body>/.test(html)) {
	    html = html.replace(/<\/body>/, bodyBlock + '\n  </body>');
	    info('壁纸层已插入'); changed = true;
	  } else {
	    warn('未找到 </body>，跳过壁纸层注入');
	  }

  // 4c) JS：注入到 </body> 之前
  const jsBlock = `${SCRIPT_MARK_BEGIN}\n${jsTpl}${SCRIPT_MARK_END}`;
  const jsReplaced = replaceBlock(html, SCRIPT_MARK_BEGIN, SCRIPT_MARK_END, jsTpl);
  if (jsReplaced !== null) {
    html = jsReplaced; info('切换脚本已更新（替换旧块）');
  } else if (/<\/body>/.test(html)) {
    html = html.replace(/<\/body>/, jsBlock + '\n  </body>');
    info('切换脚本已插入'); changed = true;
  } else {
    warn('未找到 </body>，跳过脚本注入');
  }

  // 4d) switcher.js（手动开关）：同样注入到 </body> 之前，紧挨主脚本之后
  let switcherReplaced = null;
  if (switcherTpl) {
    const switcherBlock = `${SWITCHER_MARK_BEGIN}\n${switcherTpl}${SWITCHER_MARK_END}`;
    switcherReplaced = replaceBlock(html, SWITCHER_MARK_BEGIN, SWITCHER_MARK_END, switcherTpl);
    if (switcherReplaced !== null) {
      html = switcherReplaced; info('手动开关已更新（替换旧块）');
    } else if (/<\/body>/.test(html)) {
      html = html.replace(/<\/body>/, switcherBlock + '\n  </body>');
      info('手动开关已插入'); changed = true;
    }
  }

  // 4d-bis) weather.js（open-meteo 自动检测）：注入到 </body> 之前，最后加载
  let weatherReplaced = null;
  if (weatherTpl) {
    const weatherBlock = `${WEATHER_MARK_BEGIN}\n${weatherTpl}${WEATHER_MARK_END}`;
    weatherReplaced = replaceBlock(html, WEATHER_MARK_BEGIN, WEATHER_MARK_END, weatherTpl);
    if (weatherReplaced !== null) {
      html = weatherReplaced; info('自动天气检测已更新（替换旧块）');
    } else if (/<\/body>/.test(html)) {
      html = html.replace(/<\/body>/, weatherBlock + '\n  </body>');
	      info('自动天气检测已插入'); changed = true;
	    }
	  }

	  // 4d-ter) theme-engine.js（主题引擎：外部主题加载、切换、渲染）
	  let engineReplaced = null;
	  if (engineTpl) {
	    const engineBlock = `${ENGINE_MARK_BEGIN}\n${engineTpl}${ENGINE_MARK_END}`;
	    engineReplaced = replaceBlock(html, ENGINE_MARK_BEGIN, ENGINE_MARK_END, engineTpl);
	    if (engineReplaced !== null) {
	      html = engineReplaced; info('主题引擎已更新（替换旧块）');
	    } else if (/<\/body>/.test(html)) {
	      html = html.replace(/<\/body>/, engineBlock + '\n  </body>');
	      info('主题引擎已插入'); changed = true;
	    }
	  }

	  // 4d-quater) theme-panel.js（主题管理面板 Ctrl+Shift+W）
	  let panelReplaced = null;
	  if (panelTpl) {
	    const panelBlock = `${PANEL_MARK_BEGIN}\n${panelTpl}${PANEL_MARK_END}`;
	    panelReplaced = replaceBlock(html, PANEL_MARK_BEGIN, PANEL_MARK_END, panelTpl);
	    if (panelReplaced !== null) {
	      html = panelReplaced; info('主题面板已更新（替换旧块）');
	    } else if (/<\/body>/.test(html)) {
	      html = html.replace(/<\/body>/, panelBlock + '\n  </body>');
	      info('主题面板已插入'); changed = true;
	    }
	  }

	  // 4d-quin) rain-effect.js（下雨 Canvas 动效）
	  let rainReplaced = null;
	  if (rainTpl) {
	    const rainBlock = `${RAIN_MARK_BEGIN}\n${rainTpl}${RAIN_MARK_END}`;
	    rainReplaced = replaceBlock(html, RAIN_MARK_BEGIN, RAIN_MARK_END, rainTpl);
	    if (rainReplaced !== null) {
	      html = rainReplaced; info('下雨动效已更新（替换旧块）');
	    } else if (/<\/body>/.test(html)) {
	      html = html.replace(/<\/body>/, rainBlock + '\n  </body>');
	      info('下雨动效已插入'); changed = true;
	    }
	  }

	  // 4d-sex) settings.js（天气配置面板 Ctrl+Shift+S）
	  let settingsReplaced = null;
	  if (settingsTpl) {
	    const settingsBlock = `${SETTINGS_MARK_BEGIN}\n${settingsTpl}${SETTINGS_MARK_END}`;
	    settingsReplaced = replaceBlock(html, SETTINGS_MARK_BEGIN, SETTINGS_MARK_END, settingsTpl);
	    if (settingsReplaced !== null) {
	      html = settingsReplaced; info('天气配置面板已更新（替换旧块）');
	    } else if (/<\/body>/.test(html)) {
	      html = html.replace(/<\/body>/, settingsBlock + '\n  </body>');
	      info('天气配置面板已插入'); changed = true;
	    }
	  }

	  if (!changed && cssReplaced === null && bodyReplaced === null && jsReplaced === null && switcherReplaced === null && weatherReplaced === null && engineReplaced === null && panelReplaced === null && rainReplaced === null && settingsReplaced === null) {
    warn('未发现可注入位置，index.html 结构可能已变化，请检查。');
  }
  fs.writeFileSync(idxPath, html, 'utf8');
  ok('index.html 注入完成');

  // 4e) 复制壁纸（双套矩阵 clear/ + rain/）
  const wpDest = path.join(workDir, 'out', 'renderer', 'wallpapers');
  rmrf(wpDest);
  fs.mkdirSync(wpDest, { recursive: true });
  let copied = 0;
  for (const d of wpDirs) {
    const sub = path.join(wpDest, d);
    fs.mkdirSync(sub, { recursive: true });
    for (const f of wpFiles) {
      fs.copyFileSync(path.join(WALLPAPER_SRC, d, f), path.join(sub, f));
      copied++;
    }
  }
  ok(`已复制 ${copied} 张壁纸（晴/雨各 ${wpFiles.length} 张）`);

  // 4f) 复制 weather-config.json（v3.0 自动检测用，先放进 asar）
  const cfgSrc = path.join(SCRIPT_DIR, 'weather-config.json');
  if (exists(cfgSrc)) {
    fs.copyFileSync(cfgSrc, path.join(wpDest, 'weather-config.json'));
    ok('已复制 weather-config.json（v3.0 预留）');
  }

  // 5) 重新打包
  step('5/6  重新打包 app.asar（约需 1-3 分钟，请耐心等待）');
  const newAsar = path.join(os.tmpdir(), 'app.asar.new-' + Date.now());
  rmrf(newAsar);
  info('打包中...');
  const t1 = Date.now();
  const pr = await asarPack(workDir, newAsar);
  if (!pr.ok || !exists(newAsar)) {
    rmrf(workDir); rmrf(newAsar);
    die('打包失败：' + (pr.error || '未知错误'));
  }
  ok(`打包完成：${(fs.statSync(newAsar).size / 1048576).toFixed(1)} MB，耗时 ${((Date.now() - t1) / 1000).toFixed(1)} 秒`);

  // 5b) 完整性校验：检查打包源 workDir 的内容（打包从此创建，源对即包对）
  step('5b/6  校验完整性');
  const vHtml = read(idxPath);
	  const needMarks = [MARK_BEGIN, BODY_MARK_BEGIN, SCRIPT_MARK_BEGIN, SWITCHER_MARK_BEGIN, WEATHER_MARK_BEGIN, ENGINE_MARK_BEGIN, PANEL_MARK_BEGIN, RAIN_MARK_BEGIN, SETTINGS_MARK_BEGIN];
  const missing = needMarks.filter(m => !vHtml.includes(m));
	  if (missing.length > 0) {
	    rmrf(workDir); rmrf(newAsar);
	    die('完整性校验失败：缺少注入标记 ' + missing.join(', ') + '，已中止替换（线上未受影响）。');
	  }
	  // 检查 HTML 文档结构完好
	  const vTrimmed = vHtml.trimStart();
	  if (!/^<!DOCTYPE/i.test(vTrimmed) && !/^<html/i.test(vTrimmed)) {
	    rmrf(workDir); rmrf(newAsar);
	    die('完整性校验失败：HTML 文档开头损坏（应始于 <!DOCTYPE 或 <html），已中止替换。请尝试从备份恢复。');
	  }
  // 壁纸数量
  let wpCount = 0;
  for (const d of wpDirs) {
    for (const f of wpFiles) {
      if (exists(path.join(wpDest, d, f))) wpCount++;
    }
  }
  if (wpCount < wpDirs.length * wpFiles.length) {
    rmrf(workDir); rmrf(newAsar);
    die(`完整性校验失败：壁纸不足（${wpCount}/${wpDirs.length * wpFiles.length}），已中止替换。`);
  }
  ok(`完整性校验通过（${needMarks.length} 标记 + ${wpCount} 壁纸齐全）`);

  // 6) 备份 + 原子替换
  step('6/6  备份原文件并原子替换');
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const bakPath = path.join(resourcesDir, `app.asar.bak.${ts}`);
  try { fs.copyFileSync(asarPath, bakPath); ok(`已备份原版：${path.basename(bakPath)}`); }
  catch (e) { rmrf(workDir); rmrf(newAsar); die(`备份失败：${e.message}`); }
  
  // 原子替换：先写到同目录临时文件，再 rename（rename 比 copy 更接近原子操作）
  const tmpPath = asarPath + '.tmp-' + Date.now();
  try {
    fs.copyFileSync(newAsar, tmpPath);
    const tmpSize = fs.statSync(tmpPath).size;
    const newSize = fs.statSync(newAsar).size;
    if (tmpSize !== newSize) throw new Error(`临时文件大小不匹配 (${tmpSize} vs ${newSize})`);
    // 尝试原子 rename；如被占用则降级为 copyFileSync
    try { fs.renameSync(tmpPath, asarPath); ok('已原子替换 app.asar'); }
    catch (rErr) {
      if (rErr.code === 'EPERM' || rErr.code === 'EBUSY') {
        fs.copyFileSync(tmpPath, asarPath);
        try { fs.unlinkSync(tmpPath); } catch(_) {}
        ok('已替换 app.asar（copy 降级，因文件被占用）');
      } else throw rErr;
    }
  } catch (e) {
    try { if (exists(tmpPath)) fs.unlinkSync(tmpPath); } catch(_) {}
    rmrf(workDir); rmrf(newAsar);
    die(`替换失败：${e.message}\n原文件未被破坏。`);
  }

  // 清理临时文件
  rmrf(workDir);
  rmrf(newAsar);

  log(`\n${C.bold}${C.green}╔════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.green}║  ✅  重装完成！                              ║${C.reset}`);
  log(`${C.bold}${C.green}╚════════════════════════════════════════════╝${C.reset}`);
  if (running) {
    log(`\n${C.yellow}下一步：请完全退出 ZCode 并重新打开，即可看到效果。${C.reset}`);
  } else {
    log(`\n${C.green}下一步：打开 ZCode 即可看到效果。${C.reset}`);
  }
  log(`${C.dim}回滚方法：把 ${path.basename(bakPath)} 改名为 app.asar 覆盖即可。${C.reset}`);
}

main().catch(e => die('意外错误：' + (e.stack || e.message)));
