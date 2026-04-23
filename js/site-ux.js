(function () {
  var TOS_KEY = "gamehub_tos_accepted_at";
  var SUPABASE_CONFIG_KEY = "gamehub_supabase_config";
  var DOCK_ID = "gamehub-site-ux-dock";
  var PLAYERS_BUTTON_ID = "gamehub-site-ux-players-btn";
  var TERMS_BUTTON_ID = "gamehub-site-ux-terms-btn";
  var PLAYERS_PANEL_ID = "gamehub-site-ux-players-panel";
  var PLAYERS_BODY_ID = "gamehub-site-ux-players-body";
  var PLAYERS_STATUS_ID = "gamehub-site-ux-players-status";
  var PLAYERS_COUNT_ID = "gamehub-site-ux-players-count";
  var TERMS_OVERLAY_ID = "gamehub-site-ux-terms-overlay";
  var TERMS_CHECK_ID = "gamehub-site-ux-terms-check";
  var TERMS_ACCEPT_ID = "gamehub-site-ux-terms-accept";
  var TERMS_STATUS_ID = "gamehub-site-ux-terms-status";
  var TERMS_LINK_ID = "gamehub-site-ux-terms-link";
  var MAX_PLAYERS = 120;
  var accepted = false;
  var termsPromise = null;
  var termsResolve = null;
  var playersVisible = false;
  var playersRefreshTimer = null;
  var playersClient = null;
  var playersRole = "";
  var playersAllowed = false;
  var playersState = {
    loaded: false,
    count: null,
    rows: [],
    error: ""
  };
  var originalBodyOverflow = "";

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_error) {
    }
  }

  function hasAcceptedTerms() {
    return !!storageGet(TOS_KEY);
  }

  function setAcceptedTerms() {
    var stamp = new Date().toISOString();
    storageSet(TOS_KEY, stamp);
    accepted = true;
    if (typeof window !== "undefined") {
      window.__GAMEHUB_TOS_ACCEPTED__ = true;
    }
    hideTermsOverlay();
    ensureDock();
    updateDockVisibility();
    refreshPlayersPanel();
    startPlayersRefreshLoop();
    if (termsResolve) {
      termsResolve(true);
      termsResolve = null;
      termsPromise = null;
    }
  }

  function ensureTermsPromise() {
    if (accepted) {
      return Promise.resolve(true);
    }
    if (termsPromise) {
      return termsPromise;
    }
    showTermsOverlay();
    termsPromise = new Promise(function (resolve) {
      termsResolve = resolve;
    });
    return termsPromise;
  }

  function makeEl(tag, attrs, children) {
    var el = document.createElement(tag);
    var key;
    if (attrs && typeof attrs === "object") {
      for (key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
          el.setAttribute(key, attrs[key]);
        }
      }
    }
    if (children && children.length) {
      children.forEach(function (child) {
        if (typeof child === "string") {
          el.appendChild(document.createTextNode(child));
        } else if (child) {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  function ensureStyles() {
    if (document.getElementById("gamehub-site-ux-styles")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "gamehub-site-ux-styles";
    style.textContent = "" +
      "#" + DOCK_ID + "{position:fixed;left:14px;bottom:14px;z-index:2147483646;display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
      "#" + DOCK_ID + " .ux-btn{appearance:none;border:1px solid rgba(99,118,161,.65);background:rgba(14,20,31,.94);color:#ecf2ff;border-radius:999px;padding:10px 14px;font:700 12px/1.1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.2)}" +
      "#" + DOCK_ID + " .ux-btn:hover{background:rgba(24,31,44,.96)}" +
      "#" + DOCK_ID + " .ux-btn.secondary{background:rgba(255,255,255,.94);color:#20304f;border-color:#c9d5ef}" +
      "#" + DOCK_ID + " .ux-chip{border-radius:999px;padding:7px 10px;border:1px solid rgba(99,118,161,.45);background:rgba(255,255,255,.9);color:#1e2b48;font:700 11px/1.1 ui-sans-serif,system-ui,sans-serif}" +
      "#" + PLAYERS_PANEL_ID + "{position:fixed;left:14px;bottom:66px;z-index:2147483646;width:min(460px,calc(100vw - 28px));max-height:min(72vh,680px);display:none;grid-template-rows:auto auto 1fr;background:rgba(10,14,21,.98);color:#eaf0ff;border:1px solid rgba(99,118,161,.62);border-radius:16px;box-shadow:0 18px 44px rgba(0,0,0,.34);overflow:hidden;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}" +
      "#" + PLAYERS_PANEL_ID + ".show{display:grid}" +
      "#" + PLAYERS_PANEL_ID + " .head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;border-bottom:1px solid rgba(99,118,161,.35)}" +
      "#" + PLAYERS_PANEL_ID + " .title{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b8c8ef}" +
      "#" + PLAYERS_PANEL_ID + " .subtitle{font-size:11px;color:#93a8d2}" +
      "#" + PLAYERS_PANEL_ID + " .body{overflow:auto;padding:10px 12px;display:grid;gap:8px}" +
      "#" + PLAYERS_PANEL_ID + " .row{border:1px solid rgba(88,103,136,.35);border-left:3px solid #5f8cff;background:rgba(18,23,33,.92);border-radius:10px;padding:8px 10px;display:grid;gap:4px}" +
      "#" + PLAYERS_PANEL_ID + " .row .name{font-weight:700;font-size:13px}" +
      "#" + PLAYERS_PANEL_ID + " .row .meta{font-size:11px;color:#aab9da;display:flex;gap:8px;flex-wrap:wrap}" +
      "#" + PLAYERS_PANEL_ID + " .row .game{font-size:12px;color:#eef4ff}" +
      "#" + PLAYERS_PANEL_ID + " .empty{border:1px dashed rgba(109,125,160,.55);border-radius:10px;padding:12px;color:#9db0d7;background:rgba(21,27,38,.75);font-size:12px}" +
      "#" + PLAYERS_PANEL_ID + " .actions{display:flex;gap:8px;flex-wrap:wrap}" +
      "#" + PLAYERS_PANEL_ID + " .action{border:1px solid rgba(99,118,161,.55);background:#182033;color:#dce7ff;border-radius:8px;padding:5px 8px;font:700 11px/1.1 inherit;cursor:pointer}" +
      "#" + TERMS_OVERLAY_ID + "{position:fixed;inset:0;z-index:2147483647;display:none;place-items:center;background:rgba(7,10,16,.78);backdrop-filter:blur(5px);padding:18px}" +
      "#" + TERMS_OVERLAY_ID + ".show{display:grid}" +
      "#" + TERMS_OVERLAY_ID + " .card{width:min(760px,100%);max-height:min(82vh,780px);overflow:auto;background:#fdfdfd;color:#182037;border:1px solid #d9e3f5;border-radius:18px;box-shadow:0 20px 48px rgba(0,0,0,.35);padding:20px}" +
      "#" + TERMS_OVERLAY_ID + " h1{margin:0 0 10px;font:700 clamp(1.6rem,3vw,2.4rem)/1.05 ui-sans-serif,system-ui,sans-serif}" +
      "#" + TERMS_OVERLAY_ID + " p{margin:0 0 10px;color:#4d5f7e;line-height:1.55;font:500 14px/1.55 ui-sans-serif,system-ui,sans-serif}" +
      "#" + TERMS_OVERLAY_ID + " .small{font-size:12px;color:#66789d}" +
      "#" + TERMS_OVERLAY_ID + " .box{margin:14px 0;padding:12px;border:1px solid #dfe7f7;border-radius:14px;background:#f7faff}" +
      "#" + TERMS_OVERLAY_ID + " .check{display:flex;gap:10px;align-items:flex-start;margin-top:10px}" +
      "#" + TERMS_OVERLAY_ID + " .check input{margin-top:4px}" +
      "#" + TERMS_OVERLAY_ID + " .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}" +
      "#" + TERMS_OVERLAY_ID + " .btn{appearance:none;border:1px solid #c5d2ea;background:#eef4ff;color:#17315a;border-radius:10px;padding:10px 14px;font:700 13px/1.1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}" +
      "#" + TERMS_OVERLAY_ID + " .btn.primary{background:#0a67ff;border-color:#0a67ff;color:#fff}" +
      "#" + TERMS_OVERLAY_ID + " .btn:disabled{opacity:.55;cursor:not-allowed}" +
      "#" + TERMS_OVERLAY_ID + " .status{margin-top:10px;font-size:12px;color:#7a5630}";
    document.head.appendChild(style);
  }

  function ensureTermsOverlay() {
    var overlay = document.getElementById(TERMS_OVERLAY_ID);
    if (overlay) {
      return overlay;
    }

    overlay = document.createElement("section");
    overlay.id = TERMS_OVERLAY_ID;
    overlay.innerHTML = "" +
      '<article class="card" role="dialog" aria-modal="true" aria-labelledby="gamehub-terms-title">' +
      '<h1 id="gamehub-terms-title">Terms of Service</h1>' +
      '<p>You must accept the site terms before using this hub. The summary below matches the full terms page.</p>' +
      '<div class="box">' +
      '<p><strong>Use responsibly.</strong> This project is educational, local-first, and not affiliated with any school or institution.</p>' +
      '<p><strong>Privacy.</strong> Favorites, settings, and saves stay in your browser unless you sign in and use cloud sync.</p>' +
      '<p><strong>Account use.</strong> Accounts must follow the same rules and the verification settings on your profile.</p>' +
      '<p class="small">Read the full document on the Privacy and Terms page before accepting.</p>' +
      '</div>' +
      '<label class="check"><input id="' + TERMS_CHECK_ID + '" type="checkbox"><span>I agree to the Terms of Service and Privacy policy.</span></label>' +
      '<div class="actions">' +
      '<a id="' + TERMS_LINK_ID + '" class="btn" href="privacy.html">Read Full Terms</a>' +
      '<button id="' + TERMS_ACCEPT_ID + '" type="button" class="btn primary" disabled>Accept and Continue</button>' +
      '</div>' +
      '<p id="' + TERMS_STATUS_ID + '" class="status">Acceptance is required to continue.</p>' +
      '</article>';
    document.body.appendChild(overlay);

    var checkbox = document.getElementById(TERMS_CHECK_ID);
    var acceptBtn = document.getElementById(TERMS_ACCEPT_ID);
    if (checkbox && acceptBtn) {
      checkbox.addEventListener("change", function () {
        acceptBtn.disabled = !checkbox.checked;
      });
      acceptBtn.addEventListener("click", function () {
        if (!checkbox.checked) {
          return;
        }
        setAcceptedTerms();
      });
      checkbox.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && checkbox.checked) {
          event.preventDefault();
          setAcceptedTerms();
        }
      });
    }
    return overlay;
  }

  function showTermsOverlay() {
    ensureStyles();
    var overlay = ensureTermsOverlay();
    var status = document.getElementById(TERMS_STATUS_ID);
    var checkbox = document.getElementById(TERMS_CHECK_ID);
    var acceptBtn = document.getElementById(TERMS_ACCEPT_ID);

    if (overlay) {
      overlay.classList.add("show");
    }
    if (document.body) {
      if (!originalBodyOverflow) {
        originalBodyOverflow = document.body.style.overflow || "";
      }
      document.body.style.overflow = "hidden";
    }
    if (status) {
      status.textContent = "You need to accept the terms to continue.";
    }
    if (checkbox) {
      checkbox.checked = false;
    }
    if (acceptBtn) {
      acceptBtn.disabled = true;
    }
  }

  function hideTermsOverlay() {
    var overlay = document.getElementById(TERMS_OVERLAY_ID);
    if (overlay) {
      overlay.classList.remove("show");
    }
    if (document.body) {
      document.body.style.overflow = originalBodyOverflow;
    }
  }

  function updateDockVisibility() {
    var dock = document.getElementById(DOCK_ID);
    var playersBtn = document.getElementById(PLAYERS_BUTTON_ID);
    var playersCount = document.getElementById(PLAYERS_COUNT_ID);
    if (!dock) {
      return;
    }
    dock.style.display = accepted ? "flex" : "none";
    if (playersBtn) {
      playersBtn.style.display = playersAllowed ? "inline-flex" : "none";
    }
    if (playersCount) {
      playersCount.style.display = playersAllowed ? "inline-flex" : "none";
    }
  }

  function ensureDock() {
    ensureStyles();
    var dock = document.getElementById(DOCK_ID);
    if (dock) {
      return dock;
    }

    dock = document.createElement("div");
    dock.id = DOCK_ID;
    dock.style.display = accepted ? "flex" : "none";
    dock.innerHTML = "" +
      '<button id="' + PLAYERS_BUTTON_ID + '" type="button" class="ux-btn">Players</button>' +
      '<button id="' + TERMS_BUTTON_ID + '" type="button" class="ux-btn secondary">Terms</button>' +
      '<span id="' + PLAYERS_COUNT_ID + '" class="ux-chip">Players: --</span>';
    document.body.appendChild(dock);

    var playersBtn = document.getElementById(PLAYERS_BUTTON_ID);
    var termsBtn = document.getElementById(TERMS_BUTTON_ID);
    if (playersBtn) {
      playersBtn.addEventListener("click", function () {
        togglePlayersPanel();
      });
    }
    if (termsBtn) {
      termsBtn.addEventListener("click", function () {
        showTermsOverlay();
      });
    }
    return dock;
  }

  async function refreshPlayersRole() {
    var client = await getSupabaseClient();
    if (!client || !client.auth || typeof client.auth.getUser !== "function") {
      playersRole = "";
      playersAllowed = false;
      playersVisible = false;
      updateDockVisibility();
      setPlayersVisible(false);
      return;
    }

    try {
      var auth = await client.auth.getUser();
      var user = auth && auth.data ? auth.data.user : null;
      if (!user) {
        playersRole = "";
        playersAllowed = false;
        playersVisible = false;
        updateDockVisibility();
        setPlayersVisible(false);
        return;
      }

      var result = await client.rpc("current_user_staff_role");
      if (result && result.error) {
        throw result.error;
      }

      playersRole = String(result && result.data ? result.data : "").trim().toLowerCase();
      playersAllowed = playersRole === "admin" || playersRole === "developer";
      if (!playersAllowed) {
        playersVisible = false;
        setPlayersVisible(false);
      }
      updateDockVisibility();
    } catch (_error) {
      playersRole = "";
      playersAllowed = false;
      playersVisible = false;
      setPlayersVisible(false);
      updateDockVisibility();
    }
  }

  function ensurePlayersPanel() {
    var panel = document.getElementById(PLAYERS_PANEL_ID);
    if (panel) {
      return panel;
    }

    panel = document.createElement("section");
    panel.id = PLAYERS_PANEL_ID;
    panel.innerHTML = "" +
      '<div class="head">' +
      '<div>' +
      '<div class="title">Who is Playing</div>' +
      '<div class="subtitle" id="' + PLAYERS_STATUS_ID + '">Loading current presence...</div>' +
      '</div>' +
      '<div class="actions">' +
      '<button type="button" class="action" data-players-action="refresh">Refresh</button>' +
      '<button type="button" class="action" data-players-action="close">Close</button>' +
      '</div>' +
      '</div>' +
      '<div class="body" id="' + PLAYERS_BODY_ID + '"></div>';
    document.body.appendChild(panel);

    panel.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.getAttribute) {
        return;
      }
      var action = target.getAttribute("data-players-action");
      if (!action) {
        return;
      }
      if (action === "close") {
        setPlayersVisible(false);
      } else if (action === "refresh") {
        refreshPlayersPanel();
      }
    });
    return panel;
  }

  function setPlayersVisible(nextVisible) {
    playersVisible = !!nextVisible;
    if (playersVisible && !playersAllowed) {
      playersVisible = false;
    }
    var panel = ensurePlayersPanel();
    panel.classList.toggle("show", playersVisible);
    if (playersVisible) {
      refreshPlayersPanel();
    }
  }

  function togglePlayersPanel() {
    setPlayersVisible(!playersVisible);
  }

  function getSupabaseConfig() {
    var cfg = window.__GAMEHUB_SUPABASE__ || {};
    var localCfg = {};
    try {
      localCfg = JSON.parse(storageGet(SUPABASE_CONFIG_KEY) || "{}") || {};
    } catch (_error) {
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
    if (playersClient) {
      return playersClient;
    }
    if (!(window.supabase && typeof window.supabase.createClient === "function")) {
      return null;
    }
    var cfg = getSupabaseConfig();
    if (!cfg.url || !cfg.anonKey) {
      return null;
    }
    playersClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    return playersClient;
  }

  function formatPresenceLine(row) {
    var name = row && typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : "Guest";
    var username = row && typeof row.username === "string" && row.username.trim() ? "@" + row.username.trim() : "";
    var gameId = row && typeof row.current_game_id === "string" ? row.current_game_id.trim() : "";
    var gameTitle = row && typeof row.current_game_title === "string" ? row.current_game_title.trim() : "";
    var status = row && typeof row.presence_status === "string" ? row.presence_status.trim() : "online";
    var updatedAt = row && row.presence_updated_at ? new Date(row.presence_updated_at) : null;
    var updatedLabel = updatedAt && !isNaN(updatedAt.getTime()) ? updatedAt.toLocaleTimeString() : "";
    var gameLabel = gameTitle || gameId || "On the site";

    return {
      name: name,
      username: username,
      gameLabel: gameLabel,
      status: status,
      updatedLabel: updatedLabel
    };
  }

  function renderPlayersPanel() {
    var body = document.getElementById(PLAYERS_BODY_ID);
    var statusEl = document.getElementById(PLAYERS_STATUS_ID);
    var countEl = document.getElementById(PLAYERS_COUNT_ID);
    if (!body || !statusEl || !countEl) {
      return;
    }

    if (!playersState.loaded) {
      body.innerHTML = '<div class="empty">Loading presence data...</div>';
      statusEl.textContent = "Loading current presence...";
      countEl.textContent = "Players: --";
      return;
    }

    if (playersState.error) {
      body.innerHTML = '<div class="empty">' + escapeHtml(playersState.error) + '</div>';
      statusEl.textContent = "Could not refresh presence right now.";
      if (typeof playersState.count === "number") {
        countEl.textContent = "Players: " + playersState.count;
      }
      return;
    }

    if (!playersState.rows.length) {
      body.innerHTML = '<div class="empty">No one is currently online right now.</div>';
      statusEl.textContent = "No public presence entries yet.";
      countEl.textContent = "Players: 0";
      return;
    }

    body.innerHTML = playersState.rows.map(function (row) {
      var entry = formatPresenceLine(row);
      return '' +
        '<div class="row">' +
        '<div class="name">' + escapeHtml(entry.name) + (entry.username ? ' <span class="subtitle">' + escapeHtml(entry.username) + '</span>' : '') + '</div>' +
        '<div class="game">' + escapeHtml(entry.gameLabel) + '</div>' +
        '<div class="meta"><span>' + escapeHtml(entry.status) + '</span>' + (entry.updatedLabel ? '<span>' + escapeHtml(entry.updatedLabel) + '</span>' : '') + '</div>' +
        '</div>';
    }).join("");
    statusEl.textContent = "Showing " + playersState.rows.length + " public presence entries.";
    countEl.textContent = "Players: " + playersState.rows.length;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function refreshPlayersPanel() {
    var client = await getSupabaseClient();
    var body = document.getElementById(PLAYERS_BODY_ID);
    var statusEl = document.getElementById(PLAYERS_STATUS_ID);
    var countEl = document.getElementById(PLAYERS_COUNT_ID);

    if (!playersAllowed) {
      playersState.loaded = true;
      playersState.rows = [];
      playersState.count = null;
      playersState.error = "This viewer is available to admins and developers only.";
      renderPlayersPanel();
      return;
    }

    playersState.loaded = false;
    playersState.error = "";
    renderPlayersPanel();

    if (!client) {
      playersState.loaded = true;
      playersState.error = "Presence data is unavailable until Supabase is configured.";
      playersState.rows = [];
      playersState.count = null;
      renderPlayersPanel();
      return;
    }

    try {
      var result = await client.rpc("public_list_online_presence", { limit_count: MAX_PLAYERS });
      if (result && result.error) {
        throw result.error;
      }
      var rows = Array.isArray(result && result.data) ? result.data : [];
      playersState.rows = rows;
      playersState.count = rows.length;
      playersState.error = "";
      playersState.loaded = true;
      if (countEl) {
        countEl.textContent = "Players: " + rows.length;
      }
      if (statusEl) {
        statusEl.textContent = rows.length ? ("Showing " + rows.length + " public presence entries.") : "No public presence entries yet.";
      }
      if (body) {
        renderPlayersPanel();
      }
    } catch (error) {
      playersState.loaded = true;
      playersState.rows = [];
      playersState.count = null;
      playersState.error = error && error.message ? error.message : "Could not load presence data.";
      renderPlayersPanel();
    }
  }

  function startPlayersRefreshLoop() {
    if (playersRefreshTimer) {
      clearInterval(playersRefreshTimer);
      playersRefreshTimer = null;
    }
    playersRefreshTimer = setInterval(function () {
      refreshPlayersRole();
      if (accepted) {
        refreshPlayersPanel();
      }
    }, 30000);
  }

  function bindLifecycleEvents() {
    window.addEventListener("focus", function () {
      refreshPlayersRole();
      if (accepted) {
        refreshPlayersPanel();
      }
    });
    window.addEventListener("online", function () {
      refreshPlayersRole();
      if (accepted) {
        refreshPlayersPanel();
      }
    });
    window.addEventListener("pageshow", function () {
      refreshPlayersRole();
      if (accepted) {
        refreshPlayersPanel();
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && accepted) {
        refreshPlayersRole();
        refreshPlayersPanel();
      }
    });
  }

  function install() {
    if (typeof accepted !== "boolean") {
      accepted = false;
    }
    accepted = hasAcceptedTerms();
    if (typeof window !== "undefined") {
      window.__GAMEHUB_TOS_ACCEPTED__ = accepted;
      window.__GAMEHUB_ACCEPT_TERMS__ = setAcceptedTerms;
      window.__GAMEHUB_REQUIRE_TERMS_ACCEPTANCE__ = ensureTermsPromise;
      window.__GAMEHUB_OPEN_PLAYERS_PANEL__ = function () {
        setPlayersVisible(true);
      };
      window.__GAMEHUB_CLOSE_PLAYERS_PANEL__ = function () {
        setPlayersVisible(false);
      };
    }

    ensureDock();
    updateDockVisibility();
    bindLifecycleEvents();

    if (!accepted) {
      showTermsOverlay();
    } else {
      hideTermsOverlay();
      refreshPlayersRole();
      refreshPlayersPanel();
      startPlayersRefreshLoop();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
