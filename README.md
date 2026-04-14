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

- `index.html`: Coolmath-inspired hub UI with search, dynamic category filters, compatibility badges, favorites, and recently played.
- `play.html`: Fullscreen-style player page with embed fallback and direct-open controls.
- `snow-rider.html`: Local Unity WebGL Snow Rider page.
- `games/sweet-bakery/`: Local idle clicker game files.
- `games/fnaf/`: Local FNAF pack imported from `hd_fnaf` (`1`, `2`, `3`, `4`, `w`, `sl`, `ps`, `ucn`).
- `games/minecraft/eaglercraft/`: Local Minecraft web client (Eaglercraft) imported from `LucasGrimm389/thing`.
- `games.json`: Central game catalog used by both `index.html` and `play.html`.
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

## School Chromebook notes

- Local games (`snow-rider`, `sweet-bakery-local`) are the best chance to work on school-managed devices.
- Minecraft (`minecraft-eaglercraft`) is configured to launch in direct mode by default for better performance (avoids iframe overhead).
- External games may be blocked by school DNS/category filters even if they load normally from home networks.
- Some games are flagged in `games.json` as `embed: blocked`; those open better via direct links.

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
- Confirm `play.html` fallback button (`Open Direct`) works for games that block embedding.
- Review third-party game licensing and terms before public release.
- Replace contact placeholder text in `privacy.html` with real owner contact details.
- Replace `https://example.com` entries in `sitemap.xml` and `robots.txt` with your real domain.