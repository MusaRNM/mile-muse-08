# MileTrack — GitHub Pages hosting

This folder is the source for the MileTrack legal pages served via
**GitHub Pages**. Everything here is static HTML, publicly accessible,
and requires no login.

## Enable GitHub Pages

In the connected GitHub repo:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set:
   - **Source:** *Deploy from a branch*
   - **Branch:** `main` (or your default branch) — **Folder:** `/docs`
3. Click **Save**. GitHub builds and returns a public URL of the form:

   ```
   https://<github-username>.github.io/<repo-name>/
   ```

## Public URLs

Once Pages is live, these URLs work publicly without a Lovable or GitHub
login and can be pasted directly into the Google Play Console:

- Legal index: `https://<user>.github.io/<repo>/`
- **Privacy policy:** `https://<user>.github.io/<repo>/privacy-policy.html`
- **Terms of use:** `https://<user>.github.io/<repo>/terms.html`

Use the **privacy-policy.html** URL in Play Console → *App content →
Privacy policy*.

## Notes

- `.nojekyll` disables Jekyll processing so filenames with unusual
  characters or underscore prefixes are served as-is.
- The same HTML is also shipped inside the app under `public/`, so the
  in-app **Settings → Privacy policy** and **Terms of use** links keep
  working offline against a local copy.
- If you edit a policy, update **both** `docs/*.html` and
  `public/*.html` in the same commit so the hosted and in-app copies
  stay in sync.
- Contact address on every page: `MileTrack.Help@hotmail.com`.
