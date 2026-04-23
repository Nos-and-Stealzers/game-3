(function () {
  var ROOT_ID = "gamehub-debug-console-root";
  var OVERLAY_ID = "gamehub-debug-console-overlay";
  var BODY_ID = "gamehub-debug-console-body";
  var TOGGLE_ID = "gamehub-debug-console-toggle";
  var MAX_ITEMS = 160;
  var DEV_TOOLS_KEY = "gamehub_developer_tools_enabled";
  var logs = [];
  var visible = false;
  var installed = false;
  var enabled = false;
  var currentPageLabel = "Page";
  var existingToggle = null;
  var originalWarn = console.warn;
  var originalError = console.error;

  function nowLabel() {
    return new Date().toLocaleTimeString();
  }

  function safeMessage(value) {
    try {
      if (typeof value === "string") {
        return value;
      }
      if (value instanceof Error) {
        return value.stack || value.message || String(value);
      }
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  function pushLog(level, message) {
    logs.push({ level: level, message: message, at: new Date().toISOString() });
    if (logs.length > MAX_ITEMS) {
      logs.shift();
    }
    render();
  }

  function isEnabled() {
    try {
      return localStorage.getItem(DEV_TOOLS_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function removeOverlay() {
    var root = document.getElementById(ROOT_ID);
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
  }

  function restoreConsole() {
    console.warn = originalWarn;
    console.error = originalError;
  }

  function ensureOverlay() {
    var root = document.getElementById(ROOT_ID);
    if (root) {
      return root;
    }

    var style = document.createElement("style");
    style.textContent = "" +
      "#" + ROOT_ID + "{position:fixed;right:14px;bottom:14px;z-index:2147483647;display:grid;gap:10px;pointer-events:none}" +
      "#" + TOGGLE_ID + "{pointer-events:auto;align-self:end;justify-self:end;border:1px solid rgba(97,117,154,.75);background:rgba(14,20,31,.94);color:#ecf2ff;border-radius:999px;padding:10px 14px;font:700 12px/1.1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.22)}" +
      "#" + OVERLAY_ID + "{pointer-events:auto;display:none;width:min(720px,calc(100vw - 28px));height:min(72vh,720px);background:rgba(10,14,21,.98);color:#eaf0ff;border:1px solid rgba(99,118,161,.62);border-radius:14px;box-shadow:0 18px 44px rgba(0,0,0,.38);overflow:hidden;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}" +
      "#" + OVERLAY_ID + ".show{display:grid;grid-template-rows:auto 1fr}" +
      "#" + OVERLAY_ID + " .head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 12px;border-bottom:1px solid rgba(99,118,161,.42)}" +
      "#" + OVERLAY_ID + " .title{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b8c8ef}" +
      "#" + OVERLAY_ID + " .hint{font-size:11px;color:#96a6cc}" +
      "#" + OVERLAY_ID + " .actions{display:flex;gap:8px;flex-wrap:wrap}" +
      "#" + OVERLAY_ID + " .action{border:1px solid rgba(99,118,161,.55);background:#182033;color:#dce7ff;border-radius:8px;padding:5px 8px;font:700 11px/1.1 inherit;cursor:pointer}" +
      "#" + OVERLAY_ID + " .body{overflow:auto;padding:10px 12px;display:grid;gap:6px}" +
      "#" + OVERLAY_ID + " .item{border:1px solid rgba(88,103,136,.45);border-left:3px solid #7d8fb7;background:rgba(18,23,33,.92);border-radius:8px;padding:7px 8px;line-height:1.35;font-size:12px;white-space:pre-wrap;word-break:break-word}" +
      "#" + OVERLAY_ID + " .item.warn{border-left-color:#f0b23d}" +
      "#" + OVERLAY_ID + " .item.error{border-left-color:#ff6f6f}" +
      "#" + OVERLAY_ID + " .item.info{border-left-color:#5f8cff}";
    document.head.appendChild(style);

    root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = "" +
      '<button type="button" id="' + TOGGLE_ID + '">Debug Console</button>' +
      '<section id="' + OVERLAY_ID + '">' +
      '<div class="head">' +
      '<div>' +
      '<div class="title">' + currentPageLabel + ' Debug Console</div>' +
      '<div class="hint">Ctrl+Shift+F to toggle · Captures warnings and errors</div>' +
      '</div>' +
      '<div class="actions">' +
      '<button type="button" class="action" data-debug-action="clear">Clear</button>' +
      '<button type="button" class="action" data-debug-action="close">Close</button>' +
      '</div>' +
      '</div>' +
      '<div class="body" id="' + BODY_ID + '"></div>' +
      '</section>';
    document.body.appendChild(root);

    var toggleBtn = document.getElementById(TOGGLE_ID);
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        if (typeof existingToggle === "function") {
          existingToggle();
          return;
        }
        setVisible(!visible);
      });
    }

    root.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.getAttribute) {
        return;
      }
      var action = target.getAttribute("data-debug-action");
      if (!action) {
        return;
      }
      if (action === "close") {
        setVisible(false);
      } else if (action === "clear") {
        logs = [];
        render();
      }
    });

    return root;
  }

  function render() {
    if (typeof existingToggle === "function") {
      return;
    }
    var root = ensureOverlay();
    var overlay = document.getElementById(OVERLAY_ID);
    var body = document.getElementById(BODY_ID);
    if (!root || !overlay || !body) {
      return;
    }

    overlay.classList.toggle("show", visible);
    window.__GAMEHUB_DEBUG_CONSOLE_ACTIVE__ = visible;

    if (!visible) {
      return;
    }

    if (!logs.length) {
      body.innerHTML = '<div class="item info">No warnings or errors captured yet.</div>';
      return;
    }

    body.innerHTML = logs.slice().reverse().map(function (entry) {
      var stamp = new Date(entry.at).toLocaleTimeString();
      var safe = String(entry.message)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return '<div class="item ' + entry.level + '">[' + stamp + '] ' + entry.level.toUpperCase() + '\n' + safe + '</div>';
    }).join("");
  }

  function setVisible(nextVisible) {
    visible = !!nextVisible;
    render();
  }

  function installLocalCapture() {
    if (installed) {
      return;
    }
    installed = true;

    console.warn = function () {
      try {
        pushLog("warn", Array.prototype.slice.call(arguments).map(safeMessage).join(" "));
      } catch (_error) {
      }
      return originalWarn.apply(console, arguments);
    };

    console.error = function () {
      try {
        pushLog("error", Array.prototype.slice.call(arguments).map(safeMessage).join(" "));
      } catch (_error) {
      }
      return originalError.apply(console, arguments);
    };

    window.addEventListener("error", function (event) {
      var message = event && (event.message || (event.error && event.error.message)) ? (event.message || event.error.message) : "Unhandled error";
      pushLog("error", String(message));
    });

    window.addEventListener("unhandledrejection", function (event) {
      var reason = event && event.reason;
      var message = reason && reason.message ? reason.message : String(reason || "Unhandled rejection");
      pushLog("warn", message);
    });

    document.addEventListener("keydown", function (event) {
      var key = String(event.key || "").toLowerCase();
      if (key !== "f" || !event.ctrlKey || !event.shiftKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      setVisible(!visible);
    }, true);

    window.__GAMEHUB_DEBUG_CONSOLE_OPEN__ = function () {
      setVisible(true);
    };
    window.__GAMEHUB_DEBUG_CONSOLE_CLOSE__ = function () {
      setVisible(false);
    };
    window.__GAMEHUB_DEBUG_CONSOLE_TOGGLE__ = function () {
      setVisible(!visible);
    };
  }

  function install() {
    enabled = isEnabled();
    if (!enabled) {
      removeOverlay();
      restoreConsole();
      installed = false;
      window.__GAMEHUB_DEBUG_CONSOLE_ACTIVE__ = false;
      window.__GAMEHUB_DEBUG_CONSOLE_OPEN__ = function () {};
      window.__GAMEHUB_DEBUG_CONSOLE_CLOSE__ = function () {};
      window.__GAMEHUB_DEBUG_CONSOLE_TOGGLE__ = function () {};
      return;
    }

    if (typeof window.__GAMEHUB_TOGGLE_DIAGNOSTICS__ === "function") {
      existingToggle = window.__GAMEHUB_TOGGLE_DIAGNOSTICS__;
    } else if (typeof window.__GAMEHUB_OPEN_DIAGNOSTICS__ === "function" && typeof window.__GAMEHUB_CLOSE_DIAGNOSTICS__ === "function") {
      existingToggle = function () {
        if (window.__GAMEHUB_DIAG_OVERLAY_ACTIVE__) {
          window.__GAMEHUB_CLOSE_DIAGNOSTICS__();
        } else {
          window.__GAMEHUB_OPEN_DIAGNOSTICS__();
        }
      };
    }

    if (!existingToggle) {
      installLocalCapture();
    }

    ensureOverlay();
    render();

    window.__GAMEHUB_DEBUG_CONSOLE_OPEN__ = function () {
      if (existingToggle) {
        window.__GAMEHUB_OPEN_DIAGNOSTICS__ ? window.__GAMEHUB_OPEN_DIAGNOSTICS__() : existingToggle();
        return;
      }
      setVisible(true);
    };
    window.__GAMEHUB_DEBUG_CONSOLE_CLOSE__ = function () {
      if (existingToggle) {
        if (window.__GAMEHUB_CLOSE_DIAGNOSTICS__) {
          window.__GAMEHUB_CLOSE_DIAGNOSTICS__();
        }
        return;
      }
      setVisible(false);
    };
    window.__GAMEHUB_DEBUG_CONSOLE_TOGGLE__ = function () {
      if (existingToggle) {
        existingToggle();
        return;
      }
      setVisible(!visible);
    };
  }

  function refreshFromPreference() {
    install();
  }

  currentPageLabel = document.title ? String(document.title).trim() : currentPageLabel;
  window.__GAMEHUB_DEBUG_CONSOLE_REFRESH__ = refreshFromPreference;
  window.addEventListener("storage", function (event) {
    if (!event || event.key !== DEV_TOOLS_KEY) {
      return;
    }
    refreshFromPreference();
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
