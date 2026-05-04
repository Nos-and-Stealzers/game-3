# Admin Console System - Complete Documentation

## Overview

A comprehensive admin console system has been implemented globally across all games. It provides:
- **Global hotkey activation** (Ctrl+Shift+F / Cmd+Shift+F)
- **Admin-only commands** with role-based access control
- **FNAF game unlocking system** ("fnaf all" command)
- **Cache and storage management**
- **Real-time game state inspection**
- **Command history with arrow key navigation**

## Quick Start

### Opening the Console
Press **Ctrl+Shift+F** (or **Cmd+Shift+F** on Mac) on any game page to open the admin console.

### Basic Commands
```
help          - Show all available commands
status        - Show current user and game status
user          - Show current user info
fnaf all      - Unlock all FNAF games
fnaf 1        - Unlock FNAF 1
cache show    - Show cache contents
clear         - Clear console output
```

## Console Features

### 1. **Global Hotkey**
- **Hotkey:** `Ctrl+Shift+F` (Windows/Linux) or `Cmd+Shift+F` (Mac)
- **Available:** All game pages, play.html, settings.html
- **Effect:** Opens/closes admin console
- **Toggle:** Press hotkey again to close

### 2. **User Interface**
- Fixed position: Bottom-right corner
- Sleek dark theme with blue accents
- Responsive: Adapts to smaller screens
- History: Command history stored in localStorage
- Navigation: Arrow up/down to navigate history

### 3. **Command System**
Console parses commands with arguments:
```
command [arg1] [arg2] [arg3]
```

All commands support:
- **Tab completion:** Not yet (future enhancement)
- **History:** Up/Down arrows to navigate
- **Multi-word:** Spaces separate arguments
- **Case-insensitive:** Commands are lowercase

### 4. **Admin Role Detection**
- Queries Supabase `current_user_staff_role()`
- Detects: `"admin"` or `"developer"` roles
- Automatic: Updates every 30 seconds
- Fallback: Stores in localStorage as `gamehub_user_admin_role`
- Admin-only commands require: `isAdmin = true`

## Commands Reference

### General Commands (All Users)

#### `help`
Shows all available commands with descriptions.
```
> help
Available Commands:
  admin - Admin only command (shows admin status)
  cache - Cache info: cache [clear|show|stats]
  ...
```

#### `status`
Displays current in-game status and system info.
```
> status
=== Game Hub Status ===
Admin: YES
User ID: 12345678-1234-1234-1234-123456789012
Supabase: Connected
Page: https://example.com/games/fnaf/1/
Time: 5/4/2026, 3:45:30 PM
```

#### `user`
Shows current user account information.
```
> user
User: username@example.com
ID: 12345678-1234-1234-1234-123456789012
Email: username@example.com
```

#### `game current`
Shows which game is currently open.
```
> game current
Current game: fnaf
```

#### `game list`
Lists all available games.
```
> game list
Available games:
  fnaf: 1, 2, 3, 4, sl, ps, ucn, w
  minecraft: eaglercraft
  retro-bowl, sweet-bakery, websie
```

#### `clear`
Clears all console output.
```
> clear
Console cleared.
```

### Admin Commands (Admin/Developer Role Only)

#### `fnaf [all|1|2|3|4|sl|ps|ucn|w] [unlock|lock|status]`
Manages FNAF game unlocks.

**Examples:**
```
> fnaf all unlock
Unlocked: fnaf-1
Unlocked: fnaf-2
Unlocked: fnaf-3
Unlocked: fnaf-4
Unlocked: fnaf-sl
Unlocked: fnaf-ps
Unlocked: fnaf-ucn
Unlocked: fnaf-w

> fnaf 1 status
fnaf-1: UNLOCKED

> fnaf all lock
Locked: fnaf-1
Locked: fnaf-2
...
```

**Game IDs:**
- `1` = FNAF 1
- `2` = FNAF 2
- `3` = FNAF 3
- `4` = FNAF 4
- `w` = FNAF World
- `sl` = Sister Location
- `ps` = Pizzeria Simulator
- `ucn` = Ultimate Custom Night

**Storage Key:** `gamehub_fnaf_unlocks`
```json
{
  "fnaf-1": { "unlocked": true, "unlockedAt": "2026-05-04T...", "unlockedBy": "user-id" },
  "fnaf-2": { ... },
  ...
}
```

#### `unlock [game] [feature]`
Unlock content for a specific game.
```
> unlock fnaf all
Unlocking fnaf:all
Unlocked: fnaf-1
Unlocked: fnaf-2
...

> unlock 1
Unlocking 1:all
Unlocked: fnaf-1
```

#### `lock [game] [feature]`
Lock content for a specific game.
```
> lock fnaf all
Locking fnaf:all
Locked: fnaf-1
Locked: fnaf-2
...
```

#### `reset [game|all]`
Reset/clear local storage data.
```
> reset all
All local storage cleared!

> reset fnaf
Reset data for fnaf
```

#### `admin`
Shows current admin status and privileges.
```
> admin
You have ADMIN privileges
Admin commands available

# OR for non-admin:
You do NOT have admin privileges
Contact administrator for access
```

#### `cache show`
Display all localStorage keys and sizes.
```
> cache show
localStorage keys:
  gamehub_user_settings (2048 bytes)
  gamehub_game_saves (15360 bytes)
  gamehub_fnaf_unlocks (512 bytes)
  ...
```

#### `cache stats`
Show storage statistics.
```
> cache stats
Storage Stats:
localStorage items: 24
localStorage size: 128.45 KB
sessionStorage items: 5
```

#### `cache clear`
Clear all cache/storage (warning: destructive).
```
> cache clear
Cache cleared
```

## Integration Points

### Locations
- ✅ **play.html** - Main game hub
- ✅ **settings.html** - User settings
- ✅ **All 8 FNAF games** - fnaf/1/, 2/, 3/, 4/, sl/, ps/, ucn/, w/
- ✅ **snow-rider.html** - Snow Rider game
- ✅ **minecraft/eaglercraft** - Minecraft version
- ✅ **retro-bowl** - Retro Bowl game
- ✅ **sweet-bakery** - Sweet Bakery game
- ✅ **mini/parkcore** - ParkCore mini game

### Script Loading
```html
<script src="js/admin-console.js"></script>
```
- Loaded **after** supabase.config.js
- Loaded **before** cloud-autosync.js
- Initializes automatically on page load
- Available as `window.__GAMEHUB_ADMIN_CONSOLE__`

## JavaScript API

### Properties & Methods

#### `window.__GAMEHUB_ADMIN_CONSOLE__.show()`
Shows the admin console.
```javascript
window.__GAMEHUB_ADMIN_CONSOLE__.show();
```

#### `window.__GAMEHUB_ADMIN_CONSOLE__.hide()`
Hides the admin console.
```javascript
window.__GAMEHUB_ADMIN_CONSOLE__.hide();
```

#### `window.__GAMEHUB_ADMIN_CONSOLE__.execute(command)`
Executes a command programmatically.
```javascript
window.__GAMEHUB_ADMIN_CONSOLE__.execute("fnaf all unlock");
window.__GAMEHUB_ADMIN_CONSOLE__.execute("status");
```

#### `window.__GAMEHUB_ADMIN_CONSOLE__.isAdmin()`
Returns true if current user is admin.
```javascript
if (window.__GAMEHUB_ADMIN_CONSOLE__.isAdmin()) {
  console.log("User has admin access");
}
```

## Storage Keys

### Console History
- **Key:** `gamehub_console_history`
- **Type:** JSON array of strings
- **Max:** Last 50 commands stored

### Admin Role Cache
- **Key:** `gamehub_user_admin_role`
- **Type:** "1" (admin) or "0" (not admin)
- **Refreshed:** Every 30 seconds from Supabase

### Console State
- **Key:** `gamehub_console_visible`
- **Type:** "1" (visible) or "0" (hidden)

### FNAF Unlocks
- **Key:** `gamehub_fnaf_unlocks`
- **Type:** JSON object with game unlock states
- **Format:** `{ "fnaf-1": { unlocked, unlockedAt, unlockedBy }, ... }`

## UI Features

### Theme
- **Color:** Dark blue theme with purple accents
- **Font:** Monospace (Courier New)
- **Transparency:** Semi-transparent background with blur effect
- **Responsive:** Adapts to mobile screens (smaller on <600px width)

### Output Types
- **Info** (default) - Blue text for information
- **Success** - Green text for successful operations
- **Error** - Red text for errors
- **Warning** - Yellow text for warnings
- **Admin** - Orange text for admin-specific messages

### Scrolling
- Output automatically scrolls to latest message
- Manual scroll available for history
- Smoother scrollbar styling

## Error Handling

### No Admin Access
```
> fnaf all unlock
Error: This command requires admin privileges.
```

### Unknown Command
```
> foobar
Error: Unknown command 'foobar'. Type 'help' for available commands.
```

### Missing Arguments
```
> fnaf
Usage: fnaf [all|1|2|3|4|sl|ps|ucn|w] [unlock|lock|status]
Examples:
  fnaf all unlock   - Unlock all FNAF games
  fnaf 1 unlock     - Unlock FNAF 1
  fnaf all status   - Show unlock status
```

## Security Considerations

1. **Admin Detection:** Queries Supabase `current_user_staff_role()` function
2. **Role Validation:** Only `"admin"` and `"developer"` roles get access
3. **LocalStorage Fallback:** Caches role for 30 seconds
4. **Destructive Commands:** Reset/clear commands require admin role
5. **User Context:** Commands operate within signed-in user's context

## Performance

- **Bundle Size:** ~8-10 KB (minified)
- **Runtime Overhead:** Minimal (only active when opened)
- **Memory:** Stores up to 50 command history entries (~2-5 KB)
- **Admin Check:** Once on load + every 30 seconds
- **Console UI:** Created only when first opened

## Technical Architecture

```
Admin Console Module (admin-console.js)
    ↓
Initialize on page load
    ↓
Setup Hotkey Listener (Ctrl+Shift+F)
    ↓
Check Admin Status (Supabase RPC)
    ↓
Wait for user interaction
    ↓
User presses hotkey
    ↓
Create/Show Console UI
    ↓
User types command
    ↓
Parse & Validate Command
    ↓
Check Admin Requirements
    ↓
Execute Command
    ↓
Display Output
    ↓
Store History
```

## Future Enhancements

Potential additions not yet implemented:
- [ ] Tab completion for commands
- [ ] Command aliases (e.g., `? → help`)
- [ ] Command search/filtering
- [ ] Auto-complete suggestions
- [ ] Persistent console state across pages
- [ ] Game-specific commands
- [ ] Save/load of command macros
- [ ] Real-time game variable inspection
- [ ] Performance profiling tools
- [ ] API endpoint testing

## Troubleshooting

### Console doesn't open
1. Verify `admin-console.js` is loaded: Check Network tab
2. Check console for errors: Browser DevTools
3. Verify hotkey isn't blocked: Try on different page

### Commands not working
1. Check if you have admin role: Run `admin` command
2. Verify syntax: Run `help [command]`
3. Check if command exists: Run `help`

### Unlocks not persisting
1. Check localStorage isn't full: Run `cache stats`
2. Verify game is loaded from same domain
3. Try `cache clear` then unlock again

## Related Systems

The admin console integrates with:
- ✅ **Cloud Auto Sync** - Makes unlocks persistent to cloud
- ✅ **Username Server Sync** - Allows admin status monitoring
- ✅ **FNAF Loader Optimization** - Works alongside optimized loaders
- ✅ **Friend System** - Can see friend admin status

## Version History

- **v1.0** (May 4, 2026) - Initial release
  - Ctrl+Shift+F hotkey
  - Admin role detection
  - FNAF unlock commands
  - Cache management
  - Command history

---

**Status:** ✅ **COMPLETE AND DEPLOYED**

The admin console is now fully operational on all game pages and provides complete admin functionality for managing unlocks and debugging.
