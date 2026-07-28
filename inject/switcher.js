    <script>
      // ============ 天气手动开关 ============
      // 快捷键 Ctrl+Shift+R：切换晴/雨
      // 右下角隐形小按钮：点击切换，悬停显示
      // 切换时右下角浮出 1.5 秒提示
      (function () {
        // 等主切换逻辑就绪
        function ready(fn) {
          if (window.__dwToggleWeather) fn();
          else setTimeout(function () { ready(fn); }, 100);
        }

        ready(function () {
          var WEATHER_LABEL = { clear: '☀️ 晴天', rain: '🌧️ 雨天' };

          // —— 提示气泡 ——
          var toast = document.createElement('div');
          toast.id = 'dw-toast';
          Object.assign(toast.style, {
            position: 'fixed', right: '24px', bottom: '24px', zIndex: 2147483646,
            padding: '10px 18px', borderRadius: '12px',
            background: 'rgba(10,15,25,0.78)', color: '#fff',
            fontSize: '14px', fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            opacity: '0', transform: 'translateY(8px)',
            transition: 'opacity .25s ease, transform .25s ease',
            pointerEvents: 'none', backdropFilter: 'blur(8px)',
          });
          document.body.appendChild(toast);

          var hideTimer = null;
          function showToast(text) {
            toast.textContent = text;
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
            clearTimeout(hideTimer);
            hideTimer = setTimeout(function () {
              toast.style.opacity = '0';
              toast.style.transform = 'translateY(8px)';
            }, 1500);
          }

          // —— 执行切换 ——
          function doToggle() {
            var next = window.__dwToggleWeather();
            showToast('壁纸已切换：' + WEATHER_LABEL[next]);
          }
          function doSet(w) {
            window.__dwSetWeather(w, 'manual'); // 手动设置 → 锁定，自动检测让位
            showToast('壁纸已切换：' + WEATHER_LABEL[w]);
          }

          // —— 快捷键 Ctrl+Shift+R ——
          document.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
              e.preventDefault();
              doToggle();
            }
          });

          // —— 右下角隐形按钮（悬停浮现）——
          var btn = document.createElement('div');
          btn.id = 'dw-switch-btn';
          btn.title = '切换晴/雨壁纸（Ctrl+Shift+R）';
          btn.textContent = '🌤️';
          Object.assign(btn.style, {
            position: 'fixed', right: '12px', bottom: '12px', zIndex: 2147483645,
            width: '28px', height: '28px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', cursor: 'pointer', userSelect: 'none',
            opacity: '0.25', transition: 'opacity .25s ease, transform .15s ease',
            background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(4px)',
          });
          btn.addEventListener('mouseenter', function () { btn.style.opacity = '1'; });
          btn.addEventListener('mouseleave', function () { btn.style.opacity = '0.25'; });
          btn.addEventListener('click', doToggle);

          // 同步按钮图标随天气变化
          function syncBtnIcon() {
            var w = window.__dwGetWeather();
            btn.textContent = w === 'rain' ? '🌧️' : '🌤️';
          }
          syncBtnIcon();
          setInterval(syncBtnIcon, 2000); // 兜底同步

          // 等body就绪再插入（防止script在body构建前执行）
          if (document.body) document.body.appendChild(btn);
          else document.addEventListener('DOMContentLoaded', function () {
            document.body.appendChild(btn);
          });

          // 暴露给控制台调试：
          //   __dwWeather('rain'/'clear')  手动锁定（自动检测让位）
          //   __dwWeather('toggle')        手动切换
          //   __dwWeather('auto')          恢复自动检测（清除手动锁定）
          //   __dwWeather()                查看当前状态
          window.__dwWeather = function (w) {
            if (w === 'toggle') doToggle();
            else if (w === 'clear' || w === 'rain') doSet(w);
            else if (w === 'auto') {
              // 清除手动锁定，让 weather.js 自动检测重新接管
              try { localStorage.removeItem('dw-weather-source'); } catch (e) {}
              if (window.__dwWeatherAuto && window.__dwWeatherAuto.detect) {
                window.__dwWeatherAuto.detect(); // 立即触发一次检测
              }
              showToast('已恢复自动天气检测');
            }
            else return {
              weather: window.__dwGetWeather(),
              source: window.__dwGetWeatherSource ? window.__dwGetWeatherSource() : null,
            };
          };
        });
      })();
    </script>
