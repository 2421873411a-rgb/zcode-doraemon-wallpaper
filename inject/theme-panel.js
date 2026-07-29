    <script>
      // ============ 主题面板 v6.1（完整版 + 容错）============
      // 每个功能模块独立 try/catch，一个崩不影响整体
      (function () {
        // ★ 可见标记
        try {
          var _ok = document.createElement('div');
          _ok.id = 'dw-panel-ok';
          _ok.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483645;padding:1px 5px;background:#0a0;color:#fff;font-size:9px;opacity:0.6;pointer-events:none;border-radius:0 0 0 4px;';
          _ok.textContent = 'PANEL v6.1';
          document.body.appendChild(_ok);
        } catch(_) {}

        var PANEL = null, UPLOAD_MODE = false, UPLOAD_MULTI = false;
        var _searchQuery = '', _showSettings = false;

        // —— 工具函数 ——
        function ready(fn) { if (window.__dwGetActiveTheme) fn(); else setTimeout(function(){ready(fn);},100); }
        function esc(s) { if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function toast(msg) {
          var t = document.createElement('div'); t.textContent = msg;
          t.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:8px 20px;border-radius:20px;background:rgba(0,0,0,0.8);color:#fff;font-size:13px;font-family:system-ui;pointer-events:none;transition:opacity .3s;opacity:0;';
          document.body.appendChild(t);
          requestAnimationFrame(function(){t.style.opacity='1';});
          setTimeout(function(){t.style.opacity='0';setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},300);},1500);
        }

        // —— IndexedDB（独立 try/catch）——
        var DB = null;
        try {
          function openDB() {
            return new Promise(function (resolve, reject) {
              var req = indexedDB.open('zcode-wp-themes', 1);
              req.onupgradeneeded = function (e) { if (!e.target.result.objectStoreNames.contains('themes')) e.target.result.createObjectStore('themes', { keyPath: 'id' }); };
              req.onsuccess = function (e) { resolve(e.target.result); };
              req.onerror = function (e) { reject(e.target.error); };
            });
          }
          window._dwSaveUserTheme = function (t) { return openDB().then(function (db) { return new Promise(function (r, j) { var tx = db.transaction('themes', 'readwrite'); tx.objectStore('themes').put(t); tx.oncomplete = r; tx.onerror = function (e) { j(e.target.error); }; }); }); };
          window._dwLoadUserThemes = function () { return openDB().then(function (db) { return new Promise(function (r, j) { var tx = db.transaction('themes', 'readonly'); var req = tx.objectStore('themes').getAll(); req.onsuccess = function () { r(req.result || []); }; req.onerror = function (e) { j(e.target.error); }; }); }); };
          window._dwDeleteUserTheme = function (id) { return openDB().then(function (db) { return new Promise(function (r, j) { var tx = db.transaction('themes', 'readwrite'); tx.objectStore('themes').delete(id); tx.oncomplete = r; tx.onerror = function (e) { j(e.target.error); }; }); }); };
        } catch (e) { console.warn('[DW] IndexedDB 不可用'); }

        // —— 用户主题注册 ——
        function registerUserThemes(list) {
          var tgt = {};
          var ex = window.__DW_THEMES__ || {};
          for (var k in ex) { if (k === '__default__' || !ex[k]._isUser) tgt[k] = ex[k]; }
          (list || []).forEach(function (u) {
            var e = { id: u.id, name: u.name, type: u.type || 'static', periods: u.periods, weather: u.weather, asset: u.asset, assets: u.assets, desc: u.desc, _userData: u._userData, _userDataMime: u._userDataMime, _isUser: true };
            for (var k in u) { if (/^_data_/.test(k)) e[k] = u[k]; }
            tgt[u.id] = e;
          });
          window.__DW_THEMES__ = tgt;
        }
        function refreshUserThemes() {
          if (!window._dwLoadUserThemes) return Promise.resolve();
          return window._dwLoadUserThemes().then(function (l) {
            window.__DW_USER_THEMES__ = l;
            registerUserThemes(l);
            try { var sid = localStorage.getItem('dw-active-theme'); if (sid && l.some(function (t) { return t.id === sid; })) { if (window.__dwSwitchTheme) window.__dwSwitchTheme(sid); } } catch (e) { }
          }).catch(function () { });
        }

        // —— 主题列表 ——
        window.__dwListAllThemes = function () {
          var map = {};
          var builtin = window.__dwListThemes ? window.__dwListThemes() : [];
          builtin.forEach(function (t) { map[t.id] = t; });
          (window.__DW_USER_THEMES__ || []).forEach(function (t) {
            map[t.id] = { id: t.id, name: t.name, type: t.type, desc: t.desc || '自定义', user: true };
          });
          var r = []; for (var k in map) r.push(map[k]); return r;
        };

        // —— 缩略图 ——
        // _thumbCache: id → 小缩略图 data URL（异步生成，避免大 data URL 嵌入 HTML）
        var _thumbCache = {};
        function thumbUrl(id, t) {
          if (t.type === 'video') return null;
          // 优先用已缓存的小缩略图
          if (_thumbCache[id]) return _thumbCache[id];
          // 主题自带缩略图（小）
          if (t._thumbnail && t._thumbnail.length < 5000) return t._thumbnail;
          // 内置主题用 file:// 路径（短，安全）
          if (!t.user) {
            var themes = window.__DW_THEMES__ || {};
            var base = window.__DW_THEMES_BASE__ || './themes/';
            var th = themes[id];
            if (th && th.assets && th.assets.clear && th.assets.clear.morning) return base + id + '/' + th.assets.clear.morning;
          }
          // 用户主题的大 data URL 不直接用（会撑爆 HTML），异步生成缩略图
          if (t.user && t._userData && typeof t._userData === 'string' && t._userData.indexOf('data:') === 0) {
            genThumbAsync(id, t._userData);
          }
          return null;
        }

        // 异步生成缩略图：data URL → canvas 缩放 → 小 data URL
        function genThumbAsync(id, dataUrl) {
          if (_thumbCache[id]) return; // 已生成
          try {
            var img = new Image();
            img.onload = function () {
              try {
                var c = document.createElement('canvas');
                c.width = 48; c.height = 32;
                var cx = c.getContext('2d');
                // 居中裁剪缩放
                var s = Math.min(img.width / 48, img.height / 32);
                var sw = 48 * s, sh = 32 * s;
                cx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, 48, 32);
                _thumbCache[id] = c.toDataURL('image/jpeg', 0.6);
                // 缩略图生成后刷新面板（如果面板开着）
                if (PANEL && PANEL.style.display === 'block') buildPanel();
              } catch (e) { /* 跨域或解码失败，忽略 */ }
            };
            img.onerror = function () { /* 解码失败，忽略 */ };
            img.src = dataUrl;
          } catch (e) { }
        }

        // —— 主面板渲染 ——
        function buildPanel() {
          try {
            if (!PANEL || !document.body.contains(PANEL)) return;
            if (typeof window.__dwListAllThemes !== 'function') {
              PANEL.innerHTML = '<div style="text-align:center;padding:20px;color:#f66;">⚠ __dwListAllThemes 未定义<br><span style="font-size:10px;opacity:0.5;">主题引擎可能加载失败</span></div>';
              return;
            }
            var all = window.__dwListAllThemes();
            var active = window.__dwGetActiveTheme ? window.__dwGetActiveTheme() : '';
            var w = window.__dwGetWeather ? window.__dwGetWeather() : 'clear';
            var wIcon = w === 'rain' ? '🌧️' : '☀️';

            var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
              '<span style="font-weight:600;">🎨 主题壁纸</span>' +
              '<span style="font-size:11px;opacity:0.5;cursor:pointer;" id="dw-weather-toggle" title="切换晴雨">' + wIcon + '</span></div>';

            // 搜索
            html += '<input id="dw-search" placeholder="🔍 搜索..." value="' + esc(_searchQuery) + '" style="width:100%;box-sizing:border-box;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;outline:none;margin-bottom:5px;">';

            // 过滤
            var q = _searchQuery.toLowerCase();
            var filtered = all.filter(function (t) { return !q || t.name.toLowerCase().indexOf(q) >= 0; });

            html += '<div style="max-height:240px;overflow-y:auto;margin-bottom:6px;">';
            filtered.forEach(function (t) {
              try {
              var isCur = t.id === active;
              var thu = thumbUrl(t.id, t);
              html += '<div class="dw-item" data-id="' + esc(t.id) + '" data-name="' + esc(t.name) + '" style="' +
                'padding:5px 8px;margin:2px 0;border-radius:7px;cursor:pointer;' +
                'background:' + (isCur ? 'rgba(126,182,255,0.25)' : 'rgba(255,255,255,0.06)') + ';' +
                'border:1px solid ' + (isCur ? 'rgba(126,182,255,0.6)' : 'transparent') + ';' +
                'display:flex;align-items:center;gap:8px;">';
              // 缩略图（48×32 圆角）
              if (thu) {
                html += '<div style="width:48px;height:32px;border-radius:4px;flex-shrink:0;background-size:cover;background-position:center;background-image:url(\'' + thu.replace(/'/g, "\\'") + '\');"></div>';
              } else if (t.type === 'video') {
                // 视频主题：尝试从内置主题取第一帧缩略图，否则用图标
                var vThumb = null;
                var themes = window.__DW_THEMES__ || {};
                var th = themes[t.id];
                if (th && th.asset) {
                  var base = window.__DW_THEMES_BASE__ || './themes/';
                  // 视频无法直接做缩略图，用渐变背景 + 图标
                  vThumb = base + t.id + '/' + th.asset;
                }
                html += '<div style="width:48px;height:32px;border-radius:4px;flex-shrink:0;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;justify-content:center;font-size:16px;">🎬</div>';
              } else {
                html += '<div style="width:48px;height:32px;border-radius:4px;flex-shrink:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">🖼</div>';
              }
              html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;">' + (isCur ? '● ' : '○ ') + esc(t.name) + '</span>';
              // 类型标签
              html += '<span style="font-size:9px;opacity:0.4;padding:1px 4px;border-radius:3px;background:rgba(255,255,255,0.08);">' + (t.type === 'video' ? '视频' : '图片') + '</span>';
              // 操作按钮
              if (t.user) {
                html += '<span class="dw-rename-btn" data-id="' + esc(t.id) + '" style="cursor:pointer;opacity:0.35;padding:2px;" title="重命名">✏️</span>' +
                  '<span class="dw-del-btn" data-id="' + esc(t.id) + '" style="cursor:pointer;opacity:0.35;padding:2px;" title="删除">✕</span>';
              } else {
                html += '<span class="dw-copy-btn" data-id="' + esc(t.id) + '" style="cursor:pointer;opacity:0.35;padding:2px;" title="复制">📋</span>';
              }
              html += '</div>';
              } catch (e) { /* 跳过单个主题的渲染错误 */ }
            });
            if (filtered.length === 0) html += '<div style="text-align:center;opacity:0.4;padding:20px;">无匹配主题</div>';
            html += '</div>';

            // 上传区域
            if (!UPLOAD_MODE) {
              html += '<div id="dw-add-btn" style="padding:6px;text-align:center;cursor:pointer;border:1px dashed rgba(255,255,255,0.2);border-radius:7px;font-size:12px;margin-bottom:6px;">➕ 上传新主题</div>';
            } else {
              html += '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:8px;margin-bottom:6px;">' +
                '<input id="dw-upload-name" placeholder="主题名称" style="width:100%;box-sizing:border-box;padding:5px 6px;border-radius:5px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;margin-bottom:4px;">' +
                '<div id="dw-drop-zone" style="padding:12px;text-align:center;border:1px dashed rgba(255,255,255,0.25);border-radius:6px;font-size:11px;opacity:0.7;margin-bottom:4px;cursor:pointer;">📁 点击选择或拖入文件<br><span style="font-size:9px;opacity:0.5;">图片≤20MB · 视频≤100MB</span></div>' +
                '<div id="dw-file-info" style="font-size:10px;opacity:0.5;margin-bottom:4px;min-height:14px;"></div>' +
                '<div style="display:flex;gap:4px;">' +
                '<button id="dw-upload-save" style="flex:1;padding:4px;border:none;border-radius:5px;background:rgba(74,144,226,0.7);color:#fff;cursor:pointer;font-size:11px;">保存</button>' +
                '<button id="dw-upload-cancel" style="flex:1;padding:4px;border:none;border-radius:5px;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:11px;">取消</button></div></div>';
            }

            // 底部按钮
            html += '<div style="display:flex;gap:4px;margin-bottom:4px;">' +
              '<button id="dw-export-btn" style="flex:1;padding:3px;border:none;border-radius:5px;background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;font-size:11px;">📥 导出</button>' +
              '<button id="dw-import-btn" style="flex:1;padding:3px;border:none;border-radius:5px;background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;font-size:11px;">📤 导入</button>' +
              '<button id="dw-refresh-btn" style="flex:1;padding:3px;border:none;border-radius:5px;background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;font-size:11px;">🔄 刷新</button></div>';

            // 诊断
            if (window.__DW_DIAGNOSTICS__) {
              var d = window.__DW_DIAGNOSTICS__;
              html += '<div style="font-size:9px;opacity:0.25;text-align:center;">来源:' + d.source + ' · ' + d.themeCount + '主题' + (d.errors.length ? ' ⚠' : '') + '</div>';
            }
            html += '<div style="font-size:9px;opacity:0.3;text-align:center;">Ctrl+Shift+W · Esc关闭</div>';

            PANEL.innerHTML = html;
            bindEvents();
          } catch (e) { PANEL.innerHTML = '<div style="text-align:center;color:#f66;padding:10px;">面板错误: ' + (e.message || e) + '</div>'; }
        }

        // —— 事件绑定 ——
        function bindEvents() {
          // 搜索
          var si = document.getElementById('dw-search');
          if (si) si.oninput = function () { _searchQuery = this.value; buildPanel(); };

          // 天气切换
          var wt = document.getElementById('dw-weather-toggle');
          if (wt) wt.onclick = function () { if (window.__dwToggleWeather) { window.__dwToggleWeather(); setTimeout(buildPanel, 200); } };

          // 主题点击切换
          PANEL.querySelectorAll('.dw-item').forEach(function (item) {
            item.onclick = function (e) {
              if (e.target.classList.contains('dw-del-btn') || e.target.classList.contains('dw-rename-btn') || e.target.classList.contains('dw-copy-btn')) return;
              var id = item.dataset.id;
              var r = window.__dwSwitchTheme ? window.__dwSwitchTheme(id) : false;
              if (r !== false) { PANEL.style.display = 'none'; } else { toast('切换失败'); }
            };
          });

          // 删除
          PANEL.querySelectorAll('.dw-del-btn').forEach(function (btn) {
            btn.onclick = function (e) { e.stopPropagation();
              var id = btn.dataset.id;
              if (!confirm('删除此主题？')) return;
              var wasActive = window.__dwGetActiveTheme && window.__dwGetActiveTheme() === id;
              var def = (window.__DW_THEMES__ && window.__DW_THEMES__.__default__) || 'doraemon';
              if (window._dwDeleteUserTheme) {
                window._dwDeleteUserTheme(id).then(function () {
                  window.__DW_USER_THEMES__ = (window.__DW_USER_THEMES__ || []).filter(function (t) { return t.id !== id; });
                  if (window.__DW_THEMES__ && window.__DW_THEMES__[id]) delete window.__DW_THEMES__[id];
                  if (wasActive && window.__dwSwitchTheme) window.__dwSwitchTheme(def);
                  buildPanel();
                }).catch(function (err) { toast('删除失败: ' + err.message); });
              }
            };
          });

          // 重命名
          PANEL.querySelectorAll('.dw-rename-btn').forEach(function (btn) {
            btn.onclick = function (e) { e.stopPropagation();
              var id = btn.dataset.id;
              var item = btn.closest('.dw-item');
              var nameSpan = item.querySelector('span:nth-child(2)');
              if (!nameSpan) return;
              var oldName = nameSpan.textContent.replace(/^[●○]\s*/, '');
              var input = document.createElement('input');
              input.value = oldName;
              input.style.cssText = 'width:100%;padding:2px 4px;border-radius:3px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.4);color:#fff;font-size:12px;';
              nameSpan.textContent = ''; nameSpan.appendChild(input);
              input.focus(); input.select();
              function save() {
                var newName = input.value.trim();
                if (newName && newName !== oldName) {
                  var themes = window.__DW_USER_THEMES__ || [];
                  var found = themes.find(function (t) { return t.id === id; });
                  if (found) {
                    found.name = newName;
                    if (window._dwSaveUserTheme) window._dwSaveUserTheme(found).then(function () { refreshUserThemes().then(buildPanel); });
                  }
                } else { buildPanel(); }
              }
              input.onblur = save;
              input.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } if (ev.key === 'Escape') { buildPanel(); } };
            };
          });

          // 复制
          PANEL.querySelectorAll('.dw-copy-btn').forEach(function (btn) {
            btn.onclick = function (e) { e.stopPropagation(); copyBuiltinTheme(btn.dataset.id); };
          });

          // 上传按钮（★ 必须 stopPropagation，否则 buildPanel 重建 DOM 后点击冒泡到 document 会被误判为"外部点击"而关闭面板）
          var addBtn = document.getElementById('dw-add-btn');
          if (addBtn) addBtn.onclick = function (e) { e.stopPropagation(); UPLOAD_MODE = true; buildPanel(); };
          var cancelBtn = document.getElementById('dw-upload-cancel');
          if (cancelBtn) cancelBtn.onclick = function (e) { e.stopPropagation(); UPLOAD_MODE = false; buildPanel(); };

          // 文件选择（延迟创建 input，避免渲染时崩溃）
          var _selectedFile = null;
          var dropZone = document.getElementById('dw-drop-zone');
          var fileInfo = document.getElementById('dw-file-info');
          if (dropZone) {
            // 点击触发文件选择
            dropZone.onclick = function () {
              var inp = document.createElement('input');
              inp.type = 'file'; inp.accept = 'image/*,video/*';
              inp.onchange = function () {
                _selectedFile = inp.files[0];
                if (fileInfo && _selectedFile) {
                  fileInfo.textContent = '✓ ' + _selectedFile.name + ' (' + (_selectedFile.size / 1024 / 1024).toFixed(1) + 'MB)';
                }
              };
              inp.click();
            };
            // 拖拽支持
            dropZone.ondragover = function (e) { e.preventDefault(); dropZone.style.borderColor = 'rgba(126,182,255,0.6)'; };
            dropZone.ondragleave = function () { dropZone.style.borderColor = ''; };
            dropZone.ondrop = function (e) {
              e.preventDefault(); dropZone.style.borderColor = '';
              if (e.dataTransfer.files[0]) {
                _selectedFile = e.dataTransfer.files[0];
                if (fileInfo) fileInfo.textContent = '✓ ' + _selectedFile.name + ' (' + (_selectedFile.size / 1024 / 1024).toFixed(1) + 'MB)';
              }
            };
          }

          // 保存上传
          var saveBtn = document.getElementById('dw-upload-save');
          if (saveBtn) saveBtn.onclick = function () {
            var nameInput = document.getElementById('dw-upload-name');
            var name = nameInput ? nameInput.value.trim() : '';
            if (!name) { toast('请输入名称'); return; }
            if (name.length > 60) { toast('名称过长'); return; }
            if (!_selectedFile) { toast('请选择文件'); return; }
            handleUpload(name, _selectedFile);
          };

          // 导出
          var expBtn = document.getElementById('dw-export-btn');
          if (expBtn) expBtn.onclick = function () {
            var list = (window.__DW_USER_THEMES__ || []).map(function (t) {
              var c = {};
              for (var k in t) {
                if (k === '_userData' && t._userData instanceof ArrayBuffer) {
                  var bytes = new Uint8Array(t._userData);
                  var bin = '';
                  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                  c._userData = { _encoding: 'base64', _mime: t._userDataMime || 'video/mp4', _data: btoa(bin) };
                } else { c[k] = t[k]; }
              }
              return c;
            });
            var data = JSON.stringify({ _formatVersion: 2, themes: list });
            var a = document.createElement('a');
            var blob = new Blob([data], { type: 'application/json' });
            a.href = URL.createObjectURL(blob);
            a.download = 'zcode-themes-' + new Date().toISOString().slice(0, 10) + '.zctheme';
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
          };

          // 导入
          var impBtn = document.getElementById('dw-import-btn');
          if (impBtn) {
            var fi2 = document.createElement('input');
            fi2.type = 'file'; fi2.accept = '.zctheme,.json';
            fi2.onchange = function () {
              var f = fi2.files[0]; if (!f) return;
              var r = new FileReader();
              r.onload = function (ev) {
                try {
                  var p = JSON.parse(ev.target.result);
                  var raw = Array.isArray(p) ? p : (p.themes || []);
                  if (!raw.length) { toast('无主题数据'); return; }
                  var decoded = [];
                  raw.forEach(function (t) {
                    if (t._userData && t._userData._encoding === 'base64' && t._userData._data) {
                      var bin = atob(t._userData._data);
                      var bytes = new Uint8Array(bin.length);
                      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                      t._userData = t.fileType === 'video' ? bytes.buffer : ('data:' + (t._userData._mime || 'image/png') + ';base64,' + t._userData._data);
                    }
                    decoded.push(t);
                  });
                  if (!window._dwSaveUserTheme) { toast('数据库不可用'); return; }
                  Promise.all(decoded.map(function (t) { return window._dwSaveUserTheme(t); })).then(function () {
                    refreshUserThemes().then(buildPanel);
                    toast('导入 ' + decoded.length + ' 个主题');
                  }).catch(function (err) { toast('导入失败: ' + err.message); });
                } catch (err) { toast('文件格式错误'); }
              };
              r.readAsText(f);
            };
            impBtn.onclick = function () { fi2.click(); };
          }

          // 刷新
          var refBtn = document.getElementById('dw-refresh-btn');
          if (refBtn) refBtn.onclick = function () {
            if (window.__dwReloadThemes) window.__dwReloadThemes();
            refreshUserThemes().then(function () { buildPanel(); toast('已刷新'); });
          };
        }

        // —— 单图上传 ——
        function handleUpload(name, file) {
          // ★ 类型检测：优先 MIME，其次扩展名
          var isVideo = /^video\//.test(file.type) || /\.(mp4|webm|mov|avi|mkv|wmv|flv)$/i.test(file.name);
          var MAX_VIDEO = 100 * 1024 * 1024; // 100MB，避免 ArrayBuffer 内存溢出
          var MAX_IMAGE = 20 * 1024 * 1024;
          var limit = isVideo ? MAX_VIDEO : MAX_IMAGE;
          if (file.size > limit) { toast('文件过大（最大' + (isVideo ? '200MB' : '20MB') + '），当前' + (file.size/1024/1024).toFixed(1) + 'MB'); return; }
          if (!isVideo && file.size > MAX_IMAGE) { toast('图片最大20MB，当前' + (file.size/1024/1024).toFixed(1) + 'MB'); return; }
          
          var id = 'user-' + Date.now();
          var reader = new FileReader();
          reader.onerror = function () { toast('文件读取失败'); };
          reader.onload = function (e) {
            try {
            var data = e.target.result;
            var theme = { id: id, name: name, type: isVideo ? 'video' : 'static', periods: false, weather: false, desc: (isVideo ? '🎬 ' : '🖼 ') + name, fileType: isVideo ? 'video' : 'image', asset: isVideo ? 'bg.mp4' : 'bg.png', _userData: data, _isUser: true };
            if (isVideo) theme._userDataMime = file.type || 'video/mp4';
            if (!isVideo) theme.assets = { clear: { morning: 'bg.png', day: 'bg.png', dusk: 'bg.png', night: 'bg.png' }, rain: { morning: 'bg.png', day: 'bg.png', dusk: 'bg.png', night: 'bg.png' } };
            
            // ★ 先保存到内存（不等 DB），确保立即可切换
            var memEntry = { id: id, name: name, type: theme.type, asset: theme.asset, assets: theme.assets, desc: theme.desc, _userData: data, _isUser: true };
            if (isVideo) memEntry._userDataMime = theme._userDataMime;
            // 复制所有 _data_* 字段
            for (var k in theme) { if (/^_data_/.test(k)) memEntry[k] = theme[k]; }
            
            var dwThemes = window.__DW_THEMES__ || {};
            dwThemes[id] = memEntry;
            window.__DW_THEMES__ = dwThemes;
            
            // 更新用户列表
            var userList = (window.__DW_USER_THEMES__ || []).filter(function(t){return t.id !== id;});
            userList.push(theme);
            window.__DW_USER_THEMES__ = userList;
            
            // 后台保存（异步，不阻塞切换）
            if (window._dwSaveUserTheme) {
              window._dwSaveUserTheme(theme).then(function () {
                return window._dwLoadUserThemes ? window._dwLoadUserThemes() : Promise.resolve(userList);
              }).then(function (dbList) {
                window.__DW_USER_THEMES__ = dbList;
              }).catch(function () { /* DB 保存失败不影响使用 */ });
            }
            
            // 立即切换（不等 DB）
            UPLOAD_MODE = false;
            // 图片主题预生成缩略图缓存
            if (!isVideo && typeof data === 'string' && data.indexOf('data:') === 0) genThumbAsync(id, data);
            if (window.__dwSwitchTheme) window.__dwSwitchTheme(id);
            setTimeout(buildPanel, 300);
            
            } catch (err) { toast('处理失败: ' + (err.message || err)); }
          };
          if (isVideo) reader.readAsArrayBuffer(file); else reader.readAsDataURL(file);
        }

        // —— 多图上传 ——
        function handleUploadMulti(name, files) {
          var totalSize = 0;
          for (var fi = 0; fi < files.length; fi++) { var f = files[fi]; if (!f) continue; if (f.size > 20 * 1024 * 1024) { toast('图片过大（最大20MB）'); return; } totalSize += f.size; }
          if (totalSize > 60 * 1024 * 1024) { toast('总大小超过60MB'); return; }
          var id = 'user-' + Date.now();
          var periods = ['morning', 'day', 'dusk', 'night'];
          var assets = { clear: {}, rain: {} };
          var loaded = 0, total = 0, datas = {};
          files.forEach(function (f, idx) { if (f) total++; });
          if (total === 0) return;
          files.forEach(function (file, idx) {
            if (!file) return;
            var r = new FileReader();
            r.onload = function (e) {
              datas[periods[idx]] = e.target.result;
              loaded++;
              if (loaded >= total) {
                var firstData = null;
                for (var pk in datas) { firstData = datas[pk]; break; }
                periods.forEach(function (p) {
                  if (datas[p]) { assets.clear[p] = 'bg-' + p + '.png'; assets.rain[p] = 'bg-' + p + '.png'; }
                  else { assets.clear[p] = 'bg-fallback.png'; assets.rain[p] = 'bg-fallback.png'; datas[p] = firstData; }
                });
                var theme = { id: id, name: name, type: 'static', periods: true, weather: false, desc: '🖼 ' + name + '（四时段）', fileType: 'image', assets: assets, _isUser: true };
                periods.forEach(function (p) { if (datas[p]) theme['_data_' + p] = datas[p]; });
                
                // 先注册到内存
                var memEntry = { id: id, name: name, type: 'static', assets: assets, desc: theme.desc, _isUser: true };
                for (var k in theme) { if (/^_data_/.test(k)) memEntry[k] = theme[k]; }
                var dwThemes = window.__DW_THEMES__ || {};
                dwThemes[id] = memEntry;
                window.__DW_THEMES__ = dwThemes;
                var userList = (window.__DW_USER_THEMES__ || []).filter(function(t){return t.id !== id;});
                userList.push(theme);
                window.__DW_USER_THEMES__ = userList;
                
                // 后台保存
                if (window._dwSaveUserTheme) {
                  window._dwSaveUserTheme(theme).then(function () {
                    return window._dwLoadUserThemes ? window._dwLoadUserThemes() : Promise.resolve(userList);
                  }).then(function (dbList) {
                    window.__DW_USER_THEMES__ = dbList;
                  }).catch(function () {});
                }
                
                // 立即切换
                UPLOAD_MODE = false; UPLOAD_MULTI = false;
                if (window.__dwSwitchTheme) window.__dwSwitchTheme(id);
                setTimeout(buildPanel, 300);
              }
            };
            r.readAsDataURL(file);
          });
        }

        // —— 复制内置主题 ——
        function copyBuiltinTheme(id) {
          var themes = window.__DW_THEMES__ || {};
          var theme = themes[id];
          if (!theme) { toast('主题不存在'); return; }
          var base = window.__DW_THEMES_BASE__ || './themes/';
          var newId = 'user-' + id + '-' + Date.now();
          var newName = theme.name + '（复制）';

          if (theme.type === 'video') {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', base + id + '/' + theme.asset, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function () {
              var ok = (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.response && xhr.response.byteLength > 0);
              if (!ok) { toast('复制失败：无法读取视频文件'); return; }
              var ut = { id: newId, name: newName, type: 'video', periods: false, weather: false, desc: '🎬 ' + newName, fileType: 'video', asset: 'bg.mp4', _userData: xhr.response, _isUser: true };
              if (window._dwSaveUserTheme) {
                window._dwSaveUserTheme(ut).then(function () { return refreshUserThemes(); }).then(function () {
                  if (window.__dwSwitchTheme) window.__dwSwitchTheme(newId);
                  setTimeout(buildPanel, 200);
                }).catch(function (e) { toast('保存失败: ' + e.message); });
              }
            };
            xhr.onerror = function () { toast('复制失败：网络错误'); };
            xhr.send();
          } else {
            // 静态主题复制
            var periods = ['morning', 'day', 'dusk', 'night'];
            var weathers = ['clear', 'rain'];
            var assets = { clear: {}, rain: {} };
            var datas = {};
            var urls = [];
            weathers.forEach(function (w) {
              periods.forEach(function (p) {
                if (theme.assets && theme.assets[w] && theme.assets[w][p]) {
                  urls.push({ w: w, p: p, key: w + '-' + p, url: base + id + '/' + theme.assets[w][p] });
                }
              });
            });
            if (urls.length === 0) { toast('无可复制资源'); return; }
            var loaded = 0;
            urls.forEach(function (item) {
              var xhr = new XMLHttpRequest();
              xhr.open('GET', item.url, true);
              xhr.responseType = 'blob';
              xhr.onload = function () {
                var ok = (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.response && xhr.response.size > 0);
                if (ok) {
                  var fr = new FileReader();
                  fr.onload = function (ev) { datas[item.key] = ev.target.result; assets[item.w][item.p] = 'bg-' + item.w + '-' + item.p + '.png'; checkDone(); };
                  fr.readAsDataURL(xhr.response);
                } else { checkDone(); }
              };
              xhr.onerror = function () { checkDone(); };
              xhr.send();
              function checkDone() { loaded++; if (loaded >= urls.length) finishCopy(); }
            });
            function finishCopy() {
              var ut = { id: newId, name: newName, type: 'static', periods: true, weather: true, desc: '🖼 ' + newName, fileType: 'image', assets: assets, _isUser: true };
              weathers.forEach(function (w) { periods.forEach(function (p) { var k = w + '-' + p; if (datas[k]) ut['_data_' + w + '_' + p] = datas[k]; }); });
              periods.forEach(function (p) { var f = null; weathers.forEach(function (w) { if (!f && datas[w + '-' + p]) f = datas[w + '-' + p]; }); if (f) ut['_data_' + p] = f; });
              if (window._dwSaveUserTheme) {
                window._dwSaveUserTheme(ut).then(function () { return refreshUserThemes(); }).then(function () {
                  if (window.__dwSwitchTheme) window.__dwSwitchTheme(newId);
                  setTimeout(buildPanel, 200);
                }).catch(function (e) { toast('保存失败: ' + e.message); });
              }
            }
          }
        }

        // —— 快捷键 ——
        document.addEventListener('keydown', function (e) {
          if (e.ctrlKey && e.shiftKey && (e.key === 'W' || e.key === 'w')) {
            e.preventDefault(); e.stopPropagation();
            if (!PANEL) {
              PANEL = document.createElement('div');
              PANEL.id = 'dw-theme-panel';
              PANEL.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;min-width:300px;max-width:380px;padding:14px;background:rgba(15,20,35,0.94);color:#fff;border-radius:14px;font-family:system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,0.5);backdrop-filter:blur(16px);font-size:13px;';
              document.body.appendChild(PANEL);
            }
            PANEL.style.display = PANEL.style.display === 'none' ? 'block' : 'none';
            if (PANEL.style.display === 'block') { UPLOAD_MODE = false; UPLOAD_MULTI = false; buildPanel(); }
          }
          if (e.key === 'Escape' && PANEL) PANEL.style.display = 'none';
        });

        // 外部点击关闭面板（★ 加 _rebuilding 标志，避免 buildPanel 重建 DOM 时旧元素被误判为"外部"）
        var _rebuilding = false;
        var _origBuildPanel = buildPanel;
        buildPanel = function () { _rebuilding = true; try { _origBuildPanel(); } finally { setTimeout(function () { _rebuilding = false; }, 200); } };

        document.addEventListener('click', function (e) {
          if (_rebuilding) return; // 重建期间忽略所有外部点击判断
          if (PANEL && PANEL.style.display === 'block' && !PANEL.contains(e.target) && !e.ctrlKey)
            setTimeout(function () { if (PANEL && !_rebuilding) PANEL.style.display = 'none'; }, 100);
        });

        // —— 启动 ——
        ready(function () { refreshUserThemes().then(function () { }).catch(function () { }); });
      })();
    </script>
