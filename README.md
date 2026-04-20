# Snow-Rider3D

Arcade-style browser game hub with a local Snow Rider build, a local idle clicker game, and external game fallbacks.

## Run locally

From the project root:

```bash
python3 -m http.server 3000 --bind 0.0.0.0
```

If `python3` is unavailable, use:

```bash
python -m http.server 3000 --bind 0.0.0.0
```

Then open:

- http://localhost:3000

## Site structure

- `index.html`: Classroom 6X-style hub UI with search, category filters, compatibility badges, favorites, recents, theme settings, fast mode, and save-data tools.
- `play.html`: Fullscreen-style player page with embed fallback, direct-open controls, and synced theme/performance mode.
- `account.html`: Dedicated sign-in/cloud-sync page for Supabase account actions.
- `snow-rider.html`: Local Unity WebGL Snow Rider page.
- `games/sweet-bakery/`: Local idle clicker game files.
- `games/fnaf/`: Local FNAF pack imported from `hd_fnaf` (`1`, `2`, `3`, `4`, `w`, `sl`, `ps`, `ucn`).
- `games/minecraft/eaglercraft/`: Local Minecraft web client (Eaglercraft) imported from `LucasGrimm389/thing`.
- `retro-bowl-plus` entry in `games.json`: Local Retro Bowl build at `games/retro-bowl/index.html`, imported from `Nos-and-Stealzers/Retro-Bowl`.
- `games.json`: Central game catalog used by both `index.html` and `play.html`.
- `js/supabase.config.js`: Supabase public config (URL + anon key) loaded by `index.html`.
- `js/cloud-autosync.js`: Shared periodic cloud sync worker used during active play sessions.
- `supabase/setup.sql`: SQL to create and secure the `user_saves` table for cloud save sync.
- `privacy.html`: Privacy and terms page for public deployment.
- `404.html`: Not found page for static host fallback.
- `icon.svg`: Site and PWA icon source.
- `robots.txt` and `sitemap.xml`: Search engine discovery files.

## Game compatibility checks

Run this to validate local files and test whether external games likely block iframe embedding:

```bash
python3 scripts/check_game_compat.py
```

The script reports status codes and key headers like `X-Frame-Options` and `Content-Security-Policy`.

## FNAF asset integrity checks

Run this to validate local FNAF split archive completeness and merged ZIP integrity:

```bash
python3 scripts/check_fnaf_integrity.py
```

The report includes expected part count, missing parts (if any), ZIP test status, and pass/fail totals.

If you only want a fast missing-file check (skip ZIP validation):

```bash
python3 scripts/check_fnaf_integrity.py --skip-zip-test
```

## School Chromebook notes

- Local games (`snow-rider`, `sweet-bakery-local`) are the best chance to work on school-managed devices.
- Minecraft (`minecraft-eaglercraft`) is configured to launch in direct mode by default for better performance (avoids iframe overhead).
- Fast mode can be enabled in Settings to reduce effects and launch external games in direct mode for faster play.
- External games may be blocked by school DNS/category filters even if they load normally from home networks.
- Some games are flagged in `games.json` as `embed: blocked`; those open better via direct links.

## Settings and save data

- Open **Settings** on the hub header to switch between Light, Gray, and Black themes.
- Open **Settings** and use **Library View** to switch between standard cards and grouped mode (for example, `FNAF`, then category groups).
- Enable **Fast mode** to reduce UI effects and prioritize direct launch for external games.
- Enable **Open Source Only** in the filter row to view only catalog entries marked open source.
- Enable **Playable Only** to hide entries that look like source/repository links instead of playable game pages.
- The hub stores favorites, recents, theme, and fast mode in browser `localStorage`.
- Use **Export** to back up save data as JSON.
- Use **Import** to restore a previous backup.
- Use **Reset All** to clear saved hub data in the current browser profile.

## Supabase sign-in and cloud save setup

1. Create or open your Supabase project.
2. In Supabase SQL Editor, run `supabase/setup.sql`.
3. In Supabase Auth settings, enable Email auth.
4. In Supabase Auth -> Email Templates, make the OTP email code-first (not link-first).
	- Subject suggestion: `Your Classroom 6X verification code`
	- Body suggestion:

	```text
	Use this code to verify your sign-in:

	{{ .Token }}

	This code expires soon. If you did not request this, you can ignore this email.
	```
	- Keep `{{ .Token }}` in the template so code verification works.
5. Open `js/supabase.config.js` and fill in:
	- `url`: your Supabase project URL
	- `anonKey`: your Supabase anon public key
6. Reload the site and open `account.html`:
	- Use **Password** tab for email/password sign in or account creation.
	- Use **Email Code** tab for one-time-code sign in/sign up.
	- Use **Send Password Reset** if users forget passwords.
	- Then return to Settings -> Account Cloud Save as needed.
	- Cloud auto-sync continues to run after sign-in.

7. In Settings -> Account Cloud Save:
	- Click `Save your data` to open the dedicated sign-in page
	- Sign in using any supported method from `account.html`
	- Enter emailed verification code on `account.html` when using OTP mode (no redirect required)
	- Toggle `Cloud Auto Sync` on/off as desired
	- `Cloud Save` to upload local favorites/settings/game data snapshot
	- `Cloud Load` to pull saved data back
	- Important settings changes require verification; once verified, the session stays trusted for 30 minutes
	- After sign-in, auto-sync runs every 60 seconds on hub/account/player pages and local game pages (`snow-rider`, `sweet-bakery`, `minecraft-eaglercraft`, and local FNAF pages)
	- `Cloud Auto Sync Status` in hub/account shows the latest autosave heartbeat
	- Cloud payload now includes safe extra localStorage + game save map + bounded IndexedDB + sessionStorage + same-origin cookies + Supabase auth token keys for login continuity

If config is empty, the UI will show `Supabase: not configured.` and stay local-only.

Browser security limits still apply: data from other domains/websites cannot be read by this site, and HttpOnly/secure cross-site cookies are not accessible to JavaScript for backup/restore.

### Required Supabase tasks after this update

1. Re-run the latest SQL script in Supabase SQL Editor:
	- Use `supabase/setup.full.sql` (recommended) so admin RPCs and grants are present.
	- This script is rerunnable and will refresh policies/functions.
2. In Supabase Auth -> Sign In / Providers -> Email:
	- Keep email OTP enabled.
	- Keep magic-link fallback disabled if you want strict code-only flow.
3. In Supabase Auth -> Email Templates:
	- Use a code-first template that includes `{{ .Token }}`.
	- Suggested subject: `Your Classroom 6X verification code`.
4. Make sure your admin account email is listed in:
	- `ADMIN_EMAILS` in `account.html`
	- `ADMIN_EMAILS` in `admin.html`
	- `public.is_admin_email(...)` in `supabase/setup.full.sql`
5. Test once with a real account:
	- Sign in on `account.html` using a code.
	- Change profile/security settings on `settings.html` and verify the 30-minute trusted session window.
	- Open `admin.html` and confirm user list + moderation actions load.

### Migration order note (important)

- Keep dependent RPCs in safe create order when editing SQL scripts.
- If one function calls another, define the callee first or keep the caller self-contained.
- Example: `admin_list_activity` should not fail if `admin_list_activity_filtered` is moved/edited later.
- Running `supabase/setup.full.sql` from top to bottom avoids most order issues.

### Prompt for Supabase AI

Paste this in Supabase AI if you want it to generate/setup the backend pieces for this project:

```text
I am building a browser game hub and need complete Supabase setup for auth + per-user cloud saves.

Please do the following for my project:
1) Ensure Email auth is enabled (email/password sign-in).
2) Create a table public.user_saves with:
	- user_id uuid primary key references auth.users(id) on delete cascade
	- payload jsonb not null
	- updated_at timestamptz not null default now()
3) Enable Row Level Security on public.user_saves.
4) Add RLS policies so authenticated users can only read/insert/update rows where user_id = auth.uid().
5) Make the SQL rerunnable safely by dropping/recreating policies if they already exist.
6) Return the final SQL script in one block.

Important: do not use CREATE POLICY IF NOT EXISTS because PostgreSQL/Supabase does not support that syntax.
```

## Open-source game leads (GitHub)

These are legal/open-source style leads to review and verify before adding:

- Tetris-inspired search: `tetris javascript html5 license:mit`
- Snake-style search: `snake game javascript html5 license:mit`
- Breakout/Arkanoid search: `breakout game javascript canvas license:mit`
- Platformer search: `platformer javascript game license:mit`
- Tower-defense search: `tower defense javascript game open source`
- Fireboy and Watergirl fan projects: `fireboy watergirl html5 game open source`
- Co-op browser tower defense search: `tower defense multiplayer browser game open source`

For each candidate, check:

- License permits your use/distribution.
- Asset/audio licenses are also valid (not just code).
- Hosting terms allow public embedding/direct linking.

## Testing and liability note

- This project is intended for testing/educational use.
- Users are responsible for how they use the site and for compliance with local rules, school/work policies, and laws.
- A disclaimer page helps communicate intent, but it cannot guarantee zero legal risk in every jurisdiction.
- For public deployment, consult a qualified attorney and publish accurate owner contact details.

## TDS game import

I could not locate a public repository or public Pages URL for `tds` under `itsvijaysingh` via GitHub API/CLI lookup.

Once you share the repo URL (or copy its files into this workspace), add it to `games.json` using:

```json
{
	"id": "tds",
	"title": "TDS",
	"category": "action",
	"description": "Your TDS game",
	"gradient": "linear-gradient(135deg, #5b9dff, #1a4fa8)",
	"source": "<tds-entry-file-or-url>",
	"direct": "<tds-entry-file-or-url>",
	"platform": "local",
	"embed": "allowed",
	"schoolRisk": "low"
}
```

## Public deployment

This project is static, so it can be hosted on GitHub Pages, Netlify, Cloudflare Pages, or any static host.

### GitHub Pages quick steps

1. Push the repository to GitHub.
2. Open repository settings.
3. Go to Pages.
4. Set source to deploy from branch `main` and folder `/ (root)`.
5. Save and wait for deployment.

## Launch checklist

- Run `python3 scripts/check_game_compat.py` and review `blocked` entries.
- Test desktop and mobile layouts.
- Test Settings (theme, fast mode, export/import/reset) in at least one desktop and one mobile browser.
- Confirm `play.html` fallback button (`Open Direct`) works for games that block embedding.
- Review third-party game licensing and terms before public release.
- Replace contact placeholder text in `privacy.html` with real owner contact details.
- Replace `https://www.arcadecampushub.online` entries in `sitemap.xml` and `robots.txt` if you move the site to a different domain.