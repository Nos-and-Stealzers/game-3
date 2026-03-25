# Snow-Rider3D

Classroom-style browser game hub with a local Snow Rider build and externally hosted games.

## Run locally

From the project root:

```bash
python3 -m http.server 3000
```

Then open:

- http://localhost:3000

## Site structure

- `index.html`: Game hub UI with search, category filters, favorites, and recently played.
- `play.html`: Fullscreen-style player page with back navigation.
- `snow-rider.html`: Local Unity WebGL Snow Rider page.
- `games.json`: Central game catalog used by both `index.html` and `play.html`.
- `privacy.html`: Privacy and terms page for public deployment.
- `404.html`: Not found page for static host fallback.
- `icon.svg`: Site and PWA icon source.
- `robots.txt` and `sitemap.xml`: Search engine discovery files.

## Public deployment

This project is static, so it can be hosted on GitHub Pages, Netlify, Cloudflare Pages, or any static host.

### GitHub Pages quick steps

1. Push the repository to GitHub.
2. Open repository settings.
3. Go to Pages.
4. Set source to deploy from branch `main` and folder `/ (root)`.
5. Save and wait for deployment.

## Launch checklist

- Verify all game links in `games.json` are active.
- Test desktop and mobile layouts.
- Confirm `play.html` fallback button (`Open Direct`) works for games that block embedding.
- Review third-party game licensing and terms before public release.
- Replace contact placeholder text in `privacy.html` with real owner contact details.
- Replace `https://example.com` entries in `sitemap.xml` and `robots.txt` with your real domain.