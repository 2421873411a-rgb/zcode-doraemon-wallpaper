    <script>
      // ============ 主题引擎（v4.2 外部主题）============
      // 主题从外部目录加载（file://），加主题不用重打包。
      // __DW_THEMES_BASE__ 由 apply.js 注入：file:///D:/.../resources/themes/
      // __DW_FALLBACK_THEMES__ 由 apply.js 注入：最后已知主题清单（启动兜底）
      (function () {
        var BASE = __BASE_TOKEN__;
        var FALLBACK = __FALLBACK_TOKEN__;
        var STORAGE_KEY = 'dw-active-theme';
        var _themes = null; // 当前加载的主题清单

        // P0-4: 本地文件读取 — 接受 status 0（file:// 成功）和 2xx
        function loadLocalText(url) {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, false);
          xhr.send(null);
          var httpOk = xhr.status >= 200 && xhr.status < 300;
          var localOk = xhr.status === 0 && typeof xhr.responseText === 'string' && xhr.responseText.trim().length > 0;
          if (!httpOk && !localOk) {
            throw new Error('读取文件失败 ' + url + ' (status=' + xhr.status + ')');
          }
          return xhr.responseText;
        }

        // ★ 加载外部 registry.js（add-theme.js 生成的单文件聚合，比逐个读 theme.json 更快更可靠）
        function loadExternalRegistry() {
          if (!BASE) return null;
          try {
            var text = loadLocalText(BASE + 'registry.js');
            // 从 'window.__DW_EXTERNAL_THEMES__ = {...};' 提取 JSON
            var jsonStart = text.indexOf('= ') + 2;
            var jsonEnd = text.lastIndexOf(';');
            if (jsonStart > 1 && jsonEnd > jsonStart) {
              var json = text.substring(jsonStart, jsonEnd);
              var data = JSON.parse(json);
              window.__DW_EXTERNAL_THEMES__ = data;
              return data;
            }
          } catch (e) {
            console.info('[DW] registry.js 不可用: ' + (e && e.message ? e.message : e));
          }
          return null;
        }

        // 同步加载主题清单：registry.js → XHR _registry.json → FALLBACK
        function loadThemes() {
          // Priority 1: registry.js 文本读取（单文件，最快）
          var ext = loadExternalRegistry();
          if (ext) {
            _diag.source = 'registry-js';
            _diag.themeCount = Object.keys(ext).filter(function (k) { return k !== '__default__'; }).length;
            console.log('[DW] 主题来源: registry.js (' + _diag.themeCount + ' 个)');
            return ext;
          }

          // Priority 2: 逐个 XHR 读取 _registry.json + theme.json
          if (!BASE) return useFallback();
          try {
            var reg = JSON.parse(loadLocalText(BASE + '_registry.json'));
            var out = { __default__: reg.default || 'doraemon' };
            for (var i = 0; i < reg.themes.length; i++) {
              var id = reg.themes[i];
              try {
                out[id] = JSON.parse(loadLocalText(BASE + id + '/theme.json'));
              } catch (e2) {
                console.warn('[DW] 主题「' + id + '」加载失败: ' + (e2 && e2.message ? e2.message : e2));
              }
            }
            _diag.source = 'xhr';
            _diag.themeCount = Object.keys(out).filter(function (k) { return k !== '__default__'; }).length;
            console.log('[DW] 主题来源: XHR (' + _diag.themeCount + ' 个)');
            return out;
          } catch (e) {
            console.warn('[DW] XHR 主题清单加载失败: ' + (e && e.message ? e.message : e));
            _diag.errors.push('xhr: ' + (e && e.message ? e.message : e));
            return useFallback();
          }
        }

        function useFallback() {
          _diag.source = 'fallback';
          _diag.themeCount = Object.keys(FALLBACK).filter(function (k) { return k !== '__default__'; }).length;
          console.log('[DW] 主题来源: FALLBACK 兜底 (' + _diag.themeCount + ' 个)');
          return FALLBACK;
        }

        var _diag = { source: 'pending', themeCount: 0, errors: [], loadedAt: 0, lastVideoError: null };
        _themes = loadThemes();
        _diag.loadedAt = Date.now();
        window.__DW_THEMES__ = _themes;
        window.__DW_THEMES_BASE__ = BASE;
        // 诊断 API: 控制台执行 __DW_DIAGNOSTICS__ 查看主题加载状态
        window.__DW_DIAGNOSTICS__ = _diag;

        function getActiveTheme() {
          if (!_themes) _themes = window.__DW_THEMES__ || FALLBACK;
          // 联合查询 _themes 和 __DW_THEMES__，用户主题可能只在后者的引用中
          var all = window.__DW_THEMES__ || _themes;
          try { var id = localStorage.getItem(STORAGE_KEY); if (id && all[id]) return id; } catch (e) {}
          return all.__default__ || Object.keys(all).filter(function(k){return k!=='__default__';})[0];
        }
        function setActiveTheme(id) {
          // 检查两个来源：_themes（闭包）和 __DW_THEMES__（外部注入）
          var all = window.__DW_THEMES__ || _themes || {};
          var inClosure = !!_themes[id];
          var inWindow = !!(window.__DW_THEMES__ && window.__DW_THEMES__[id]);
          console.log('[DW:setActive] id=' + id + ' inClosure=' + inClosure + ' inWindow=' + inWindow);
          if (!_themes[id] && !all[id]) { console.log('[DW:setActive] FAIL - not found'); return false; }
          // 同步：如果主题在 __DW_THEMES__ 但不在 _themes，补充
          if (!_themes[id] && all[id]) { _themes[id] = all[id]; console.log('[DW:setActive] synced from __DW_THEMES__'); }
          try { localStorage.setItem(STORAGE_KEY, id); } catch (e) {} return true;
        }

        // ★ 统一视频素材解析：_blobUrl → _userData(ArrayBuffer) → file:// asset
        function resolveVideoSource(theme, id) {
          if (!theme) return null;
          // 1) 已有 blob URL（XHR 回退或之前已转换）
          if (theme._blobUrl) return theme._blobUrl;
          // 2) 用户上传主题：_userData 是 ArrayBuffer（视频），需转 Blob URL
          if (theme._userData instanceof ArrayBuffer) {
            var mime = theme._userDataMime || 'video/mp4';
            var blob = new Blob([theme._userData], { type: mime });
            var blobUrl = URL.createObjectURL(blob);
            theme._blobUrl = blobUrl;
            // 同步回所有引用
            if (window.__DW_THEMES__ && window.__DW_THEMES__[id]) window.__DW_THEMES__[id]._blobUrl = blobUrl;
            if (_themes && _themes[id]) _themes[id]._blobUrl = blobUrl;
            console.log('[DW] ✅ 用户视频 _userData → Blob URL: ' + blobUrl.substring(0, 60));
            return blobUrl;
          }
          // 3) 内置/外置主题：file:// 路径
          if (theme.asset) return BASE + id + '/' + theme.asset;
          return null;
        }

        function renderTheme(id, instant) {
          console.log('[DW:render] START id=' + id + ' instant=' + instant);
          // 优先 _themes，fallback __DW_THEMES__（用户主题可能只注册到后者）
          var theme = _themes[id] || (window.__DW_THEMES__ && window.__DW_THEMES__[id]);
          var wp = document.getElementById('doraemon-wallpaper');
          if (!wp) { console.error('[DW:render] FAIL — #doraemon-wallpaper 不存在！'); return; }
          if (!theme) { console.error('[DW:render] FAIL — 主题「' + id + '」不在 _themes 也不在 __DW_THEMES__'); return; }
          console.log('[DW:render] theme.type=' + theme.type + ' hasAsset=' + (!!theme.asset) + ' hasBlobUrl=' + (!!theme._blobUrl));
	          // 同步到闭包，避免下次查找失败
	          if (!_themes[id] && theme) _themes[id] = theme;

	          // 淡出旧 wrapper（如有）
	          var oldWrappers = wp.querySelectorAll('.dw-theme-wrapper');
	          oldWrappers.forEach(function (old) {
	            old.removeAttribute('data-current');
	            old.style.transition = 'opacity 1.2s ease-in-out';
	            old.style.opacity = '0';
	            setTimeout(function () {
	              if (old.parentNode) old.parentNode.removeChild(old);
	            }, 1300);
	          });

	          // 创建新 wrapper（初始不可见）
	          var wrapper = document.createElement('div');
	          wrapper.className = 'dw-theme-wrapper';
	          wrapper.setAttribute('data-current', '');
	          Object.assign(wrapper.style, {
	            position: 'absolute', inset: '0', opacity: '0',
	            transition: instant ? 'none' : 'opacity 1.2s ease-in-out',
	          });

          if (theme.type === 'video') {
            var v = document.createElement('video');
            // ★ 使用统一视频素材解析（_userData ArrayBuffer → Blob URL / file://）
            var videoSrc = resolveVideoSource(theme, id);
            console.log('[DW:render] video src=' + videoSrc.substring(0, 120));
            
            // ★ 如果 file:// 加载失败，尝试 XHR 读取视频 → blob URL
            var tryXhrFallback = !theme._blobUrl; // 只对外置主题尝试
            var xhrAttempted = false;
            
            function setVideoSource(src) {
              v.src = src;
            }
            
            v.onerror = function () {
              var code = v.error ? v.error.code : '?';
              var msg = v.error ? v.error.message : 'unknown';
              _diag.lastVideoError = { id: id, src: v.src, code: code, message: msg, time: Date.now() };
              console.error('[DW] ❌ 视频加载失败: ' + id + ' code=' + code + ' ' + msg);
              
              // 如果是 file:// 失败且还没尝试 XHR，改用 XHR 读取
              if (tryXhrFallback && !xhrAttempted && videoSrc.indexOf('file://') === 0) {
                console.log('[DW] 🔄 尝试 XHR 方式加载视频...');
                xhrAttempted = true;
                var xhr = new XMLHttpRequest();
                xhr.open('GET', videoSrc, true);
                xhr.responseType = 'arraybuffer';
                xhr.onload = function () {
                  var ok = (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.response && xhr.response.byteLength > 0);
                  if (ok) {
                    var blob = new Blob([xhr.response], { type: 'video/mp4' });
                    var blobUrl = URL.createObjectURL(blob);
                    console.log('[DW] ✅ XHR 读取成功, blobUrl=' + blobUrl);
                    theme._blobUrl = blobUrl;
                    // 更新 __DW_THEMES__ 中的缓存
                    if (window.__DW_THEMES__ && window.__DW_THEMES__[id]) {
                      window.__DW_THEMES__[id]._blobUrl = blobUrl;
                    }
                    if (_themes[id]) _themes[id]._blobUrl = blobUrl;
                    v.src = blobUrl;
                    v.load();
                  } else {
                    console.error('[DW] ❌ XHR 也失败了: status=' + xhr.status);
                  }
                };
                xhr.onerror = function () { console.error('[DW] ❌ XHR 网络错误'); };
                xhr.send();
              }
            };
            v.onloadeddata = function () { console.log('[DW] ✅ 视频首帧就绪: ' + id); };
            v.onloadstart = function () { console.log('[DW] 🎬 视频开始加载: ' + id); };
            v.oncanplay = function () { console.log('[DW] ▶ 视频可播放: ' + id); };
            
            setVideoSource(videoSrc);
            v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
            Object.assign(v.style, {
              position: 'absolute', inset: '0', width: '100%', height: '100%',
              objectFit: 'cover', pointerEvents: 'none',
            });
            wrapper.appendChild(v);
            wp.appendChild(wrapper);
            console.log('[DW:render] wrapper appended to DOM');
            document.documentElement.dataset.themeType = 'video';
            document.documentElement.dataset.period = 'video';
            document.documentElement.dataset.weather = 'clear';
	          } else {
	            document.documentElement.dataset.themeType = 'static';
	            ['morning', 'day', 'dusk', 'night'].forEach(function (period) {
	              var layer = document.createElement('div');
	              layer.className = 'dw-layer';
	              layer.setAttribute('data-period', period);
	              wrapper.appendChild(layer);
	            });
	            wp.appendChild(wrapper);
	            if (window.__dwReloadTheme) window.__dwReloadTheme(id);
	          }

	          // 触发 reflow 后淡入（instant 时跳过）
	          if (!instant) {
	            wrapper.offsetHeight; // force reflow
	            wrapper.style.opacity = '1';
	          } else {
	            wrapper.style.opacity = '1';
	          }
	        }

        window.__dwSwitchTheme = function (id) {
          console.log('[DW:switch] ENTER id=' + id);
          if (!setActiveTheme(id)) { console.log('[DW:switch] FAIL — setActiveTheme returned false'); return false; }
          renderTheme(id);
          var panel = document.getElementById('dw-theme-panel');
          if (panel) panel.style.display = 'none';
          console.log('[DW:switch] DONE id=' + id);
          return true;
        };
        window.__dwGetActiveTheme = getActiveTheme;
        window.__dwListThemes = function () {
          return Object.keys(_themes).filter(function (k) { return k !== '__default__'; })
            .map(function (k) { return { id: k, name: _themes[k].name, type: _themes[k].type, desc: _themes[k].desc || '' }; });
        };
	        window.__dwReloadThemes = function () {
	          _themes = loadThemes();
	          window.__DW_THEMES__ = _themes;
	          renderTheme(getActiveTheme(), false);
	        };

	        function boot() { renderTheme(getActiveTheme(), true); }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
      })();
    </script>
