#!/usr/bin/env node
/* ==========================================================================
 * 语法检查器 — 提取 inject/*.js 中的 JavaScript，验证语法正确性
 * 用法: node scripts/check-inject-syntax.js
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INJECT_DIR = path.join(__dirname, '..', 'inject');
const files = [
  'script.js', 'switcher.js', 'weather.js',
  'theme-engine.js', 'theme-panel.js',
  'rain-effect.js', 'settings.js'
];

let hasError = false;
let checked = 0;

for (const file of files) {
  const fp = path.join(INJECT_DIR, file);
  if (!fs.existsSync(fp)) { console.log(`  ⚠ 跳过 ${file}（不存在）`); continue; }
  checked++;

  let code = fs.readFileSync(fp, 'utf8');

  // 提取 <script>...</script> 内的 JS（可能有多块）
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let match;
  while ((match = scriptRe.exec(code)) !== null) {
    blocks.push(match[1]);
  }

  // 如果没有 <script> 标签，整个文件当作 JS
  if (blocks.length === 0) blocks.push(code);

  let fileOk = true;
  blocks.forEach((js, i) => {
    const jsTrimmed = js.trim();
    if (!jsTrimmed) return; // 空块跳过

    try {
      new vm.Script(jsTrimmed, { filename: `${file}#block${i}` });
    } catch (e) {
      fileOk = false;
      // 提取行号
      const lineMatch = e.stack.match(/:(\d+)/);
      const lineNum = lineMatch ? lineMatch[1] : '?';

      // 显示出错行附近的代码
      const lines = jsTrimmed.split('\n');
      const errLine = parseInt(lineMatch ? lineMatch[1] : '0', 10);
      const context = [];
      for (let li = Math.max(0, errLine - 3); li < Math.min(lines.length, errLine + 2); li++) {
        const marker = (li + 1 === errLine) ? ' >>> ' : '     ';
        context.push(`${marker}${li + 1}: ${lines[li]}`);
      }

      console.error(`\n❌ ${file} (块${i}) 语法错误: ${e.message}`);
      console.error(context.join('\n'));
    }
  });

  if (fileOk) {
    console.log(`✓ ${file} — ${blocks.length} 块，语法正确`);
  } else {
    hasError = true;
  }
}

console.log(`\n${'='.repeat(50)}`);
if (hasError) {
  console.error(`❌ 发现语法错误！必须修复后才能部署。`);
  process.exit(1);
} else {
  console.log(`✅ 全部 ${checked} 个文件语法检查通过。`);
  process.exit(0);
}
