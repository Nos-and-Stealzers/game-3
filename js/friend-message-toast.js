(function () {
  var POLL_VISIBLE_MS = 9000;
  var POLL_HIDDEN_MS = 25000;
  var MAX_TOASTS = 4;
  var TOAST_LIFETIME_MS = 7000;

  var supabaseClient = null;
  var activeUserId = "";
  var seenIds = {};
  var pollTimer = null;
  var stack = null;
  var stylesInjected = false;

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function trimText(value, maxLen) {
    var input = String(value || "").trim();
    if (input.length <= maxLen) {
      return input;
    }
    return input.slice(0, maxLen - 1) + "...";
  }

  function buildConfig() {
    var cfg = window.__GAMEHUB_SUPABASE__ || {};
    var fromStorage = {};
    try {
      fromStorage = JSON.parse(storageGet("gamehub_supabase_config") || "{}") || {};
    } catch (_error) {
      fromStorage = {};
    }

    var url = typeof fromStorage.url === "string" && fromStorage.url.trim() ? fromStorage.url.trim() : (typeof cfg.url === "string" ? cfg.url.trim() : "");
    var anonKey = typeof fromStorage.anonKey === "string" && fromStorage.anonKey.trim() ? fromStorage.anonKey.trim() : (typeof cfg.anonKey === "string" ? cfg.anonKey.trim() : "");
    return { url: url, anonKey: anonKey };
  }

  function ensureStack() {
    if (stack) {
      return stack;
    }
    stack = document.createElement("div");
    stack.className = "gh-toast-stack";
    stack.setAttribute("aria-live", "polite");
    stack.setAttribute("aria-atomic", "false");
    document.body.appendChild(stack);
    return stack;
  }

  function ensureStyles() {
    if (stylesInjected) {
      return;
    }
    stylesInjected = true;
    var style = document.createElement("style");
    style.textContent = "" +
      ".gh-toast-stack{position:fixed;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));display:grid;gap:8px;z-index:99999;width:min(360px,calc(100vw - max(20px,env(safe-area-inset-left) + env(safe-area-inset-right) + 20px)));pointer-events:none}" +
      ".gh-toast{pointer-events:auto;border:1px solid rgba(121,133,169,.55);border-left:3px solid #5865f2;border-radius:12px;background:rgba(22,26,34,.95);box-shadow:0 12px 24px rgba(0,0,0,.35);padding:9px 11px;display:grid;gap:4px;text-align:left;cursor:pointer;color:#f2f5ff}" +
      ".gh-toast h4,.gh-toast p{margin:0}" +
      ".gh-toast h4{font-size:.82rem;font-weight:900;line-height:1.3}" +
      ".gh-toast p{font-size:.78rem;line-height:1.35;color:#d7def0}";
    document.head.appendChild(style);
  }

  function openFriendsCenter() {
    try {
      var target = new URL("/settings.html", window.location.origin);
      target.hash = "friends";
      window.location.href = target.toString();
    } catch (_error) {
      window.location.href = "/settings.html#friends";
    }
  }

  function showToast(message) {
    if (!message || typeof message !== "object") {
      return;
    }

    ensureStyles();
    var parent = ensureStack();
    while (parent.children.length >= MAX_TOASTS) {
      parent.removeChild(parent.firstElementChild);
    }

    var senderName = trimText(message.sender_display_name || (message.sender_username ? ("@" + message.sender_username) : "Friend"), 42);
    var senderHandle = message.sender_username ? ("@" + message.sender_username) : "";
    var body = trimText(message.body, 110);

    var toast = document.createElement("button");
    toast.type = "button";
    toast.className = "gh-toast";
    toast.innerHTML = "<h4>New message from " + escapeHtml(senderName) + "</h4>" +
      "<p>" + escapeHtml(senderHandle ? (senderHandle + " · ") : "") + escapeHtml(body) + "</p>";
    toast.addEventListener("click", function () {
      try {
        sessionStorage.setItem("gamehub_pending_friend_chat_user_id", String(message.sender_user_id || ""));
      } catch (_error) {
      }
      openFriendsCenter();
    });

    parent.appendChild(toast);
    window.setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, TOAST_LIFETIME_MS);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function loadSeenForUser(userId) {
    seenIds = {};
    if (!userId) {
      return;
    }
    var key = "gamehub_seen_friend_messages_" + userId;
    try {
      var parsed = JSON.parse(sessionStorage.getItem(key) || "[]");
      if (Array.isArray(parsed)) {
        parsed.forEach(function (id) {
          seenIds[String(id)] = true;
        });
      }
    } catch (_error) {
      seenIds = {};
    }
  }

  function saveSeenForUser() {
    if (!activeUserId) {
      return;
    }
    var key = "gamehub_seen_friend_messages_" + activeUserId;
    try {
      var ids = Object.keys(seenIds).slice(-160);
      sessionStorage.setItem(key, JSON.stringify(ids));
    } catch (_error) {
    }
  }

  async function pollUnreadMessages() {
    if (!supabaseClient || !activeUserId) {
      return;
    }

    var result = await supabaseClient.rpc("list_my_unread_friend_messages", { limit_count: 12 });
    if (result && result.error) {
      return;
    }

    var rows = Array.isArray(result.data) ? result.data : [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var row = rows[i] || {};
      var id = String(row.message_id || "");
      if (!id || seenIds[id]) {
        continue;
      }
      seenIds[id] = true;
      showToast(row);
    }

    saveSeenForUser();
  }

  function schedulePolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (!activeUserId || !supabaseClient) {
      return;
    }

    var intervalMs = document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
    pollTimer = setInterval(function () {
      pollUnreadMessages();
    }, intervalMs);
  }

  async function refreshAuthState() {
    if (!supabaseClient) {
      return;
    }

    var auth = await supabaseClient.auth.getUser();
    var user = auth && auth.data ? auth.data.user : null;
    var userId = user && user.id ? String(user.id) : "";

    if (userId !== activeUserId) {
      activeUserId = userId;
      loadSeenForUser(activeUserId);
      schedulePolling();
    }

    if (activeUserId) {
      pollUnreadMessages();
    }
  }

  async function init() {
    if (window.__GAMEHUB_SOCIAL_SYNC_ACTIVE__) {
      return;
    }
    if (!(window.supabase && typeof window.supabase.createClient === "function")) {
      return;
    }

    var cfg = buildConfig();
    if (!cfg.url || !cfg.anonKey) {
      return;
    }

    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    await refreshAuthState();

    supabaseClient.auth.onAuthStateChange(function () {
      refreshAuthState();
    });

    document.addEventListener("visibilitychange", function () {
      schedulePolling();
      if (!document.hidden) {
        pollUnreadMessages();
      }
    });
    window.addEventListener("focus", function () {
      pollUnreadMessages();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
