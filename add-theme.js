#!/usr/bin/env node
/* ==========================================================================
 * ZCode 壁纸 · 添加新主题工具
 *
 * 用法（三种方式）：
 *   1) 交互式：node add-theme.js（按提示输入）
 *   2) 快速加视频：node add-theme.js video "主题名" "视频文件路径"
 *   3) 快速加单图：node add-theme.js image "主题名" "图片文件路径"
 *
 * 加完后重启 ZCode 即可看到新主题。不需要重打包！
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const C = { reset:'\x1b[0m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m' };
const ok =  m => console.log(`${C.green}✓${C.reset} ${m}`);
const warn = m => console.log(`${C.yellow}!${C.reset} ${m}`);
const info = m => console.log(`${C.cyan}ℹ${C.reset} ${m}`);

// 定位 ZCode 安装目录
function findZCodeDir() {
  const candidates = [
    'D:\\应用\\Zcode', 'C:\\Program Files\\ZCode', 'C:\\Program Files (x86)\\ZCode',
    path.join(require('os').homedir(), 'AppData', 'Local', 'Programs', 'ZCode'),
  ];
  for (const c of candidates)
    if (fs.existsSync(path.join(c, 'resources', 'app.asar'))) return c;
  return null;
}
const ZCODE_DIR = findZCodeDir();
if (!ZCODE_DIR) { console.error(`${C.red}✗ 未找到 ZCode 安装目录${C.reset}`); process.exit(1); }
const THEMES_DIR = path.join(ZCODE_DIR, 'resources', 'themes');

const args = process.argv.slice(2);
const mode = args[0];

function generateId(name) {
  return name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || 'theme-' + Date.now();
}

// P0-1: 类型归一化 — image/static 统一为 static
function normalizeThemeType(rawType) {
  var type = String(rawType || '').trim().toLowerCase();
  if (type === 'image' || type === 'static') return 'static';
  if (type === 'video') return 'video';
  throw new Error('主题类型只能是 image、static 或 video');
}

// P0-2: 生成完整晴雨四时段资源矩阵
function createStaticAssets(assetName) {
  var periods = { morning: assetName, day: assetName, dusk: assetName, night: assetName };
  return { clear: JSON.parse(JSON.stringify(periods)), rain: JSON.parse(JSON.stringify(periods)) };
}

function addTheme(id, name, type, assetFile, desc) {
  // P0-1: 类型归一化
  try { type = normalizeThemeType(type); }
  catch (e) { console.error(C.red + '✗ ' + e.message + C.reset); return; }
  // 建主题目录
  const themeDir = path.join(THEMES_DIR, id);
  if (fs.existsSync(themeDir)) { warn(`主题「${id}」已存在，覆盖`); }

  // 复制素材
  const ext = path.extname(assetFile).toLowerCase();
  const extMap = { '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.mp4': 'mp4', '.webm': 'webm', '.gif': 'gif' };
  const assetExt = extMap[ext] || ext.slice(1);
  const assetName = 'bg.' + assetExt;
  const destFile = path.join(themeDir, assetName);

  fs.mkdirSync(themeDir, { recursive: true });
  fs.copyFileSync(assetFile, destFile);

  // 写 theme.json
  var themeJson = {
    id: id, name: name, type: type,
    periods: false,   // 单图主题无时段变化
    weather: false,   // 单图主题无天气变化
    desc: desc || (name + ' - ' + (type === 'video' ? '视频' : '静态') + '壁纸'),
  };
  if (type === 'video') {
    themeJson.asset = assetName;
  } else {
    // P0-2: 生成完整晴雨四时段矩阵，确保任何天气/时段都能解析到资源
    themeJson.assets = createStaticAssets(assetName);
  }
  fs.writeFileSync(path.join(themeDir, 'theme.json'), JSON.stringify(themeJson, null, 2));

  // 更新 _registry.json
  const regPath = path.join(THEMES_DIR, '_registry.json');
  let reg = { themes: [] };
  if (fs.existsSync(regPath)) reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
  if (!reg.themes.includes(id)) reg.themes.push(id);
  if (!reg.default) reg.default = id;
  fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));

  // P0-7: 自动验证写入结果
  var errors = [];
  // 1) 验证 _registry.json
  try {
    var regCheck = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    if (!regCheck.themes || !regCheck.themes.includes(id))
      errors.push('_registry.json 中未找到主题 ID「' + id + '」');
  } catch (e) { errors.push('_registry.json 解析失败: ' + e.message); }
  // 2) 验证 theme.json
  try {
    var themeCheck = JSON.parse(fs.readFileSync(path.join(themeDir, 'theme.json'), 'utf8'));
    if (!themeCheck.id || !themeCheck.name || !themeCheck.type)
      errors.push('theme.json 缺少必要字段 (id/name/type)');
    if (themeCheck.type === 'static' && (!themeCheck.assets || !themeCheck.assets.clear))
      errors.push('静态主题缺少 assets.clear');
    if (themeCheck.type === 'video' && !themeCheck.asset)
      errors.push('视频主题缺少 asset 字段');
  } catch (e) { errors.push('theme.json 解析失败: ' + e.message); }
  // 3) 验证资源文件存在
  if (!fs.existsSync(destFile))
    errors.push('资源文件缺失: ' + destFile);

  if (errors.length > 0) {
    console.error(C.red + '✗ 验证失败！' + C.reset);
    errors.forEach(function (e) { console.error('  ' + C.red + '! ' + e + C.reset); });
  } else {
    ok('主题「' + name + '」已添加并验证通过！重启 ZCode 即可看到');
  }
  info('主题路径: ' + themeDir);
  info('配置文件: themes/_registry.json');
}

// 交互式
if (!mode || mode === 'interactive') {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`${C.cyan}添加新主题${C.reset}`);
  console.log('---');
  rl.question('主题名称（中文也行）: ', (name) => {
    rl.question('类型 (video / image): ', (type) => {
      rl.question('素材文件路径: ', (file) => {
        rl.question('简介（可选）: ', (desc) => {
          if (!fs.existsSync(file)) { console.error(`${C.red}✗ 文件不存在${C.reset}`); rl.close(); return; }
          addTheme(generateId(name), name.trim(), type.trim(), file.trim(), desc.trim());
          rl.close();
        });
      });
    });
  });
} else if (mode === 'video' || mode === 'image') {
  if (args.length < 3) { console.error(`${C.red}用法: node add-theme.js ${mode} "主题名" "文件路径"${C.reset}`); process.exit(1); }
  addTheme(generateId(args[1]), args[1], mode === 'video' ? 'video' : 'static', args[2], args[3] || '');
} else {
  console.error(`${C.red}未知模式: ${mode}${C.reset}`);
  console.log('用法:');
  console.log('  node add-theme.js                  交互式');
  console.log('  node add-theme.js video "名" "路径"  加视频主题');
  console.log('  node add-theme.js image "名" "路径"  加图片主题');
}
