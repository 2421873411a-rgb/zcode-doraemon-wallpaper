    <script>
      // ============ 主题引擎（v5.0 异步加载）============
      // 主题从外部目录加载（file://），加主题不用重打包。
      // 启动流程：显示兜底主题 → 异步加载外部注册表 → Schema 校验 → 切换到用户主题
      // __DW_THEMES_BASE__ 由 apply.js 注入
      // __DW_FALLBACK_THEMES__ 由 apply.js 注入
      (function () {
        var BASE = __BASE_TOKEN__;
        var FALLBACK = __FALLBACK_TOKEN__;
        var STORAGE_KEY = 'dw-active-theme';
        var _themes = null;
        var _booted = false;

        // ★ 构建信息（供 status.js 读取）
        window.__DW_BUILD_INFO__ = {
          version: '5.0.0',
          schemaVersion: 1,
          modules: { engine: 'async', panel: 'v6.1', weather: 'v3.0' },
        };

        // ---------- 异步读取工具 ----------
        function fetchText(url, timeoutMs) {
          timeoutMs = timeoutMs || 5000;
          return new Promise(function (resolve, reject) {
            var controller = new AbortController();
            var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
            fetch(url, { signal: controller.signal })
              .then(function (res) {
                clearTimeout(timer);
                // file:// 协议返回 status 0（成功）但 ok 为 false
                if (!res.ok && res.status !== 0) {
                  reject(new Error('HTTP ' + res.status));
                  return;
                }
                return res.text();
              })
              .then(function (text) {
                if (text !== undefined) resolve(text);
              })
              .catch(function (e) {
                clearTimeout(timer);
                reject(e);
              });
          });
        }

        // ---------- 异步加载 registry.js ----------
        function loadExternalRegistry() {
          if (!BASE) return Promise.resolve(null);
          return fetchText(BASE + 'registry.js', 3000).then(function (text) {
            var jsonStart = text.indexOf('= ') + 2;
            var jsonEnd = text.lastIndexOf(';');
            if (jsonStart > 1 && jsonEnd > jsonStart) {
              var json = text.substring(jsonStart, jsonEnd);
              var data = JSON.parse(json);
              window.__DW_EXTERNAL_THEMES__ = data;
              return data;
            }
            return null;
          }).catch(function (e) {
            console.info('[DW] registry.js 不可用: ' + (e && e.message ? e.message : e));
            return null;
          });
        }

        // ---------- 异步加载 _registry.json + theme.json ----------
        function loadXhrThemes() {
          if (!BASE) return Promise.resolve(null);
          return fetchText(BASE + '_registry.json', 3000).then(function (text) {
            var reg = JSON.parse(text);
            var out = { __default__: reg.default || 'doraemon' };
            var chain = Promise.resolve();
            (reg.themes || []).forEach(function (id) {
              chain = chain.then(function () {
                return fetchText(BASE + id + '/theme.json', 3000).then(function (tText) {
                  out[id] = JSON.parse(tText);
                }).catch(function (e2) {
                  console.warn('[DW] 主题「' + id + '」加载失败');
                });
              });
            });
            return chain.then(function () { return out; });
          }).catch(function (e) {
            console.warn('[DW] XHR 主题清单加载失败: ' + (e && e.message ? e.message : e));
            return null;
          });
        }

        // ---------- 异步加载主题 ----------
        function loadThemesAsync() {
          return loadExternalRegistry().then(function (ext) {
            if (ext) return ext;
            return loadXhrThemes().then(function (xhr) {
              if (xhr) return xhr;
              return null;
            });
          });
        }

        // ---------- 渲染函数（同原有，精简后保留） ----------
        function renderTheme(id, instant) {
          var theme = _themes && (_themes[id] || (window.__DW_THEMES__ && window.__DW_THEMES__[id]));
          if (!theme) { console.warn('[DW:render] 主题「' + id + '」不存在'); return; }
          var wp = document.getElementById('doraemon-wallpaper');
          if (!wp) { console.error('[DW:render] #doraemon-wallpaper 不存在'); return; }

          // 淡出旧 wrapper
          var oldWrappers = wp.querySelectorAll('.dw-theme-wrapper');
          oldWrappers.forEach(function (old) {
            old.removeAttribute('data-current');
            old.style.transition = 'opacity 1.2s ease-in-out';
            old.style.opacity = '0';
            setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 1300);
          });

          var wrapper = document.createElement('div');
          wrapper.className = 'dw-theme-wrapper';
          wrapper.setAttribute('data-current', '');
          Object.assign(wrapper.style, {
            position: 'absolute', inset: '0', opacity: '0',
            transition: instant ? 'none' : 'opacity 1.2s ease-in-out',
          });

          if (theme.type === 'video') {
            var v = document.createElement('video');
            // ★ 统一视频素材解析：_blobUrl → _userData(ArrayBuffer) → file:// asset
            var videoSrc = (function resolveVideoSource(th, tid) {
              if (!th) return null;
              if (th._blobUrl) return th._blobUrl;
              if (th._userData instanceof ArrayBuffer) {
                var mime = th._userDataMime || 'video/mp4';
                var blob2 = new Blob([th._userData], { type: mime });
                var blobUrl = URL.createObjectURL(blob2);
                th._blobUrl = blobUrl;
                if (window.__DW_THEMES__ && window.__DW_THEMES__[tid]) window.__DW_THEMES__[tid]._blobUrl = blobUrl;
                if (_themes && _themes[tid]) _themes[tid]._blobUrl = blobUrl;
                console.log('[DW] ✅ 用户视频 _userData → Blob URL');
                return blobUrl;
              }
              if (th.asset) return BASE + tid + '/' + th.asset;
              return null;
            })(theme, id) || (BASE + id + '/' + (theme.asset || ''));
            v.onerror = function () {
              console.error('[DW] 视频加载失败: ' + id);
              if (!theme._blobUrl && videoSrc.indexOf('file://') === 0) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', videoSrc, true);
                xhr.responseType = 'arraybuffer';
                xhr.onload = function () {
                  if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.response)) {
                    var blob = new Blob([xhr.response], { type: 'video/mp4' });
                    var blobUrl = URL.createObjectURL(blob);
                    theme._blobUrl = blobUrl;
                    if (window.__DW_THEMES__ && window.__DW_THEMES__[id]) window.__DW_THEMES__[id]._blobUrl = blobUrl;
                    v.src = blobUrl;
                    v.load();
                  }
                };
                xhr.send();
              }
            };
            v.src = videoSrc;
            v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
            Object.assign(v.style, {
              position: 'absolute', inset: '0', width: '100%', height: '100%',
              objectFit: 'cover', pointerEvents: 'none',
            });
            wrapper.appendChild(v);
            wp.appendChild(wrapper);
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

          if (!instant) { wrapper.offsetHeight; wrapper.style.opacity = '1'; }
          else { wrapper.style.opacity = '1'; }
        }

        // ---------- 启动流程 ----------
        // Phase 1: 立即用 FALLBACK 渲染（不阻塞首屏）
        function bootPhase1() {
          _themes = FALLBACK;
          window.__DW_THEMES__ = FALLBACK;
          window.__DW_THEMES_BASE__ = BASE;
          var activeId = FALLBACK.__default__ || 'doraemon';
          try { var saved = localStorage.getItem(STORAGE_KEY); if (saved && FALLBACK[saved]) activeId = saved; } catch (e) {}
          renderTheme(activeId, true);
          _booted = true;
        }

        // Phase 2: 异步加载外部主题，加载成功后无缝切换
        function bootPhase2() {
          loadThemesAsync().then(function (loaded) {
            if (loaded && Object.keys(loaded).length > 1) {
              _themes = loaded;
              window.__DW_THEMES__ = loaded;
              // 如果用户保存的主题在加载后的清单中，切换过去
              var activeId = loaded.__default__ || 'doraemon';
              try { var saved = localStorage.getItem(STORAGE_KEY); if (saved && loaded[saved]) activeId = saved; } catch (e) {}
              if (activeId !== (FALLBACK.__default__ || 'doraemon')) {
                renderTheme(activeId, false);
              }
              console.log('[DW] 异步主题加载完成 (' + Object.keys(loaded).length + ' 个)');
            } else {
              console.log('[DW] 异步加载无新主题，沿用兜底');
            }
          }).catch(function (e) {
            console.warn('[DW] 异步主题加载失败: ' + (e && e.message ? e.message : e));
          });
        }

        // 对外接口
        window.__dwSwitchTheme = function (id) {
          // Multi-source lookup, in decreasing probability of containing the id:
          //   1) window.__DW_THEMES__ — populated by registerUserThemes with full fields
          //   2) _themes — engine closure, holds built-in / external themes from bootPhase2
          //   3) FALLBACK — last-resort hard-coded defaults
          //   4) window.__DW_USER_THEMES__ — raw IndexedDB list; in edge cases
          //      (registerUserThemes never ran / failed / list was empty), the user
          //      theme only lives here. On hit we back-write to (1) and (2) so
          //      renderTheme / themeAsset see the full theme object.
          //
          // The old order `_themes || window.__DW_THEMES__ || FALLBACK` silently
          // failed for every user-uploaded theme because the engine closure
          // `_themes` is only ever repointed by bootPhase2 (built-in only) and
          // never receives user themes — those are added via registerUserThemes
          // into __DW_THEMES__, not _themes.
          var all = window.__DW_THEMES__ || _themes || FALLBACK;
          if (!all[id] && Array.isArray(window.__DW_USER_THEMES__)) {
            for (var i = 0; i < window.__DW_USER_THEMES__.length; i++) {
              var u = window.__DW_USER_THEMES__[i];
              if (u && u.id === id) {
                if (!window.__DW_THEMES__) window.__DW_THEMES__ = {};
                window.__DW_THEMES__[id] = u;
                all = window.__DW_THEMES__;
                break;
              }
            }
          }
          if (!all[id]) { console.warn('[DW] 主题不存在: ' + id); return false; }
          if (!_themes[id] && all[id]) { _themes[id] = all[id]; }
          try { localStorage.setItem(STORAGE_KEY, id); } catch (e) {}
          renderTheme(id, false);
          var panel = document.getElementById('dw-theme-panel');
          if (panel) panel.style.display = 'none';
          return true;
        };
        window.__dwGetActiveTheme = function () {
          var all = _themes || window.__DW_THEMES__ || FALLBACK;
          try { var id = localStorage.getItem(STORAGE_KEY); if (id && all[id]) return id; } catch (e) {}
          return all.__default__ || Object.keys(all).filter(function(k){return k!=='__default__';})[0];
        };
        window.__dwListThemes = function () {
          var all = _themes || window.__DW_THEMES__ || FALLBACK;
          return Object.keys(all).filter(function (k) { return k !== '__default__'; })
            .map(function (k) { return { id: k, name: all[k].name, type: all[k].type, desc: all[k].desc || '' }; });
        };
        window.__dwReloadThemes = function () {
          loadThemesAsync().then(function (loaded) {
            if (loaded) { _themes = loaded; window.__DW_THEMES__ = loaded; }
            renderTheme(window.__dwGetActiveTheme(), false);
          });
        };

        // 启动
        function boot() { bootPhase1(); setTimeout(bootPhase2, 100); }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
      })();
    </script>
