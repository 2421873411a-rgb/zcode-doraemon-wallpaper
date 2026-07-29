// 诊断脚本：模拟 ZCode 运行时，测试主题引擎加载链路
var fs = require('fs'), p = require('path');

// 1. 模拟 XMLHttpRequest（用 fs 替代）
function FakeXHR() {
  this.status = 0;
  this.responseText = '';
  this.readyState = 4;
}
FakeXHR.prototype.open = function (method, url, async) { this._url = url; };
FakeXHR.prototype.send = function () {
  try {
    var filePath = this._url.replace('file:///D:/', 'D:/').replace('file:///', '/').replace(/\//g, p.sep);
    this.responseText = fs.readFileSync(filePath, 'utf8');
    this.status = this.responseText.length > 0 ? 0 : 404;
  } catch (e) {
    this.status = 404;
    this.responseText = '';
  }
};

// 2. 读取模板并注入 token
var engineTpl = fs.readFileSync(p.join(__dirname, 'inject', 'theme-engine.js'), 'utf8');
var themesDir = 'D:/应用/Zcode/resources/themes';
var BASE = 'file:///' + themesDir.replace(/\\/g, '/') + '/';

// 构建 FALLBACK
var regPath = p.join(themesDir, '_registry.json');
var reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
var FALLBACK = { __default__: reg.default || 'doraemon' };
for (var i = 0; i < reg.themes.length; i++) {
  try {
    var tp = p.join(themesDir, reg.themes[i], 'theme.json');
    if (fs.existsSync(tp)) {
      var tj = JSON.parse(fs.readFileSync(tp, 'utf8'));
      FALLBACK[tj.id] = tj;
    }
  } catch (e) { console.log('skip ' + reg.themes[i] + ': ' + e.message); }
}

// 替换 token
var code = engineTpl.replace('__BASE_TOKEN__', JSON.stringify(BASE));
code = code.replace('__FALLBACK_TOKEN__', JSON.stringify(FALLBACK));

// 提取纯 JS（去掉 <script> 和 </script> 包装）
code = code.replace(/^\s*<script[^>]*>/, '').replace(/<\/script>\s*$/, '');

// 3. 在模拟环境中执行
var vm = require('vm');
var ctx = {
  window: {},
  console: console,
  XMLHttpRequest: FakeXHR,
  localStorage: {
    _data: {},
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = v; }
  },
  document: {
    readyState: 'complete',
    addEventListener: function () { },
    getElementById: function (id) {
      if (id === 'doraemon-wallpaper') return { querySelectorAll: function () { return []; }, appendChild: function () { }, dataset: {} };
      return null;
    },
    documentElement: { dataset: {} },
    createElement: function (tag) {
      return {
        tagName: tag, style: {}, dataset: {},
        appendChild: function () { },
        setAttribute: function () { },
        addEventListener: function () { }
      };
    },
    head: { appendChild: function () { } },
    body: { appendChild: function () { } }
  },
  setTimeout: function (fn, t) { },
  setInterval: function (fn, t) { },
  URL: { createObjectURL: function () { return 'blob:mock'; }, revokeObjectURL: function () { } },
  Image: function () { this.src = ''; }
};
ctx.global = ctx;

try {
  var script = new vm.Script(code);
  script.runInNewContext(ctx);

  // 4. 检查结果
  var themes = ctx.window.__DW_THEMES__;
  var diag = ctx.window.__DW_DIAGNOSTICS__;
  var ids = Object.keys(themes || {}).filter(function (k) { return k !== '__default__'; });

  console.log('');
  console.log('========================================');
  console.log('  主题引擎离线诊断');
  console.log('========================================');
  console.log('加载来源:  ' + (diag ? diag.source : 'N/A'));
  console.log('主题数量:  ' + ids.length);
  console.log('主题列表:  ' + ids.join(', '));
  console.log('默认主题:  ' + (themes ? themes.__default__ : 'N/A'));
  console.log('错误数量:  ' + (diag ? diag.errors.length : 'N/A'));
  if (diag && diag.errors.length > 0) console.log('错误详情:  ' + JSON.stringify(diag.errors));
  console.log('');

  // 5. 测试切换逻辑
  console.log('--- 切换测试 ---');
  ids.forEach(function (id) {
    var t = themes[id];
    var issues = [];
    if (!t) issues.push('不存在');
    else {
      if (!t.type) issues.push('缺type');
      else if (t.type === 'video' && !t.asset) issues.push('缺asset');
    }
    if (issues.length === 0) {
      // 测试 setActiveTheme
      var r1 = ctx.window.__dwSwitchTheme ? '可切换' : '缺switch函数';
      console.log('  ✅ ' + id + ' (' + (t ? t.type : '?') + ') — ' + r1);
    } else {
      console.log('  ❌ ' + id + ': ' + issues.join(', '));
    }
  });

  // 6. 测试加载优先级  
  console.log('');
  console.log('--- 加载优先级测试 ---');
  console.log('__DW_EXTERNAL_THEMES__: ' + (ctx.window.__DW_EXTERNAL_THEMES__ ? 'YES (' + Object.keys(ctx.window.__DW_EXTERNAL_THEMES__).filter(function(k){return k!=='__default__'}).length + ' themes)' : 'NO'));
  console.log('FALLBACK themes: ' + Object.keys(FALLBACK).filter(function(k){return k!=='__default__'}).length);
  console.log('');

} catch (e) {
  console.error('❌ 执行失败:', e.message);
  console.error(e.stack);
}
