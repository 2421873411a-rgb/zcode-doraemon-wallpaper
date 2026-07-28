    <script>
      // ============ open-meteo 自动天气检测（v3.0）============
      // 数据源：open-meteo.com（免费、免 key、支持 CORS，浏览器可直接 fetch）
      // 逻辑：
      //   1) 按时间表决定当前坐标（工作日白天=work，其余=home）
      //   2) fetch 当前降水量 + 降水概率
      //   3) 滞回阈值判断晴/雨，避免临界抖动
      //   4) 失败/超时 → 沿用上次结果（首次失败 → clear）
      //   5) 手动开关优先：若 localStorage dw-weather 被 v2.0 开关设为非 auto，则不覆盖
      //
      // 配置直接内联（与 weather-config.json 保持一致）；改坐标/时间表就编辑这里。
	      (function () {
	        // 默认配置（已脱敏为北京示例坐标，请替换为你的位置）
	        var DEFAULT_CFG = {
	          homeLat: 39.9042, homeLon: 116.4074,
	          workLat: 39.9142, workLon: 116.4174,
	          workDays: '1,2,3,4,5',
	          workHourStart: 8, workHourEnd: 17,
	          enterMm: 0.1, enterProb: 50,
	          exitMm: 0.05, exitProb: 30,
	          refreshMin: 20,
	        };

	        // 从 localStorage 读用户配置，降级到默认
	        function loadConfig() {
	          try {
	            var raw = localStorage.getItem('dw-weather-config');
	            if (raw) {
	              var c = JSON.parse(raw);
	              // 合入默认值（用户配置可能缺字段）
	              for (var k in DEFAULT_CFG) { if (c[k] === undefined) c[k] = DEFAULT_CFG[k]; }
	              return c;
	            }
	          } catch (e) {}
	          return DEFAULT_CFG;
	        }

	        function buildConfig() {
	          var c = loadConfig();
	          return {
	            location: {
	              home: { name: '家', lat: c.homeLat, lon: c.homeLon },
	              work: { name: '工作', lat: c.workLat, lon: c.workLon },
	            },
	            schedule: {
	              workDays: c.workDays.split(',').map(function(s){return parseInt(s,10);}).filter(function(n){return n>=0&&n<=6;}),
	              workHourStart: c.workHourStart,
	              workHourEnd: c.workHourEnd,
	            },
	            rainThreshold: {
	              enterMmPerHour: c.enterMm,
	              enterProbability: c.enterProb,
	              exitMmPerHour: c.exitMm,
	              exitProbability: c.exitProb,
	            },
	            refresh: { weatherIntervalMs: c.refreshMin * 60000 },
	          };
	        }

	        var CONFIG = buildConfig();
	        var API = 'https://api.open-meteo.com/v1/forecast';
        var REFRESH_MS = CONFIG.refresh.weatherIntervalMs;
        var FETCH_TIMEOUT_MS = 8000;

        // —— 当前坐标（按时间表）——
        function currentLocation(now) {
          var day = now.getDay(); // 0=周日 ... 6=周六
          var hour = now.getHours();
          var isWorkday = CONFIG.schedule.workDays.indexOf(day) >= 0;
          var isWorkHour = hour >= CONFIG.schedule.workHourStart && hour < CONFIG.schedule.workHourEnd;
          return (isWorkday && isWorkHour) ? CONFIG.location.work : CONFIG.location.home;
        }

        // —— 滞回判断 ——
        // 状态存在 localStorage 'dw-weather-auto'，避免每次都从晴天起判
        function getAutoWeather() {
          try { return localStorage.getItem('dw-weather-auto') || 'clear'; }
          catch (e) { return 'clear'; }
        }
        function setAutoWeather(w) {
          try { localStorage.setItem('dw-weather-auto', w); } catch (e) {}
        }

        // 根据降水量(mm)和概率(%) + 当前状态，滞回判断
        function decide(precipMm, probPct, current) {
          var t = CONFIG.rainThreshold;
          if (current === 'rain') {
            // 已在雨境：需"确实停了"才退出
            if (precipMm <= t.exitMmPerHour && probPct <= t.exitProbability) return 'clear';
            return 'rain';
          } else {
            // 在晴境：需"确实下雨了"才进入
            if (precipMm >= t.enterMmPerHour || probPct >= t.enterProbability) return 'rain';
            return 'clear';
          }
        }

        // —— fetch 天气（带超时）——
        function fetchWeather(loc) {
          var url = API +
            '?latitude=' + loc.lat + '&longitude=' + loc.lon +
            '&current=precipitation,precipitation_probability&timezone=auto';
          return new Promise(function (resolve, reject) {
            var done = false;
            var timer = setTimeout(function () {
              if (!done) { done = true; reject(new Error('timeout')); }
            }, FETCH_TIMEOUT_MS);
            fetch(url).then(function (res) {
              return res.json();
            }).then(function (data) {
              if (done) return;
              done = true; clearTimeout(timer);
              var c = data.current || {};
              resolve({
                precip: typeof c.precipitation === 'number' ? c.precipitation : 0,
                prob: typeof c.precipitation_probability === 'number' ? c.precipitation_probability : 0,
              });
            }).catch(function (e) {
              if (done) return;
              done = true; clearTimeout(timer); reject(e);
            });
          });
        }

	        // —— 主检测流程 ——
	        function detect() {
	          // 每次检测重新读取配置（用户可能在 settings 面板改了）
	          CONFIG = buildConfig();
	          // 手动覆盖检查：dw-weather-source 为 'manual' 时，用户已手动锁定，不干预
          var source = null;
          try { source = localStorage.getItem('dw-weather-source'); } catch (e) {}
          if (source === 'manual') return; // 手动模式，自动检测让位

          var loc = currentLocation(new Date());
          fetchWeather(loc).then(function (r) {
            var cur = getAutoWeather();
            var next = decide(r.precip, r.prob, cur);
            setAutoWeather(next);
            lastResult = { precip: r.precip, prob: r.prob, decided: next, loc: loc.name, time: new Date().toISOString() };
            lastError = null;
            // 应用到壁纸：标记来源为 auto，再调用主切换
            if (window.__dwSetWeatherSource) {
              window.__dwSetWeatherSource(next, 'auto');
            } else if (window.__dwSetWeather) {
              window.__dwSetWeather(next);
            }
          }).catch(function (e) {
            // 失败：沿用上次 auto 结果，不切换，下次刷新再试
            lastError = e && e.message ? e.message : String(e);
            lastErrorTime = new Date().toISOString();
          });
        }

        var lastError = null, lastErrorTime = null, lastResult = null;

        // —— 启动 ——
        // 等主切换逻辑就绪
        function startWhenReady() {
          if (window.__dwSetWeather) {
            detect();
            setInterval(detect, REFRESH_MS);
            // 休眠唤醒后立即检测
            document.addEventListener('visibilitychange', function () {
              if (!document.hidden) setTimeout(detect, 2000);
            });
          } else {
            setTimeout(startWhenReady, 300);
          }
        }
        // 延迟启动，避免和主脚本抢资源
        setTimeout(startWhenReady, 5000);

        // 暴露调试接口：__dwWeatherAuto.status() 查看最近一次检测结果/错误
        window.__dwWeatherAuto = {
          detect: detect,
          getAutoWeather: getAutoWeather,
          config: CONFIG,
          status: function () {
            return { lastResult: lastResult, lastError: lastError, lastErrorTime: lastErrorTime, autoWeather: getAutoWeather() };
          },
        };
      })();
    </script>
