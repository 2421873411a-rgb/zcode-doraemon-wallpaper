#!/usr/bin/env node
/* ==========================================================================
 * ZCode 壁纸系统 · 状态自检
 *
 * 作用：检查当前线上 app.asar 处于哪个版本、注入是否完整、回溯快照有哪些。
 *       只读不改，安全。
 *
 * 用法：node status.js   （或双击 查看状态.bat）
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const C = { reset:'\x1b[0m', bold:'\x1b[1m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m', dim:'\x1b[2m' };
const ok = m => console.log(`${C.green}✓${C.reset} ${m}`);
const warn = m => console.log(`${C.yellow}!${C.reset} ${m}`);
const info = m => console.log(`${C.cyan}ℹ${C.reset} ${m}`);

const SCRIPT_DIR = __dirname;

function exists(p){ try{fs.accessSync(p);return true}catch(e){return false} }
function findZCodeDir(){
  if (process.env.ZCODE_DIR && exists(path.join(process.env.ZCODE_DIR,'resources','app.asar'))) return process.env.ZCODE_DIR;
  const cands = ['D:\\应用\\Zcode','C:\\Program Files\\ZCode','C:\\Program Files (x86)\\ZCode',
    path.join(require('os').homedir(),'AppData','Local','Programs','ZCode')];
  for (const c of cands) if (exists(path.join(c,'resources','app.asar'))) return c;
  return null;
}

console.log(`${C.bold}${C.cyan}╔════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.bold}${C.cyan}║  ZCode 壁纸系统 · 状态自检                  ║${C.reset}`);
console.log(`${C.bold}${C.cyan}╚════════════════════════════════════════════╝${C.reset}\n`);

// 1) 工具包完整性
console.log(`${C.bold}【工具包】${C.reset}`);
const needFiles = ['apply.js','一键重装.bat','weather-config.json','CHANGELOG.md','使用说明.md'];
const needInject = ['css.css','body.html','script.js','switcher.js','weather.js'];
let tkOk = true;
for (const f of needFiles) { if (exists(path.join(SCRIPT_DIR,f))) ok(f); else { warn(`缺失: ${f}`); tkOk=false; } }
for (const f of needInject) { if (exists(path.join(SCRIPT_DIR,'inject',f))) ok(`inject/${f}`); else { warn(`缺失: inject/${f}`); tkOk=false; } }
// asar 依赖
const asarDep = path.join(SCRIPT_DIR,'node_modules','asar');
if (exists(asarDep)) ok('node_modules/asar (重装依赖就绪)'); else warn('node_modules/asar 缺失（重装会失败，需 npm install）');
// 壁纸
for (const w of ['clear','rain']) {
  for (const p of ['morning','day','dusk','night']) {
    const f = `doraemon-${p}.png`;
    if (!exists(path.join(SCRIPT_DIR,'wallpapers',w,f))) { warn(`缺失: wallpapers/${w}/${f}`); tkOk=false; }
  }
}
if (tkOk) ok('工具包完整');

// 2) 线上版本检测
console.log(`\n${C.bold}【线上 app.asar】${C.reset}`);
const zdir = findZCodeDir();
if (!zdir) { warn('未找到 ZCode 安装目录'); }
else {
  info(`ZCode 目录: ${zdir}`);
  const asarPath = path.join(zdir,'resources','app.asar');
  // 读 index.html：用 getRawHeader 拿偏移量，手动读取字节（绕过 extractFile bug）
  try {
    const asar = require(path.join(SCRIPT_DIR,'node_modules','asar'));
    const raw = asar.getRawHeader(asarPath);
    // 在 header 树里找 /out/renderer/index.html
    let target = null;
    const findPath = ['out','renderer','index.html'];
    let node = raw.header;
    for (const seg of findPath) {
      if (node && node.files && node.files[seg]) node = node.files[seg];
      else { node = null; break; }
    }
    if (node && node.offset !== undefined) target = node;
    if (!target) throw new Error('asar 内未找到 out/renderer/index.html');
    // 读取：asar 文件头 + headerSize 之后，加上 offset（8字节 pickle 头 + 内容）
    const fd = fs.openSync(asarPath, 'r');
    const HEADER_PICKLE = 16; // asar 文件头本身的双层 pickle（8+8）
    const filePickle = 8;     // 每个文件内容的 pickle 头
    const startPos = HEADER_PICKLE + raw.headerSize + parseInt(target.offset) + filePickle;
    const buf = Buffer.alloc(target.size);
    fs.readSync(fd, buf, 0, target.size, startPos);
    fs.closeSync(fd);
    const html = buf.toString('utf8');
    const marks = {
      'CSS样式': '/* >>> ZCODE-WALLPAPER-INJECT BEGIN',
      '壁纸层': '<!-- >>> ZCODE-WALLPAPER-BODY BEGIN',
      '主切换脚本': '<!-- >>> ZCODE-WALLPAPER-SCRIPT BEGIN',
      '手动开关': '<!-- >>> ZCODE-WALLPAPER-SWITCHER BEGIN',
      '自动天气检测': '<!-- >>> ZCODE-WALLPAPER-WEATHER BEGIN',
    };
    let injectCount = 0;
    for (const [name, mark] of Object.entries(marks)) {
      if (html.includes(mark)) { ok(`注入: ${name}`); injectCount++; }
      else warn(`未注入: ${name}`);
    }
    let ver = '未知/原始版';
    if (html.includes('api.open-meteo.com')) ver = 'v3.0 (open-meteo自动检测)';
    else if (html.includes('dw-switch-btn')) ver = 'v2.0 (雨天矩阵+手动开关)';
    else if (html.includes('#doraemon-wallpaper')) ver = 'v1.0 (四时壁纸无框版)';
    console.log(`\n  ${C.bold}${C.green}当前线上版本: ${ver}${C.reset}`);
    console.log(`  注入完整度: ${injectCount}/5`);
    // 壁纸检查：遍历 header 树
    let wpCount = 0;
    function countWp(n, p) {
      if (n.files) { for (const k of Object.keys(n.files)) countWp(n.files[k], p+'/'+k); }
      else if (/doraemon-(morning|day|dusk|night)\.png$/.test(p)) wpCount++;
    }
    countWp(raw.header, '');
    info(`壁纸数量: ${wpCount} (v2/v3 应为 8)`);
  } catch(e) {
    warn('无法读取线上 asar: ' + e.message);
  }
}

// 3) 回溯快照
console.log(`\n${C.bold}【回溯快照】${C.reset}`);
const verDir = path.join(SCRIPT_DIR,'versions');
if (exists(verDir)) {
  const snaps = fs.readdirSync(verDir).filter(f => f.startsWith('app.asar.'));
  if (snaps.length === 0) info('无快照');
  else snaps.forEach(s => {
    const sz = fs.statSync(path.join(verDir,s)).size;
    info(`${s}  (${(sz/1048576).toFixed(1)} MB)`);
  });
} else warn('无 versions/ 目录');

// 4) resources 备份
console.log(`\n${C.bold}【resources 备份】${C.reset}`);
if (zdir) {
  const resDir = path.join(zdir,'resources');
  const baks = fs.readdirSync(resDir).filter(f => f.startsWith('app.asar.bak'));
  if (baks.length === 0) info('无 .bak 备份');
  else baks.forEach(b => {
    const sz = fs.statSync(path.join(resDir,b)).size;
    info(`${b}  (${(sz/1048576).toFixed(1)} MB)`);
  });
}

console.log(`\n${C.dim}自检完成。回滚方法见 CHANGELOG.md。${C.reset}`);
