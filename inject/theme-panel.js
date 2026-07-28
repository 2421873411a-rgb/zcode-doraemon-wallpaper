    <script>
      // ============ 主题面板（v5.0 完整版）============
      // Ctrl+Shift+W 调出；缩略图/重命名/上传四张图/导出导入/天气指示
      (function () {
        var DB_NAME = 'zcode-wp-themes';
        var PANEL = null;
        var UPLOAD_MODE = false;
	        var UPLOAD_MULTI = false; // 多图上传模式
	        var _searchQuery = ''; // 搜索框关键词
	        var _showSettings = false; // 天气设置展开

        function ready(fn) { if (window.__dwGetActiveTheme) fn(); else setTimeout(function () { ready(fn); }, 100); }

        // —— IndexedDB ——
        function openDB() {
          return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function (e) { if (!e.target.result.objectStoreNames.contains('themes')) e.target.result.createObjectStore('themes', { keyPath: 'id' }); };
            req.onsuccess = function (e) { resolve(e.target.result); };
            req.onerror = function (e) { reject(e.target.error); };
          });
        }
        function saveUserTheme(t) { return openDB().then(function(db){return new Promise(function(r,j){var tx=db.transaction('themes','readwrite');tx.objectStore('themes').put(t);tx.oncomplete=r;tx.onerror=function(e){j(e.target.error);};});}); }
        function loadUserThemes() { return openDB().then(function(db){return new Promise(function(r,j){var tx=db.transaction('themes','readonly');var req=tx.objectStore('themes').getAll();req.onsuccess=function(){r(req.result||[]);};req.onerror=function(e){j(e.target.error);};});}); }
        function deleteUserTheme(id) { return openDB().then(function(db){return new Promise(function(r,j){var tx=db.transaction('themes','readwrite');tx.objectStore('themes').delete(id);tx.oncomplete=r;tx.onerror=function(e){j(e.target.error);};});}); }

		        window.__DW_USER_THEMES__ = window.__DW_USER_THEMES__ || [];
		        // 把用户主题注册到 __DW_THEMES__ 中，确保 _themes[id] 存在
		        function registerUserThemes(themes) {
		          var target = window.__DW_THEMES__ || {};
		          themes.forEach(function(t) {
		            target[t.id] = {
		              id: t.id, name: t.name, type: t.type || 'static',
		              periods: t.periods, weather: t.weather,
		              asset: t.asset, assets: t.assets, desc: t.desc,
		              _userData: t._userData,
		              _data_morning: t._data_morning, _data_day: t._data_day,
		              _data_dusk: t._data_dusk, _data_night: t._data_night,
		              _isUser: true,
		            };
		          });
		          window.__DW_THEMES__ = target;
		        }
		        function refreshUserThemes() {
		          return loadUserThemes().then(function(l){
		            window.__DW_USER_THEMES__ = l;
		            // 预注册到 __DW_THEMES__，确保切换时 _themes[id] 立即可用
		            registerUserThemes(l);
		            // ★ 启动时强制恢复上次的用户主题（不用 getActiveTheme 比较，
		            //   因为 registerUserThemes 后 getActiveTheme 返回值会变，导致假匹配跳过切换）
		            try {
		              var savedId = localStorage.getItem('dw-active-theme');
		              if (savedId && l.some(function(t){return t.id===savedId;})) {
		                if (window.__dwSwitchTheme) window.__dwSwitchTheme(savedId);
		              }
		            } catch(e) {}
		          }).catch(function(){});
		        }

        // —— 缩略图 URL ——
        function thumbUrl(id, t) {
          if (t.type === 'video') return null;
          // 优先使用缩略图
          if (t._thumbnail) return t._thumbnail;
          if (t.user && t._userData) return t._userData;
          var themes = window.__DW_THEMES__ || {};
          var base = window.__DW_THEMES_BASE__ || './themes/';
          var th = themes[id];
          if (th && th.assets && th.assets.clear && th.assets.clear.morning) return base + id + '/' + th.assets.clear.morning;
          return null;
        }

        // —— 合并主题清单 ——
        window.__dwListAllThemes = function () {
          var builtin = window.__dwListThemes ? window.__dwListThemes() : [];
          var user = (window.__DW_USER_THEMES__ || []).map(function (t) { return { id: t.id, name: t.name, type: t.type, desc: t.desc || '自定义', user: true, _userData: t._userData }; });
          return builtin.concat(user);
        };

        // —— 面板渲染 ——
        function buildPanel() {
          if (!PANEL || !document.body.contains(PANEL)) return;
          var allThemes = window.__dwListAllThemes ? window.__dwListAllThemes() : [];
          var active = window.__dwGetActiveTheme ? window.__dwGetActiveTheme() : '';

	          // 天气状态
	          var w = window.__dwGetWeather ? window.__dwGetWeather() : 'clear';
	          var ws = window.__dwGetWeatherSource ? window.__dwGetWeatherSource() : null;
	          var wIcon = w === 'rain' ? '🌧️' : '☀️';
	          var wLabel = w === 'rain' ? '下雨' : '晴天';
	          var wSrc = ws === 'manual' ? '手动' : (ws === 'auto' ? '自动' : '默认');

	          // 天气详情（从自动检测结果取）
	          var weatherDetail = '';
	          if (window.__dwWeatherAuto) {
	            var st = window.__dwWeatherAuto.status();
	            if (st.lastResult) {
	              weatherDetail = '<span style="font-size:10px;opacity:0.5;">' +
	                (typeof st.lastResult.precip === 'number' ? st.lastResult.precip.toFixed(1) + 'mm ' : '') +
	                (typeof st.lastResult.prob === 'number' ? st.lastResult.prob + '% ' : '') +
	                (st.lastResult.loc ? st.lastResult.loc : '') +
	                '</span>';
	            }
	            if (st.lastError) {
	              weatherDetail = '<span style="font-size:10px;opacity:0.35;" title="' + st.lastError + '">⚠️ 检测异常</span>';
	            }
	          }

	          var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
	            '<div style="font-size:16px;font-weight:600;">🎨 主题壁纸</div>' +
	            '<div style="display:flex;align-items:center;gap:4px;">' +
	            '<span id="dw-open-settings" style="font-size:11px;cursor:pointer;opacity:0.35;padding:2px;" title="天气设置 ⚙️">⚙️</span>' +
	            '<span id="dw-weather-refresh" style="font-size:11px;cursor:pointer;opacity:0.4;padding:2px;" title="刷新天气检测">↻</span>' +
	            '<span style="font-size:11px;opacity:0.5;">' + wIcon + ' ' + wLabel + ' · ' + wSrc + '</span>' +
	            '</div></div>' +
	            (weatherDetail ? '<div style="text-align:right;margin-bottom:4px;">' + weatherDetail + '</div>' : '');

	          // —— 搜索框 ——
	          html += '<div style="position:relative;margin-bottom:5px;">' +
	            '<input id="dw-search-input" placeholder="🔍 搜索主题..." value="' + _searchQuery.replace(/"/g,'&quot;') + '" style="width:100%;box-sizing:border-box;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;outline:none;">' +
	            '<span id="dw-search-clear" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);cursor:pointer;opacity:0.4;font-size:12px;' + (!_searchQuery?'display:none;':'') + '">✕</span></div>';

	          // —— 过滤 ——
	          var filtered = allThemes.filter(function (t) {
	            if (!_searchQuery) return true;
	            return t.name.toLowerCase().indexOf(_searchQuery.toLowerCase()) >= 0;
	          });

	          html += '<div style="max-height:290px;overflow-y:auto;margin-bottom:8px;">';
	          var hasThemes = false;
	          filtered.forEach(function (t) {
            hasThemes = true;
            var isCur = t.id === active;
            var thu = thumbUrl(t.id, t);
	            html += '<div class="dw-theme-item" data-id="' + t.id + '" data-name="' + t.name.replace(/"/g,'&quot;') + '" data-user="' + (t.user || false) + '" style="' +
              'padding:6px 10px;margin:3px 0;border-radius:8px;cursor:pointer;' +
              'background:' + (isCur ? 'rgba(126,182,255,0.25)' : 'rgba(255,255,255,0.06)') + ';' +
              'border:1px solid ' + (isCur ? 'rgba(126,182,255,0.6)' : 'transparent') + ';' +
              'display:flex;align-items:center;gap:8px;">';
            // 缩略图
            if (thu) html += '<div style="width:40px;height:28px;border-radius:4px;overflow:hidden;flex-shrink:0;background:rgba(0,0,0,0.3);background-size:cover;background-position:center;background-image:url(\'' + thu + '\');"></div>';
            else if (t.type === 'video') html += '<div style="width:40px;height:28px;border-radius:4px;flex-shrink:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:16px;">🎬</div>';
            else html += '<div style="width:40px;height:28px;border-radius:4px;flex-shrink:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;">🖼</div>';
            // 名称+描述
            html += '<div style="flex:1;min-width:0;">' +
              '<div class="dw-theme-name" style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (isCur ? '● ' : '○ ') + t.name + '</div>' +
              '<div style="font-size:11px;opacity:0.6;">' + (t.desc || (t.type==='video'?'🎬 视频':'🖼 图片')) + '</div></div>';
	            // 操作按钮
	            if (t.user) {
	              html += '<span class="dw-rename-btn" data-id="' + t.id + '" style="font-size:13px;opacity:0.35;cursor:pointer;padding:2px 3px;" title="重命名">✏️</span>' +
	                '<span class="dw-del-btn" data-id="' + t.id + '" style="font-size:14px;opacity:0.35;cursor:pointer;padding:2px 3px;" title="删除">✕</span>';
	            } else {
	              html += '<span class="dw-copy-btn" data-id="' + t.id + '" style="font-size:12px;opacity:0.35;cursor:pointer;padding:2px 3px;" title="复制到自定义">📋</span>';
	            }
            html += '</div>';
          });
          if (!hasThemes) html += '<div style="text-align:center;opacity:0.4;padding:20px 0;">暂无主题</div>';
          html += '</div>';

          // —— 上传区域 ——
          html += '<div id="dw-upload-area">';
          if (!UPLOAD_MODE) {
            html += '<div id="dw-add-btn" style="padding:7px;text-align:center;cursor:pointer;border:1px dashed rgba(255,255,255,0.25);border-radius:8px;font-size:13px;">➕ 添加新主题</div>';
          } else {
            html += '<div style="border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;">' +
              '<div style="font-size:13px;font-weight:500;margin-bottom:6px;">📤 上传新主题</div>' +
              '<input id="dw-upload-name" placeholder="主题名称" style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:13px;margin-bottom:6px;">' +
              '<label style="display:flex;align-items:center;gap:4px;font-size:11px;opacity:0.6;margin-bottom:4px;"><input id="dw-upload-multi" type="checkbox" ' + (UPLOAD_MULTI?'checked':'') + '> 分时段（不同时段不同壁纸）</label>';
            if (!UPLOAD_MULTI) {
              html += '<input id="dw-upload-file" type="file" accept="image/*,video/*" style="font-size:12px;margin-bottom:6px;color:#fff;">';
            } else {
              html += '<div style="font-size:11px;opacity:0.6;margin-bottom:4px;">按顺序选4张图：清晨 / 白天 / 黄昏 / 夜晚</div>' +
                ['清晨','白天','黄昏','夜晚'].map(function(n,i){return'<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;"><span style="width:28px;font-size:11px;opacity:0.6;">'+n+'</span><input class="dw-upload-mfile" data-idx="'+i+'" type="file" accept="image/*" style="font-size:11px;color:#fff;flex:1;"></div>';}).join('');
            }
            html += '<div style="display:flex;gap:6px;margin-top:4px;">' +
              '<button id="dw-upload-save" style="flex:1;padding:5px;border:none;border-radius:6px;background:rgba(74,144,226,0.7);color:#fff;cursor:pointer;font-size:12px;">保存</button>' +
              '<button id="dw-upload-cancel" style="flex:1;padding:5px;border:none;border-radius:6px;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:12px;">取消</button></div></div>';
          }
          html += '</div>';

          // —— 底部按钮行（导入导出）——
          html += '<div style="display:flex;gap:6px;margin-top:8px;">' +
            '<button id="dw-export-btn" style="flex:1;padding:4px;border:none;border-radius:6px;background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:11px;">📥 导出主题</button>' +
            '<button id="dw-import-btn" style="flex:1;padding:4px;border:none;border-radius:6px;background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:11px;">📤 导入主题</button></div>' +

            // —— 缩放模式 ——
            (function() {
              var cur = 'cover';
              try { var v = localStorage.getItem('dw-fit'); if (v) cur = v; } catch(e) {}
              var opts = [
                { v: 'cover', l: '⊞ 铺满', t: '裁剪填满屏幕' },
                { v: 'contain', l: '⊡ 适配', t: '完整可见，可能有黑边' },
                { v: 'fill', l: '⊟ 拉伸', t: '拉伸填满，可能变形' },
              ];
              var h = '<div style="display:flex;gap:4px;margin-top:6px;font-size:11px;">';
              opts.forEach(function(o) {
                var sel = cur === o.v;
                h += '<span class="dw-fit-btn" data-fit="' + o.v + '" title="' + o.t + '" style="flex:1;text-align:center;padding:3px 0;border-radius:5px;cursor:pointer;background:' + (sel ? 'rgba(126,182,255,0.25)' : 'rgba(255,255,255,0.06)') + ';border:1px solid ' + (sel ? 'rgba(126,182,255,0.4)' : 'transparent') + ';">' + o.l + '</span>';
              });
              h += '</div>';
	              return h;
	            })() +

	            // —— 天气设置（可折叠）——
	            (function() {
	              var h = '<div style="margin-top:5px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;">';
	              h += '<div id="dw-toggle-settings" style="font-size:11px;cursor:pointer;opacity:0.5;padding:2px 0;user-select:none;">⚙️ 天气设置 ' + (_showSettings ? '▲' : '▼') + '</div>';
	              if (_showSettings) {
	                var C = { homeLat:39.9042,homeLon:116.4074,workLat:39.9142,workLon:116.4174,workDays:'1,2,3,4,5',workHourStart:8,workHourEnd:17,enterMm:0.1,enterProb:50,exitMm:0.05,exitProb:30,refreshMin:20 };
	                try { var r = JSON.parse(localStorage.getItem('dw-weather-config')||'{}'); for(var k in r) C[k]=r[k]; } catch(e){}
	                h += '<div style="font-size:11px;display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:4px;">' +
	                  '<span style="opacity:0.5;">🏠 家纬度</span><input class="dw-cfg" data-k="homeLat" value="'+C.homeLat+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:70px;">' +
	                  '<span style="opacity:0.5;">家经度</span><input class="dw-cfg" data-k="homeLon" value="'+C.homeLon+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:70px;">' +
	                  '<span style="opacity:0.5;">🏢 工作纬度</span><input class="dw-cfg" data-k="workLat" value="'+C.workLat+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:70px;">' +
	                  '<span style="opacity:0.5;">工作经度</span><input class="dw-cfg" data-k="workLon" value="'+C.workLon+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:70px;">' +
	                  '<span style="opacity:0.5;">📅 工作日</span><input class="dw-cfg" data-k="workDays" value="'+C.workDays+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:70px;" title="逗号分隔，如 1,2,3,4,5">' +
	                  '<span style="opacity:0.5;">工作时(起-止)</span><span><input class="dw-cfg" data-k="workHourStart" value="'+C.workHourStart+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:28px;text-align:center;"> － <input class="dw-cfg" data-k="workHourEnd" value="'+C.workHourEnd+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:28px;text-align:center;"></span>' +
	                  '<span style="opacity:0.5;">🌧 进入(mm/%)</span><span><input class="dw-cfg" data-k="enterMm" value="'+C.enterMm+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:30px;text-align:center;">／<input class="dw-cfg" data-k="enterProb" value="'+C.enterProb+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:28px;text-align:center;"></span>' +
	                  '<span style="opacity:0.5;">☀ 退出(mm/%)</span><span><input class="dw-cfg" data-k="exitMm" value="'+C.exitMm+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:30px;text-align:center;">／<input class="dw-cfg" data-k="exitProb" value="'+C.exitProb+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:28px;text-align:center;"></span>' +
	                  '<span style="opacity:0.5;">⏱ 刷新(分)</span><input class="dw-cfg" data-k="refreshMin" value="'+C.refreshMin+'" style="padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;width:50px;text-align:center;">' +
	                  '</div>';
	                h += '<button id="dw-save-weather-cfg" style="width:100%;margin-top:4px;padding:4px;border:none;border-radius:5px;background:rgba(74,144,226,0.6);color:#fff;cursor:pointer;font-size:11px;">💾 保存天气配置</button>';
	              }
	              h += '</div>';
	              return h;
	            })() +

	          html += '<div style="margin-top:6px;font-size:10px;opacity:0.35;text-align:center;">Ctrl+W 面板 · Ctrl+R 晴雨 · Esc 关闭</div>';
	          PANEL.innerHTML = html;

	          // —— 搜索框事件（DOM 过滤，不重建面板）——
	          var searchInput = document.getElementById('dw-search-input');
	          if (searchInput) {
	            searchInput._composing = false;
	            searchInput.oncompositionstart = function () { this._composing = true; };
	            searchInput.oncompositionend = function () {
	              this._composing = false;
	              _searchQuery = this.value;
	              filterThemeList();
	            };
	            searchInput.oninput = function () {
	              _searchQuery = this.value;
	              if (this._composing) return;
	              filterThemeList();
	            };
	          }
	          function filterThemeList() {
	            var items = PANEL.querySelectorAll('.dw-theme-item');
	            var q = _searchQuery.toLowerCase();
	            items.forEach(function (item) {
	              var name = (item.getAttribute('data-name') || '').toLowerCase();
	              item.style.display = (!q || name.indexOf(q) >= 0) ? '' : 'none';
	            });
	            var clearBtn = document.getElementById('dw-search-clear');
	            if (clearBtn) clearBtn.style.display = _searchQuery ? '' : 'none';
	          }
	          var searchClear = document.getElementById('dw-search-clear');
	          if (searchClear) {
	            searchClear.onclick = function (e) { e.stopPropagation(); _searchQuery = ''; var si = document.getElementById('dw-search-input'); if (si) si.value = ''; filterThemeList(); };
	          }

	          // —— 天气刷新 ——
	          var refreshBtn = document.getElementById('dw-weather-refresh');
	          if (refreshBtn) {
	            refreshBtn.onclick = function (e) { e.stopPropagation(); if (window.__dwWeatherAuto && window.__dwWeatherAuto.detect) window.__dwWeatherAuto.detect(); setTimeout(buildPanel, 2000); };
	          }
	          // —— 打开设置 ——
	          var settingsBtn = document.getElementById('dw-open-settings');
	          if (settingsBtn) {
	            settingsBtn.onclick = function (e) { e.stopPropagation(); if (window.__dwOpenSettings) window.__dwOpenSettings(); };
	          }

		          // —— 点击切换主题 ——
		          PANEL.querySelectorAll('.dw-theme-item').forEach(function (item) {
		            item.onmouseenter = function () { if (item.dataset.id !== active) item.style.background = 'rgba(255,255,255,0.12)'; };
		            item.onmouseleave = function () { if (item.dataset.id !== active) item.style.background = 'rgba(255,255,255,0.06)'; };
		            item.onclick = function (e) {
		              if (e.target.classList.contains('dw-del-btn') || e.target.classList.contains('dw-rename-btn') || e.target.classList.contains('dw-copy-btn')) return;
		              var id = item.dataset.id;
		              document.title = '🖱 点击: ' + id;
		              var result = window.__dwSwitchTheme(id);
		              document.title = (result === false ? '❌ FAIL' : '✅ OK') + ' → ' + id;
		              if (result !== false) {
		                active = id;
		                buildPanel();
		              }
		            };
		          });

          // —— 删除 ——
          PANEL.querySelectorAll('.dw-del-btn').forEach(function (btn) {
            btn.onclick = function (e) { e.stopPropagation();
              var id = btn.dataset.id;
              if (!confirm('删除此主题？')) return;
              deleteUserTheme(id).then(function () {
                window.__DW_USER_THEMES__ = (window.__DW_USER_THEMES__ || []).filter(function (t) { return t.id !== id; });
                if (window.__dwGetActiveTheme && window.__dwGetActiveTheme() === id) window.__dwSwitchTheme(window.__DW_THEMES__.__default__ || 'doraemon');
                buildPanel();
              }).catch(function (err) { alert('删除失败: ' + err.message); });
            };
          });

          // —— 重命名 ——
          PANEL.querySelectorAll('.dw-rename-btn').forEach(function (btn) {
            btn.onclick = function (e) { e.stopPropagation();
              var id = btn.dataset.id;
              var item = btn.closest('.dw-theme-item');
              var nameEl = item.querySelector('.dw-theme-name');
              var oldName = nameEl.textContent.replace(/^[●○]\s*/, '');
              var input = document.createElement('input');
              input.value = oldName;
              input.style.cssText = 'width:100%;padding:2px 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.4);color:#fff;font-size:13px;';
              nameEl.textContent = '';
              nameEl.appendChild(input);
              input.focus();
              input.select();
              function save() {
                var newName = input.value.trim();
                if (newName && newName !== oldName) {
                  var themes = window.__DW_USER_THEMES__ || [];
                  var found = themes.find(function(t){return t.id===id;});
                  if (found) { found.name = newName; found.desc = found.desc.replace(/[^ ]+$/, newName);
                    saveUserTheme(found).then(function(){ refreshUserThemes(); buildPanel(); }); }
                } else { buildPanel(); }
              }
              input.onblur = save;
              input.onkeydown = function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } if (ev.key === 'Escape') { buildPanel(); } };
            };
          });

          // —— 上传切换 ——
          var addBtn = document.getElementById('dw-add-btn');
          if (addBtn) addBtn.onclick = function (e) { e.stopPropagation(); UPLOAD_MODE = true; buildPanel(); };
          var cancelBtn = document.getElementById('dw-upload-cancel');
          if (cancelBtn) cancelBtn.onclick = function (e) { e.stopPropagation(); UPLOAD_MODE = false; UPLOAD_MULTI = false; buildPanel(); };
          var multiCb = document.getElementById('dw-upload-multi');
          if (multiCb) multiCb.onchange = function (e) { e.stopPropagation(); UPLOAD_MULTI = multiCb.checked; buildPanel(); };

          // —— 保存上传 ——
          var saveBtn = document.getElementById('dw-upload-save');
          if (saveBtn) saveBtn.onclick = function (e) { e.stopPropagation();
            var nameInput = document.getElementById('dw-upload-name');
            var name = nameInput ? nameInput.value.trim() : '';
            if (!name) { alert('请输入主题名称'); return; }
            if (!UPLOAD_MULTI) {
              var fileInput = document.getElementById('dw-upload-file');
              if (!fileInput || !fileInput.files[0]) { alert('请选择文件'); return; }
              handleUpload(name, fileInput.files[0], null);
            } else {
              var fileInputs = document.querySelectorAll('.dw-upload-mfile');
              var files = [];
              fileInputs.forEach(function(fi){ files.push(fi.files[0] || null); });
              if (files.every(function(f){return f===null;})) { alert('请至少选择一张图'); return; }
              handleUploadMulti(name, files);
            }
          };

	          // —— 导出 .zctheme ——
	          var exportBtn = document.getElementById('dw-export-btn');
	          if (exportBtn) exportBtn.onclick = function (e) { e.stopPropagation();
	            var list = window.__DW_USER_THEMES__ || [];
	            var data = JSON.stringify({ _formatVersion: 1, _exportedAt: new Date().toISOString(), themes: list });
	            var a = document.createElement('a');
	            a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
	            a.download = 'zcode-themes-' + new Date().toISOString().slice(0,10) + '.zctheme';
	            a.click();
	          };

	          // —— 导入 .zctheme / .json ——
	          var importBtn = document.getElementById('dw-import-btn');
	          if (importBtn) {
	            var fileInput = document.createElement('input');
	            fileInput.type = 'file'; fileInput.accept = '.zctheme,.json';
	            fileInput.onchange = function (e2) {
	              var f = e2.target.files[0]; if (!f) return;
	              var r = new FileReader();
	              r.onload = function (e3) {
	                try {
	                  var parsed = JSON.parse(e3.target.result);
	                  // 支持新格式 {_formatVersion, themes} 和旧格式 [...]
	                  var list = Array.isArray(parsed) ? parsed : (parsed.themes || []);
	                  if (!Array.isArray(list)) { alert('格式错误'); return; }
	                  Promise.all(list.map(function(t){return saveUserTheme(t);})).then(function(){
	                    refreshUserThemes(); buildPanel();
	                    alert('成功导入 ' + list.length + ' 个主题！');
	                  }).catch(function(err){alert('导入失败:'+err.message);});
	                } catch(e4){ alert('文件格式错误'); }
	              };
	              r.readAsText(f);
	            };
	            importBtn.onclick = function (e) { e.stopPropagation(); fileInput.click(); };
	          }

	          // —— 拖放导入（.zctheme 文件拖到面板上）——
	          PANEL.ondragover = function (e) { e.preventDefault(); PANEL.style.borderColor = 'rgba(126,182,255,0.6)'; };
	          PANEL.ondragleave = function () { PANEL.style.borderColor = ''; };
	          PANEL.ondrop = function (e) { e.preventDefault(); PANEL.style.borderColor = '';
	            var f = e.dataTransfer.files[0];
	            if (!f || !f.name.match(/\.(zctheme|json)$/i)) { alert('请拖入 .zctheme 或 .json 文件'); return; }
	            var r = new FileReader();
	            r.onload = function (ev) {
	              try {
	                var parsed = JSON.parse(ev.target.result);
	                var list = Array.isArray(parsed) ? parsed : (parsed.themes || []);
	                if (!Array.isArray(list)) { alert('格式错误'); return; }
	                Promise.all(list.map(function(t){return saveUserTheme(t);})).then(function(){
	                  refreshUserThemes(); buildPanel();
	                  alert('成功导入 ' + list.length + ' 个主题！');
	                }).catch(function(err){alert('导入失败:'+err.message);});
	              } catch(e){ alert('文件格式错误'); }
	            };
		            r.readAsText(f);
		          };

		          // —— 壁纸缩放模式 ——
		          PANEL.querySelectorAll('.dw-fit-btn').forEach(function (btn) {
		            btn.onclick = function (e) { e.stopPropagation();
		              var fit = btn.dataset.fit;
		              try { localStorage.setItem('dw-fit', fit); } catch(e) {}
		              document.documentElement.style.setProperty('--dw-fit', fit);
		              buildPanel();
		            };
			          });

		          // —— 天气设置展开/折叠 ——
		          var toggleSettings = document.getElementById('dw-toggle-settings');
		          if (toggleSettings) toggleSettings.onclick = function (e) { e.stopPropagation(); _showSettings = !_showSettings; buildPanel(); };

		          // —— 保存天气配置 ——
		          var saveWeatherCfg = document.getElementById('dw-save-weather-cfg');
		          if (saveWeatherCfg) saveWeatherCfg.onclick = function (e) { e.stopPropagation();
		            var cfg = {};
		            document.querySelectorAll('.dw-cfg').forEach(function(inp) { cfg[inp.dataset.k] = inp.value; });
		            try { localStorage.setItem('dw-weather-config', JSON.stringify(cfg)); } catch(e) {}
		            if (window.__dwWeatherAuto && window.__dwWeatherAuto.detect) window.__dwWeatherAuto.detect();
		            _showSettings = false;
		            buildPanel();
		          };

		          // —— 复制内置主题 ——
	          PANEL.querySelectorAll('.dw-copy-btn').forEach(function (btn) {
	            btn.onclick = function (e) { e.stopPropagation();
	              var id = btn.dataset.id;
	              copyBuiltinTheme(id);
	            };
	          });
	        }

	        // —— 单图上传 ——
	        function handleUpload(name, file, multiFiles) {
	          var isVideo = file.type.startsWith('video/');
	          var id = 'user-' + Date.now();
	          var reader = new FileReader();
	          reader.onload = function (e) {
	            var data = e.target.result;
	            var theme = { id: id, name: name, type: isVideo ? 'video' : 'static', periods: false, weather: false, desc: (isVideo ? '🎬 ' : '🖼 ') + name, fileType: isVideo ? 'video' : 'image', asset: isVideo ? 'bg.mp4' : 'bg.png', _userData: data, _isUser: true };
	            if (!isVideo) {
	              theme.assets = { clear: { morning: 'bg.png', day: 'bg.png', dusk: 'bg.png', night: 'bg.png' }, rain: { morning: 'bg.png', day: 'bg.png', dusk: 'bg.png', night: 'bg.png' } };
	              // 生成缩略图
	              genThumbnail(data, function(t) { theme._thumbnail = t; finish(); });
	            } else {
	              finish();
	            }
	            function finish() {
	              // ★ 立即注册到 __DW_THEMES__（不等 IndexedDB），确保即时可切换
	              var target = window.__DW_THEMES__ || {};
	              target[id] = { id: id, name: name, type: theme.type, periods: theme.periods, weather: theme.weather, asset: theme.asset, assets: theme.assets, desc: theme.desc, _userData: data, _isUser: true };
	              if (theme._thumbnail) target[id]._thumbnail = theme._thumbnail;
	              window.__DW_THEMES__ = target;
	              // 同时更新 __DW_USER_THEMES__ 供面板显示
	              window.__DW_USER_THEMES__ = (window.__DW_USER_THEMES__ || []).concat([theme]);
	              // 保存到 IndexedDB 并刷新
	              saveUserTheme(theme).then(function(){ return refreshUserThemes(); }).then(function(){ UPLOAD_MODE = false; if (window.__dwSwitchTheme) window.__dwSwitchTheme(id); setTimeout(buildPanel, 200); }).catch(function(err){ alert('保存失败: ' + err.message); });
	            }
	          };
	          if (isVideo) reader.readAsArrayBuffer(file); else reader.readAsDataURL(file);
	        }

        function genThumbnail(dataUrl, cb) {
          var img = new Image();
          img.onload = function() {
            try {
              var c = document.createElement('canvas');
              c.width = 40; c.height = 28;
              var cx = c.getContext('2d');
              // 居中裁剪缩放
              var s = Math.min(img.width / 40, img.height / 28);
              var sw = 40 * s, sh = 28 * s;
              cx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, 40, 28);
              cb(c.toDataURL('image/jpeg', 0.7));
            } catch(e) { cb(null); }
          };
          img.onerror = function() { cb(null); };
          img.src = dataUrl;
        }

        // —— 多图上传 ——
        function handleUploadMulti(name, files) {
          var id = 'user-' + Date.now();
          var periods = ['morning', 'day', 'dusk', 'night'];
          var pNames = ['清晨', '白天', '黄昏', '夜晚'];
          var assets = { clear: {}, rain: {} };
          var loaded = 0; var total = 0; var datas = {};
          files.forEach(function(f, idx) { if (f) total++; });
          if (total === 0) return;
          files.forEach(function(file, idx) {
            if (!file) return;
            var r = new FileReader();
            r.onload = function(e) {
              datas[periods[idx]] = e.target.result;
              loaded++;
              if (loaded >= total) {
                periods.forEach(function(p) { if (datas[p]) { assets.clear[p] = 'bg-' + p + '.png'; assets.rain[p] = 'bg-' + p + '.png'; } else { assets.clear[p] = datas[periods.find(function(p2){return datas[p2];})] || 'bg.png'; assets.rain[p] = datas[periods.find(function(p2){return datas[p2];})] || 'bg.png'; } });
	                var theme = { id: id, name: name, type: 'static', periods: true, weather: false, desc: '🖼 ' + name + '（四时段）', fileType: 'image', assets: assets, _isUser: true };
	                periods.forEach(function(p) { if (datas[p]) theme['_data_' + p] = datas[p]; });
	                // ★ 立即注册到 __DW_THEMES__（不等 IndexedDB）
	                var target = window.__DW_THEMES__ || {};
	                target[id] = { id: id, name: name, type: 'static', periods: true, weather: false, assets: assets, desc: theme.desc, _isUser: true };
	                periods.forEach(function(p) { if (datas[p]) target[id]['_data_' + p] = datas[p]; });
	                target.__multiData = {};
	                periods.forEach(function(p) { if (datas[p]) target.__multiData[p] = datas[p]; });
	                window.__DW_THEMES__ = target;
	                window.__DW_USER_THEMES__ = (window.__DW_USER_THEMES__ || []).concat([theme]);
	                saveUserTheme(theme).then(function(){ return refreshUserThemes(); }).then(function(){ UPLOAD_MODE = false; UPLOAD_MULTI = false; if (window.__dwSwitchTheme) window.__dwSwitchTheme(id); setTimeout(buildPanel, 200); }).catch(function(err){ alert('保存失败: '+err.message); });
              }
            };
            r.readAsDataURL(file);
          });
	        }

	        // —— XHR 辅助：file:// 协议下载 blob → dataURL ——
	        function xhrBlobAsDataUrl(url, cb) {
	          var xhr = new XMLHttpRequest();
	          xhr.open('GET', url, true);
	          xhr.responseType = 'blob';
	          xhr.onload = function () {
	            if (xhr.status < 200 || xhr.status >= 300) { cb(new Error('HTTP ' + xhr.status)); return; }
	            var r = new FileReader();
	            r.onload = function (e) { cb(null, e.target.result); };
	            r.readAsDataURL(xhr.response);
	          };
	          xhr.onerror = function () { cb(new Error('网络错误')); };
	          xhr.send();
	        }
	        function xhrAsArrayBuffer(url, cb) {
	          var xhr = new XMLHttpRequest();
	          xhr.open('GET', url, true);
	          xhr.responseType = 'arraybuffer';
	          xhr.onload = function () {
	            if (xhr.status < 200 || xhr.status >= 300) { cb(new Error('HTTP ' + xhr.status)); return; }
	            cb(null, xhr.response);
	          };
	          xhr.onerror = function () { cb(new Error('网络错误')); };
	          xhr.send();
	        }

	        // —— 复制内置主题到自定义 ——
	        function copyBuiltinTheme(id) {
	          var themes = window.__DW_THEMES__ || {};
	          var theme = themes[id];
	          if (!theme) { alert('未找到主题'); return; }
	          var base = window.__DW_THEMES_BASE__ || './themes/';
	          var newId = 'user-' + id + '-' + Date.now();
	          var newName = theme.name + '（复制）';

	          if (theme.type === 'video') {
	            var url = base + id + '/' + theme.asset;
	            xhrAsArrayBuffer(url, function (err, buf) {
	              if (err) { alert('复制失败: ' + err.message); return; }
	              var ut = {
	                id: newId, name: newName, type: 'video', periods: false, weather: false,
	                desc: '🎬 ' + newName, fileType: 'video', asset: 'bg.mp4',
	                _userData: buf, _isUser: true,
	              };
		              saveUserTheme(ut).then(function () {
		                return refreshUserThemes();
		              }).then(function () {
		                if (window.__dwSwitchTheme) window.__dwSwitchTheme(newId);
		                setTimeout(buildPanel, 200);
		              }).catch(function (e) { alert('保存失败: ' + e.message); });
		            });
		          } else {
		            // 静态主题：加载 clear/rain × 4 periods 共最多 8 张图
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
	            if (urls.length === 0) { alert('无可复制的图片资源'); return; }
	            var loaded = 0;
	            urls.forEach(function (item) {
	              xhrBlobAsDataUrl(item.url, function (err, dataUrl) {
	                if (err) { loaded++; if (loaded >= urls.length) finishCopy(); return; }
	                datas[item.key] = dataUrl;
	                assets[item.w][item.p] = 'bg-' + item.w + '-' + item.p + '.png';
	                loaded++;
	                if (loaded >= urls.length) finishCopy();
	              });
	            });
	            function finishCopy() {
	              // 没加载到的时段用已有图片兜底
	              var firstData = null;
	              for (var k in datas) { firstData = datas[k]; break; }
	              weathers.forEach(function (w) {
	                periods.forEach(function (p) {
	                  if (!assets[w][p] && firstData) {
	                    assets[w][p] = 'bg.png';
	                    datas[w + '-' + p] = firstData;
	                  }
	                });
	              });
	              var ut = {
	                id: newId, name: newName, type: 'static', periods: true, weather: true,
	                desc: '🖼 ' + newName, fileType: 'image', assets: assets, _isUser: true,
	              };
	              periods.forEach(function (p) {
	                ['clear', 'rain'].forEach(function (w) {
	                  var k = w + '-' + p;
	                  if (datas[k]) ut['_data_' + p] = datas[k];
	                });
	              });
		              saveUserTheme(ut).then(function () {
		                return refreshUserThemes();
		              }).then(function () {
		                if (window.__dwSwitchTheme) window.__dwSwitchTheme(newId);
		                setTimeout(buildPanel, 200);
		              }).catch(function (e) { alert('保存失败: ' + e.message); });
		            }
		          }
		        }

	        // —— 预览遮罩 ——
	        var _previewOverlay = null;
	        function getPreviewUrl(id) {
	          var themes = window.__DW_THEMES__ || {};
	          var allList = window.__dwListAllThemes ? window.__dwListAllThemes() : [];
	          var info = allList.find(function(t){return t.id===id;});
	          if (!info) return null;
	          var t = themes[id];
	          if (!t || t.type === 'video') return null;
	          var hour = new Date().getHours();
	          var period = hour>=5&&hour<8?'morning':hour>=8&&hour<17?'day':hour>=17&&hour<19?'dusk':'night';
	          var weather = window.__dwGetWeather ? window.__dwGetWeather() : 'clear';
	          var base = window.__DW_THEMES_BASE__ || './themes/';
	          if (t._isUser && t.periods) {
	            var multiData = window.__DW_THEMES__.__multiData;
	            if (multiData && multiData[period]) return multiData[period];
	          }
	          if (t._userData) return t._userData;
	          if (t.assets && t.assets[weather] && t.assets[weather][period])
	            return base + id + '/' + t.assets[weather][period];
	          return null;
	        }
	        function showPreview(id) {
	          closePreview();
	          var allList = window.__dwListAllThemes ? window.__dwListAllThemes() : [];
	          var info = allList.find(function(t){return t.id===id;});
	          if (!info) return;
	          var isVideo = info.type === 'video';
	          var imgUrl = getPreviewUrl(id);
	          var activeId = window.__dwGetActiveTheme ? window.__dwGetActiveTheme() : '';
	          var isActive = id === activeId;

	          var overlay = document.createElement('div');
	          overlay.className = 'dw-preview-overlay';
	          overlay.setAttribute('data-preview-id', id);
	          Object.assign(overlay.style, {
	            position:'fixed', inset:'0', zIndex:2147483646,
	            background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)',
	            display:'flex', alignItems:'center', justifyContent:'center',
	            fontFamily:'system-ui,sans-serif',
	          });
	          overlay.onclick = function(e) { if (e.target === overlay) closePreview(); };

	          var box = document.createElement('div');
	          Object.assign(box.style, {
	            background:'rgba(15,20,35,0.92)', borderRadius:'14px', padding:'20px',
	            maxWidth:'520px', width:'90%', color:'#fff', boxShadow:'0 16px 48px rgba(0,0,0,0.5)',
	          });
	          box.onclick = function(e) { e.stopPropagation(); };

	          // 预览图片区
	          var previewHtml = '';
	          if (isVideo) {
	            previewHtml = '<div style="height:200px;border-radius:10px;overflow:hidden;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:48px;margin-bottom:12px;">🎬</div>';
	          } else if (imgUrl) {
	            previewHtml = '<div style="height:220px;border-radius:10px;overflow:hidden;background:rgba(0,0,0,0.3);background-size:cover;background-position:center;background-image:url(\'' + imgUrl.replace(/'/g,"\\'") + '\');margin-bottom:12px;"></div>';
	          } else {
	            previewHtml = '<div style="height:200px;border-radius:10px;overflow:hidden;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:12px;">🖼</div>';
	          }

	          box.innerHTML = previewHtml +
	            '<div style="font-size:16px;font-weight:600;margin-bottom:4px;">' + info.name + '</div>' +
	            '<div style="font-size:12px;opacity:0.6;margin-bottom:14px;">' + (info.desc || (isVideo?'🎬 视频主题':'🖼 图片主题')) + '</div>' +
	            (isActive ? '<div style="text-align:center;padding:6px;border-radius:6px;background:rgba(126,182,255,0.15);font-size:12px;opacity:0.7;">✓ 当前使用中</div>' :
	            '<div style="display:flex;gap:8px;">' +
	              '<button class="dw-preview-apply" style="flex:1;padding:8px;border:none;border-radius:8px;background:rgba(74,144,226,0.7);color:#fff;cursor:pointer;font-size:13px;">✓ 应用</button>' +
	              '<button class="dw-preview-cancel" style="flex:1;padding:8px;border:none;border-radius:8px;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:13px;">✕ 取消</button></div>');

	          overlay.appendChild(box);
	          document.body.appendChild(overlay);
	          _previewOverlay = overlay;

	          // 按钮事件
	          var applyBtn = overlay.querySelector('.dw-preview-apply');
	          if (applyBtn) applyBtn.onclick = function(e) { e.stopPropagation();
	            window.__dwSwitchTheme(id);
	            closePreview();
	            setTimeout(buildPanel, 150);
	          };
	          var cancelBtn = overlay.querySelector('.dw-preview-cancel');
	          if (cancelBtn) cancelBtn.onclick = function(e) { e.stopPropagation(); closePreview(); };
	        }
	        function closePreview() {
	          if (_previewOverlay && _previewOverlay.parentNode) _previewOverlay.parentNode.removeChild(_previewOverlay);
	          _previewOverlay = null;
	        }

			        // —— 用户主题切换支持 ——
		        var origSwitch = window.__dwSwitchTheme;
		        if (origSwitch) {
		          window.__dwSwitchTheme = function (id) {
		            var userTheme = (window.__DW_USER_THEMES__ || []).find(function (t) { return t.id === id; });
		            var hasInDW = !!(window.__DW_THEMES__ && window.__DW_THEMES__[id]);
		            document.title = '🔍 ' + id + ' inDW=' + hasInDW + ' inUser=' + !!userTheme;
		            if (userTheme && userTheme._isUser) {
		              // ★ 兜底注册：每一次切换前确保主题在 __DW_THEMES__ 中
		              var target = window.__DW_THEMES__ || {};
		              if (!target[id]) {
		                document.title = '📝 兜底注册: ' + id;
		                target[id] = {
		                  id: userTheme.id, name: userTheme.name, type: userTheme.type || 'static',
		                  periods: userTheme.periods, weather: userTheme.weather,
		                  asset: userTheme.asset, assets: userTheme.assets, desc: userTheme.desc,
		                  _userData: userTheme._userData,
		                  _data_morning: userTheme._data_morning, _data_day: userTheme._data_day,
		                  _data_dusk: userTheme._data_dusk, _data_night: userTheme._data_night,
		                  _isUser: true,
		                };
		              }
		              if (userTheme.fileType === 'video') {
		                if (window.__dwLastBlobUrl) { URL.revokeObjectURL(window.__dwLastBlobUrl); window.__dwLastBlobUrl = null; }
		                window.__dwLastBlobUrl = URL.createObjectURL(new Blob([userTheme._userData], { type: 'video/mp4' }));
		                target[id]._blobUrl = window.__dwLastBlobUrl;
		              }
		              if (userTheme.periods && (userTheme._data_morning || userTheme._data_day || userTheme._data_dusk || userTheme._data_night)) {
		                target.__multiData = {};
		                ['morning','day','dusk','night'].forEach(function(p){ var k='_data_'+p; if (userTheme[k]) target.__multiData[p] = userTheme[k]; });
		              }
		              window.__DW_THEMES__ = target;
		            }
		            var ret = origSwitch(id);
		            document.title = (ret ? '✅' : '❌') + ' ' + id + ' active=' + (window.__dwGetActiveTheme ? window.__dwGetActiveTheme() : '?');
		            return ret;
		          };
		        }

        // —— 快捷键 ——
        document.addEventListener('keydown', function (e) {
          if (e.ctrlKey && e.shiftKey && (e.key === 'W' || e.key === 'w')) {
            e.preventDefault();
            if (PANEL && PANEL.style.display !== 'none') { PANEL.style.display = 'none'; return; }
            // ★ 等待 refreshUserThemes 完成后再构建面板，避免主题未注册
            refreshUserThemes().then(function () {
              if (!PANEL) {
                PANEL = document.createElement('div'); PANEL.id = 'dw-theme-panel';
                Object.assign(PANEL.style, { position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:2147483647, minWidth:'320px', maxWidth:'400px', padding:'16px', background:'rgba(15,20,35,0.92)', color:'#fff', borderRadius:'14px', fontFamily:'system-ui,sans-serif', boxShadow:'0 12px 40px rgba(0,0,0,0.5)', backdropFilter:'blur(16px)', display:'block', fontSize:'13px' });
                document.body.appendChild(PANEL);
              } else { PANEL.style.display = 'block'; }
              UPLOAD_MODE = false; UPLOAD_MULTI = false; buildPanel();
            });
          }
          if (e.key === 'Escape' && PANEL) PANEL.style.display = 'none';
        });
        document.addEventListener('click', function (e) {
          if (PANEL && PANEL.style.display === 'block' && !PANEL.contains(e.target) && !e.ctrlKey)
            setTimeout(function () { if (PANEL) PANEL.style.display = 'none'; }, 100);
        });

        // —— 启动 ——
        ready(function () { refreshUserThemes(); });
      })();
    </script>
