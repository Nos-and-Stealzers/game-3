(function () {
  var CLOUD_LAST_SYNC_KEY = "gamehub_cloud_last_sync";
  var SUPABASE_CONFIG_KEY = "gamehub_supabase_config";
  var FAVORITES_KEY = "gamehub_favorites";
  var RECENTS_KEY = "gamehub_recent";
  var THEME_KEY = "gamehub_theme";
  var FAST_MODE_KEY = "gamehub_fast_mode";
  var PERFORMANCE_PROFILE_KEY = "gamehub_performance_profile";
  var LIBRARY_VIEW_KEY = "gamehub_library_view";
  var OPEN_SOURCE_ONLY_KEY = "gamehub_open_source_only";
  var PLAYABLE_ONLY_KEY = "gamehub_playable_only";
  var GAME_SAVES_KEY = "gamehub_game_saves";
  var GAME_SAVE_ALIASES = {
    "fnaf-sl": ["fnaf-sister-location"],
    "fnaf-ps": ["fnaf-pizzeria-simulator"]
  };
  var GAME_SAVE_CANONICAL_BY_ALIAS = (function () {
    var out = {};
    Object.keys(GAME_SAVE_ALIASES).forEach(function (canonicalId) {
      out[canonicalId] = canonicalId;
      var aliases = GAME_SAVE_ALIASES[canonicalId] || [];
      for (var i = 0; i < aliases.length; i++) {
        out[aliases[i]] = canonicalId;
      }
    });
    return out;
  })();

  var SAVE_KEYS = [
    FAVORITES_KEY,
    RECENTS_KEY,
    THEME_KEY,
    FAST_MODE_KEY,
    PERFORMANCE_PROFILE_KEY,
    LIBRARY_VIEW_KEY,
    OPEN_SOURCE_ONLY_KEY,
    PLAYABLE_ONLY_KEY,
    GAME_SAVES_KEY,
    "gamehub_local_last_saved",
    CLOUD_LAST_SYNC_KEY
  ];

  var INDEXED_DB_SYNC_MAX_DATABASES = 6;
  var INDEXED_DB_SYNC_MAX_STORES_PER_DB = 12;
  var INDEXED_DB_SYNC_MAX_RECORDS_PER_STORE = 200;
  var INDEXED_DB_SYNC_MAX_VALUE_CHARS = 120000;

  var options = window.__GAMEHUB_CLOUD_SYNC_OPTIONS__ || {};
  var AUTOSYNC_INTERVAL_MS = (typeof options.intervalMs === "number" && options.intervalMs > 0)
    ? Math.floor(options.intervalMs)
    : 60000;
  var CAPTURE_INDEXED_DB = options.captureIndexedDb !== false;
  var RUN_ON_START = options.runOnStart !== false;
  var PULL_ON_START = options.pullOnStart !== false;
  var PAGEHIDE_ONLY = options.pagehideOnly === true;
  var RELOAD_AFTER_PULL = options.reloadAfterPull !== false;

  var inFlight = false;
  var loadInFlight = false;
  var loadedUserId = "";
  var timer = null;
  var client = null;
  var socialTimer = null;
  var socialInFlight = false;
  var TOAST_CONTAINER_ID = "gamehub-social-toasts";
  var FRIEND_MESSAGE_LAST_SEEN_KEY = "gamehub_friend_message_last_seen_at";
  var SOCIAL_POLL_INTERVAL_MS = 20000;
  var DIAG_OVERLAY_ID = "gamehub-diag-overlay";
  var DIAG_MAX_ITEMS = 120;
  var diagLogs = [];
  var diagVisible = false;

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
    }
  }

  function readArray(key) {
    try {
      var value = JSON.parse(storageGet(key));
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function readObject(key) {
    try {
      var value = JSON.parse(storageGet(key) || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
      }
      return value;
    } catch (error) {
      return {};
    }
  }

  function getCanonicalGameSaveId(gameId) {
    if (typeof gameId !== "string" || !gameId) {
      return "";
    }
    return GAME_SAVE_CANONICAL_BY_ALIAS[gameId] || gameId;
  }

  function sanitizeGameSaveEntry(gameSave) {
    if (!gameSave || typeof gameSave !== "object" || Array.isArray(gameSave)) {
      return null;
    }

    var localData = gameSave.localStorage;
    if (!localData || typeof localData !== "object" || Array.isArray(localData)) {
      return null;
    }

    var cleanLocalData = {};
    Object.keys(localData).forEach(function (key) {
      var value = localData[key];
      if (value === null || typeof value === "string") {
        cleanLocalData[key] = value;
      }
    });

    return {
      updatedAt: typeof gameSave.updatedAt === "string" ? gameSave.updatedAt : new Date().toISOString(),
      localStorage: cleanLocalData
    };
  }

  function normalizeGameSaveMap(rawGameSaves) {
    if (!rawGameSaves || typeof rawGameSaves !== "object" || Array.isArray(rawGameSaves)) {
      return {};
    }

    var out = {};
    Object.keys(rawGameSaves).forEach(function (gameId) {
      var canonicalId = getCanonicalGameSaveId(gameId);
      if (!canonicalId) {
        return;
      }

      var incoming = sanitizeGameSaveEntry(rawGameSaves[gameId]);
      if (!incoming) {
        return;
      }

      var existing = out[canonicalId];
      if (!existing) {
        out[canonicalId] = incoming;
        return;
      }

      var existingTime = Date.parse(existing.updatedAt || "") || 0;
      var incomingTime = Date.parse(incoming.updatedAt || "") || 0;
      var incomingWins = incomingTime >= existingTime;

      out[canonicalId] = {
        updatedAt: incomingWins ? incoming.updatedAt : existing.updatedAt,
        localStorage: incomingWins
          ? Object.assign({}, existing.localStorage, incoming.localStorage)
          : Object.assign({}, incoming.localStorage, existing.localStorage)
      };
    });

    return out;
  }

  function readSetting(key, fallback) {
    var value = storageGet(key);
    return value === null ? fallback : value;
  }

  function toJsonSafeValue(value, maxChars) {
    try {
      var json = JSON.stringify(value);
      if (typeof json !== "string" || json.length > maxChars) {
        return null;
      }
      return JSON.parse(json);
    } catch (error) {
      return null;
    }
  }

  function shouldSyncExtraLocalStorageKey(key) {
    if (typeof key !== "string" || !key) {
      return false;
    }
    if (SAVE_KEYS.indexOf(key) !== -1 || key === SUPABASE_CONFIG_KEY) {
      return false;
    }
    if (/^sb-.*-auth-token$/i.test(key) || key === "supabase.auth.token") {
      return false;
    }
    return true;
  }

  function snapshotExtraLocalStorage() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!shouldSyncExtraLocalStorageKey(key)) {
          continue;
        }
        var value = localStorage.getItem(key);
        if (typeof value === "string") {
          out[key] = value;
        }
      }
    } catch (error) {
      return out;
    }
    return out;
  }

  function isAuthTokenStorageKey(key) {
    return /^sb-.*-auth-token$/i.test(key) || key === "supabase.auth.token";
  }

  function snapshotAuthTokens() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!isAuthTokenStorageKey(key)) {
          continue;
        }
        var value = localStorage.getItem(key);
        if (typeof value === "string" && value) {
          out[key] = value;
        }
      }
    } catch (error) {
      return out;
    }
    return out;
  }

  function applyAuthTokens(authTokens) {
    if (!authTokens || typeof authTokens !== "object" || Array.isArray(authTokens)) {
      return;
    }
    Object.keys(authTokens).forEach(function (key) {
      if (!isAuthTokenStorageKey(key)) {
        return;
      }
      var value = authTokens[key];
      if (typeof value === "string" && value) {
        storageSet(key, value);
      }
    });
  }

  function snapshotSessionStorage() {
    var out = {};
    try {
      if (!window.sessionStorage) {
        return out;
      }
      for (var i = 0; i < sessionStorage.length; i++) {
        var key = sessionStorage.key(i);
        var value = sessionStorage.getItem(key);
        if (typeof key === "string" && key && typeof value === "string") {
          out[key] = value;
        }
      }
    } catch (error) {
      return out;
    }
    return out;
  }

  function applySessionStorage(sessionData) {
    if (!sessionData || typeof sessionData !== "object" || Array.isArray(sessionData)) {
      return;
    }
    try {
      if (!window.sessionStorage) {
        return;
      }
      Object.keys(sessionData).forEach(function (key) {
        var value = sessionData[key];
        if (typeof value === "string") {
          sessionStorage.setItem(key, value);
        }
      });
    } catch (error) {
    }
  }

  function snapshotCookies() {
    var out = {};
    try {
      var raw = document.cookie || "";
      if (!raw) {
        return out;
      }
      raw.split(";").forEach(function (part) {
        var section = part.trim();
        if (!section) {
          return;
        }
        var eqIndex = section.indexOf("=");
        if (eqIndex <= 0) {
          return;
        }
        var key = section.slice(0, eqIndex).trim();
        var value = section.slice(eqIndex + 1);
        if (key) {
          out[key] = value;
        }
      });
    } catch (error) {
      return out;
    }
    return out;
  }

  function applyCookies(cookies) {
    if (!cookies || typeof cookies !== "object" || Array.isArray(cookies)) {
      return;
    }
    Object.keys(cookies).forEach(function (key) {
      var value = cookies[key];
      if (typeof key !== "string" || !key || typeof value !== "string") {
        return;
      }
      try {
        document.cookie = key + "=" + value + "; path=/; max-age=2592000; SameSite=Lax";
      } catch (error) {
      }
    });
  }

  function ensureToastHost() {
    var host = document.getElementById(TOAST_CONTAINER_ID);
    if (host) {
      return host;
    }

    host = document.createElement("div");
    host.id = TOAST_CONTAINER_ID;
    host.style.position = "fixed";
    host.style.right = "16px";
    host.style.bottom = "16px";
    host.style.zIndex = "2147483647";
    host.style.display = "grid";
    host.style.gap = "8px";
    host.style.pointerEvents = "none";
    host.style.maxWidth = "min(360px, calc(100vw - 32px))";
    document.body.appendChild(host);
    return host;
  }

  function showToast(title, body) {
    var host = ensureToastHost();
    var toast = document.createElement("div");
    toast.style.pointerEvents = "auto";
    toast.style.border = "1px solid rgba(130, 160, 220, 0.45)";
    toast.style.borderRadius = "14px";
    toast.style.background = "rgba(16, 24, 38, 0.96)";
    toast.style.color = "#fff";
    toast.style.boxShadow = "0 18px 32px rgba(0, 0, 0, 0.28)";
    toast.style.padding = "12px 14px";
    toast.style.backdropFilter = "blur(10px)";
    toast.style.display = "grid";
    toast.style.gap = "4px";

    var titleEl = document.createElement("div");
    titleEl.style.fontWeight = "800";
    titleEl.style.fontSize = "0.92rem";
    titleEl.textContent = title;

    var bodyEl = document.createElement("div");
    bodyEl.style.fontSize = "0.84rem";
    bodyEl.style.lineHeight = "1.4";
    bodyEl.style.color = "rgba(255, 255, 255, 0.88)";
    bodyEl.textContent = body;

    toast.appendChild(titleEl);
    toast.appendChild(bodyEl);
    host.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode === host) {
        host.removeChild(toast);
      }
      if (!host.children.length && host.parentNode) {
        host.parentNode.removeChild(host);
      }
    }, 7000);
  }

  function addDiagLog(level, message) {
    var text = String(message || "").trim();
    if (!text) {
      return;
    }
    diagLogs.push({
      level: level,
      message: text,
      at: new Date().toISOString()
    });
    if (diagLogs.length > DIAG_MAX_ITEMS) {
      diagLogs.shift();
    }
    renderDiagOverlay();
  }

  function ensureDiagOverlay() {
    var root = document.getElementById(DIAG_OVERLAY_ID);
    if (root) {
      return root;
    }

    var style = document.createElement("style");
    style.textContent = "" +
      "#" + DIAG_OVERLAY_ID + "{position:fixed;inset:8px;display:none;z-index:2147483646;background:rgba(8,10,14,.96);color:#eaf0ff;border:1px solid rgba(99,118,161,.62);border-radius:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}" +
      "#" + DIAG_OVERLAY_ID + ".show{display:grid;grid-template-rows:auto 1fr}" +
      "#" + DIAG_OVERLAY_ID + " .head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(99,118,161,.42)}" +
      "#" + DIAG_OVERLAY_ID + " .title{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b8c8ef}" +
      "#" + DIAG_OVERLAY_ID + " .hint{font-size:11px;color:#96a6cc}" +
      "#" + DIAG_OVERLAY_ID + " .body{overflow:auto;padding:10px 12px;display:grid;gap:6px}" +
      "#" + DIAG_OVERLAY_ID + " .item{border:1px solid rgba(88,103,136,.45);border-left:3px solid #7d8fb7;background:rgba(18,23,33,.92);border-radius:8px;padding:7px 8px;line-height:1.35;font-size:12px;white-space:pre-wrap;word-break:break-word}" +
      "#" + DIAG_OVERLAY_ID + " .item.warn{border-left-color:#f0b23d}" +
      "#" + DIAG_OVERLAY_ID + " .item.error{border-left-color:#ff6f6f}";
    document.head.appendChild(style);

    root = document.createElement("section");
    root.id = DIAG_OVERLAY_ID;
    root.innerHTML = "" +
      '<div class="head">' +
      '<div>' +
      '<div class="title">School Chromebook Diagnostics</div>' +
      '<div class="hint">Ctrl+Shift+F to toggle · Captures errors and warnings</div>' +
      '</div>' +
      '<button type="button" id="gamehubDiagClose" style="background:#1f2738;border:1px solid rgba(99,118,161,.55);color:#dce7ff;border-radius:7px;padding:4px 8px;cursor:pointer">Close</button>' +
      '</div>' +
      '<div class="body" id="gamehubDiagBody"></div>';
    document.body.appendChild(root);

    var closeBtn = document.getElementById("gamehubDiagClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        diagVisible = false;
        renderDiagOverlay();
      });
    }
    return root;
  }

  function renderDiagOverlay() {
    var root = ensureDiagOverlay();
    var body = document.getElementById("gamehubDiagBody");
    if (!root || !body) {
      return;
    }
    root.classList.toggle("show", diagVisible);
    window.__GAMEHUB_DIAG_OVERLAY_ACTIVE__ = diagVisible;
    if (!diagVisible) {
      return;
    }

    if (!diagLogs.length) {
      body.innerHTML = '<div class="item">No warnings/errors captured yet.</div>';
      return;
    }

    body.innerHTML = diagLogs.slice().reverse().map(function (entry) {
      var stamp = new Date(entry.at).toLocaleTimeString();
      var safe = String(entry.message)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return '<div class="item ' + entry.level + '">[' + stamp + '] ' + entry.level.toUpperCase() + '\n' + safe + '</div>';
    }).join("");
  }

  function installDiagnosticsOverlay() {
    if (window.__GAMEHUB_DIAG_OVERLAY_INSTALLED__) {
      return;
    }
    window.__GAMEHUB_DIAG_OVERLAY_INSTALLED__ = true;

    var originalWarn = console.warn;
    var originalError = console.error;
    console.warn = function () {
      try { addDiagLog("warn", Array.prototype.slice.call(arguments).map(String).join(" ")); } catch (_error) {}
      return originalWarn.apply(console, arguments);
    };
    console.error = function () {
      try { addDiagLog("error", Array.prototype.slice.call(arguments).map(String).join(" ")); } catch (_error) {}
      return originalError.apply(console, arguments);
    };

    window.addEventListener("error", function (event) {
      var msg = event && (event.message || (event.error && event.error.message)) ? (event.message || event.error.message) : "Unhandled error";
      addDiagLog("error", String(msg));
    });
    window.addEventListener("unhandledrejection", function (event) {
      var reason = event && event.reason;
      var msg = reason && reason.message ? reason.message : String(reason || "Unhandled rejection");
      addDiagLog("warn", msg);
    });

    document.addEventListener("keydown", function (event) {
      var key = (event.key || "").toLowerCase();
      if (key !== "f" || !event.ctrlKey || !event.shiftKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      diagVisible = !diagVisible;
      renderDiagOverlay();
    }, true);
  }

  function inferCurrentGameContext() {
    var current = window.__GAMEHUB_CURRENT_GAME__ || {};
    if (current && typeof current === "object") {
      return {
        gameId: typeof current.id === "string" ? current.id : "",
        gameTitle: typeof current.title === "string" ? current.title : (typeof current.name === "string" ? current.name : "")
      };
    }

    var path = String(window.location.pathname || "").toLowerCase();
    var gameId = "";
    if (/\/snow-rider\.html$/i.test(path)) {
      gameId = "snow-rider";
    } else if (/\/games\/sweet-bakery\/index\.html$/i.test(path)) {
      gameId = "sweet-bakery";
    } else if (/\/games\/minecraft\/eaglercraft\/index\.html$/i.test(path)) {
      gameId = "minecraft-eaglercraft";
    } else if (/\/games\/fnaf\//i.test(path)) {
      var parts = path.split("/");
      gameId = parts.length > 2 ? parts[parts.length - 2] || parts[parts.length - 1] : "fnaf";
    }

    return {
      gameId: gameId,
      gameTitle: String(document.title || "").trim()
    };
  }

  async function syncMyPresence(supabaseClient, user) {
    if (!supabaseClient || !user || !user.id || typeof supabaseClient.rpc !== "function") {
      return;
    }

    var context = inferCurrentGameContext();
    var isHidden = document.visibilityState === "hidden";
    var isFocused = typeof document.hasFocus === "function" ? document.hasFocus() : true;
    var presenceStatus = "online";

    if (isHidden) {
      presenceStatus = "background";
    } else if (!isFocused) {
      presenceStatus = "away";
    } else if (context.gameTitle) {
      presenceStatus = "playing";
    }

    try {
      await supabaseClient.rpc("upsert_my_presence", {
        current_game_id: context.gameId || null,
        current_game_title: context.gameTitle || null,
        status: presenceStatus,
        message_opt_in: true
      });
    } catch (error) {
    }
  }

  function getFriendMessageCursor() {
    var raw = storageGet(FRIEND_MESSAGE_LAST_SEEN_KEY);
    var time = Date.parse(raw || "");
    return isNaN(time) ? 0 : time;
  }

  function setFriendMessageCursor(timeValue) {
    if (!timeValue) {
      return;
    }
    storageSet(FRIEND_MESSAGE_LAST_SEEN_KEY, new Date(timeValue).toISOString());
  }

  async function pollUnreadFriendMessages(supabaseClient, user) {
    if (!supabaseClient || !user || !user.id || typeof supabaseClient.rpc !== "function") {
      return;
    }

    try {
      var result = await supabaseClient.rpc("list_my_unread_friend_messages", { limit_count: 10 });
      if (result && result.error) {
        return;
      }

      var rows = Array.isArray(result && result.data) ? result.data : [];
      if (!rows.length) {
        return;
      }

      var lastSeen = getFriendMessageCursor();
      var newestSeen = lastSeen;

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i] || {};
        var createdAt = Date.parse(row.created_at || "") || 0;
        if (!createdAt || createdAt <= lastSeen) {
          continue;
        }

        var senderName = String(row.sender_display_name || row.sender_email || "Friend");
        var senderGame = String(row.sender_current_game_title || "").trim();
        var body = String(row.body || "").trim();
        var title = senderGame ? (senderName + " · " + senderGame) : senderName;
        showToast(title, body || "New friend message received.");

        newestSeen = Math.max(newestSeen, createdAt);
        if (row.message_id) {
          try {
            await supabaseClient.rpc("mark_friend_message_read", { message_id: row.message_id });
          } catch (markError) {
          }
        }
      }

      if (newestSeen > lastSeen) {
        setFriendMessageCursor(newestSeen);
      }
    } catch (error) {
    }
  }

  async function runSocialSync() {
    if (socialInFlight) {
      return;
    }

    var supabaseClient = await getSupabaseClient();
    if (!supabaseClient) {
      return;
    }

    socialInFlight = true;
    try {
      var auth = await supabaseClient.auth.getUser();
      var user = auth && auth.data ? auth.data.user : null;
      if (!user) {
        return;
      }

      await syncMyPresence(supabaseClient, user);
      await pollUnreadFriendMessages(supabaseClient, user);
    } catch (error) {
    } finally {
      socialInFlight = false;
    }
  }

  function applyExtraLocalStorage(extraLocalStorage) {
    if (!extraLocalStorage || typeof extraLocalStorage !== "object" || Array.isArray(extraLocalStorage)) {
      return;
    }
    Object.keys(extraLocalStorage).forEach(function (key) {
      if (!shouldSyncExtraLocalStorageKey(key)) {
        return;
      }
      var value = extraLocalStorage[key];
      if (typeof value === "string") {
        storageSet(key, value);
      }
    });
  }

  function shouldSyncIndexedDbName(name) {
    if (typeof name !== "string" || !name) {
      return false;
    }
    if (/supabase|firebase|auth|workbox|service ?worker|cache/i.test(name)) {
      return false;
    }
    return true;
  }

  function getIndexedDbDatabaseList() {
    try {
      if (!window.indexedDB || typeof window.indexedDB.databases !== "function") {
        return Promise.resolve([]);
      }
      return window.indexedDB.databases().then(function (list) {
        return Array.isArray(list) ? list : [];
      }).catch(function () {
        return [];
      });
    } catch (error) {
      return Promise.resolve([]);
    }
  }

  function openIndexedDb(name, version) {
    return new Promise(function (resolve, reject) {
      var request;
      try {
        request = (typeof version === "number" && version > 0)
          ? window.indexedDB.open(name, version)
          : window.indexedDB.open(name);
      } catch (error) {
        reject(error);
        return;
      }

      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("Unable to open IndexedDB"));
      };
    });
  }

  function readIndexedDbStoreSnapshot(db, storeName) {
    return new Promise(function (resolve, reject) {
      var tx;
      try {
        tx = db.transaction(storeName, "readonly");
      } catch (error) {
        resolve(null);
        return;
      }

      var store = tx.objectStore(storeName);
      var out = {
        keyPath: typeof store.keyPath === "string" ? store.keyPath : null,
        autoIncrement: store.autoIncrement === true,
        records: []
      };

      var cursorRequest = store.openCursor();
      cursorRequest.onsuccess = function () {
        var cursor = cursorRequest.result;
        if (!cursor) {
          resolve(out);
          return;
        }

        if (out.records.length >= INDEXED_DB_SYNC_MAX_RECORDS_PER_STORE) {
          resolve(out);
          return;
        }

        var safeValue = toJsonSafeValue(cursor.value, INDEXED_DB_SYNC_MAX_VALUE_CHARS);
        var safeKey = toJsonSafeValue(cursor.key, 4000);
        if (safeValue !== null && safeKey !== null) {
          out.records.push({ key: safeKey, value: safeValue });
        }
        cursor.continue();
      };
      cursorRequest.onerror = function () {
        reject(cursorRequest.error || new Error("Unable to read IndexedDB store"));
      };
    });
  }

  async function snapshotIndexedDb() {
    if (!window.indexedDB) {
      return {};
    }

    var out = {};
    var dbList = await getIndexedDbDatabaseList();
    var names = dbList
      .map(function (db) { return db && typeof db.name === "string" ? db.name : ""; })
      .filter(function (name) { return shouldSyncIndexedDbName(name); })
      .slice(0, INDEXED_DB_SYNC_MAX_DATABASES);

    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var info = dbList.find(function (db) { return db && db.name === name; }) || {};
      var version = typeof info.version === "number" && info.version > 0 ? Math.floor(info.version) : 1;
      var db = null;
      try {
        db = await openIndexedDb(name, version);
        var storeNames = Array.from(db.objectStoreNames || []).slice(0, INDEXED_DB_SYNC_MAX_STORES_PER_DB);
        var stores = {};
        for (var s = 0; s < storeNames.length; s++) {
          var storeName = storeNames[s];
          var storeSnapshot = await readIndexedDbStoreSnapshot(db, storeName);
          if (storeSnapshot) {
            stores[storeName] = storeSnapshot;
          }
        }
        if (Object.keys(stores).length > 0) {
          out[name] = { version: version, stores: stores };
        }
      } catch (error) {
      } finally {
        if (db) {
          db.close();
        }
      }
    }

    return out;
  }

  function getSupabaseConfig() {
    var cfg = window.__GAMEHUB_SUPABASE__ || {};
    var localCfg = {};
    try {
      localCfg = JSON.parse(storageGet(SUPABASE_CONFIG_KEY) || "{}") || {};
    } catch (error) {
      localCfg = {};
    }

    var localUrl = typeof localCfg.url === "string" ? localCfg.url.trim() : "";
    var localAnon = typeof localCfg.anonKey === "string" ? localCfg.anonKey.trim() : "";
    var fileUrl = typeof cfg.url === "string" ? cfg.url.trim() : "";
    var fileAnon = typeof cfg.anonKey === "string" ? cfg.anonKey.trim() : "";

    return {
      url: localUrl || fileUrl,
      anonKey: localAnon || fileAnon
    };
  }

  async function getSupabaseClient() {
    if (client) {
      return client;
    }
    if (!(window.supabase && typeof window.supabase.createClient === "function")) {
      return null;
    }
    var cfg = getSupabaseConfig();
    if (!cfg.url || !cfg.anonKey) {
      return null;
    }
    client = window.supabase.createClient(cfg.url, cfg.anonKey);
    return client;
  }

  async function buildPayload() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        favorites: readArray(FAVORITES_KEY),
        recent: readArray(RECENTS_KEY),
        theme: readSetting(THEME_KEY, "light"),
        fastMode: readSetting(FAST_MODE_KEY, "0"),
        performanceProfile: readSetting(PERFORMANCE_PROFILE_KEY, "normal"),
        libraryView: readSetting(LIBRARY_VIEW_KEY, "cards"),
        openSourceOnly: readSetting(OPEN_SOURCE_ONLY_KEY, "0"),
        playableOnly: readSetting(PLAYABLE_ONLY_KEY, "0"),
        cloudAutoSync: "1",
        gameSaves: normalizeGameSaveMap(readObject(GAME_SAVES_KEY)),
        extraLocalStorage: snapshotExtraLocalStorage(),
        authTokens: snapshotAuthTokens(),
        sessionStorage: snapshotSessionStorage(),
        cookies: snapshotCookies(),
        indexedDb: CAPTURE_INDEXED_DB ? await snapshotIndexedDb() : {}
      }
    };
  }

  function writeArray(key, value) {
    storageSet(key, JSON.stringify(Array.isArray(value) ? value : []));
  }

  function writeObject(key, value) {
    var safeValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    if (key === GAME_SAVES_KEY) {
      safeValue = normalizeGameSaveMap(safeValue);
    }
    storageSet(key, JSON.stringify(safeValue));
  }

  function applyPayload(payload) {
    if (!payload || typeof payload !== "object" || !payload.data || typeof payload.data !== "object") {
      return false;
    }

    var data = payload.data;
    writeArray(FAVORITES_KEY, Array.isArray(data.favorites) ? data.favorites : []);
    writeArray(RECENTS_KEY, Array.isArray(data.recent) ? data.recent : []);
    storageSet(THEME_KEY, typeof data.theme === "string" ? data.theme : "light");
    storageSet(FAST_MODE_KEY, data.fastMode === "1" ? "1" : "0");
    storageSet(PERFORMANCE_PROFILE_KEY, (data.performanceProfile === "quick" || data.performanceProfile === "turbo") ? data.performanceProfile : "normal");
    storageSet(LIBRARY_VIEW_KEY, ["cards", "grouped", "platform", "compact"].indexOf(data.libraryView) !== -1 ? data.libraryView : "cards");
    storageSet(OPEN_SOURCE_ONLY_KEY, data.openSourceOnly === "1" ? "1" : "0");
    storageSet(PLAYABLE_ONLY_KEY, data.playableOnly === "1" ? "1" : "0");
    writeObject(GAME_SAVES_KEY, data.gameSaves);
    applyExtraLocalStorage(data.extraLocalStorage);
    applyAuthTokens(data.authTokens);
    applySessionStorage(data.sessionStorage);
    applyCookies(data.cookies);
    return true;
  }

  function snapshotLocalStorage() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (typeof key === "string") {
          out[key] = localStorage.getItem(key);
        }
      }
    } catch (error) {
      return out;
    }
    return out;
  }

  function storageSignature(snapshot) {
    var keys = Object.keys(snapshot || {}).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      parts.push(key + "\u0000" + String(snapshot[key]));
    }
    return parts.join("\u0001");
  }

  async function runCloudLoadOnce() {
    if (loadInFlight) {
      return false;
    }

    var supabaseClient = await getSupabaseClient();
    if (!supabaseClient) {
      return false;
    }

    loadInFlight = true;
    try {
      var auth = await supabaseClient.auth.getUser();
      var user = auth && auth.data ? auth.data.user : null;
      if (!user) {
        loadedUserId = "";
        return false;
      }
      if (loadedUserId === user.id) {
        return {
          applied: false,
          storageChanged: false
        };
      }

      var beforeStorage = snapshotLocalStorage();

      var result = await supabaseClient
        .from("user_saves")
        .select("payload")
        .eq("user_id", user.id)
        .maybeSingle();

      if (result && result.error) {
        return false;
      }
      if (!result || !result.data || !result.data.payload) {
        loadedUserId = user.id;
        return {
          applied: false,
          storageChanged: false
        };
      }

      var applied = applyPayload(result.data.payload);
      var afterStorage = snapshotLocalStorage();
      var storageChanged = storageSignature(beforeStorage) !== storageSignature(afterStorage);
      loadedUserId = user.id;
      if (applied) {
        storageSet(CLOUD_LAST_SYNC_KEY, new Date().toISOString());
      }
      syncMyPresence(supabaseClient, user);
      pollUnreadFriendMessages(supabaseClient, user);
      return {
        applied: applied,
        storageChanged: storageChanged
      };
    } catch (error) {
      return {
        applied: false,
        storageChanged: false
      };
    } finally {
      loadInFlight = false;
    }
  }

  async function runCloudSync() {
    if (inFlight) {
      return;
    }

    var supabaseClient = await getSupabaseClient();
    if (!supabaseClient) {
      return;
    }

    inFlight = true;
    try {
      var auth = await supabaseClient.auth.getUser();
      var user = auth && auth.data ? auth.data.user : null;
      if (!user) {
        return;
      }

      var payload = await buildPayload();
      var result = await supabaseClient
        .from("user_saves")
        .upsert({ user_id: user.id, payload: payload }, { onConflict: "user_id" });

      if (result && result.error) {
        throw result.error;
      }

      storageSet(CLOUD_LAST_SYNC_KEY, new Date().toISOString());
      await syncMyPresence(supabaseClient, user);
    } catch (error) {
    } finally {
      inFlight = false;
    }
  }

  function start() {
    window.__GAMEHUB_SOCIAL_SYNC_ACTIVE__ = true;
    installDiagnosticsOverlay();

    if (timer) {
      clearInterval(timer);
    }

    if (PULL_ON_START) {
      runCloudLoadOnce().then(function (result) {
        if (result && result.storageChanged && RELOAD_AFTER_PULL) {
          window.location.reload();
          return;
        }
        if (RUN_ON_START) {
          runCloudSync();
        }
      });
    } else if (RUN_ON_START) {
      runCloudSync();
    }

    if (!PAGEHIDE_ONLY) {
      timer = setInterval(runCloudSync, AUTOSYNC_INTERVAL_MS);
    }

    socialTimer = setInterval(runSocialSync, SOCIAL_POLL_INTERVAL_MS);
    runSocialSync();

    window.addEventListener("pagehide", runCloudSync);
    window.addEventListener("beforeunload", runCloudSync);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        runCloudSync();
        runSocialSync();
      }
    });
  }

  start();
})();
