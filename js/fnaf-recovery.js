(function () {
  function createFnafRecovery(options) {
    var cfg = options || {};
    var canvasId = cfg.canvasId || "MMFCanvas";
    var inputStability = cfg.inputStability || null;
    var restartRuntime = typeof cfg.restartRuntime === "function" ? cfg.restartRuntime : null;

    var isLowSpec = (typeof navigator !== "undefined") && (
      (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) ||
      (typeof navigator.deviceMemory === "number" && navigator.deviceMemory > 0 && navigator.deviceMemory <= 4)
    );

    var pollIntervalMs = isLowSpec ? 2000 : 3000;
    var blackStreakLimit = isLowSpec ? 5 : 6;
    var autoRestartUsed = false;
    var blackFrameStreak = 0;
    var watcherId = null;
    var bound = false;

    var overlay = null;
    var messageEl = null;

    function getCanvas() {
      return document.getElementById(canvasId);
    }

    function isMostlyBlack() {
      var canvas = getCanvas();
      if (!canvas || canvas.style.display === "none" || !canvas.width || !canvas.height) {
        return false;
      }

      var ctx;
      try {
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      } catch (error) {
        return false;
      }
      if (!ctx) {
        return false;
      }

      var samplePoints = [
        [0.5, 0.5],
        [0.2, 0.2],
        [0.8, 0.2],
        [0.2, 0.8],
        [0.8, 0.8]
      ];
      var darkCount = 0;

      for (var i = 0; i < samplePoints.length; i++) {
        var x = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * samplePoints[i][0])));
        var y = Math.max(0, Math.min(canvas.height - 1, Math.floor(canvas.height * samplePoints[i][1])));
        var pixel;
        try {
          pixel = ctx.getImageData(x, y, 1, 1).data;
        } catch (error) {
          return false;
        }

        var brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
        if (brightness < 8) {
          darkCount++;
        }
      }

      return darkCount === samplePoints.length;
    }

    function ensureOverlay() {
      if (overlay) {
        return;
      }

      var style = document.createElement("style");
      style.textContent = "" +
        ".recovery-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.85);z-index:9999;color:#fff;font-family:monospace;padding:20px}" +
        ".recovery-card{width:min(560px,94vw);border:1px solid rgba(255,255,255,.35);border-radius:10px;background:rgba(12,12,12,.92);padding:16px;display:grid;gap:12px}" +
        ".recovery-card h3{margin:0;font-size:clamp(16px,2.2vw,22px)}" +
        ".recovery-card p{margin:0;color:#e3e3e3;font-size:clamp(12px,1.6vw,15px);line-height:1.4}" +
        ".recovery-actions{display:flex;gap:10px;flex-wrap:wrap}" +
        ".recovery-btn{border:1px solid rgba(255,255,255,.45);border-radius:8px;background:#171717;color:#fff;font-family:inherit;padding:8px 12px;cursor:pointer;min-height:40px}" +
        ".recovery-btn.primary{background:#0c6ff2;border-color:#0c6ff2}";
      document.head.appendChild(style);

      overlay = document.createElement("div");
      overlay.className = "recovery-overlay";
      overlay.setAttribute("role", "alert");
      overlay.setAttribute("aria-live", "assertive");
      overlay.innerHTML = "" +
        '<div class="recovery-card">' +
        "<h3>Game Recovery</h3>" +
        '<p id="fnafRecoveryMessage">A runtime issue was detected. You can try a quick recover or reload the game.</p>' +
        '<div class="recovery-actions">' +
        '<button id="fnafRecoverNowBtn" type="button" class="recovery-btn">Quick Recover</button>' +
        '<button id="fnafReloadGameBtn" type="button" class="recovery-btn primary">Reload Game</button>' +
        '<button id="fnafCloseRecoveryBtn" type="button" class="recovery-btn">Dismiss</button>' +
        "</div>" +
        "</div>";
      document.body.appendChild(overlay);

      messageEl = document.getElementById("fnafRecoveryMessage");

      document.getElementById("fnafRecoverNowBtn").addEventListener("click", quickRecover);
      document.getElementById("fnafReloadGameBtn").addEventListener("click", function () {
        window.location.reload();
      });
      document.getElementById("fnafCloseRecoveryBtn").addEventListener("click", hideOverlay);
    }

    function showOverlay(message) {
      ensureOverlay();
      if (messageEl) {
        messageEl.textContent = message || "A runtime issue was detected. You can try a quick recover or reload the game.";
      }
      overlay.style.display = "flex";
    }

    function hideOverlay() {
      if (!overlay) {
        return;
      }
      overlay.style.display = "none";
    }

    function toggleCanvasFullscreen() {
      var canvas = getCanvas();
      if (!canvas) {
        return;
      }
      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
        return;
      }
      if (canvas.requestFullscreen) {
        canvas.requestFullscreen();
      }
    }

    function quickRecover() {
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen();
        }
      } catch (error) {
      }

      try {
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("focus"));
        if (inputStability) {
          inputStability.releaseStuckInput();
          inputStability.focusCanvas();
        }
      } catch (error) {
      }

      hideOverlay();

      window.setTimeout(function () {
        if (!autoRestartUsed && isMostlyBlack() && restartRuntime) {
          autoRestartUsed = true;
          showOverlay("Quick Recover did not clear the black screen. Attempting one automatic runtime restart...");
          try {
            restartRuntime();
            window.setTimeout(hideOverlay, 1200);
          } catch (error) {
            showOverlay("Auto restart failed. Please use Reload Game.");
          }
        }
      }, isLowSpec ? 4500 : 6000);
    }

    function startWatcher() {
      if (watcherId) {
        clearInterval(watcherId);
      }

      watcherId = setInterval(function () {
        if (document.hidden) {
          blackFrameStreak = 0;
          return;
        }

        if (isMostlyBlack()) {
          blackFrameStreak++;
        } else {
          blackFrameStreak = 0;
        }

        if (blackFrameStreak >= blackStreakLimit) {
          blackFrameStreak = 0;
          showOverlay("Detected a prolonged black screen after gameplay. Try Quick Recover. If that fails, use Reload Game.");
        }
      }, pollIntervalMs);
    }

    function bindGlobalHandlers() {
      document.addEventListener("keydown", function (event) {
        var key = (event.key || "").toLowerCase();
        if (key !== "f") {
          return;
        }

        if (event.ctrlKey && event.shiftKey) {
          event.preventDefault();
          toggleCanvasFullscreen();
          return;
        }

        if (event.ctrlKey || event.metaKey || event.altKey) {
          return;
        }

        event.preventDefault();
        toggleCanvasFullscreen();
      });

      window.addEventListener("error", function (event) {
        var msg = event && event.message ? String(event.message) : "Runtime error detected.";
        showOverlay("Runtime error: " + msg + " Try Quick Recover first, then Reload Game if needed.");
      });

      window.addEventListener("unhandledrejection", function (event) {
        var reason = event && event.reason;
        var msg = reason && reason.message ? String(reason.message) : String(reason || "Unhandled promise rejection");
        showOverlay("Runtime rejection: " + msg + " Try Quick Recover first, then Reload Game if needed.");
      });
    }

    return {
      bind: function () {
        if (bound) {
          return;
        }
        bound = true;
        window.__GAMEHUB_FNAF_RECOVERY_ACTIVE__ = true;
        ensureOverlay();
        bindGlobalHandlers();
        startWatcher();
      },
      onRuntimeStarted: function () {
        blackFrameStreak = 0;
        if (inputStability) {
          inputStability.releaseStuckInput();
          window.setTimeout(inputStability.focusCanvas, 0);
        }
        startWatcher();
      },
      showOverlay: showOverlay,
      hideOverlay: hideOverlay,
      quickRecover: quickRecover
    };
  }

  window.createFnafRecovery = createFnafRecovery;
})();
