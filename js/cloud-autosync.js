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

  var inFlight = false;
  var loadInFlight = false;
  var loadedUserId = "";
  var timer = null;
  var client = null;

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
        return false;
      }

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
        return false;
      }

      var applied = applyPayload(result.data.payload);
      loadedUserId = user.id;
      if (applied) {
        storageSet(CLOUD_LAST_SYNC_KEY, new Date().toISOString());
      }
      return applied;
    } catch (error) {
      return false;
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
    } catch (error) {
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (timer) {
      clearInterval(timer);
    }

    if (PULL_ON_START) {
      runCloudLoadOnce().finally(function () {
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

    window.addEventListener("pagehide", runCloudSync);
    window.addEventListener("beforeunload", runCloudSync);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        runCloudSync();
      }
    });
  }

  start();
})();
