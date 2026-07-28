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

        // 同步加载主题清单：从外部目录读 _registry.json + 各 theme.json
        function loadThemes() {
          if (!BASE) return FALLBACK;
          try {
            var req = new XMLHttpRequest();
            req.open('GET', BASE + '_registry.json', false);
            req.send();
            if (req.status < 200 || req.status >= 300) return FALLBACK;
            var reg = JSON.parse(req.responseText);
            var out = { __default__: reg.default || 'doraemon' };
            for (var i = 0; i < reg.themes.length; i++) {
              var id = reg.themes[i];
              req.open('GET', BASE + id + '/theme.json', false);
              req.send();
              if (req.status >= 200 && req.status < 300) {
                out[id] = JSON.parse(req.responseText);
              }
            }
            return out;
          } catch (e) {
            return FALLBACK;
          }
        }

        _themes = loadThemes();
        window.__DW_THEMES__ = _themes;
        window.__DW_THEMES_BASE__ = BASE;

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

	        function renderTheme(id, instant) {
	          // 优先 _themes，fallback __DW_THEMES__（用户主题可能只注册到后者）
	          var theme = _themes[id] || (window.__DW_THEMES__ && window.__DW_THEMES__[id]);
	          var wp = document.getElementById('doraemon-wallpaper');
	          if (!wp || !theme) return;
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
	            // 用户上传主题用 blob URL，内置主题用 file:// 路径
	            v.src = theme._blobUrl || (BASE + id + '/' + theme.asset);
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

	          // 触发 reflow 后淡入（instant 时跳过）
	          if (!instant) {
	            wrapper.offsetHeight; // force reflow
	            wrapper.style.opacity = '1';
	          } else {
	            wrapper.style.opacity = '1';
	          }
	        }

        window.__dwSwitchTheme = function (id) {
          if (!setActiveTheme(id)) return false;
          renderTheme(id);
          var panel = document.getElementById('dw-theme-panel');
          if (panel) panel.style.display = 'none';
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
