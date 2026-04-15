(function () {
  var GAME_SAVES_KEY = "gamehub_game_saves";
  var HUB_PREFIX = "gamehub_";
  var SAVE_INTERVAL_MS = 1500;

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
    storageSet(key, JSON.stringify(value || {}));
  }

  function shouldTrackStorageKey(key) {
    return typeof key === "string" && key.indexOf(HUB_PREFIX) !== 0;
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

    if ((!gameSave || typeof gameSave !== "object") && gameId === "fnaf-sl") {
      gameSave = allSaves["fnaf-sister-location"];
    }

    if ((!gameSave || typeof gameSave !== "object") && gameId === "fnaf-ps") {
      gameSave = allSaves["fnaf-pizzeria-simulator"];
    }

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
  window.__GAMEHUB_FNAF_SAVE_SYNC__ = {
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
