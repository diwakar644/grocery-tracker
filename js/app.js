/**
 * FreshGuard - Main Application Controller
 * Manages UI interactions, items CRUD, filtering, sorting, modals, and scanning workflows.
 */

class FreshGuardApp {
  constructor() {
    this.items = [];
    this.currentFilter = 'all';
    this.currentSort = 'expiry_asc';
    this.searchQuery = '';
    this.viewMode = 'grid'; // 'grid' | 'table'
    this.editingItemId = null;
    this.activeCameraStream = false;
    this.currentScannedImage = null;
  }

  async init() {
    console.log('Initializing FreshGuard...');
    await window.FreshDB.initPromise;
    console.log('DB init finished');
    await window.FreshNotifier.init();
    console.log('Notifier init finished');

    this.bindEvents();
    console.log('Events bound');
    await this.loadItems();
    console.log('Loaded items count:', this.items.length);
    this.renderStatsBanner();

    // Check if initial sample data should be loaded for first-time users
    const hasPrompted = localStorage.getItem('freshguard_welcomed');
    if (!hasPrompted && this.items.length === 0) {
      console.log('First-time user detected: loading sample data...');
      await this.loadSampleData(false);
      localStorage.setItem('freshguard_welcomed', 'true');
      console.log('Sample data loaded successfully!');
    }

    // Check URL hash for shortcut actions (#scan or #add)
    this.handleUrlHash();
    window.addEventListener('hashchange', () => this.handleUrlHash());

    // PWA Install prompt listener
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const installBtn = document.getElementById('btnInstallPwa');
      if (installBtn) installBtn.classList.remove('hidden');
    });
  }

  handleUrlHash() {
    const hash = window.location.hash;
    if (hash === '#scan') {
      this.openScannerModal();
    } else if (hash === '#add') {
      this.openAddModal();
    }
  }

  async promptPwaInstall() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const choice = await this.deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        const installBtn = document.getElementById('btnInstallPwa');
        if (installBtn) installBtn.classList.add('hidden');
      }
      this.deferredPrompt = null;
    } else {
      // iOS Safari fallback message
      alert('To install on iPhone/iPad (iOS):\n1. Tap the Safari Share button (box with arrow)\n2. Scroll down and tap "Add to Home Screen" 📲');
    }
  }

  // --- Data Loading & Rendering ---

  async loadItems() {
    this.items = await window.FreshDB.getAllItems();
    this.renderItemList();
    this.renderStatsBanner();
    window.FreshNotifier.checkExpiringItems();
  }

  getFilteredAndSortedItems() {
    let result = [...this.items];

    // Filter by active status by default unless viewing history
    if (this.currentFilter === 'consumed') {
      result = result.filter((i) => i.status === 'consumed');
    } else if (this.currentFilter === 'discarded') {
      result = result.filter((i) => i.status === 'discarded');
    } else {
      result = result.filter((i) => i.status === 'active' || !i.status);
    }

    // Search query
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          (i.notes && i.notes.toLowerCase().includes(q)) ||
          i.storageLocation.toLowerCase().includes(q)
      );
    }

    // Filter Chips
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (this.currentFilter === 'expiring_soon') {
      result = result.filter((i) => {
        const exp = new Date(i.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const diff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= window.FreshNotifier.alertThresholdDays;
      });
    } else if (this.currentFilter === 'expired') {
      result = result.filter((i) => {
        const exp = new Date(i.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const diff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        return diff < 0;
      });
    } else if (['Fridge', 'Pantry', 'Freezer'].includes(this.currentFilter)) {
      result = result.filter((i) => i.storageLocation === this.currentFilter);
    } else if (['Dairy', 'Sauces & Condiments', 'Bakery', 'Produce', 'Meat & Poultry'].includes(this.currentFilter)) {
      result = result.filter((i) => i.category === this.currentFilter);
    }

    // Sorting
    result.sort((a, b) => {
      if (this.currentSort === 'expiry_asc') {
        return new Date(a.expiryDate) - new Date(b.expiryDate);
      } else if (this.currentSort === 'expiry_desc') {
        return new Date(b.expiryDate) - new Date(a.expiryDate);
      } else if (this.currentSort === 'name_asc') {
        return a.name.localeCompare(b.name);
      } else if (this.currentSort === 'created_desc') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      return 0;
    });

    return result;
  }

  renderItemList() {
    const container = document.getElementById('itemsContainer');
    const emptyState = document.getElementById('emptyState');
    const items = this.getFilteredAndSortedItems();

    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    container.innerHTML = items
      .map((item) => {
        const exp = new Date(item.expiryDate);
        exp.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

        let badgeClass = 'badge-fresh';
        let badgeIcon = '🟢';
        let statusText = `${diffDays} days left`;

        if (diffDays < 0) {
          badgeClass = 'badge-expired';
          badgeIcon = '❌';
          statusText = `Expired ${Math.abs(diffDays)}d ago`;
        } else if (diffDays === 0) {
          badgeClass = 'badge-urgent';
          badgeIcon = '🚨';
          statusText = 'Expires TODAY';
        } else if (diffDays === 1) {
          badgeClass = 'badge-urgent';
          badgeIcon = '⚠️';
          statusText = 'Expires Tomorrow';
        } else if (diffDays <= 3) {
          badgeClass = 'badge-warning';
          badgeIcon = '⏳';
          statusText = `Expires in ${diffDays} days`;
        }

        // Category icon
        const catIcons = {
          'Dairy': '🥛',
          'Sauces & Condiments': '🥫',
          'Bakery': '🍞',
          'Produce': '🥬',
          'Meat & Poultry': '🍗',
          'Beverages': '🧃',
          'Pantry & Dry Goods': '🌾',
          'Frozen Foods': '🧊',
          'Other': '🛒'
        };

        const storageIcons = {
          'Fridge': '❄️ Fridge',
          'Pantry': '🥫 Pantry',
          'Freezer': '🧊 Freezer',
          'Countertop': '🧺 Counter'
        };

        const formattedExpDate = this.formatDateDisplay(item.expiryDate);

        return `
        <div class="item-card ${diffDays < 0 ? 'card-expired' : diffDays <= 1 ? 'card-urgent' : ''}" data-id="${item.id}">
          <div class="item-card-top">
            <div class="item-category-pill">
              <span>${catIcons[item.category] || '🛒'}</span>
              <span>${item.category}</span>
            </div>
            <div class="expiry-badge ${badgeClass}">
              <span>${badgeIcon}</span>
              <span>${statusText}</span>
            </div>
          </div>

          <div class="item-body">
            ${
              item.image
                ? `<div class="item-thumb-wrapper" onclick="app.previewImage('${item.image}', '${this.escapeHtml(item.name)}')">
                     <img src="${item.image}" alt="${this.escapeHtml(item.name)}" class="item-thumb" />
                     <span class="thumb-zoom-icon">🔍</span>
                   </div>`
                : `<div class="item-thumb-placeholder">${catIcons[item.category] || '📦'}</div>`
            }
            <div class="item-details">
              <h3 class="item-name" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</h3>
              <div class="item-meta">
                <span class="meta-qty">${item.quantity} ${item.unit}</span>
                <span class="meta-dot">•</span>
                <span class="meta-storage">${storageIcons[item.storageLocation] || item.storageLocation}</span>
              </div>
              <div class="item-date-row">
                <span class="date-label">Expiry:</span>
                <span class="date-val ${diffDays <= 1 ? 'text-urgent' : ''}">${formattedExpDate}</span>
              </div>
              ${item.notes ? `<p class="item-note">📝 ${this.escapeHtml(item.notes)}</p>` : ''}
            </div>
          </div>

          <div class="item-actions">
            ${
              item.status === 'active' || !item.status
                ? `
                <button class="btn-action btn-consume" onclick="app.markConsumed('${item.id}')" title="Mark as consumed / cooked">
                  <span>🍽️</span> Consumed
                </button>
                <button class="btn-action btn-edit" onclick="app.editItem('${item.id}')" title="Edit details">
                  <span>✏️</span> Edit
                </button>
                <button class="btn-action btn-discard" onclick="app.discardItem('${item.id}')" title="Mark as discarded / spoiled">
                  <span>🗑️</span>
                </button>
                `
                : `
                <button class="btn-action btn-consume" onclick="app.restoreItem('${item.id}')" title="Restore back to active tracking">
                  <span>🔄</span> Restore
                </button>
                <button class="btn-action btn-discard" onclick="app.deleteItemForever('${item.id}')" title="Delete permanently">
                  <span>🗑️</span> Delete
                </button>
                `
            }
          </div>
        </div>
      `;
      })
      .join('');
  }

  async renderStatsBanner() {
    const stats = await window.FreshDB.getStats();

    const elTotal = document.getElementById('statTotal');
    const elExpiring = document.getElementById('statExpiring');
    const elExpired = document.getElementById('statExpired');
    const elSaveRate = document.getElementById('statSaveRate');

    if (elTotal) elTotal.textContent = stats.totalActive;
    if (elExpiring) elExpiring.textContent = stats.expiringSoon;
    if (elExpired) elExpired.textContent = stats.expired;
    if (elSaveRate) elSaveRate.textContent = `${stats.saveRate}%`;
  }

  // --- Item Actions ---

  async markConsumed(id) {
    const item = await window.FreshDB.markItemStatus(id, 'consumed');
    if (item) {
      window.FreshNotifier.playChime('success');
      window.FreshNotifier.showToast(`Yum! Marked "${item.name}" as consumed. Great job preventing waste!`, 'success');
      await this.loadItems();
    }
  }

  async discardItem(id) {
    const item = await window.FreshDB.getItem(id);
    if (!item) return;

    if (confirm(`Mark "${item.name}" as spoiled / discarded?`)) {
      await window.FreshDB.markItemStatus(id, 'discarded');
      window.FreshNotifier.showToast(`Marked "${item.name}" as discarded.`, 'warning');
      await this.loadItems();
    }
  }

  async restoreItem(id) {
    await window.FreshDB.markItemStatus(id, 'active');
    window.FreshNotifier.showToast(`Restored to active tracking!`, 'info');
    await this.loadItems();
  }

  async deleteItemForever(id) {
    if (confirm('Permanently delete this record?')) {
      await window.FreshDB.deleteItem(id);
      window.FreshNotifier.showToast('Item deleted.', 'info');
      await this.loadItems();
    }
  }

  // --- Add / Edit Item Modal ---

  openAddModal(prefill = {}) {
    this.editingItemId = null;
    const modal = document.getElementById('itemModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('itemForm');

    form.reset();
    document.getElementById('itemId').value = '';
    title.textContent = 'Add Kitchen Item';

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('itemPurchaseDate').value = today;

    // Default expiry: 3 days from now
    const defaultExp = new Date();
    defaultExp.setDate(defaultExp.getDate() + 3);
    document.getElementById('itemExpiryDate').value = defaultExp.toISOString().split('T')[0];

    // Clear image preview
    this.currentScannedImage = null;
    this.updateImagePreview(null);

    // Apply prefill if provided (from scanner)
    if (prefill.name) document.getElementById('itemName').value = prefill.name;
    if (prefill.category) document.getElementById('itemCategory').value = prefill.category;
    if (prefill.storageLocation) document.getElementById('itemStorage').value = prefill.storageLocation;
    if (prefill.expiryDate) document.getElementById('itemExpiryDate').value = prefill.expiryDate;
    if (prefill.notes) document.getElementById('itemNotes').value = prefill.notes;
    if (prefill.image) {
      this.currentScannedImage = prefill.image;
      this.updateImagePreview(prefill.image);
    }

    modal.classList.add('active');
  }

  async editItem(id) {
    const item = await window.FreshDB.getItem(id);
    if (!item) return;

    this.editingItemId = id;
    const modal = document.getElementById('itemModal');
    const title = document.getElementById('modalTitle');

    title.textContent = 'Edit Grocery Item';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemStorage').value = item.storageLocation;
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemUnit').value = item.unit;
    document.getElementById('itemPurchaseDate').value = item.purchaseDate;
    document.getElementById('itemExpiryDate').value = item.expiryDate;
    document.getElementById('itemNotes').value = item.notes || '';

    this.currentScannedImage = item.image || null;
    this.updateImagePreview(this.currentScannedImage);

    modal.classList.add('active');
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  async handleItemFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('itemName').value.trim();
    const expiryDate = document.getElementById('itemExpiryDate').value;

    if (!name || !expiryDate) {
      window.FreshNotifier.showToast('Please provide an item name and expiry date.', 'warning');
      return;
    }

    const itemData = {
      id: this.editingItemId || undefined,
      name,
      category: document.getElementById('itemCategory').value,
      storageLocation: document.getElementById('itemStorage').value,
      quantity: document.getElementById('itemQuantity').value,
      unit: document.getElementById('itemUnit').value,
      purchaseDate: document.getElementById('itemPurchaseDate').value,
      expiryDate,
      notes: document.getElementById('itemNotes').value.trim(),
      image: this.currentScannedImage
    };

    await window.FreshDB.saveItem(itemData);
    this.closeModal('itemModal');
    window.FreshNotifier.playChime('success');
    window.FreshNotifier.showToast(this.editingItemId ? 'Item updated!' : `Added "${name}" to tracker!`, 'success');

    await this.loadItems();
  }

  // --- Quick Date Offset Helper ---

  setExpiryOffset(days) {
    const expInput = document.getElementById('itemExpiryDate');
    const d = new Date();
    d.setDate(d.getDate() + days);
    expInput.value = d.toISOString().split('T')[0];
  }

  // --- Preset Item Quick Adder ---

  applyPreset(presetKey) {
    const presets = {
      milk: { name: 'Fresh Milk', category: 'Dairy', storage: 'Fridge', days: 3, unit: 'packet' },
      curd: { name: 'Curd / Dahi', category: 'Dairy', storage: 'Fridge', days: 4, unit: 'tub' },
      bread: { name: 'Sliced Bread', category: 'Bakery', storage: 'Pantry', days: 4, unit: 'loaf' },
      eggs: { name: 'Eggs', category: 'Meat & Poultry', storage: 'Fridge', days: 21, unit: 'tray' },
      cheese: { name: 'Cheddar Cheese', category: 'Dairy', storage: 'Fridge', days: 25, unit: 'block' },
      paneer: { name: 'Fresh Paneer', category: 'Dairy', storage: 'Fridge', days: 4, unit: 'g' },
      sauce: { name: 'Tomato Sauce', category: 'Sauces & Condiments', storage: 'Fridge', days: 90, unit: 'bottle' },
      chicken: { name: 'Chicken Breast', category: 'Meat & Poultry', storage: 'Fridge', days: 2, unit: 'kg' },
      yogurt: { name: 'Greek Yogurt', category: 'Dairy', storage: 'Fridge', days: 7, unit: 'cup' }
    };

    const p = presets[presetKey];
    if (!p) return;

    document.getElementById('itemName').value = p.name;
    document.getElementById('itemCategory').value = p.category;
    document.getElementById('itemStorage').value = p.storage;
    document.getElementById('itemUnit').value = p.unit;
    this.setExpiryOffset(p.days);
  }

  // --- Scanner Modal & Camera/OCR Operations ---

  openScannerModal() {
    const modal = document.getElementById('scannerModal');
    modal.classList.add('active');

    // Reset scanner state
    document.getElementById('scannerResultCard').classList.add('hidden');
    document.getElementById('scannerProgress').classList.add('hidden');
    document.getElementById('cameraView').classList.remove('hidden');

    this.startCameraStream();
  }

  async startCameraStream() {
    const video = document.getElementById('scannerVideo');
    const errBox = document.getElementById('cameraError');
    if (!video) return;

    errBox.classList.add('hidden');
    try {
      await window.FreshScanner.startCamera(video);
      this.activeCameraStream = true;
    } catch (err) {
      console.warn('Could not start live camera preview:', err);
      this.activeCameraStream = false;
      errBox.classList.remove('hidden');
      errBox.textContent = 'Camera not accessible or permission denied. Please upload a photo instead.';
    }
  }

  stopCameraStream() {
    window.FreshScanner.stopCamera();
    this.activeCameraStream = false;
  }

  closeScannerModal() {
    this.stopCameraStream();
    this.closeModal('scannerModal');
  }

  async captureFromCamera() {
    const video = document.getElementById('scannerVideo');
    const frame = window.FreshScanner.captureFrame(video);
    if (!frame) {
      window.FreshNotifier.showToast('Please wait for camera stream to begin.', 'warning');
      return;
    }
    this.stopCameraStream();
    await this.processScannedImage(frame);
  }

  async handleFileUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      window.FreshNotifier.showToast('Please select a valid image file.', 'warning');
      return;
    }

    this.stopCameraStream();
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      await this.processScannedImage(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async processScannedImage(imageDataUrl) {
    this.currentScannedImage = imageDataUrl;

    const progressBox = document.getElementById('scannerProgress');
    const progressBar = document.getElementById('scannerProgressBar');
    const progressStatus = document.getElementById('scannerProgressStatus');
    const resultCard = document.getElementById('scannerResultCard');
    const cameraView = document.getElementById('cameraView');

    cameraView.classList.add('hidden');
    resultCard.classList.add('hidden');
    progressBox.classList.remove('hidden');

    // Check if AI Vision mode is enabled
    const useAiVision = document.getElementById('toggleAiVision')?.checked;
    const apiKey = await window.FreshDB.getSetting('gemini_api_key', '');

    try {
      let scanResult = null;

      if (useAiVision && apiKey) {
        progressStatus.textContent = 'Analyzing label with Gemini Vision AI...';
        progressBar.style.width = '60%';
        scanResult = await window.FreshScanner.scanWithGemini(imageDataUrl, apiKey);
        progressBar.style.width = '100%';
      } else {
        progressStatus.textContent = 'Initializing OCR date engine...';
        scanResult = await window.FreshScanner.scanWithOCR(imageDataUrl, (p) => {
          progressStatus.textContent = p.status;
          progressBar.style.width = `${Math.min(100, Math.max(10, p.progress))}%`;
        });
      }

      progressBox.classList.add('hidden');
      this.displayScannerResult(scanResult, imageDataUrl);
    } catch (err) {
      console.error('Scan processing error:', err);
      progressBox.classList.add('hidden');
      window.FreshNotifier.showToast('Could not automatically parse label: ' + err.message, 'error');

      // Still show result card so user can manually adjust with the photo
      this.displayScannerResult(
        {
          expiryDate: null,
          name: '',
          category: 'Other',
          confidence: 'none',
          notes: 'Auto-scan failed; please enter date manually.'
        },
        imageDataUrl
      );
    }
  }

  displayScannerResult(result, imageDataUrl) {
    const resultCard = document.getElementById('scannerResultCard');
    const resultPreview = document.getElementById('scannedThumb');
    const detectedDateEl = document.getElementById('scannedDateDisplay');
    const detectedNameEl = document.getElementById('scannedNameInput');
    const detectedCategoryEl = document.getElementById('scannedCategoryInput');
    const confidenceBadge = document.getElementById('scannedConfidence');

    resultPreview.src = imageDataUrl;

    // Normalizing results from OCR or Gemini
    const expiry = result.expiryDate || '';
    const name = result.name || result.suggestedName || '';
    const category = result.category || result.suggestedCategory || 'Other';
    const confidence = result.confidence || result.expiryConfidence || 'low';

    detectedDateEl.value = expiry;
    detectedNameEl.value = name;
    detectedCategoryEl.value = category;

    confidenceBadge.className = `confidence-badge confidence-${confidence}`;
    confidenceBadge.textContent =
      confidence === 'high' ? '🎯 High Confidence' : confidence === 'medium' ? '🔍 Medium Confidence' : '⚠️ Review Date';

    resultCard.classList.remove('hidden');
  }

  confirmScannedResult() {
    const name = document.getElementById('scannedNameInput').value;
    const category = document.getElementById('scannedCategoryInput').value;
    const expiryDate = document.getElementById('scannedDateDisplay').value;

    this.closeScannerModal();

    // Open Add Modal populated with scanned data
    this.openAddModal({
      name: name || 'Scanned Grocery Item',
      category: category || 'Other',
      expiryDate: expiryDate || '',
      image: this.currentScannedImage
    });
  }

  // --- Image Preview Modal ---

  previewImage(src, title) {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('modalImagePreview');
    const caption = document.getElementById('modalImageCaption');

    img.src = src;
    caption.textContent = title;
    modal.classList.add('active');
  }

  updateImagePreview(dataUrl) {
    const previewWrapper = document.getElementById('formImagePreviewWrapper');
    const previewImg = document.getElementById('formImagePreview');
    if (!previewWrapper || !previewImg) return;

    if (dataUrl) {
      previewImg.src = dataUrl;
      previewWrapper.classList.remove('hidden');
    } else {
      previewImg.src = '';
      previewWrapper.classList.add('hidden');
    }
  }

  removeFormImage() {
    this.currentScannedImage = null;
    this.updateImagePreview(null);
  }

  // --- Waste Reduction & Recipe Suggester ---

  async openWasteStatsModal() {
    const stats = await window.FreshDB.getStats();
    const modal = document.getElementById('statsModal');

    document.getElementById('metricConsumed').textContent = stats.consumed;
    document.getElementById('metricDiscarded').textContent = stats.discarded;
    document.getElementById('metricActive').textContent = stats.totalActive;
    document.getElementById('metricSaveRate').textContent = `${stats.saveRate}%`;

    // Expiring soon items for recipe suggestions
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiringItems = this.items.filter((i) => {
      if (i.status !== 'active') return false;
      const exp = new Date(i.expiryDate);
      exp.setHours(0, 0, 0, 0);
      const diff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 3;
    });

    const suggestionsContainer = document.getElementById('recipeSuggestions');
    if (expiringItems.length === 0) {
      suggestionsContainer.innerHTML = `
        <div class="empty-cook-state">
          <span>✨</span>
          <p>No items expiring in the next 3 days! Your kitchen inventory is in great shape.</p>
        </div>
      `;
    } else {
      const ideas = this.generateCookSuggestions(expiringItems);
      suggestionsContainer.innerHTML = ideas
        .map(
          (idea) => `
        <div class="cook-card">
          <div class="cook-icon">${idea.icon}</div>
          <div class="cook-content">
            <h4>${idea.title}</h4>
            <p>${idea.desc}</p>
            <span class="cook-item-tag">Uses: ${idea.itemsUsed.join(', ')}</span>
          </div>
        </div>
      `
        )
        .join('');
    }

    modal.classList.add('active');
  }

  generateCookSuggestions(items) {
    const names = items.map((i) => i.name.toLowerCase());
    const ideas = [];

    const hasMilk = names.some((n) => n.includes('milk'));
    const hasCurd = names.some((n) => n.includes('curd') || n.includes('dahi') || n.includes('yogurt'));
    const hasBread = names.some((n) => n.includes('bread') || n.includes('bun'));
    const hasSauce = names.some((n) => n.includes('sauce') || n.includes('ketchup') || n.includes('salsa'));
    const hasEggs = names.some((n) => n.includes('egg'));
    const hasVeg = names.some((n) => n.includes('tomato') || n.includes('potato') || n.includes('spinach') || n.includes('veg'));

    if (hasCurd) {
      ideas.push({
        icon: '🥣',
        title: 'Quick Kadhi / Spiced Chaas / Raita',
        desc: 'Curd close to expiry is fermented and perfect for tangy Gujarati/Punjabi Kadhi, Tadka Raita, or refreshing Buttermilk.',
        itemsUsed: ['Curd / Dahi']
      });
      ideas.push({
        icon: '🍢',
        title: 'Tandoori / Tikka Marination',
        desc: 'Use remaining curd with ginger-garlic paste and chili powder to marinate paneer, veggies, or chicken.',
        itemsUsed: ['Curd / Dahi']
      });
    }

    if (hasMilk) {
      ideas.push({
        icon: '🧀',
        title: 'Homemade Soft Paneer / Chenna',
        desc: 'Boil expiring milk with a spoon of lemon juice or vinegar to get fresh, preservative-free cottage cheese in 5 minutes.',
        itemsUsed: ['Milk']
      });
      ideas.push({
        icon: '🥞',
        title: 'Pancakes / Oatmeal / Creamy Chai',
        desc: 'Simmer into warm cinnamon oatmeal or whip up a quick batch of fluffy breakfast pancakes.',
        itemsUsed: ['Milk']
      });
    }

    if (hasBread && hasEggs) {
      ideas.push({
        icon: '🍳',
        title: 'Classic French Toast / Egg Scramble Toast',
        desc: 'Slightly stale bread absorbs egg batter perfectly without getting soggy. Great weekend breakfast!',
        itemsUsed: ['Bread', 'Eggs']
      });
    } else if (hasBread) {
      ideas.push({
        icon: '🍞',
        title: 'Crispy Garlic Croutons / Bread Upma',
        desc: 'Cube stale bread and toss in a pan with butter/ghee, garlic, and herbs for crunchy soup croutons or quick spicy bread upma.',
        itemsUsed: ['Bread']
      });
    }

    if (hasSauce) {
      ideas.push({
        icon: '🍝',
        title: 'One-Pot Pasta Sauce / Spicy Rice Bowl',
        desc: 'Combine opened sauces with sautéed onions, garlic, and leftover veggies for a savory pasta glaze or fried rice.',
        itemsUsed: ['Sauces & Condiments']
      });
    }

    if (ideas.length === 0) {
      const sampleNames = items.slice(0, 3).map((i) => i.name).join(', ');
      ideas.push({
        icon: '🥘',
        title: 'Kitchen Clean-out Stir-Fry or Soup',
        desc: `Toss ${sampleNames} into a hot skillet with soy sauce and garlic, or simmer with broth for a hearty stew.`,
        itemsUsed: items.slice(0, 3).map((i) => i.name)
      });
    }

    return ideas;
  }

  // --- Notification Drawer ---

  async openNotificationDrawer() {
    const drawer = document.getElementById('notifDrawer');
    const list = document.getElementById('drawerAlertList');
    const result = await window.FreshNotifier.checkExpiringItems(false);

    const allUrgent = [...result.expiresToday, ...result.expiringSoon, ...result.expired];

    if (allUrgent.length === 0) {
      list.innerHTML = `
        <div class="empty-drawer">
          <span>🔔</span>
          <p>No urgent expiry alerts right now. All groceries are safe and sound!</p>
        </div>
      `;
    } else {
      list.innerHTML = allUrgent
        .map((item) => {
          const isExpired = item.diffDays < 0;
          const isToday = item.diffDays === 0;

          return `
          <div class="drawer-alert-item ${isExpired ? 'drawer-expired' : isToday ? 'drawer-urgent' : ''}">
            <div class="drawer-alert-info">
              <h4>${this.escapeHtml(item.name)}</h4>
              <p>
                ${
                  isExpired
                    ? `❌ Expired ${Math.abs(item.diffDays)} day(s) ago`
                    : isToday
                    ? `🚨 Expires TODAY (${this.formatDateDisplay(item.expiryDate)})`
                    : `⏳ Expires in ${item.diffDays} day(s)`
                }
              </p>
            </div>
            <button class="btn-drawer-consume" onclick="app.markConsumed('${item.id}'); app.openNotificationDrawer();">
              Mark Consumed
            </button>
          </div>
        `;
        })
        .join('');
    }

    drawer.classList.add('active');
    const backdrop = document.getElementById('drawerBackdrop');
    if (backdrop) backdrop.classList.remove('hidden');
  }

  closeNotificationDrawer() {
    const drawer = document.getElementById('notifDrawer');
    if (drawer) drawer.classList.remove('active');
    const backdrop = document.getElementById('drawerBackdrop');
    if (backdrop) backdrop.classList.add('hidden');
  }

  // --- Settings & Data Management ---

  async openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const key = await window.FreshDB.getSetting('gemini_api_key', '');
    const threshold = await window.FreshDB.getSetting('alert_threshold_days', 3);

    document.getElementById('settingsApiKey').value = key;
    document.getElementById('settingsThreshold').value = threshold;

    modal.classList.add('active');
  }

  async saveSettings() {
    const key = document.getElementById('settingsApiKey').value.trim();
    const threshold = parseInt(document.getElementById('settingsThreshold').value, 10) || 3;

    await window.FreshDB.setSetting('gemini_api_key', key);
    await window.FreshDB.setSetting('alert_threshold_days', threshold);
    window.FreshNotifier.alertThresholdDays = threshold;

    this.closeModal('settingsModal');
    window.FreshNotifier.showToast('Settings saved successfully!', 'success');
  }

  async exportData() {
    const data = await window.FreshDB.exportAll();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freshguard_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    window.FreshNotifier.showToast('Backup exported as JSON!', 'success');
  }

  async importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const count = await window.FreshDB.importAll(e.target.result);
        window.FreshNotifier.showToast(`Successfully imported ${count} items!`, 'success');
        await this.loadItems();
      } catch (err) {
        window.FreshNotifier.showToast('Failed to import backup file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  async loadSampleData(showToast = true) {
    const today = new Date();

    const sampleItems = [
      {
        name: 'Amul Taaza Homogenised Toned Milk',
        category: 'Dairy',
        storageLocation: 'Fridge',
        quantity: 1,
        unit: 'L',
        purchaseDate: today.toISOString().split('T')[0],
        expiryDate: this._getRelativeDate(2), // 2 days left (warning)
        notes: 'Opened today, keep refrigerated'
      },
      {
        name: 'Mother Dairy Fresh Curd / Dahi',
        category: 'Dairy',
        storageLocation: 'Fridge',
        quantity: 1,
        unit: 'tub',
        purchaseDate: this._getRelativeDate(-2),
        expiryDate: this._getRelativeDate(0), // EXPIRES TODAY!
        notes: 'Use today for Kadhi or Tadka Raita'
      },
      {
        name: 'Ching’s Secret Schezwan Sauce',
        category: 'Sauces & Condiments',
        storageLocation: 'Fridge',
        quantity: 1,
        unit: 'bottle',
        purchaseDate: this._getRelativeDate(-15),
        expiryDate: this._getRelativeDate(45), // Fresh
        notes: 'Best for noodles & fried rice'
      },
      {
        name: 'Harvest Gold 100% Atta Bread',
        category: 'Bakery',
        storageLocation: 'Pantry',
        quantity: 1,
        unit: 'loaf',
        purchaseDate: this._getRelativeDate(-1),
        expiryDate: this._getRelativeDate(3), // 3 days left
        notes: 'For breakfast toast'
      },
      {
        name: 'Farm Fresh Organic Eggs',
        category: 'Meat & Poultry',
        storageLocation: 'Fridge',
        quantity: 12,
        unit: 'tray',
        purchaseDate: this._getRelativeDate(-3),
        expiryDate: this._getRelativeDate(14),
        notes: 'Grade A eggs'
      },
      {
        name: 'Veeba Real Mayonnaise',
        category: 'Sauces & Condiments',
        storageLocation: 'Fridge',
        quantity: 1,
        unit: 'jar',
        purchaseDate: this._getRelativeDate(-60),
        expiryDate: this._getRelativeDate(-2), // EXPIRED 2 days ago
        notes: 'Check smell before using'
      },
      {
        name: 'Amul Pasteurised Butter',
        category: 'Dairy',
        storageLocation: 'Fridge',
        quantity: 500,
        unit: 'g',
        purchaseDate: this._getRelativeDate(-10),
        expiryDate: this._getRelativeDate(90),
        notes: 'Keep cold'
      }
    ];

    for (const item of sampleItems) {
      await window.FreshDB.saveItem(item);
    }

    if (showToast) {
      window.FreshNotifier.showToast('Demo kitchen items loaded! Check expiring items.', 'success');
    }
    await this.loadItems();
  }

  _getRelativeDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
  }

  // --- UI Utilities ---

  formatDateDisplay(isoDate) {
    if (!isoDate) return 'N/A';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;

    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Event Bindings ---

  bindEvents() {
    // Top Bar Buttons
    document.getElementById('btnOpenScanner')?.addEventListener('click', () => this.openScannerModal());
    document.getElementById('btnManualAdd')?.addEventListener('click', () => this.openAddModal());
    document.getElementById('btnNotifDrawer')?.addEventListener('click', () => this.openNotificationDrawer());
    document.getElementById('btnWasteStats')?.addEventListener('click', () => this.openWasteStatsModal());
    document.getElementById('btnSettings')?.addEventListener('click', () => this.openSettingsModal());

    // Search & Filter
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim();
      this.renderItemList();
    });

    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.renderItemList();
    });

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentFilter = chip.dataset.filter;
        this.renderItemList();
      });
    });

    // Item Form
    document.getElementById('itemForm')?.addEventListener('submit', (e) => this.handleItemFormSubmit(e));

    // Preset Buttons
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const preset = btn.dataset.preset;
        this.applyPreset(preset);
      });
    });

    // Scanner Camera Controls
    document.getElementById('btnCapturePhoto')?.addEventListener('click', () => this.captureFromCamera());
    document.getElementById('scannerFileInput')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleFileUpload(e.target.files[0]);
      }
    });

    // Drag and Drop on Scanner View
    const scanDropZone = document.getElementById('cameraView');
    if (scanDropZone) {
      scanDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        scanDropZone.classList.add('drag-over');
      });
      scanDropZone.addEventListener('dragleave', () => scanDropZone.classList.remove('drag-over'));
      scanDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        scanDropZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });
    }

    // Modal Close buttons
    document.querySelectorAll('.modal-close, .modal-backdrop').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modal = btn.closest('.modal');
        if (modal) modal.classList.remove('active');
        if (modal && modal.id === 'scannerModal') {
          this.stopCameraStream();
        }
      });
    });

    // Notification Permission Request button
    document.getElementById('btnEnablePush')?.addEventListener('click', async () => {
      const granted = await window.FreshNotifier.requestPermission();
      if (granted) {
        window.FreshNotifier.showToast('Browser notifications enabled!', 'success');
      } else {
        window.FreshNotifier.showToast('Notification permission denied or blocked.', 'warning');
      }
    });

    // Audio Chime Test button
    document.getElementById('btnTestChime')?.addEventListener('click', () => {
      window.FreshNotifier.playChime('urgent');
    });

    // Settings Form
    document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });

    // Export / Import
    document.getElementById('btnExportBackup')?.addEventListener('click', () => this.exportData());
    document.getElementById('importBackupInput')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.importData(e.target.files[0]);
      }
    });

    // Sample data button in settings & empty state
    document.getElementById('btnLoadSamples')?.addEventListener('click', () => this.loadSampleData(true));
    document.getElementById('btnEmptyLoadSamples')?.addEventListener('click', () => this.loadSampleData(true));
    document.getElementById('btnEmptyAdd')?.addEventListener('click', () => this.openAddModal());

    // Global keyboard shortcuts (ESC closes modals & drawer)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach((m) => {
          m.classList.remove('active');
          if (m.id === 'scannerModal') this.stopCameraStream();
        });
        this.closeNotificationDrawer();
      }
    });
  }
}

// Instantiate and start app on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new FreshGuardApp();
  window.app.init();
});
