    <script>
      // ============ 壁纸显示引擎（v4.0 多主题适配）============
      // 职责：按「活动主题 × 时段 × 天气」显示壁纸
      // 主题元数据由 theme-engine.js 设置到 window.__DW_THEMES__
      // 视频主题由 theme-engine.js 直接渲染，本脚本仅处理 static 类型
      (function () {
        var PERIODS = ['morning', 'day', 'dusk', 'night'];
        var WEATHERS = ['clear', 'rain'];

        function currentPeriod(hour) {
          if (hour >= 5 && hour < 8) return 'morning';
          if (hour >= 8 && hour < 17) return 'day';
          if (hour >= 17 && hour < 19) return 'dusk';
          return 'night';
        }

        // —— 天气状态 ——
        function getWeather() {
          try { var w = localStorage.getItem('dw-weather'); if (WEATHERS.indexOf(w) >= 0) return w; } catch (e) {}
          return 'clear';
        }
        function setWeather(w) { if (WEATHERS.indexOf(w) < 0) return; try { localStorage.setItem('dw-weather', w); } catch (e) {} }
        function getWeatherSource() { try { return localStorage.getItem('dw-weather-source'); } catch (e) { return null; } }
        function setWeatherSource(w, s) { setWeather(w); try { localStorage.setItem('dw-weather-source', s); } catch (e) {} }

        // —— 主题资源路径 ——

        // P0-3: 统一资源解析（天气回退 + 时段回退 + 尊重 weather/periods 声明）
        function resolveThemeAsset(theme, weather, period) {
          if (!theme || theme.type === 'video') return null;
          var assets = theme.assets || {};
          // 尊重 weather 声明：不区分天气时始终用 clear
          var effectiveWeather = (theme.weather === false) ? 'clear' : weather;
          // 天气回退链：指定天气 → clear → rain → 第一个可用
          var group = assets[effectiveWeather] || assets.clear || assets.rain;
          if (!group) {
            var keys = Object.keys(assets);
            group = keys.length > 0 ? assets[keys[0]] : null;
          }
          if (!group) return null;
          if (typeof group === 'string') return group;
          // 尊重 periods 声明：无时段变化时用 default key
          var effectivePeriod = (theme.periods === false) ? 'default' : period;
          // 时段回退链：指定时段 → default → 当前 period → 第一个可用 key
          return group[effectivePeriod] || group.default || group[period] ||
            (Object.keys(group).length > 0 ? group[Object.keys(group)[0]] : null);
        }

        function themeAsset(themeId, weather, period) {
          var themes = window.__DW_THEMES__;
          if (!themes || !themes[themeId]) return null;
          var t = themes[themeId];
          if (t.type === 'video') return null;
          // 用户主题：优先取晴雨二维 _data_<weather>_<period>，再取 _data_<period>，最后取通用 _userData
          if (t._isUser) {
            if (t['_data_' + weather + '_' + period]) return t['_data_' + weather + '_' + period];
            if (t['_data_' + period]) return t['_data_' + period];
            if (t._userData) return t._userData;
          }
          // 统一资源解析（内置主题 + 带 assets 的用户主题）
          var assetPath = resolveThemeAsset(t, weather, period);
          if (!assetPath) return null;
          // 已是完整 URL（data: 等）则直接返回
          if (assetPath.indexOf('data:') === 0 || assetPath.indexOf('://') > 3) return assetPath;
          var base = window.__DW_THEMES_BASE__ || './themes/';
          return base + themeId + '/' + assetPath;
        }

        // —— 渲染（static 主题）——
        function apply(period, weather) {
          var themeId = window.__dwGetActiveTheme ? window.__dwGetActiveTheme() : 'doraemon';
          var themes = window.__DW_THEMES__ || {};
          if (themes[themeId] && themes[themeId].type === 'video') return; // 视频主题跳过

	          document.documentElement.dataset.period = period;
	          document.documentElement.dataset.weather = weather;
	          var layers = document.querySelectorAll('#doraemon-wallpaper [data-current] .dw-layer');
          layers.forEach(function (layer) {
            var p = layer.getAttribute('data-period');
            var url = themeAsset(themeId, weather, p);
            if (!url) return;
            if (layer.dataset.url !== url) { layer.style.backgroundImage = "url('" + url + "')"; layer.dataset.url = url; }
            if (p === period) layer.classList.add('dw-active');
            else layer.classList.remove('dw-active');
          });
        }

	        function tick() {
	          apply(currentPeriod(new Date().getHours()), getWeather());
	          // 下雨动效同步
	          if (window.__dwRain) {
	            if (getWeather() === 'rain') window.__dwRain.start();
	            else window.__dwRain.stop();
	          }
	        }

        // —— 主题重载（切换主题后由 theme-engine 调用）——
        window.__dwReloadTheme = function (themeId) {
          var themes = window.__DW_THEMES__ || {};
          if (themes[themeId] && themes[themeId].type === 'video') return; // 视频主题引擎自管
          // 预加载该主题所有壁纸
          WEATHERS.forEach(function (w) {
            PERIODS.forEach(function (p) {
              var url = themeAsset(themeId, w, p);
              if (url) { var img = new Image(); img.src = url; }
            });
          });
          tick();
        };

		        // —— 对外天气接口（switcher.js / weather.js 用）——
		        window.__dwSetWeather = function (w, s) { if (s) setWeatherSource(w, s); else setWeather(w); tick(); };
		        window.__dwSetWeatherSource = function (w, s) { setWeatherSource(w, s); tick(); };
		        window.__dwGetWeather = getWeather;
		        window.__dwGetWeatherSource = getWeatherSource;
		        window.__dwToggleWeather = function () {
		          var next = getWeather() === 'rain' ? 'clear' : 'rain';
		          setWeatherSource(next, 'manual'); tick(); return next;
		        };

		        // ============ 壁纸亮度自适应 ============
		        var _brightnessCache = {};
		        var _lastBrightCheck = { period: '', theme: '', weather: '' };

		        function detectBrightness(url, cb) {
		          if (!url || typeof url !== 'string') { if (cb) cb(null); return; }
		          if (_brightnessCache[url] !== undefined) { if (cb) cb({ luminance: _brightnessCache[url] }); return; }
		          var img = new Image();
		          img.onload = function () {
		            try {
		              var c = document.createElement('canvas');
		              c.width = 1; c.height = 1;
		              var ctx = c.getContext('2d');
		              ctx.drawImage(img, 0, 0, 1, 1);
		              var d = ctx.getImageData(0, 0, 1, 1).data;
		              var lum = (0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]) / 255;
		              _brightnessCache[url] = lum;
		              if (cb) cb({ luminance: lum });
		            } catch (e) { if (cb) cb(null); }
		          };
		          img.onerror = function () { if (cb) cb(null); };
		          if (url.startsWith('data:')) { img.src = url; } else {
		            var xhr = new XMLHttpRequest();
		            xhr.open('GET', url, true); xhr.responseType = 'blob';
		            xhr.onload = function () { if (xhr.status >= 200 && xhr.status < 300) img.src = URL.createObjectURL(xhr.response); else if (cb) cb(null); };
		            xhr.onerror = function () { if (cb) cb(null); }; xhr.send();
		          }
		        }

		        function applyBrightness(lum) {
		          var root = document.documentElement;
		          if (lum === null || lum === undefined) { root.style.removeProperty('--dw-stroke-width'); root.style.removeProperty('--dw-shadow'); return; }
		          if (lum > 0.6) {
		            // 亮壁纸：稍粗描边 + 柔和投影
		            root.style.setProperty('--dw-stroke-width', '0.5px');
		            root.style.setProperty('--dw-shadow', '0 1px 3px rgba(0,0,0,0.5)');
		          } else if (lum > 0.3) {
		            // 中等：标准描边
		            root.style.setProperty('--dw-stroke-width', '0.3px');
		            root.style.setProperty('--dw-shadow', '0 1px 2px rgba(0,0,0,0.35)');
		          } else {
		            // 暗壁纸：极细描边，取消投影
		            root.style.setProperty('--dw-stroke-width', '0.15px');
		            root.style.removeProperty('--dw-shadow');
		          }
		        }

		        // 把亮度检测和内嵌进 tick
		        var _origTick = tick;
		        tick = function () {
		          _origTick();
		          var tid = window.__dwGetActiveTheme ? window.__dwGetActiveTheme() : '';
		          var p = currentPeriod(new Date().getHours());
		          var w = getWeather();
		          if (p === _lastBrightCheck.period && tid === _lastBrightCheck.theme && w === _lastBrightCheck.weather) return;
		          var themes = window.__DW_THEMES__ || {};
		          if (themes[tid] && themes[tid].type === 'video') { applyBrightness(null); return; }
		          var url = themeAsset(tid, w, p);
		          if (url) {
		            detectBrightness(url, function (r) {
		              _lastBrightCheck.period = p; _lastBrightCheck.theme = tid; _lastBrightCheck.weather = w;
		              applyBrightness(r ? r.luminance : null);
		            });
		          }
		        };

		        // —— 启动 ——
		        document.documentElement.classList.add('zcode-wallpaper-on');
		        // 恢复壁纸缩放模式
		        try { var f = localStorage.getItem('dw-fit'); if (f) document.documentElement.style.setProperty('--dw-fit', f); } catch(e) {}
		        function startWhenReady() {
		          if (window.__dwGetActiveTheme) { tick(); setInterval(tick, 60000); }
		          else setTimeout(startWhenReady, 100);
		        }
		        startWhenReady();
		        document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
		      })();
    </script>
