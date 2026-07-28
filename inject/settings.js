	    <script>
	      // ============ 天气配置面板（v1.0）============
	      // Ctrl+Shift+S 或主题面板 ⚙️ 按钮调出
	      // 配置保存在 localStorage key 'dw-weather-config'
	      // weather.js 优先读取此配置，无则用内联默认值
	      (function () {
	        var SETTINGS_PANEL = null;

		        // 默认配置（已脱敏为北京示例坐标，请替换为你的位置）
		        var DEFAULTS = {
		          homeLat: 39.9042,   homeLon: 116.4074,
		          workLat: 39.9142,   workLon: 116.4174,
	          workDays: '1,2,3,4,5',
	          workHourStart: 8,   workHourEnd: 17,
	          enterMm: 0.1,       enterProb: 50,
	          exitMm: 0.05,       exitProb: 30,
	          refreshMin: 20,
	        };

	        function loadConfig() {
	          try {
	            var raw = localStorage.getItem('dw-weather-config');
	            if (raw) return JSON.parse(raw);
	          } catch (e) {}
	          return {};
	        }

	        function saveConfig(cfg) {
	          try { localStorage.setItem('dw-weather-config', JSON.stringify(cfg)); } catch (e) {}
	        }

	        function getVal(key) {
	          var cfg = loadConfig();
	          return cfg[key] !== undefined ? cfg[key] : DEFAULTS[key];
	        }

	        function buildSettingsPanel() {
	          if (!SETTINGS_PANEL || !document.body.contains(SETTINGS_PANEL)) return;
	          var html =
	            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
	            '<div style="font-size:16px;font-weight:600;">🌐 天气设置</div>' +
	            '<span id="dw-settings-close" style="font-size:18px;cursor:pointer;opacity:0.5;padding:0 4px;" title="关闭">✕</span></div>' +

	            // —— 家坐标 ——
	            '<div style="font-size:12px;font-weight:500;margin:8px 0 4px;opacity:0.7;">🏠 家庭位置</div>' +
	            '<div style="display:flex;gap:6px;margin-bottom:4px;">' +
	            '<input id="cfg-homeLat" placeholder="纬度" value="' + getVal('homeLat') + '" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;">' +
	            '<input id="cfg-homeLon" placeholder="经度" value="' + getVal('homeLon') + '" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;"></div>' +

	            // —— 工作坐标 ——
	            '<div style="font-size:12px;font-weight:500;margin:8px 0 4px;opacity:0.7;">🏢 工作位置（工作日白天）</div>' +
	            '<div style="display:flex;gap:6px;margin-bottom:4px;">' +
	            '<input id="cfg-workLat" placeholder="纬度" value="' + getVal('workLat') + '" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;">' +
	            '<input id="cfg-workLon" placeholder="经度" value="' + getVal('workLon') + '" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;"></div>' +

	            // —— 时间表 ——
	            '<div style="font-size:12px;font-weight:500;margin:8px 0 4px;opacity:0.7;">📅 工作时间表</div>' +
	            '<div style="display:flex;gap:4px;margin-bottom:4px;align-items:center;">' +
	            '<span style="font-size:11px;opacity:0.6;">工作日</span>' +
	            '<input id="cfg-workDays" placeholder="如 1,2,3,4,5" value="' + getVal('workDays') + '" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;"></div>' +
	            '<div style="display:flex;gap:6px;margin-bottom:4px;">' +
	            '<span style="font-size:11px;opacity:0.6;line-height:28px;">起</span><input id="cfg-workHourStart" type="number" min="0" max="23" value="' + getVal('workHourStart') + '" style="width:50px;padding:5px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;text-align:center;">' +
	            '<span style="font-size:11px;opacity:0.6;line-height:28px;">止</span><input id="cfg-workHourEnd" type="number" min="0" max="23" value="' + getVal('workHourEnd') + '" style="width:50px;padding:5px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;text-align:center;">' +
	            '<span style="font-size:11px;opacity:0.6;line-height:28px;">时</span></div>' +

	            // —— 降雨阈值 ——
	            '<div style="font-size:12px;font-weight:500;margin:8px 0 4px;opacity:0.7;">🌧️ 降雨阈值</div>' +
	            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">' +
	            '<span style="opacity:0.6;">进入雨境（mm/h）</span><input id="cfg-enterMm" type="number" step="0.01" min="0" value="' + getVal('enterMm') + '" style="padding:4px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;text-align:center;width:70px;">' +
	            '<span style="opacity:0.6;">进入概率（%）</span><input id="cfg-enterProb" type="number" min="0" max="100" value="' + getVal('enterProb') + '" style="padding:4px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;text-align:center;width:70px;">' +
	            '<span style="opacity:0.6;">退出雨境（mm/h）</span><input id="cfg-exitMm" type="number" step="0.01" min="0" value="' + getVal('exitMm') + '" style="padding:4px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;text-align:center;width:70px;">' +
	            '<span style="opacity:0.6;">退出概率（%）</span><input id="cfg-exitProb" type="number" min="0" max="100" value="' + getVal('exitProb') + '" style="padding:4px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:#fff;font-size:11px;text-align:center;width:70px;"></div>' +

	            // —— 刷新间隔 ——
	            '<div style="font-size:12px;font-weight:500;margin:8px 0 4px;opacity:0.7;">⏱️ 刷新间隔（分钟）</div>' +
	            '<input id="cfg-refreshMin" type="number" min="1" max="120" value="' + getVal('refreshMin') + '" style="width:80px;padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.3);color:#fff;font-size:12px;text-align:center;">' +

	            // —— 按钮 ——
	            '<div style="display:flex;gap:8px;margin-top:16px;">' +
	            '<button id="dw-settings-save" style="flex:1;padding:7px;border:none;border-radius:8px;background:rgba(74,144,226,0.7);color:#fff;cursor:pointer;font-size:13px;">💾 保存</button>' +
	            '<button id="dw-settings-reset" style="flex:1;padding:7px;border:none;border-radius:8px;background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;font-size:12px;">↺ 重置默认</button></div>' +
	            '<div style="margin-top:6px;font-size:10px;opacity:0.3;text-align:center;">保存后下次自动检测生效 · Ctrl+Shift+S 打开</div>';

	          SETTINGS_PANEL.innerHTML = html;

	          // 关闭
	          document.getElementById('dw-settings-close').onclick = function (e) { e.stopPropagation(); closeSettings(); };

	          // 保存
	          document.getElementById('dw-settings-save').onclick = function (e) { e.stopPropagation();
	            var cfg = {
	              homeLat: parseFloat(document.getElementById('cfg-homeLat').value) || DEFAULTS.homeLat,
	              homeLon: parseFloat(document.getElementById('cfg-homeLon').value) || DEFAULTS.homeLon,
	              workLat: parseFloat(document.getElementById('cfg-workLat').value) || DEFAULTS.workLat,
	              workLon: parseFloat(document.getElementById('cfg-workLon').value) || DEFAULTS.workLon,
	              workDays: document.getElementById('cfg-workDays').value.trim() || DEFAULTS.workDays,
	              workHourStart: parseInt(document.getElementById('cfg-workHourStart').value) || DEFAULTS.workHourStart,
	              workHourEnd: parseInt(document.getElementById('cfg-workHourEnd').value) || DEFAULTS.workHourEnd,
	              enterMm: parseFloat(document.getElementById('cfg-enterMm').value) || DEFAULTS.enterMm,
	              enterProb: parseFloat(document.getElementById('cfg-enterProb').value) || DEFAULTS.enterProb,
	              exitMm: parseFloat(document.getElementById('cfg-exitMm').value) || DEFAULTS.exitMm,
	              exitProb: parseFloat(document.getElementById('cfg-exitProb').value) || DEFAULTS.exitProb,
	              refreshMin: parseInt(document.getElementById('cfg-refreshMin').value) || DEFAULTS.refreshMin,
	            };
	            saveConfig(cfg);
	            // 触发立即重新检测
	            if (window.__dwWeatherAuto && window.__dwWeatherAuto.detect) {
	              window.__dwWeatherAuto.detect();
	            }
	            closeSettings();
	            // 刷新面板天气显示
	            var panel = document.getElementById('dw-theme-panel');
	            if (panel && panel.style.display !== 'none' && typeof buildPanel === 'function') buildPanel();
	          };

	          // 重置
	          document.getElementById('dw-settings-reset').onclick = function (e) { e.stopPropagation();
	            try { localStorage.removeItem('dw-weather-config'); } catch (e) {}
	            buildSettingsPanel();
	          };
	        }

	        function openSettings() {
	          if (!SETTINGS_PANEL) {
	            SETTINGS_PANEL = document.createElement('div');
	            SETTINGS_PANEL.id = 'dw-settings-panel';
	            Object.assign(SETTINGS_PANEL.style, {
	              position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
	              zIndex:2147483647, minWidth:'300px', maxWidth:'380px', width:'90%',
	              padding:'16px', background:'rgba(15,20,35,0.94)', color:'#fff',
	              borderRadius:'14px', fontFamily:'system-ui,sans-serif',
	              boxShadow:'0 12px 40px rgba(0,0,0,0.5)', backdropFilter:'blur(16px)',
	              display:'block', fontSize:'13px', maxHeight:'80vh', overflowY:'auto',
	            });
	            document.body.appendChild(SETTINGS_PANEL);
	          } else {
	            SETTINGS_PANEL.style.display = 'block';
	          }
	          buildSettingsPanel();
	        }

	        function closeSettings() {
	          if (SETTINGS_PANEL) SETTINGS_PANEL.style.display = 'none';
	        }

	        // 对外暴露
	        window.__dwOpenSettings = openSettings;
	        window.__dwCloseSettings = closeSettings;

	        // —— 快捷键 Ctrl+Shift+S ——
	        document.addEventListener('keydown', function (e) {
	          if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
	            e.preventDefault();
	            if (SETTINGS_PANEL && SETTINGS_PANEL.style.display !== 'none') { closeSettings(); return; }
	            openSettings();
	          }
	        });
	        // Esc 关闭
	        document.addEventListener('keydown', function (e) {
	          if (e.key === 'Escape' && SETTINGS_PANEL && SETTINGS_PANEL.style.display !== 'none') {
	            closeSettings();
	          }
	        });
	        // 点击外部关闭
	        document.addEventListener('click', function (e) {
	          if (SETTINGS_PANEL && SETTINGS_PANEL.style.display !== 'none' && !SETTINGS_PANEL.contains(e.target) && !e.ctrlKey) {
	            setTimeout(function () { if (SETTINGS_PANEL) SETTINGS_PANEL.style.display = 'none'; }, 100);
	          }
	        });
	      })();
	    </script>
