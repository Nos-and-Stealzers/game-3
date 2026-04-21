(function () {
  var GAME_SAVES_KEY = "gamehub_game_saves";
  var HUB_PREFIX = "gamehub_";
  var SAVE_INTERVAL_MS = 1500;
  var SIGN_IN_REDIRECT_URL = "/account.html";
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

  function inferGameId() {
    var match = String(window.location.pathname || "").match(/\/games\/fnaf\/([^\/]+)\//i);
    if (!match) {
      return "";
    }

    var slug = String(match[1] || "").toLowerCase();
    var bySlug = {
      "1": "fnaf-1",
      "2": "fnaf-2",
      "3": "fnaf-3",
      "4": "fnaf-4",
      "w": "fnaf-world",
      "sl": "fnaf-sl",
      "ps": "fnaf-ps",
      "ucn": "fnaf-ucn"
    };

    return bySlug[slug] || ("fnaf-" + slug);
  }

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
      // ignore storage exceptions
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      // ignore storage exceptions
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

  function writeObject(key, value) {
    var safeValue = value || {};
    if (key === GAME_SAVES_KEY) {
      safeValue = normalizeGameSaveMap(safeValue);
    }
    storageSet(key, JSON.stringify(safeValue));
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

  function shouldTrackStorageKey(key) {
    if (typeof key !== "string" || key.indexOf(HUB_PREFIX) === 0) {
      return false;
    }
    if (/^sb-.*-auth-token$/i.test(key) || key === "supabase.auth.token") {
      return false;
    }
    return true;
  }

  function snapshotTrackedStorage() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!shouldTrackStorageKey(key)) {
          continue;
        }
        out[key] = localStorage.getItem(key);
      }
    } catch (error) {
      return {};
    }
    return out;
  }

  function applyImportedState(gameId) {
    var allSaves = normalizeGameSaveMap(readObject(GAME_SAVES_KEY));
    var canonicalId = getCanonicalGameSaveId(gameId);
    var gameSave = allSaves[canonicalId] || allSaves[gameId];

    if (!gameSave || typeof gameSave !== "object") {
      return;
    }

    var gameLocal = gameSave.localStorage;
    if (!gameLocal || typeof gameLocal !== "object" || Array.isArray(gameLocal)) {
      return;
    }

    Object.keys(gameLocal).forEach(function (key) {
      if (!shouldTrackStorageKey(key)) {
        return;
      }

      var value = gameLocal[key];
      if (value === null) {
        storageRemove(key);
      } else if (typeof value === "string") {
        storageSet(key, value);
      }
    });

    // Persist alias migration so cloud/local sync keeps one canonical key.
    writeObject(GAME_SAVES_KEY, allSaves);
  }

  function persistChanges(gameId, previousSnapshot) {
    var canonicalId = getCanonicalGameSaveId(gameId) || gameId;
    var currentSnapshot = snapshotTrackedStorage();
    var allKeys = {};

    Object.keys(previousSnapshot).forEach(function (key) {
      allKeys[key] = true;
    });
    Object.keys(currentSnapshot).forEach(function (key) {
      allKeys[key] = true;
    });

    var changedKeys = [];
    Object.keys(allKeys).forEach(function (key) {
      if (previousSnapshot[key] !== currentSnapshot[key]) {
        changedKeys.push(key);
      }
    });

    if (!changedKeys.length) {
      return currentSnapshot;
    }

    var allSaves = normalizeGameSaveMap(readObject(GAME_SAVES_KEY));
    var gameSave = allSaves[canonicalId];
    if (!gameSave || typeof gameSave !== "object" || Array.isArray(gameSave)) {
      gameSave = {};
    }

    var gameLocal = gameSave.localStorage;
    if (!gameLocal || typeof gameLocal !== "object" || Array.isArray(gameLocal)) {
      gameLocal = {};
    }

    changedKeys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(currentSnapshot, key)) {
        gameLocal[key] = null;
        return;
      }
      gameLocal[key] = currentSnapshot[key];
    });

    gameSave.localStorage = gameLocal;
    gameSave.updatedAt = new Date().toISOString();
    allSaves[canonicalId] = gameSave;
    writeObject(GAME_SAVES_KEY, allSaves);

    return currentSnapshot;
  }

  async function ensureSignedInUser() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      return null;
    }

    var cfg = window.__GAMEHUB_SUPABASE__ || {};
    if (!cfg.url || !cfg.anonKey) {
      window.location.replace(SIGN_IN_REDIRECT_URL);
      return null;
    }

    var client = window.__GAMEHUB_SIGNIN_CLIENT__;
    if (!client) {
      client = window.__GAMEHUB_SIGNIN_CLIENT__ = window.supabase.createClient(cfg.url, cfg.anonKey);
    }

    var auth = await client.auth.getUser();
    var user = auth && auth.data ? auth.data.user : null;
    if (!user) {
      window.location.replace(SIGN_IN_REDIRECT_URL);
      return null;
    }

    return user;
  }

  async function startFnafSaveSync(gameId) {
    var signedInUser = await ensureSignedInUser();
    if (!signedInUser) {
      return;
    }

    applyImportedState(gameId);

    var lastSnapshot = snapshotTrackedStorage();
    window.__GAMEHUB_GENERIC_SAVE_SYNC__ = {
      gameId: gameId,
      storageKey: GAME_SAVES_KEY
    };

    setInterval(function () {
      lastSnapshot = persistChanges(gameId, lastSnapshot);
    }, SAVE_INTERVAL_MS);

    window.addEventListener("beforeunload", function () {
      lastSnapshot = persistChanges(gameId, lastSnapshot);
    });

    window.addEventListener("pagehide", function () {
      lastSnapshot = persistChanges(gameId, lastSnapshot);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "hidden") {
        return;
      }
      lastSnapshot = persistChanges(gameId, lastSnapshot);
    });
  }

  var gameId = inferGameId();
  if (!gameId) {
    return;
  }

  startFnafSaveSync(gameId);
})();
