	    <script>
	      // ============ 下雨 Canvas 动效（v1.1 稳健版）============
	      (function () {
	        var CANVAS_ID = 'dw-rain-canvas';
	        var RAIN_COUNT = 120;
	        var MAX_OPACITY = 0.45;
	        var FADE_SPEED = 0.03;
	        var WIND = -0.3;
	        var GRAVITY = 0.08;

		        var canvas = null, ctx = null, drops = [], ripples = [], animId = null;
		        var isActive = false, currentAlpha = 0, targetAlpha = 0;

	        function makeDrop(w, h) {
	          return {
	            x: Math.random() * w, y: Math.random() * h - h,
	            speed: 4 + Math.random() * 6, length: 10 + Math.random() * 18,
	            width: 0.5 + Math.random() * 1.2, opacity: 0.2 + Math.random() * 0.6,
	            wind: WIND + (Math.random() - 0.5) * 0.4,
	          };
	        }

	        function init() {
	          if (canvas) return;
	          var wp = document.getElementById('doraemon-wallpaper');
	          if (!wp) { setTimeout(init, 300); return; }
	          canvas = document.createElement('canvas');
	          canvas.id = CANVAS_ID;
	          canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:100;opacity:0;';
	          ctx = canvas.getContext('2d');
	          wp.appendChild(canvas);
	          resize();
	          window.addEventListener('resize', resize);
	          // 如果已经是下雨状态，自动启动
	          if (window.__dwGetWeather && window.__dwGetWeather() === 'rain') start();
	        }
	        function resize() {
	          if (!canvas) return;
	          canvas.width = window.innerWidth;
	          canvas.height = window.innerHeight;
	          drops = [];
	          for (var i = 0; i < RAIN_COUNT; i++) drops.push(makeDrop(canvas.width, canvas.height));
	        }

	        function animate() {
	          animId = requestAnimationFrame(animate);
	          // 渐变不透明度
	          if (currentAlpha < targetAlpha) currentAlpha = Math.min(currentAlpha + FADE_SPEED, targetAlpha);
	          else if (currentAlpha > targetAlpha) currentAlpha = Math.max(currentAlpha - FADE_SPEED, targetAlpha);
	          else if (!isActive && currentAlpha < 0.005) { cancelAnimationFrame(animId); animId = null; canvas.style.opacity = '0'; return; }
	          canvas.style.opacity = String(currentAlpha);
		          ctx.clearRect(0, 0, canvas.width, canvas.height);
		          // 雨滴颜色随时段
		          var pc = { morning:'rgba(210,200,185,0.35)', day:'rgba(200,215,235,0.30)', dusk:'rgba(200,170,150,0.30)', night:'rgba(150,175,210,0.25)', video:'rgba(200,215,235,0.25)' };
		          var strokeColor = pc[document.documentElement.dataset.period] || pc.day;
		          ctx.strokeStyle = strokeColor;
		          var w = canvas.width, h = canvas.height;
		          for (var i = 0; i < drops.length; i++) {
		            var d = drops[i];
		            d.x += d.wind; d.y += d.speed; d.speed += GRAVITY;
		            if (d.y > h + 20 || d.x < -20 || d.x > w + 20) {
		              // 雨滴落到底部时生成涟漪
		              if (d.y > h - 20 && canvas) ripples.push({ x: d.x, y: h - 5, radius: 2, maxRadius: 18 + Math.random() * 12, opacity: 0.5 });
		              drops[i] = makeDrop(w, h); drops[i].y = -20 - Math.random() * 60; continue;
		            }
		            ctx.globalAlpha = d.opacity * currentAlpha * (1 / MAX_OPACITY);
		            ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.wind * 5, d.y - d.length);
		            ctx.lineWidth = d.width; ctx.stroke();
		          }
		          // 绘制涟漪
		          for (var r = ripples.length - 1; r >= 0; r--) {
		            var rp = ripples[r];
		            rp.radius += 0.6; rp.opacity -= 0.015;
		            if (rp.opacity <= 0 || rp.radius > rp.maxRadius) { ripples.splice(r, 1); continue; }
		            ctx.globalAlpha = rp.opacity * currentAlpha;
		            ctx.strokeStyle = strokeColor;
		            ctx.lineWidth = 0.8 + (1 - rp.opacity / 0.5) * 1.2;
		            ctx.beginPath(); ctx.ellipse(rp.x, rp.y, rp.radius, rp.radius * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
		          }
	        }

	        function start() {
	          init();
	          if (!canvas) return;
	          isActive = true; targetAlpha = MAX_OPACITY;
	          if (!animId) animate();
	        }
	        function stop() {
	          targetAlpha = 0; isActive = false;
	        }

		        window.__dwRain = { start: start, stop: stop, get active() { return isActive; } };

		        // —— 标签页隐藏时暂停动画，节省 CPU ——
		        document.addEventListener('visibilitychange', function () {
		          if (document.hidden) {
		            if (animId) { cancelAnimationFrame(animId); animId = null; }
		          } else {
		            if (isActive && !animId) animate();
		          }
		        });

		        // 延迟初始化，确保 doraemon-wallpaper 已存在
		        setTimeout(init, 1500);
	      })();
	    </script>
