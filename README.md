# 🥑 FreshGuard - Kitchen & Grocery Expiry Tracker

**FreshGuard** is a smart, modern kitchen inventory and expiry date tracking web application (PWA) designed for households. Keep food fresh, cut down grocery waste, and never let milk, curd, sauces, or breads go bad unnoticed!

---

## ✨ Features at a Glance

### 1. 📷 Smart Label Scanner (AI & OCR)
- **Live Camera Scanner**: Point your smartphone or laptop camera at any grocery packaging (milk pouch, curd tub, sauce neck, bread tag).
- **Auto-Extract Expiry Dates**: Built-in optical character recognition (OCR via Tesseract.js) automatically recognizes date stamps:
  - `EXP`, `USE BY`, `BEST BEFORE`, `BB`, `BBD`, `MFD`, `PACKED ON`
  - Formats: `DD/MM/YYYY`, `MM/DD/YYYY`, `DD MMM YYYY` (e.g., `24 NOV 2026`), `MM/YYYY`, etc.
  - Smart shelf-life calculation (e.g., detects *"Packed on 17/10/2026"* + *"Consume within 2 days"* = auto-calculates expiry date).
- **Gemini Vision AI (Optional)**: Toggle AI Vision mode in Settings with your Gemini API key for zero-shot semantic label parsing (extracts brand, item name, category, and storage advice in 1 step).
- **Photo Upload Fallback**: Upload label photos directly from your phone gallery or computer.

### 2. ⚡ Fast Manual Entry & Quick Presets
- Can't scan a blurry stamp? Easily type or adjust dates in seconds.
- **1-Tap Kitchen Presets**:
  - 🥛 Fresh Milk (+3 days, Fridge)
  - 🥣 Curd / Dahi (+4 days, Fridge)
  - 🍞 Sliced Bread (+4 days, Pantry)
  - 🥚 Eggs (+21 days, Fridge)
  - 🥫 Tomato Sauce (+90 days, Fridge)
  - 🧀 Paneer (+4 days, Fridge)
- **Quick Date Chips**: Jump ahead `+1 Day`, `+3 Days`, `+1 Week`, `+2 Weeks`, `+1 Month`, `+6 Months` with a single click.

### 3. 🔔 Expiry Alerts & Audio Chimes
- **Desktop & Mobile Push Notifications**: Browser Web Notifications alert you when items are close to expiring.
- **Custom Alert Threshold**: Configure reminders for 1, 2, 3, 5, or 7 days prior to expiry in Settings.
- **Synthesized Audio Chimes**: Built-in Web Audio API alerts (urgent chime for items expiring today, gentle alert for items expiring soon). Zero external MP3 downloads needed.
- **Notification Drawer**: Dedicated side drawer listing all items requiring urgent attention, with 1-click **"Mark Consumed"** actions.

### 4. 🗂️ Sorting, Filtering & Search
- **Instant Sorting**:
  - *Expiry: Soonest First ⚡* (default — keeps urgent groceries at the top)
  - *Expiry: Furthest First*
  - *Name: A to Z*
  - *Recently Added*
- **Filter Chips**: All Items, ⏳ Expiring Soon (≤3 days), ❌ Expired, ❄️ Fridge, 🥫 Pantry, 🧊 Freezer, 🥛 Dairy, 🥫 Sauces & Condiments, 🍞 Bakery, 🥬 Produce, 🍽️ Consumed History.
- **Real-Time Search**: Search by product name, category, storage location, or notes.

### 5. 📊 Food Waste Prevention & Smart Cook Suggester
- **Waste Statistics**: Tracks your household food-saving rate (`% Consumed vs Discarded`).
- **Smart Cook Suggestions**: Recommends delicious recipes and tips for whatever is expiring in your fridge right now (e.g., turning expiring curd into Kadhi or Chaas; expiring milk into fresh Paneer or Pancakes; bread into French toast or croutons).

### 6. 🔒 100% Private & Offline-First
- Data stored locally in your browser using **IndexedDB** (with localStorage fallback).
- No account registration or cloud subscription required.
- **JSON Backup & Restore**: Export your kitchen inventory anytime or restore on another device.

---

## 🚀 How to Run the App

### Option A: One-Click Launch (Windows)
Double-click [`start.bat`](file:///e:/Projects/grocery_tracker/start.bat) in the project root. This starts the lightweight PowerShell HTTP server and automatically opens `http://localhost:8080/` in your browser.

### Option B: PowerShell Command Line
Open PowerShell in the project directory and run:
```powershell
pwsh -ExecutionPolicy Bypass -File server.ps1
```
Then visit:
```
http://localhost:8080/
```

---

## 🌐 Deploying to Netlify

Netlify provides instant, free HTTPS hosting with custom domain support.

### Method 1: Instant Drag-and-Drop (Netlify Drop — 30 Seconds, No Git Needed)
1. Go to **[app.netlify.com/drop](https://app.netlify.com/drop)** in your browser (log in or sign up for free).
2. Drag and drop the `grocery_tracker` folder directly into the browser upload box.
3. Done! Netlify immediately provisions a live HTTPS URL (e.g. `https://freshguard-kitchen.netlify.app`).

### Method 2: Connect via GitHub (Automatic Updates on Push)
1. Push your repository to GitHub (see GitHub instructions below).
2. Go to your [Netlify Dashboard](https://app.netlify.com) and click **"Add new site" > "Import an existing project"**.
3. Select **GitHub** and pick your `grocery_tracker` repository.
4. The repository already includes [`netlify.toml`](file:///e:/Projects/grocery_tracker/netlify.toml), so click **"Deploy site"**. Every future `git push` will deploy automatically!

---

## 🐙 Hosting on GitHub & GitHub Pages

The project has already been initialized as a Git repository (`main` branch) and includes an automated deployment workflow: [`.github/workflows/deploy.yml`](file:///e:/Projects/grocery_tracker/.github/workflows/deploy.yml).

### Steps to Push to Your GitHub Account:
1. Create a new repository on [github.com/new](https://github.com/new) named `grocery-tracker` (or any name you prefer). Leave it empty (do NOT check "Add a README" or ".gitignore").
2. Run these commands in PowerShell from `e:\Projects\grocery_tracker`:
   ```powershell
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/grocery-tracker.git
   git push -u origin main
   ```
3. Enable GitHub Pages:
   - On GitHub, go to your repository **Settings > Pages**.
   - Under **Build and deployment > Source**, select **"GitHub Actions"**.
   - The included workflow will automatically build and publish your site at `https://<YOUR_GITHUB_USERNAME>.github.io/grocery-tracker/`!

---

## 📲 How to Install as a PWA on Mobile Devices

Once hosted on Netlify or GitHub Pages (or on local Wi-Fi):

### 🤖 On Android (Google Chrome / Brave / Edge)
1. Open your hosted URL in **Google Chrome**.
2. Tap the **"📲 Install"** button in the top bar, or tap the three dots menu (⋮) in the browser.
3. Tap **"Install app"** or **"Add to Home screen"**.
4. The FreshGuard icon will be added to your home screen and app drawer, opening in full-screen standalone mode without any browser URL bar.

### 🍏 On iOS (iPhone & iPad - Apple Safari)
1. Open your hosted URL in **Safari** (Apple requires Safari for PWA installation).
2. Tap the **Share** button (the square icon with an arrow pointing up at the bottom of the screen).
3. Scroll down in the share sheet and tap **"Add to Home Screen"** (`+`).
4. Tap **"Add"** in the top-right corner.
5. The app icon will appear directly on your iOS home screen! Tap it anytime to open FreshGuard in true full-screen mode with native iOS safe-area handling.

## 🧪 Testing with Sample Grocery Labels

Three high-contrast sample labels are provided in [`sample-images/`](file:///e:/Projects/grocery_tracker/sample-images/):
- `sample_milk_label.png` (Amul Taaza Milk with `USE BY: 22/10/2026`)
- `sample_curd_label.png` (Mother Dairy Dahi with `PACKED ON: 17/10/2026` + `CONSUME WITHIN 2 DAYS`)
- `sample_sauce_label.png` (Heinz Tomato Ketchup with `EXP DATE: 25/08/2027`)

To test the scanner without taking a physical photo:
1. Click **"Scan Label"** in the top bar.
2. Click **"📁 Upload / Pick Photo"**.
3. Select any file from `sample-images/`.
4. Watch FreshGuard scan the image, extract the date stamp, suggest the category, and prepare the record!

---

## 📁 File Structure

```
grocery_tracker/
├── index.html                 # Main responsive application markup
├── styles.css                 # Modern CSS with animations, viewfinder, card grid
├── manifest.webmanifest       # PWA manifest
├── sw.js                      # Service Worker for offline capability
├── server.ps1                 # Lightweight PowerShell Core HTTP server
├── start.bat                  # 1-click Windows launcher
├── js/
│   ├── db.js                  # IndexedDB persistence layer (CRUD, logs, backup)
│   ├── notifications.js       # Web Notifications, Web Audio chime synthesizer
│   ├── scanner.js             # Camera handling, canvas OCR parser, Gemini Vision
│   └── app.js                 # App controller, event handlers, recipes & stats
├── icons/
│   └── favicon.svg            # SVG avocado & leaf brand icon
└── sample-images/             # Test labels for milk, curd, and sauces
    ├── sample_milk_label.png
    ├── sample_curd_label.png
    └── sample_sauce_label.png
```
