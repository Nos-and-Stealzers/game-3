/**
 * Real-Time User Settings Sync Module
 * Automatically syncs ALL user profile settings (username, displayName, bio, language, etc.) 
 * to the Supabase server in real-time, not just on save button click
 */
(function () {
  window.__GAMEHUB_USERNAME_SYNC__ = {
    init: function(config) {
      setupUserSettingsSyncListener(config || {});
    }
  };

  var syncInFlight = false;
  var pendingSyncTimer = null;
  var lastSyncedSettings = {};
  var supabaseClient = null;
  var currentUserId = null;

  // All user settings fields that should sync
  const SYNC_FIELDS = [
    "userUsername",
    "userDisplayName", 
    "userBio",
    "userCustomStatus",
    "userPronouns",
    "userLanguage",
    "userTimeZone",
    "userAvatarUrl",
    "userAccentColor",
    "userEmailUpdates",
    "userGameAlerts",
    "userProfilePublic",
    "userShowOnline"
  ];

  function setupUserSettingsSyncListener(config) {
    const {
      debounceMs = 1500,
      supabaseKey = "supabaseClient"
    } = config;

    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attachListeners);
    } else {
      attachListeners();
    }

    function attachListeners() {
      // Attach listeners to all user settings fields
      SYNC_FIELDS.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Skip avatar URL and accent color for now (less frequent changes)
        if (fieldId === "userAvatarUrl" || fieldId === "userAccentColor") {
          return;
        }

        field.addEventListener("input", function() {
          debounceSettingsSync(debounceMs);
        });

        field.addEventListener("change", function() {
          // Immediate sync on blur
          debounceSettingsSync(500);
        });
      });

      // Also hook into auth state changes
      observeAuthStateChanges();
    }
  }

  function debounceSettingsSync(debounceMs) {
    if (pendingSyncTimer) {
      clearTimeout(pendingSyncTimer);
    }

    pendingSyncTimer = setTimeout(function() {
      pendingSyncTimer = null;
      syncSettingsToServer();
    }, debounceMs);
  }

  async function syncSettingsToServer() {
    if (syncInFlight) {
      return; // Already syncing
    }

    // Ensure we have Supabase client and user ID
    if (!ensureSupabaseClient()) {
      return;
    }

    // Collect current field values
    const currentSettings = collectCurrentSettings();
    
    // Check if anything actually changed
    if (!hasSettingsChanged(currentSettings)) {
      return; // No changes
    }

    syncInFlight = true;

    try {
      // Try RPC first (preferred method)
      const rpcResult = await supabaseClient.rpc("upsert_my_user_settings", {
        target_user_id: currentUserId,
        payload: buildPayload(currentSettings)
      });

      if (!rpcResult.error) {
        lastSyncedSettings = JSON.parse(JSON.stringify(currentSettings));
        console.log("[Settings Sync] Synced to server via RPC:", currentSettings);
        return;
      }

      // Fallback to direct table update
      const tableResult = await supabaseClient
        .from("user_settings")
        .update(buildPayload(currentSettings))
        .eq("user_id", currentUserId);

      if (!tableResult.error) {
        lastSyncedSettings = JSON.parse(JSON.stringify(currentSettings));
        console.log("[Settings Sync] Synced to server via table update:", currentSettings);
        return;
      }

      console.warn("[Settings Sync] Failed to sync settings:", tableResult.error);
    } catch (error) {
      console.error("[Settings Sync] Error syncing settings:", error);
    } finally {
      syncInFlight = false;
    }
  }

  function collectCurrentSettings() {
    const settings = {};
    
    SYNC_FIELDS.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (!field) return;

      if (field.type === "checkbox") {
        settings[fieldId] = field.checked;
      } else {
        settings[fieldId] = (field.value || "").toString().trim();
      }
    });

    return settings;
  }

  function hasSettingsChanged(current) {
    if (Object.keys(lastSyncedSettings).length === 0) {
      return true; // First sync
    }

    for (const key in current) {
      if (current[key] !== lastSyncedSettings[key]) {
        return true;
      }
    }

    return false;
  }

  function buildPayload(settings) {
    return {
      username: normalizeUsername(settings.userUsername || ""),
      display_name: settings.userDisplayName || "",
      bio: settings.userBio || "",
      custom_status: settings.userCustomStatus || "",
      pronouns: settings.userPronouns || "",
      language: settings.userLanguage || "en",
      time_zone: settings.userTimeZone || "UTC",
      avatar_url: settings.userAvatarUrl || "",
      accent_color: settings.userAccentColor || "#5865f2",
      email_updates: settings.userEmailUpdates === true,
      game_alerts: settings.userGameAlerts !== false,
      profile_public: settings.userProfilePublic === true,
      show_online: settings.userShowOnline !== false,
      updated_at: new Date().toISOString()
    };
  }

  function normalizeUsername(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 24)
      .trim();
  }

  function ensureSupabaseClient() {
    // Try to get Supabase client from various sources
    if (supabaseClient && currentUserId) {
      return true;
    }

    // Try window.__GAMEHUB_SUPABASE_CLIENT__
    if (window.__GAMEHUB_SUPABASE_CLIENT__) {
      supabaseClient = window.__GAMEHUB_SUPABASE_CLIENT__;
    }

    // Try to find it in settings.html scope
    if (!supabaseClient && typeof window !== "undefined") {
      // In settings.html, supabaseClient is typically a global
      if (window.supabaseClient) {
        supabaseClient = window.supabaseClient;
      }
      if (window.activeAccountUser && window.activeAccountUser.id) {
        currentUserId = window.activeAccountUser.id;
      }
    }

    return supabaseClient && currentUserId;
  }

  function observeAuthStateChanges() {
    // Listen for auth state changes to update currentUserId
    setInterval(function() {
      try {
        if (window.activeAccountUser && window.activeAccountUser.id) {
          currentUserId = window.activeAccountUser.id;
          // If auth just became available, sync any pending settings
          if (!supabaseClient) {
            ensureSupabaseClient();
            if (supabaseClient && currentUserId) {
              syncSettingsToServer();
            }
          }
        } else {
          currentUserId = null;
        }
      } catch (e) {
        // Ignore
      }
    }, 5000);
  }

})();
