#!/usr/bin/env node
/* ==========================================================================
 * ZCode 哆啦A梦四时壁纸 - 一键重装脚本
 *
 * 作用：把"四时段壁纸自动切换 + 全透明 UI + 无框按钮"机制
 *       注入到 ZCode 的 app.asar 里。幂等，可重复运行。
 *
 * 安全特性：
 *   - SHA-256 完整性校验（原始 asar、备份、新 asar）
 *   - 最终包重新解包验证（不信任打包过程的隐式正确性）
 *   - 原子重命名替换（无 copyFileSync 降级）
 *   - 事务状态文件，中断后可检测和恢复
 *   - 宿主版本指纹白名单
 *   - --restore latest 自动回滚
 *
 * 用法：
 *   1) 双击"一键重装.bat"
 *   2) 或命令行：node apply.js
 *   3) 回滚：node apply.js --restore latest
 *   4) 检查：node apply.js --check
 * ========================================================================== */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ==========================================================================
// 版本与兼容性声明
// ==========================================================================
const PATCHER_VERSION = '0.6.0-beta.2';
const PATCHER_SCHEMA = 1;

// 已知兼容的 ZCode 版本白名单（空数组 = 信任所有，有值则严格匹配）
const COMPATIBLE_ZCODE_VERSIONS = [];

// 需要从解包 index.html 中检查的结构锚点
const REQUIRED_ANCHORS = ['</style>', '</body>'];

// 事务状态文件名（放在 resources/ 下）
const TRANSACTION_FILE = '.zcode-wallpaper-transaction.json';

// ---------- 配置 ----------
const SCRIPT_DIR = __dirname;
const INJECT_DIR = path.join(SCRIPT_DIR, 'inject');
const WALLPAPER_SRC = path.join(SCRIPT_DIR, 'wallpapers');

// 幂等标记
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

// ---------- 工具函数 ----------
function read(p) { return fs.readFileSync(p, 'utf8'); }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function rmrf(p) { if (exists(p)) fs.rmSync(p, { recursive: true, force: true }); }

// SHA-256 哈希
function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// 同步版 SHA-256（小文件用）
function sha256Sync(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ---------- 事务管理 ----------
function transactionPath(resourcesDir) {
  return path.join(resourcesDir, TRANSACTION_FILE);
}

function loadTransaction(resourcesDir) {
  const tp = transactionPath(resourcesDir);
  if (!exists(tp)) return null;
  try { return JSON.parse(read(tp)); } catch { return null; }
}

function saveTransaction(resourcesDir, state) {
  const tp = transactionPath(resourcesDir);
  fs.writeFileSync(tp, JSON.stringify(state, null, 2), 'utf8');
}

function clearTransaction(resourcesDir) {
  const tp = transactionPath(resourcesDir);
  if (exists(tp)) fs.unlinkSync(tp);
}

// ---------- 自动定位 ZCode ----------
function findZCodeDir() {
  if (process.env.ZCODE_DIR && exists(path.join(process.env.ZCODE_DIR, 'resources', 'app.asar'))) {
    return process.env.ZCODE_DIR;
  }
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
  try {
    const pathVar = process.env.PATH || '';
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

// ---------- asar ----------
let _asarLib = null;
function loadAsar() {
  if (_asarLib) return _asarLib;
  const localPaths = [
    path.join(SCRIPT_DIR, 'node_modules', 'asar'),
    path.join(__dirname, 'node_modules', 'asar'),
  ];
  for (const p of localPaths) {
    if (exists(p)) {
      try { _asarLib = require(p); return _asarLib; } catch (e) {}
    }
  }
  try { _asarLib = require('asar'); return _asarLib; } catch (e) {}
  return null;
}

function asarExtract(srcAsar, destDir) {
  const lib = loadAsar();
  if (!lib) return { ok: false, error: '未找到 @electron/asar 依赖，请在工具包目录运行 npm install' };
  try {
    lib.extractAll(srcAsar, destDir);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

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

// ---------- 幂等替换 ----------
function replaceBlock(text, beginMark, endMark, newContent) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc(beginMark) + '[\\s\\S]*?' + esc(endMark));
  const block = `${beginMark}\n${newContent.replace(/^\n+|\n+$/g, '')}\n${endMark}`;
  if (re.test(text)) {
    return text.replace(re, block);
  }
  return null;
}

// ---------- v1.0 遗留清理 ----------
function stripV1Legacy(html) {
  let out = html;
  const cssMark = '/* ============ 四时壁纸自动切换';
  let i = out.indexOf(cssMark);
  if (i >= 0) {
    let j = out.indexOf('</style>', i);
    if (j > i) out = out.slice(0, i) + out.slice(j);
  }
  out = out.replace(/[ \t]*<!-- 四时壁纸层[\s\S]*?<\/div>\n/, '');
  const jsMark = '    <script>\n      // ============ 四时壁纸自动切换';
  i = out.indexOf(jsMark);
  if (i >= 0) {
    let j = out.indexOf('</script>', i);
    if (j > i) out = out.slice(0, i) + out.slice(j + '</script>'.length);
  }
  return out;
}

function repairBrokenHead(html) {
  const trimmed = html.trimStart();
  if (/^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed)) {
    return html;
  }
  info('检测到 <head> 损坏，正在修复...');
  const titleIdx = html.indexOf('<title');
  const styleIdx = html.indexOf('<style');
  if (titleIdx < 0 || styleIdx < 0) {
    warn('无法修复：缺少 <title> 或 <style>');
    return html;
  }
  const metaTag = '<meta name="viewport" content="width=device-width, initial-scale=1.0" />';
  const headStart = '<!DOCTYPE html>\n<html>\n<head>\n' + metaTag + '\n';
  html = headStart + html.slice(titleIdx);
  const bodyIdx = html.indexOf('<body');
  if (bodyIdx >= 0) {
    const beforeBody = html.slice(0, bodyIdx);
    if (!beforeBody.includes('</head>')) {
      const headEndIdx = html.lastIndexOf('>', bodyIdx - 1) + 1;
      html = html.slice(0, headEndIdx) + '\n</head>\n' + html.slice(headEndIdx);
    }
  }
  return html;
}

// ---------- 生成 registry.js ----------
function generateRegistryJs(themesDirParam) {
  try {
    const rp = path.join(themesDirParam, '_registry.json');
    if (!exists(rp)) { warn('_registry.json 不存在，跳过 registry.js 生成'); return; }
    const r = JSON.parse(read(rp));
    const extThemes = { __default__: r.default || 'doraemon' };
    for (const tid of (r.themes || [])) {
      try {
        const tp = path.join(themesDirParam, tid, 'theme.json');
        if (exists(tp)) {
          const tj = JSON.parse(read(tp));
          extThemes[tj.id] = tj;
        }
      } catch (e2) { /* skip broken themes */ }
    }
    const jsContent = 'window.__DW_EXTERNAL_THEMES__ = ' + JSON.stringify(extThemes, null, 2) + ';\n';
    const rjPath = path.join(themesDirParam, 'registry.js');
    fs.writeFileSync(rjPath, jsContent, 'utf8');
    ok(`registry.js 已更新（${Object.keys(extThemes).filter(k => k !== '__default__').length} 个主题）`);
    return extThemes;
  } catch (e) { warn('registry.js 生成失败: ' + e.message); return null; }
}

// ---------- 验证最终 ASAR（重新解包检查） ----------
async function verifyFinalAsar(asarPath, expectedMarks, expectedWpCount) {
  info('最终包验证：重新解包检查...');
  const verifyDir = path.join(os.tmpdir(), 'zcode-wp-verify-' + Date.now());
  rmrf(verifyDir);
  fs.mkdirSync(verifyDir, { recursive: true });

  const er = asarExtract(asarPath, verifyDir);
  if (!er.ok) {
    rmrf(verifyDir);
    return { ok: false, error: '最终包解包失败: ' + er.error };
  }

  // 验证 index.html
  const idxPath = path.join(verifyDir, 'out', 'renderer', 'index.html');
  if (!exists(idxPath)) {
    rmrf(verifyDir);
    return { ok: false, error: '最终包缺少 out/renderer/index.html' };
  }

  const html = read(idxPath);
  const missing = expectedMarks.filter(m => !html.includes(m));
  if (missing.length > 0) {
    rmrf(verifyDir);
    return { ok: false, error: '最终包缺少注入标记: ' + missing.join(', ') };
  }

  const trimmed = html.trimStart();
  if (!/^<!DOCTYPE/i.test(trimmed) && !/^<html/i.test(trimmed)) {
    rmrf(verifyDir);
    return { ok: false, error: '最终包 HTML 文档结构损坏' };
  }

  // 验证壁纸文件
  let wpCount = 0;
  const wpDirs = ['clear', 'rain'];
  const wpFiles = ['doraemon-morning.png', 'doraemon-day.png', 'doraemon-dusk.png', 'doraemon-night.png'];
  if (expectedWpCount > 0) {
    for (const d of wpDirs) {
      for (const f of wpFiles) {
        if (exists(path.join(verifyDir, 'out', 'renderer', 'wallpapers', d, f))) wpCount++;
      }
    }
    if (wpCount < expectedWpCount) {
      rmrf(verifyDir);
      return { ok: false, error: `最终包壁纸不足 (${wpCount}/${expectedWpCount})` };
    }
  }

  // 计算最终包 SHA-256
  const packHash = sha256Sync(asarPath);

  rmrf(verifyDir);
  return { ok: true, sha256: packHash, markCount: expectedMarks.length, wpCount };
}

// ---------- 生成构建 manifest ----------
function generateBuildManifest(zcodeDir, zcodeVersion, origAsarSha256, newAsarSha256, indexSha256) {
  return {
    patcherVersion: PATCHER_VERSION,
    schemaVersion: PATCHER_SCHEMA,
    buildTime: new Date().toISOString(),
    zcode: {
      dir: zcodeDir,
      version: zcodeVersion || 'unknown',
      asarSha256: origAsarSha256,
      indexSha256: indexSha256,
    },
    result: {
      newAsarSha256: newAsarSha256,
    },
    modules: ['css', 'body', 'script', 'switcher', 'weather', 'engine', 'panel', 'rain', 'settings'],
  };
}

// ---------- 检测 ZCode 版本 ----------
function detectZCodeVersion(zcodeDir) {
  // 尝试从 app-update.yml 或 package.json 获取版本
  const updateYml = path.join(zcodeDir, 'resources', 'app-update.yml');
  if (exists(updateYml)) {
    try {
      const content = read(updateYml);
      const m = content.match(/^version:\s*["']?([^\s"']+)["']?/m);
      if (m) return m[1];
    } catch {}
  }
  // 尝试从 electron 的 app.asar 中获取
  return null;
}

// ======================================================================
//  --restore 命令
// ======================================================================
async function cmdRestore() {
  log(`${C.bold}${C.cyan}╔════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.cyan}║  ZCode 壁纸 · 自动回滚工具               ║${C.reset}`);
  log(`${C.bold}${C.cyan}╚════════════════════════════════════════════╝${C.reset}`);

  const zcodeDir = findZCodeDir();
  if (!zcodeDir) die('找不到 ZCode 安装目录。');
  const resourcesDir = path.join(zcodeDir, 'resources');
  const asarPath = path.join(resourcesDir, 'app.asar');

  // 列出所有备份
  const backups = fs.readdirSync(resourcesDir)
    .filter(f => f.startsWith('app.asar.bak.'))
    .sort()
    .reverse();

  if (backups.length === 0) die('未找到任何备份文件。');

  const target = process.argv.includes('--restore') ? 'latest' : null;
  // 如果参数是 --restore <name>，匹配
  const restoreIdx = process.argv.indexOf('--restore');
  const explicitName = (restoreIdx >= 0 && restoreIdx < process.argv.length - 1) ? process.argv[restoreIdx + 1] : 'latest';

  let backupFile;
  if (explicitName === 'latest') {
    backupFile = backups[0];
    info(`最近的备份: ${backupFile} (共 ${backups.length} 个备份可用)`);
  } else {
    const match = backups.find(f => f.includes(explicitName));
    if (!match) die(`未找到匹配 "${explicitName}" 的备份。可用备份:\n  ${backups.join('\n  ')}`);
    backupFile = match;
  }

  const bakPath = path.join(resourcesDir, backupFile);
  log(`\n即将从备份恢复: ${backupFile}`);

  // 验证备份完整性
  step('校验备份文件');
  if (!exists(bakPath)) die('备份文件不存在: ' + bakPath);
  const bakSize = fs.statSync(bakPath).size;
  if (bakSize < 1000000) die('备份文件过小，可能已损坏。');
  ok(`备份大小: ${(bakSize / 1048576).toFixed(1)} MB`);

  // 备份当前 app.asar 为可追溯的 previous
  step('备份当前 app.asar → app.asar.previous');
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const previousPath = path.join(resourcesDir, `app.asar.previous.${ts}`);
  try {
    fs.copyFileSync(asarPath, previousPath);
    ok(`当前版本已备份: ${path.basename(previousPath)}`);
  } catch (e) {
    warn('无法备份当前版本: ' + e.message + '（继续恢复）');
  }

  // 原子替换
  step('恢复备份');
  const tmpPath = asarPath + '.restore-tmp-' + Date.now();
  try {
    fs.copyFileSync(bakPath, tmpPath);
    // 验证临时文件
    const tmpSize = fs.statSync(tmpPath).size;
    if (tmpSize !== bakSize) throw new Error('临时文件大小不匹配');
    // 原子重命名
    try {
      fs.renameSync(tmpPath, asarPath);
    } catch (rErr) {
      if (rErr.code === 'EPERM' || rErr.code === 'EBUSY') {
        die('无法替换 app.asar，请完全退出 ZCode 后重试。');
      }
      throw rErr;
    }
  } catch (e) {
    try { if (exists(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    die('恢复失败: ' + e.message);
  }

  ok(`已恢复至 ${backupFile}`);
  log(`\n${C.green}完成！请完全退出 ZCode 并重新打开。${C.reset}`);
  log(`如需要回退此操作，可用 --restore 指定 ${path.basename(previousPath)}`);
}

// ======================================================================
//  --check 命令
// ======================================================================
async function cmdCheck() {
  log(`${C.bold}${C.cyan}╔════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.cyan}║  ZCode 壁纸 · 环境诊断                   ║${C.reset}`);
  log(`${C.bold}${C.cyan}╚════════════════════════════════════════════╝${C.reset}`);

  const zcodeDir = findZCodeDir();
  if (!zcodeDir) { warn('未找到 ZCode 安装目录。'); return; }
  ok(`ZCode 目录: ${zcodeDir}`);

  const resourcesDir = path.join(zcodeDir, 'resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  if (!exists(asarPath)) { warn('app.asar 不存在'); return; }

  const asarSize = fs.statSync(asarPath).size;
  const asarHash = sha256Sync(asarPath);
  ok(`app.asar: ${(asarSize / 1048576).toFixed(1)} MB`);
  info(`SHA-256: ${asarHash}`);

  // 检测版本
  const ver = detectZCodeVersion(zcodeDir);
  if (ver) ok(`ZCode 版本: ${ver}`);

  // 检查事务
  const tx = loadTransaction(resourcesDir);
  if (tx) {
    warn(`存在未清理的事务记录 (${tx.buildTime})`);
    if (tx.result && tx.result.newAsarSha256) {
      info(`上次构建 SHA-256: ${tx.result.newAsarSha256}`);
    }
  } else {
    ok('无待处理事务');
  }

  // 列出备份
  const backups = fs.readdirSync(resourcesDir)
    .filter(f => f.startsWith('app.asar.bak.'))
    .sort()
    .reverse();
  if (backups.length > 0) {
    info(`可用备份 (${backups.length}):`);
    backups.forEach(b => {
      const bp = path.join(resourcesDir, b);
      const bs = fs.statSync(bp).size;
      info(`  ${b} (${(bs / 1048576).toFixed(1)} MB)`);
    });
  } else {
    warn('无可用备份');
  }
}

// ======================================================================
// 主流程
// ======================================================================
async function main() {
  log(`${C.bold}${C.cyan}╔════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.cyan}║  ZCode 哆啦A梦四时壁纸 v${PATCHER_VERSION.padEnd(10)}║${C.reset}`);
  log(`${C.bold}${C.cyan}╚════════════════════════════════════════════╝${C.reset}`);

  // ---- 模式路由 ----
  if (process.argv.includes('--restore')) {
    await cmdRestore();
    return;
  }
  if (process.argv.includes('--check')) {
    await cmdCheck();
    return;
  }

  // ---- 前置检查 ----
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

  const wpFiles = ['doraemon-morning.png', 'doraemon-day.png', 'doraemon-dusk.png', 'doraemon-night.png'];
  const wpDirs = ['clear', 'rain'];

  // --refresh-only 模式
  if (process.argv.includes('--refresh-only')) {
    const zcodeDir = findZCodeDir();
    if (!zcodeDir) die('找不到 ZCode 安装目录。');
    const td = path.join(zcodeDir, 'resources', 'themes');
    generateRegistryJs(td);
    log(`${C.green}完成！重启 ZCode 后新主题即可被发现。${C.reset}`);
    process.exit(0);
  }

  const refreshFallbackOnly = process.argv.includes('--refresh-theme-fallback');

  // 壁纸文件检查
  for (const d of wpDirs) {
    for (const f of wpFiles) {
      if (!refreshFallbackOnly && !exists(path.join(WALLPAPER_SRC, d, f))) {
        die(`缺少壁纸文件: wallpapers/${d}/${f}`);
      }
    }
  }

  // ---- 1) 定位 ZCode ----
  step('1/6  定位 ZCode 安装目录');
  const zcodeDir = findZCodeDir();
  if (!zcodeDir) {
    die('找不到 ZCode 安装目录。\n请用环境变量指定：set ZCODE_DIR=你的ZCode路径，再重试。');
  }
  const resourcesDir = path.join(zcodeDir, 'resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  if (!exists(asarPath)) die(`找不到 app.asar：${asarPath}`);
  ok(`ZCode 目录：${zcodeDir}`);

  // ---- 1b) 宿主版本指纹 ----
  step('1b/6  宿主版本检查');
  const zcodeVersion = detectZCodeVersion(zcodeDir);
  if (zcodeVersion) info(`ZCode 版本: ${zcodeVersion}`);
  else warn('无法检测 ZCode 版本');

  if (COMPATIBLE_ZCODE_VERSIONS.length > 0) {
    if (!zcodeVersion || !COMPATIBLE_ZCODE_VERSIONS.includes(zcodeVersion)) {
      die(`当前 ZCode 版本 "${zcodeVersion || 'unknown'}" 不在兼容白名单中。\n` +
        `本次未修改任何文件。如确认兼容，请更新 COMPATIBLE_ZCODE_VERSIONS。`);
    }
    ok(`版本 ${zcodeVersion} 在白名单中`);
  } else {
    info('兼容白名单未设置，信任所有版本');
  }

  // 计算原始 asar 的 SHA-256
  info('计算原始 app.asar SHA-256...');
  const origAsarSha256 = sha256Sync(asarPath);
  info(`原始 asar SHA-256: ${origAsarSha256}`);

  // ---- 2) 检测 ZCode 进程 ----
  step('2/6  检测 ZCode 进程');
  const forceInstall = process.argv.includes('--force');
  let running = false;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq ZCode.exe" /NH', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    running = /ZCode\.exe/i.test(out);
  } catch {}
  if (running && !forceInstall) {
    die('检测到 ZCode 正在运行。请完全退出 ZCode 后再运行。\n如需强制，使用 --force（有损坏风险）。');
  }
  if (running && forceInstall) {
    warn('ZCode 正在运行，--force 模式：风险自担');
  } else if (!running) {
    ok('ZCode 未运行');
  }

  // ---- 事务开始 ----
  const txId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  saveTransaction(resourcesDir, {
    id: txId,
    patcherVersion: PATCHER_VERSION,
    buildTime: new Date().toISOString(),
    zcodeDir: zcodeDir,
    origAsarSha256: origAsarSha256,
    status: 'extracting',
  });

  // ---- 3) 解包 ----
  step('3/6  解包 app.asar');
  const workDir = path.join(os.tmpdir(), 'zcode-wp-work-' + Date.now());
  rmrf(workDir);
  fs.mkdirSync(workDir, { recursive: true });
  info('解包到临时目录...');
  const t0 = Date.now();
  const er = asarExtract(asarPath, workDir);
  if (!er.ok) {
    rmrf(workDir); clearTransaction(resourcesDir);
    die('解包失败：' + er.error);
  }
  info(`解包耗时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  const idxPath = path.join(workDir, 'out', 'renderer', 'index.html');
  if (!exists(idxPath)) { rmrf(workDir); clearTransaction(resourcesDir); die('解包后找不到 out/renderer/index.html'); }
  ok('解包完成');

  // 计算原始 index.html SHA-256
  const origIndexSha256 = sha256Sync(idxPath);

  // 检查结构锚点
  const origHtml = read(idxPath);
  for (const anchor of REQUIRED_ANCHORS) {
    if (!origHtml.includes(anchor)) {
      rmrf(workDir); clearTransaction(resourcesDir);
      die(`结构锚点 "${anchor}" 未找到，index.html 结构可能已变化。`);
    }
  }
  ok('结构锚点检查通过');

  // 更新事务
  saveTransaction(resourcesDir, {
    id: txId,
    patcherVersion: PATCHER_VERSION,
    buildTime: new Date().toISOString(),
    zcodeDir: zcodeDir,
    origAsarSha256: origAsarSha256,
    origIndexSha256: origIndexSha256,
    status: 'injecting',
  });

  // ---- 3b) 同步内置主题 ----
  const themesDir = path.join(resourcesDir, 'themes');
  function syncBundledThemes(srcDir, destDir) {
    const BUNDLED = ['doraemon'];
    fs.mkdirSync(destDir, { recursive: true });
    let existing = [];
    const regPath = path.join(destDir, '_registry.json');
    if (exists(regPath)) { try { existing = JSON.parse(read(regPath)).themes || []; } catch(e){} }
    for (const id of BUNDLED) {
      const src = path.join(srcDir, id), dest = path.join(destDir, id);
      if (!exists(src)) { warn(`内置主题 ${id} 源目录缺失`); continue; }
      rmrf(dest); fs.cpSync(src, dest, { recursive: true });
    }
    const all = [...new Set([...BUNDLED, ...existing.filter(t => !BUNDLED.includes(t))])];
    const valid = [];
    for (const id of all) {
      const d = path.join(destDir, id);
      if (!exists(d)) continue;
      const tj = path.join(d, 'theme.json');
      if (!exists(tj)) continue;
      try {
        const t = JSON.parse(read(tj));
        if (!t.id || !t.name || !t.type) continue;
        valid.push(id);
      } catch(e) {}
    }
    const def = valid.includes('doraemon') ? 'doraemon' : (valid[0] || 'doraemon');
    fs.writeFileSync(regPath, JSON.stringify({ themes: valid, default: def }, null, 2));
    return valid;
  }

  step('3c/6  部署内置主题');
  const projectThemes = path.join(SCRIPT_DIR, 'themes');
  syncBundledThemes(projectThemes, themesDir);
  const themesBaseUrl = 'file:///' + themesDir.replace(/\\/g, '/') + '/';
  let fallbackThemes = { __default__: 'doraemon' };
  try {
    const regPath = path.join(themesDir, '_registry.json');
    if (exists(regPath)) {
      const reg = JSON.parse(read(regPath));
      for (const id of (reg.themes || [])) {
        try {
          const themePath = path.join(themesDir, id, 'theme.json');
          if (exists(themePath)) {
            const themeJson = JSON.parse(read(themePath));
            fallbackThemes[themeJson.id] = themeJson;
          }
        } catch (e) {}
      }
      fallbackThemes.__default__ = reg.default || 'doraemon';
    }
  } catch (e) { warn('兜底主题读取失败'); }
  generateRegistryJs(themesDir);
  if (engineTpl) {
    engineTpl = engineTpl.replace('__BASE_TOKEN__', JSON.stringify(themesBaseUrl));
    engineTpl = engineTpl.replace('__FALLBACK_TOKEN__', JSON.stringify(fallbackThemes));
  }

  // ---- 4) 注入 ----
  step('4/6  注入壁纸机制（幂等）');
  let html = read(idxPath);
  let changed = false;

  // 清理 v1.0
  if (html.includes('#doraemon-wallpaper') && !html.includes('ZCODE-WALLPAPER-INJECT')) {
    info('检测到 v1.0 遗留注入，正在清理...');
    html = stripV1Legacy(html);
    changed = true;
    ok('v1.0 遗留已清理');
  }

  // 清理残留旧引擎
  const staleEngineRe = /<script>\s*\/\/\s*=+\s*主题引擎[\s\S]*?var\s+(?:__DW_THEMES_BASE__|BASE\s*=\s*typeof\s+__DW_THEMES_BASE__)[\s\S]*?<\/script>/gi;
  if ((html.match(staleEngineRe) || []).length > 0 && html.includes(ENGINE_MARK_BEGIN)) {
    info('清理残留旧主题引擎块...');
    html = html.replace(staleEngineRe, '');
    changed = true;
    ok('旧主题引擎已清理');
  }

  // 清理旧标记
  const staleMarkerNames = ['THEMEENGINE', 'THEMEPANEL'];
  for (const sm of staleMarkerNames) {
    const sBegin = '<!-- >>> ZCODE-WALLPAPER-' + sm + ' BEGIN >>> -->';
    const sEnd = '<!-- <<< ZCODE-WALLPAPER-' + sm + ' END <<< -->';
    if (html.includes(sBegin) && html.includes(sEnd)) {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(esc(sBegin) + '[\\s\\S]*?' + esc(sEnd), 'g');
      html = html.replace(re, '');
      info(`清理残留「${sm}」标记块`);
      changed = true;
    }
  }

  // 修复 head
  html = repairBrokenHead(html);

  // CSS
  const cssBlock = `${MARK_BEGIN}\n${cssTpl}${MARK_END}`;
  const cssReplaced = replaceBlock(html, MARK_BEGIN, MARK_END, cssTpl);
  if (cssReplaced !== null) { html = cssReplaced; info('CSS 块已更新'); }
  else if (/<\/style>/.test(html)) { html = html.replace(/<\/style>/, cssBlock + '\n    </style>'); info('CSS 块已插入'); changed = true; }

  // body
  const bodyBlock = `${BODY_MARK_BEGIN}\n${bodyTpl}${BODY_MARK_END}`;
  const bodyReplaced = replaceBlock(html, BODY_MARK_BEGIN, BODY_MARK_END, bodyTpl);
  if (bodyReplaced !== null) { html = bodyReplaced; info('壁纸层已更新'); }
  else if (/<\/body>/.test(html)) { html = html.replace(/<\/body>/, bodyBlock + '\n  </body>'); info('壁纸层已插入'); changed = true; }

  // JS
  const jsBlock = `${SCRIPT_MARK_BEGIN}\n${jsTpl}${SCRIPT_MARK_END}`;
  const jsReplaced = replaceBlock(html, SCRIPT_MARK_BEGIN, SCRIPT_MARK_END, jsTpl);
  if (jsReplaced !== null) { html = jsReplaced; info('切换脚本已更新'); }
  else if (/<\/body>/.test(html)) { html = html.replace(/<\/body>/, jsBlock + '\n  </body>'); info('切换脚本已插入'); changed = true; }

  // 其余模块
  const modules = [
    { tpl: switcherTpl, begin: SWITCHER_MARK_BEGIN, end: SWITCHER_MARK_END, name: '手动开关' },
    { tpl: weatherTpl, begin: WEATHER_MARK_BEGIN, end: WEATHER_MARK_END, name: '自动天气检测' },
    { tpl: engineTpl, begin: ENGINE_MARK_BEGIN, end: ENGINE_MARK_END, name: '主题引擎' },
    { tpl: panelTpl, begin: PANEL_MARK_BEGIN, end: PANEL_MARK_END, name: '主题面板' },
    { tpl: rainTpl, begin: RAIN_MARK_BEGIN, end: RAIN_MARK_END, name: '下雨动效' },
    { tpl: settingsTpl, begin: SETTINGS_MARK_BEGIN, end: SETTINGS_MARK_END, name: '天气配置面板' },
  ];
  for (const mod of modules) {
    if (!mod.tpl) continue;
    const block = `${mod.begin}\n${mod.tpl}${mod.end}`;
    const replaced = replaceBlock(html, mod.begin, mod.end, mod.tpl);
    if (replaced !== null) { html = replaced; info(`${mod.name}已更新`); }
    else if (/<\/body>/.test(html)) { html = html.replace(/<\/body>/, block + '\n  </body>'); info(`${mod.name}已插入`); changed = true; }
  }

  if (!changed && cssReplaced === null && bodyReplaced === null && jsReplaced === null) {
    warn('未发现可注入位置，index.html 结构可能已变化。');
  }
  fs.writeFileSync(idxPath, html, 'utf8');
  ok('index.html 注入完成');

  // 复制壁纸
  let wpDest = null;
  if (!refreshFallbackOnly) {
    wpDest = path.join(workDir, 'out', 'renderer', 'wallpapers');
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
    ok(`已复制 ${copied} 张壁纸`);
    // weather-config.json
    const cfgSrc = path.join(SCRIPT_DIR, 'weather-config.json');
    if (exists(cfgSrc)) fs.copyFileSync(cfgSrc, path.join(wpDest, 'weather-config.json'));
  }

  // ---- 更新事务 ----
  saveTransaction(resourcesDir, {
    id: txId,
    patcherVersion: PATCHER_VERSION,
    buildTime: new Date().toISOString(),
    zcodeDir: zcodeDir,
    origAsarSha256: origAsarSha256,
    origIndexSha256: origIndexSha256,
    status: 'packing',
  });

  // ---- 5) 打包 ----
  step('5/6  重新打包 app.asar');
  const newAsar = path.join(os.tmpdir(), 'app.asar.new-' + Date.now());
  rmrf(newAsar);
  info('打包中...');
  const t1 = Date.now();
  const pr = await asarPack(workDir, newAsar);
  if (!pr.ok || !exists(newAsar)) {
    rmrf(workDir); rmrf(newAsar); clearTransaction(resourcesDir);
    die('打包失败：' + (pr.error || '未知错误'));
  }
  const newAsarSize = fs.statSync(newAsar).size;
  ok(`打包完成：${(newAsarSize / 1048576).toFixed(1)} MB，耗时 ${((Date.now() - t1) / 1000).toFixed(1)} 秒`);

  // ---- 5b) 校验打包源目录 ----
  step('5b/6  源目录校验');
  const vHtml = read(idxPath);
  const needMarks = [MARK_BEGIN, BODY_MARK_BEGIN, SCRIPT_MARK_BEGIN, SWITCHER_MARK_BEGIN,
    WEATHER_MARK_BEGIN, ENGINE_MARK_BEGIN, PANEL_MARK_BEGIN, RAIN_MARK_BEGIN, SETTINGS_MARK_BEGIN];
  const missing = needMarks.filter(m => !vHtml.includes(m));
  if (missing.length > 0) {
    rmrf(workDir); rmrf(newAsar); clearTransaction(resourcesDir);
    die('源目录校验失败：缺少注入标记 ' + missing.join(', '));
  }
  ok('源目录标记齐全');

  // ---- 5c) 最终包验证（重新解包检查） ----
  step('5c/6  最终包验证（重新解包）');
  const expectedWpCount = refreshFallbackOnly ? 0 : wpDirs.length * wpFiles.length;
  const verifyResult = await verifyFinalAsar(newAsar, needMarks, expectedWpCount);
  if (!verifyResult.ok) {
    rmrf(workDir); rmrf(newAsar); clearTransaction(resourcesDir);
    die('最终包验证失败：' + verifyResult.error);
  }
  ok(`最终包验证通过 (${verifyResult.markCount} 标记 + ${verifyResult.wpCount} 壁纸)`);
  info(`新 asar SHA-256: ${verifyResult.sha256}`);

  // ---- 6) 备份 + 原子替换 ----
  step('6/6  备份原文件并原子替换');
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const bakPath = path.join(resourcesDir, `app.asar.bak.${ts}`);

  // 备份并验证
  try {
    fs.copyFileSync(asarPath, bakPath);
    const bakHash = sha256Sync(bakPath);
    if (bakHash !== origAsarSha256) {
      // 备份验证失败，尝试重新备份
      warn('备份 SHA-256 不匹配，重新备份...');
      fs.unlinkSync(bakPath);
      fs.copyFileSync(asarPath, bakPath);
    }
    ok(`已备份原版: ${path.basename(bakPath)}`);
  } catch (e) {
    rmrf(workDir); rmrf(newAsar); clearTransaction(resourcesDir);
    die('备份失败：' + e.message);
  }

  // 原子替换：只使用 renameSync，不降级到 copyFileSync
  // 若 rename 失败（如文件被占用），直接报错退出，不破坏原文件
  const tmpPath = asarPath + '.tmp-' + Date.now();
  try {
    fs.copyFileSync(newAsar, tmpPath);
    const tmpSize = fs.statSync(tmpPath).size;
    if (tmpSize !== newAsarSize) throw new Error(`临时文件大小不匹配 (${tmpSize} vs ${newAsarSize})`);

    // SHA-256 验证临时文件
    const tmpHash = sha256Sync(tmpPath);
    if (tmpHash !== verifyResult.sha256) throw new Error('临时文件 SHA-256 不匹配');

    // 原子重命名
    fs.renameSync(tmpPath, asarPath);
    ok('已原子替换 app.asar');
  } catch (e) {
    try { if (exists(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    rmrf(workDir); rmrf(newAsar); clearTransaction(resourcesDir);
    die(`替换失败：${e.message}\n原文件未被破坏。`);
  }

  // ---- 验证替换后的文件 ----
  try {
    const finalHash = sha256Sync(asarPath);
    if (finalHash !== verifyResult.sha256) {
      // 替换后哈希不一致，尝试从备份恢复
      warn('替换后 SHA-256 不一致，尝试从备份恢复...');
      try {
        fs.copyFileSync(bakPath, asarPath);
        ok('已从备份恢复');
      } catch (restoreErr) {
        die(`严重：替换后文件损坏且自动恢复失败。请手动重命名 ${path.basename(bakPath)} 为 app.asar`);
      }
      clearTransaction(resourcesDir);
      die('替换后完整性校验失败，已自动回滚。');
    }
    ok('替换后完整性通过');
  } catch (e) {
    warn('无法验证替换后文件: ' + e.message);
  }

  // ---- 生成构建 manifest ----
  const manifest = generateBuildManifest(zcodeDir, zcodeVersion, origAsarSha256, verifyResult.sha256, origIndexSha256);
  const manifestPath = path.join(resourcesDir, '.zcode-wallpaper-manifest.json');
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    ok('构建 manifest 已写入');
  } catch (e) { warn('manifest 写入失败: ' + e.message); }

  // ---- 清理 ----
  rmrf(workDir);
  rmrf(newAsar);
  clearTransaction(resourcesDir);

  log(`\n${C.bold}${C.green}╔════════════════════════════════════════════╗${C.reset}`);
  log(`${C.bold}${C.green}║  ✅  重装完成！                          ║${C.reset}`);
  log(`${C.bold}${C.green}╚════════════════════════════════════════════╝${C.reset}`);
  log(`\n${C.green}下一步：请完全退出 ZCode 并重新打开。${C.reset}`);
  log(`${C.dim}回滚：node apply.js --restore latest${C.reset}`);
  log(`${C.dim}检查：node apply.js --check${C.reset}`);
}

main().catch(e => die('意外错误：' + (e.stack || e.message)));
