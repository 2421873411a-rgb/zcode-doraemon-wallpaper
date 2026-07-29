#!/usr/bin/env node
// Create GitHub repo and push
const https = require('https');
const { execSync } = require('child_process');
const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const REPO_NAME = 'zcode-doraemon-wallpaper';
const REPO_DESC = '🎨 ZCode 哆啦A梦四时壁纸 - 一键注入动态壁纸系统';
const PROJECT_DIR = path.join(__dirname);

if (!TOKEN) {
  console.log(`
╔══════════════════════════════════════════════╗
║  需要 GitHub Personal Access Token           ║
╚══════════════════════════════════════════════╝

请按以下步骤操作：

1. 打开 https://github.com/settings/tokens/new
2. "Note" 填: zcode-wallpaper
3. "Expiration" 选: 自定义 → 选最长
4. 勾选 "repo" 范围（全部 repo 权限）
5. 点 "Generate token"
6. 复制生成的 token

然后运行：
  set GITHUB_TOKEN=你的token
  node create-repo.js

或者手动创建仓库：
1. 打开 https://github.com/new
2. Repository name: ${REPO_NAME}
3. Description: ${REPO_DESC}
4. 选 Public
5. 不要勾选任何初始化选项
6. 点 Create repository
7. 然后运行：
   git remote add origin https://github.com/你的用户名/${REPO_NAME}.git
   git push -u origin master
`);
  process.exit(1);
}

console.log('Creating GitHub repository...');

const data = JSON.stringify({
  name: REPO_NAME,
  description: REPO_DESC,
  private: false,
  has_issues: true,
  has_projects: false,
  has_wiki: false
});

const options = {
  hostname: 'api.github.com',
  path: '/user/repos',
  method: 'POST',
  headers: {
    'User-Agent': 'zcode-wallpaper',
    'Authorization': 'token ' + TOKEN,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    if (res.statusCode === 201) {
      const repo = JSON.parse(body);
      console.log('✓ Repository created:', repo.html_url);
      
      // Set remote and push
      const remoteUrl = repo.clone_url.replace('https://', 'https://' + TOKEN + '@');
      try {
        execSync('git remote remove origin 2>/dev/null; git remote add origin "' + remoteUrl + '"', { cwd: PROJECT_DIR, shell: true });
        console.log('✓ Remote set');
        console.log('Pushing...');
        execSync('git push -u origin master', { cwd: PROJECT_DIR, stdio: 'inherit', shell: true });
        console.log('✓ Pushed successfully!');
      } catch (e) {
        console.log('Push failed. You can manually push with:');
        console.log('  git push -u origin master');
      }
    } else if (res.statusCode === 422) {
      const err = JSON.parse(body);
      if (err.errors && err.errors[0].message.includes('already exists')) {
        console.log('Repository already exists, pushing...');
        try {
          execSync('git push -u origin master', { cwd: PROJECT_DIR, stdio: 'inherit', shell: true });
          console.log('✓ Pushed!');
        } catch (e) {
          console.log('Push failed:', e.message);
        }
      } else {
        console.log('Error:', JSON.stringify(err, null, 2));
      }
    } else {
      console.log('HTTP', res.statusCode, body.slice(0, 500));
    }
  });
});

req.on('error', e => console.error('Request failed:', e.message));
req.write(data);
req.end();
