/**
 * Admin Console Module - With Tabbed Interface
 * Global hotkey: Ctrl+Shift+F
 * Provides admin commands for game management, unlocks, and debugging
 * Tabs: CONSOLE (input) | OUTPUT (results)
 */
(function () {
  var CONSOLE_VISIBLE_KEY = "gamehub_console_visible";
  var ADMIN_ROLE_KEY = "gamehub_user_admin_role";
  var FNAF_UNLOCKS_KEY = "gamehub_fnaf_unlocks";
  var consoleVisible = false;
  var consoleElement = null;
  var inputElement = null;
  var outputElement = null;
  var isAdmin = false;
  var supabaseClient = null;
  var currentUserId = null;
  var commandHistory = [];
  var historyIndex = -1;
  var activeTab = "console";
  var capturedLogs = [];
  var MAX_CAPTURED = 200;
  var _originalConsole = null;
  var _captureInstalled = false;

  window.__GAMEHUB_ADMIN_CONSOLE__ = {
    show: toggleConsole,
    hide: hideConsole,
    execute: executeCommand,
    isAdmin: isAdminUser
  };

  // Command registry
  var COMMANDS = {
    help: {
      description: "Show available commands",
      execute: cmdHelp,
      adminOnly: false
    },
    clear: {
      description: "Clear console output",
      execute: cmdClear,
      adminOnly: false
    },
    fnaf: {
      description: "FNAF commands: fnaf [all|1|2|3|4|sl|ps|ucn|w] [unlock]",
      execute: cmdFnaf,
      adminOnly: true
    },
    status: {
      description: "Show current user and game status",
      execute: cmdStatus,
      adminOnly: false
    },
    user: {
      description: "Show current user info",
      execute: cmdUser,
      adminOnly: false
    },
    unlock: {
      description: "Unlock content: unlock [game] [all|feature]",
      execute: cmdUnlock,
      adminOnly: true
    },
    lock: {
      description: "Lock content: lock [game] [all|feature]",
      execute: cmdLock,
      adminOnly: true
    },
    reset: {
      description: "Reset game data: reset [game|all]",
      execute: cmdReset,
      adminOnly: true
    },
    admin: {
      description: "Admin only command (shows admin status)",
      execute: cmdAdmin,
      adminOnly: true
    },
    cache: {
      description: "Cache info: cache [clear|show|stats]",
      execute: cmdCache,
      adminOnly: true
    },
    game: {
      description: "Game info: game [current|list]",
      execute: cmdGame,
      adminOnly: false
    }
  };

  function initConsole() {
    setupHotkey();
    checkAdminStatus();
    loadCommandHistory();
    installCaptureHandlers();
  }

  function installCaptureHandlers() {
    if (_captureInstalled) return;
    _captureInstalled = true;

    // Preserve originals
    _originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console)
    };

    // Helper to push into captured buffer and print
    function pushCaptured(level, message, meta) {
      try {
        var entry = { time: Date.now(), level: level, message: String(message || ''), meta: meta };
        capturedLogs.unshift(entry);
        if (capturedLogs.length > MAX_CAPTURED) capturedLogs.pop();
        // Print to output tab in format: [h:mm:ss AM] LEVEL message
        var timeLabel = new Date(entry.time).toLocaleTimeString();
        var levelLabel = (entry.level || 'log').toUpperCase();
        printLine('[' + timeLabel + '] ' + levelLabel + ' ' + entry.message, entry.level === 'error' ? 'error' : (entry.level === 'warn' ? 'warn' : 'info'));
      } catch (e) {
        try { _originalConsole.error('Console capture failed', e); } catch (_) {}
      }
    }

    // Wrap console methods
    console.log = function () {
      try { _originalConsole.log.apply(console, arguments); } catch (e) {}
      try { pushCaptured('log', Array.prototype.slice.call(arguments).join(' ')); } catch (e) {}
    };
    console.info = function () {
      try { _originalConsole.info.apply(console, arguments); } catch (e) {}
      try { pushCaptured('info', Array.prototype.slice.call(arguments).join(' ')); } catch (e) {}
    };
    console.warn = function () {
      try { _originalConsole.warn.apply(console, arguments); } catch (e) {}
      try { pushCaptured('warn', Array.prototype.slice.call(arguments).join(' ')); } catch (e) {}
    };
    console.error = function () {
      try { _originalConsole.error.apply(console, arguments); } catch (e) {}
      try { pushCaptured('error', Array.prototype.slice.call(arguments).join(' ')); } catch (e) {}
    };

    // Global error handlers
    window.addEventListener('error', function (ev) {
      try {
        var msg = ev && ev.message ? ev.message : String(ev || 'Unknown error');
        var src = ev && ev.filename ? (ev.filename + ':' + (ev.lineno || '?')) : '';
        var stack = ev && ev.error && ev.error.stack ? '\n' + ev.error.stack : '';
        pushCaptured('error', msg + (src ? ' (' + src + ')' : '') + stack);
      } catch (e) {
        try { _originalConsole.error('Error handler failed', e); } catch (_) {}
      }
    }, true);

    window.addEventListener('unhandledrejection', function (ev) {
      try {
        var reason = ev && ev.reason ? ev.reason : ev;
        var message = reason && reason.message ? reason.message : String(reason);
        var stack = reason && reason.stack ? '\n' + reason.stack : '';
        pushCaptured('error', 'UnhandledRejection: ' + message + stack);
      } catch (e) {
        try { _originalConsole.error('UnhandledRejection handler failed', e); } catch (_) {}
      }
    }, true);
  }

  function setupHotkey() {
    document.addEventListener("keydown", function(event) {
      // Ctrl+Shift+F (or Cmd+Shift+F on Mac)
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "F") {
        event.preventDefault();
        toggleConsole();
      }
    });
  }

  async function checkAdminStatus() {
    try {
      if (window.activeAccountUser && window.activeAccountUser.id) {
        currentUserId = window.activeAccountUser.id;
      }
      if (window.supabaseClient) {
        supabaseClient = window.supabaseClient;
      }

      if (!supabaseClient || !currentUserId) {
        isAdmin = false;
        return;
      }

      // Check if user has admin role
      var roleResult = await supabaseClient.rpc("current_user_staff_role");
      if (roleResult && !roleResult.error) {
        var role = String(roleResult.data || "").trim().toLowerCase();
        isAdmin = role === "admin" || role === "developer";
        localStorage.setItem(ADMIN_ROLE_KEY, isAdmin ? "1" : "0");
      }
    } catch (error) {
      // Fallback to localStorage
      isAdmin = localStorage.getItem(ADMIN_ROLE_KEY) === "1";
    }
  }

  function isAdminUser() {
    return isAdmin;
  }

  function loadCommandHistory() {
    try {
      var stored = localStorage.getItem("gamehub_console_history");
      commandHistory = stored ? JSON.parse(stored) : [];
    } catch (error) {
      commandHistory = [];
    }
  }

  function saveCommandHistory() {
    try {
      localStorage.setItem("gamehub_console_history", JSON.stringify(commandHistory.slice(-50)));
    } catch (error) {
      // Ignore
    }
  }

  function createConsoleUI() {
    if (consoleElement) {
      return consoleElement;
    }

    var container = document.createElement("div");
    container.id = "gamehub-admin-console";
    container.className = "admin-console";
    container.innerHTML = `
      <div class="console-header">
        <div style="display:flex;flex-direction:column;flex:1;padding:8px 12px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="font-weight:bold;color:#5865f2;">Admin Console${isAdmin ? " (ADMIN)" : ""}</div>
            <div style="font-size:11px;color:rgba(232,239,255,0.6);">Ctrl+Shift+F to toggle</div>
          </div>
          <div style="font-size:11px;color:rgba(200,206,230,0.6);">Captures errors and warnings</div>
        </div>
        <div class="console-tabs" style="margin-right:8px;">
          <button class="console-tab active" data-tab="console">CONSOLE</button>
          <button class="console-tab" data-tab="output">OUTPUT</button>
        </div>
        <button class="console-close" onclick="window.__GAMEHUB_ADMIN_CONSOLE__.hide()">Close</button>
      </div>
      <div class="console-content">
        <div class="tab-content active" data-tab="console">
          <div class="console-input-row">
            <span class="console-prompt">> </span>
            <input type="text" class="console-input" placeholder="Type 'help' for commands...">
          </div>
        </div>
        <div class="tab-content" data-tab="output">
          <div class="console-output"></div>
        </div>
      </div>
    `;

    // Add styles
    var style = document.createElement("style");
    style.textContent = `
      .admin-console {
        position: fixed;
        bottom: 14px;
        right: 14px;
        width: min(600px, calc(100vw - 28px));
        height: 300px;
        max-height: 70vh;
        background: rgba(14, 18, 24, 0.98);
        border: 2px solid rgba(88, 101, 242, 0.5);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        color: #e8efff;
        z-index: 99999;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(10px);
      }

      .console-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0;
        border-bottom: 1px solid rgba(122, 162, 255, 0.3);
        background: rgba(0, 0, 0, 0.5);
        user-select: none;
      }

      .console-tabs {
        display: flex;
        flex: 1;
        gap: 0;
      }

      .console-tab {
        padding: 10px 16px;
        background: rgba(0, 0, 0, 0.3);
        border: none;
        color: rgba(232, 239, 255, 0.6);
        font-family: 'Courier New', monospace;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
        margin-right: 2px;
      }

      .console-tab:hover {
        color: #c3cee6;
        background: rgba(0, 0, 0, 0.6);
      }

      .console-tab.active {
        color: #5865f2;
        border-bottom-color: #5865f2;
        background: rgba(88, 101, 242, 0.1);
      }

      .console-close {
        background: transparent;
        border: none;
        color: #c3cee6;
        font-size: 20px;
        cursor: pointer;
        padding: 0 12px;
        height: 40px;
        transition: color 0.2s;
      }

      .console-close:hover {
        color: #e8efff;
      }

      .console-content {
        flex: 1;
        display: flex;
        overflow: hidden;
      }

      .tab-content {
        flex: 1;
        display: none;
        flex-direction: column;
        overflow: hidden;
      }

      .tab-content.active {
        display: flex;
      }

      .console-output {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        background: rgba(10, 14, 22, 0.7);
        line-height: 1.4;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .console-output::-webkit-scrollbar {
        width: 6px;
      }

      .console-output::-webkit-scrollbar-track {
        background: rgba(122, 162, 255, 0.1);
        border-radius: 3px;
      }

      .console-output::-webkit-scrollbar-thumb {
        background: rgba(122, 162, 255, 0.3);
        border-radius: 3px;
      }

      .console-output::-webkit-scrollbar-thumb:hover {
        background: rgba(122, 162, 255, 0.5);
      }

      .console-input-row {
        display: flex;
        align-items: center;
        padding: 6px;
        background: rgba(0, 0, 0, 0.3);
        flex: 1;
      }

      .console-prompt {
        color: #5865f2;
        margin-right: 4px;
        flex-shrink: 0;
      }

      .console-input {
        flex: 1;
        background: transparent;
        border: none;
        color: #e8efff;
        font-family: inherit;
        font-size: inherit;
        outline: none;
      }

      .console-input::placeholder {
        color: rgba(200, 206, 230, 0.5);
      }

      .console-line {
        margin: 2px 0;
      }

      .console-line.error {
        color: #ff6b6b;
      }

      .console-line.success {
        color: #51cf66;
      }

      .console-line.info {
        color: #74c0fc;
      }

      .console-line.warn {
        color: #ffd43b;
      }

      .console-line.admin {
        color: #ffa94d;
      }

      @media (max-width: 600px) {
        .admin-console {
          width: calc(100vw - 20px);
          height: 250px;
          bottom: 10px;
          right: 10px;
        }

        .console-tab {
          padding: 8px 12px;
          font-size: 10px;
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(container);
    consoleElement = container;
    
    // Make sure we have both output elements
    inputElement = container.querySelector(".console-input");
    outputElement = container.querySelector('[data-tab="output"] .console-output');

    // Tab switching
    var tabButtons = container.querySelectorAll(".console-tab");
    tabButtons.forEach(function(btn) {
      btn.addEventListener("click", function() {
        var tabName = btn.getAttribute("data-tab");
        switchTab(tabName);
      });
    });

    inputElement.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        var cmd = inputElement.value;
        executeCommand(cmd);
        inputElement.value = "";
        historyIndex = -1;
        // Auto-switch to output on command execution
        switchTab("output");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        if (historyIndex >= 0) {
          inputElement.value = commandHistory[historyIndex];
        }
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        historyIndex = Math.max(historyIndex - 1, -1);
        if (historyIndex >= 0) {
          inputElement.value = commandHistory[historyIndex];
        } else {
          inputElement.value = "";
        }
      }
    });

    return consoleElement;
  }

  function switchTab(tabName) {
    activeTab = tabName;
    var allTabs = consoleElement.querySelectorAll(".console-tab");
    var allContent = consoleElement.querySelectorAll(".tab-content");

    allTabs.forEach(function(tab) {
      if (tab.getAttribute("data-tab") === tabName) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });

    allContent.forEach(function(content) {
      if (content.getAttribute("data-tab") === tabName) {
        content.classList.add("active");
      } else {
        content.classList.remove("active");
      }
    });

    // Auto-focus input when switching to console tab
    if (tabName === "console" && inputElement) {
      setTimeout(function() {
        inputElement.focus();
      }, 50);
    }
  }

  function toggleConsole() {
    if (consoleVisible) {
      hideConsole();
    } else {
      showConsole();
    }
  }

  function showConsole() {
    createConsoleUI();
    consoleElement.style.display = "flex";
    consoleVisible = true;
    localStorage.setItem(CONSOLE_VISIBLE_KEY, "1");
    switchTab("console");
    inputElement.focus();
    printLine("GameHub Admin Console - Type 'help' for commands", "info");
  }

  function hideConsole() {
    if (consoleElement) {
      consoleElement.style.display = "none";
    }
    consoleVisible = false;
    localStorage.setItem(CONSOLE_VISIBLE_KEY, "0");
  }

  function executeCommand(input) {
    var trimmed = input.trim();
    if (!trimmed) return;

    // Add to history
    commandHistory.unshift(trimmed);
    saveCommandHistory();

    // Print command
    printLine("> " + trimmed, "info");

    // Parse command
    var parts = trimmed.split(/\s+/);
    var cmd = parts[0].toLowerCase();
    var args = parts.slice(1);

    // Check if command exists
    if (!COMMANDS[cmd]) {
      printLine("Error: Unknown command '" + cmd + "'. Type 'help' for available commands.", "error");
      return;
    }

    var cmdDef = COMMANDS[cmd];

    // Check admin status
    if (cmdDef.adminOnly && !isAdmin) {
      printLine("Error: This command requires admin privileges.", "error");
      return;
    }

    // Execute command
    try {
      cmdDef.execute(args);
    } catch (error) {
      printLine("Error: " + (error.message || String(error)), "error");
    }
  }

  function printLine(text, type) {
    if (!outputElement) {
      createConsoleUI();
    }

    var line = document.createElement("div");
    line.className = "console-line " + (type || "");
    line.textContent = text;
    outputElement.appendChild(line);
    outputElement.scrollTop = outputElement.scrollHeight;
  }

  // Command implementations

  function cmdHelp(args) {
    printLine("Available Commands:", "info");
    printLine("", "info");
    Object.keys(COMMANDS).sort().forEach(function(name) {
      var cmd = COMMANDS[name];
      var prefix = cmd.adminOnly && !isAdmin ? "[ADMIN] " : "";
      printLine("  " + prefix + name + " - " + cmd.description, cmd.adminOnly ? "admin" : "info");
    });
    printLine("", "info");
    printLine("Hotkey: Ctrl+Shift+F (or Cmd+Shift+F on Mac)", "info");
    printLine("Switch between CONSOLE (input) and OUTPUT (results) tabs", "info");
  }

  function cmdClear(args) {
    if (outputElement) {
      outputElement.innerHTML = "";
    }
    printLine("Console cleared.", "success");
  }

  function cmdStatus(args) {
    printLine("=== Game Hub Status ===", "info");
    printLine("Admin: " + (isAdmin ? "YES" : "NO"), isAdmin ? "admin" : "info");
    printLine("User ID: " + (currentUserId || "Not signed in"), "info");
    printLine("Supabase: " + (supabaseClient ? "Connected" : "Not connected"), supabaseClient ? "success" : "warn");
    printLine("Page: " + window.location.href, "info");
    printLine("Time: " + new Date().toLocaleString(), "info");
  }

  function cmdUser(args) {
    if (window.activeAccountUser) {
      var user = window.activeAccountUser;
      printLine("User: " + (user.email || user.user_metadata?.username || "Unknown"), "info");
      printLine("ID: " + user.id, "info");
      printLine("Email: " + user.email, "info");
    } else {
      printLine("Not signed in.", "warn");
    }
  }

  function cmdFnaf(args) {
    if (!args.length) {
      printLine("Usage: fnaf [all|1|2|3|4|sl|ps|ucn|w] [unlock|lock|status]", "warn");
      printLine("Examples:", "info");
      printLine("  fnaf all unlock   - Unlock all FNAF games", "info");
      printLine("  fnaf 1 unlock     - Unlock FNAF 1", "info");
      printLine("  fnaf all status   - Show unlock status", "info");
      return;
    }

    var gameArg = args[0].toLowerCase();
    var action = (args[1] || "status").toLowerCase();

    var games = [];
    if (gameArg === "all") {
      games = ["1", "2", "3", "4", "sl", "ps", "ucn", "w"];
    } else if (["1", "2", "3", "4", "sl", "ps", "ucn", "w"].indexOf(gameArg) !== -1) {
      games = [gameArg];
    } else {
      printLine("Error: Unknown game '" + gameArg + "'. Valid: all, 1, 2, 3, 4, sl, ps, ucn, w", "error");
      return;
    }

    var unlocksData = {};
    try {
      unlocksData = JSON.parse(localStorage.getItem(FNAF_UNLOCKS_KEY) || "{}");
    } catch (e) {
      unlocksData = {};
    }

    games.forEach(function(game) {
      var gameId = "fnaf-" + game;
      if (action === "unlock") {
        unlocksData[gameId] = { unlocked: true, unlockedAt: new Date().toISOString(), unlockedBy: currentUserId };
        printLine("Unlocked: " + gameId, "success");
      } else if (action === "lock") {
        delete unlocksData[gameId];
        printLine("Locked: " + gameId, "success");
      } else {
        var status = unlocksData[gameId] ? "UNLOCKED" : "LOCKED";
        printLine(gameId + ": " + status, unlocksData[gameId] ? "success" : "warn");
      }
    });

    try {
      localStorage.setItem(FNAF_UNLOCKS_KEY, JSON.stringify(unlocksData));
    } catch (e) {
      printLine("Error saving unlocks to storage", "error");
    }
  }

  function cmdUnlock(args) {
    if (args.length < 1) {
      printLine("Usage: unlock [game|all] [feature]", "warn");
      return;
    }

    var target = args[0].toLowerCase();
    var feature = args[1] || "all";

    printLine("Unlocking " + target + ":" + feature, "success");
    cmdFnaf([target, "unlock"]);
  }

  function cmdLock(args) {
    if (args.length < 1) {
      printLine("Usage: lock [game|all] [feature]", "warn");
      return;
    }

    var target = args[0].toLowerCase();
    var feature = args[1] || "all";

    printLine("Locking " + target + ":" + feature, "success");
    cmdFnaf([target, "lock"]);
  }

  function cmdReset(args) {
    if (args.length < 1) {
      printLine("Usage: reset [game|all]", "warn");
      return;
    }

    var target = args[0].toLowerCase();
    if (target === "all") {
      localStorage.clear();
      printLine("All local storage cleared!", "success");
    } else {
      var keys = Object.keys(localStorage);
      keys.forEach(function(key) {
        if (key.indexOf(target) !== -1) {
          localStorage.removeItem(key);
        }
      });
      printLine("Reset data for " + target, "success");
    }
  }

  function cmdAdmin(args) {
    if (isAdmin) {
      printLine("You have ADMIN privileges", "admin");
      printLine("Admin commands available", "admin");
    } else {
      printLine("You do NOT have admin privileges", "warn");
      printLine("Contact administrator for access", "warn");
    }
  }

  function cmdCache(args) {
    var action = (args[0] || "show").toLowerCase();

    if (action === "clear") {
      localStorage.clear();
      sessionStorage.clear();
      printLine("Cache cleared", "success");
    } else if (action === "stats") {
      var storageSize = Object.keys(localStorage).reduce(function(total, key) {
        return total + (localStorage.getItem(key) || "").length;
      }, 0);

      printLine("Storage Stats:", "info");
      printLine("localStorage items: " + Object.keys(localStorage).length, "info");
      printLine("localStorage size: " + (storageSize / 1024).toFixed(2) + " KB", "info");
      printLine("sessionStorage items: " + Object.keys(sessionStorage).length, "info");
    } else {
      printLine("localStorage keys:", "info");
      Object.keys(localStorage).forEach(function(key) {
        var size = (localStorage.getItem(key) || "").length;
        printLine("  " + key + " (" + size + " bytes)", "info");
      });
    }
  }

  function cmdGame(args) {
    var action = (args[0] || "current").toLowerCase();

    if (action === "current") {
      var pathname = window.location.pathname;
      var gameMatch = pathname.match(/\/games\/([^\/]+)/);
      var gameId = gameMatch ? gameMatch[1] : "unknown";
      printLine("Current game: " + gameId, "info");
    } else if (action === "list") {
      printLine("Available games:", "info");
      printLine("  fnaf: 1, 2, 3, 4, sl, ps, ucn, w", "info");
      printLine("  minecraft: eaglercraft", "info");
      printLine("  retro-bowl, sweet-bakery, websie", "info");
    }
  }

  // Initialize on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initConsole);
  } else {
    initConsole();
  }

  // Re-check admin status periodically
  setInterval(checkAdminStatus, 30000);
})();
