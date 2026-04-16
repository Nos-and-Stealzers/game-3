(function () {
  var GAME_SAVES_KEY = "gamehub_game_saves";
  var HUB_PREFIX = "gamehub_";
  var SAVE_INTERVAL_MS = 1500;

  function inferGameId() {
    var path = String(window.location.pathname || "").toLowerCase();

    if (/\/games\/fnaf\//i.test(path)) {
      return "";
    }

    if (/\/snow-rider\.html$/i.test(path)) {
      return "snow-rider";
    }

    if (/\/games\/sweet-bakery\/index\.html$/i.test(path)) {
      return "sweet-bakery-local";
    }

    if (/\/games\/mini\/parkcore\/index\.html$/i.test(path)) {
      return "parkcore-sprint";
    }

    if (/\/games\/mini\/tower-defense\/index\.html$/i.test(path)) {
      return "tower-defense-grid";
    }

    if (/\/games\/minecraft\/eaglercraft\/index\.html$/i.test(path)) {
      return "minecraft-eaglercraft";
    }

    return "";
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
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
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
    var safeValue = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    storageSet(key, JSON.stringify(safeValue));
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
    var allSaves = readObject(GAME_SAVES_KEY);
    var gameSave = allSaves[gameId];
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
  }

  function persistChanges(gameId, previousSnapshot) {
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

    var allSaves = readObject(GAME_SAVES_KEY);
    var gameSave = allSaves[gameId];
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
    allSaves[gameId] = gameSave;
    writeObject(GAME_SAVES_KEY, allSaves);

    return currentSnapshot;
  }

  var gameId = inferGameId();
  if (!gameId) {
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
})();
