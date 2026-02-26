# Holt-Winters forecasting (multi-dataset)

Pyodide-based app: select datasets (CPI, WPI, Nifty, IIP, GDP Quarterly, GDP Annual), set Alpha/Beta/Gamma, and run Holt-Winters forecasts. No backend required.

---

## For teammates: access and run the app

### Option 1 — Use in the browser (no install)

If GitHub Pages is enabled on the repo, open this link to use the app:

**https://allwinromario.github.io/Horizon-Inc/Holt%20Winters/app/index.html**

*(Repo owner: enable once under **Settings → Pages** → Deploy from branch **main**, folder **/ (root)**.)*

### Option 2 — Run the code locally

1. **Clone the repo** (or pull if you already have it):
   ```bash
   git clone https://github.com/allwinromario/Horizon-Inc.git
   cd Horizon-Inc
   ```

2. **Start a local server** from the repo root (required so `../data/` works):
   ```bash
   python3 -m http.server 8000
   ```
   *(If port 8000 is in use, use another port, e.g. `8080`.)*

3. **Open in the browser:**
   - **http://localhost:8000/Holt%20Winters/app/index.html**

You can change code in `Holt Winters/app/index.html` or data in `Holt Winters/data/` and reload the page to see updates.

### Option 3 — Edit and contribute

- **If you have write access:** clone (or pull), edit, then `git add` → `git commit` → `git push origin main`.
- **If you don’t:** fork the repo on GitHub, clone your fork, edit, push to your fork, then open a Pull Request to `Horizon-Inc`.

Repo: **https://github.com/allwinromario/Horizon-Inc**

To give teammates write access: **GitHub repo → Settings → Collaborators** → Add people.

---

## Run locally (quick reference)

From the **Horizon repo root**:

```bash
python3 -m http.server 8000
```

Then open: **http://localhost:8000/Holt%20Winters/app/index.html**
