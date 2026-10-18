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

### Accessing on Mobile Devices (Same Wi-Fi)
To use the app on your smartphone in the kitchen:
1. Find your computer's local IP address (e.g. `192.168.1.X`).
2. Open `http://<your-computer-ip>:8080/` on your mobile phone browser (Chrome or Safari).
3. Tap **"Add to Home Screen"** to install it as an app!

---

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
