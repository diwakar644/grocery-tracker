/**
 * FreshGuard - IndexedDB Storage Layer
 * Manages grocery items, settings, and food waste reduction history.
 */

const DB_NAME = 'FreshGuardDB';
const DB_VERSION = 1;

class FreshGuardDB {
  constructor() {
    this.db = null;
    this.initPromise = this._init();
  }

  async _init() {
    if (!('indexedDB' in window)) {
      console.warn('IndexedDB not supported, falling back to localStorage');
      this.isFallback = true;
      return null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Items store
        if (!db.objectStoreNames.contains('items')) {
          const itemStore = db.createObjectStore('items', { keyPath: 'id' });
          itemStore.createIndex('expiryDate', 'expiryDate', { unique: false });
          itemStore.createIndex('category', 'category', { unique: false });
          itemStore.createIndex('storageLocation', 'storageLocation', { unique: false });
          itemStore.createIndex('status', 'status', { unique: false });
          itemStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Consumption log for waste statistics
        if (!db.objectStoreNames.contains('logs')) {
          const logStore = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
          logStore.createIndex('action', 'action', { unique: false });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        this.isFallback = true;
        resolve(null);
      };
    });
  }

  async _ensureDb() {
    await this.initPromise;
    if (this.isFallback) return null;
    return this.db;
  }

  // --- Items CRUD ---

  async getAllItems() {
    const db = await this._ensureDb();
    if (!db) {
      const raw = localStorage.getItem('freshguard_items');
      return raw ? JSON.parse(raw) : [];
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['items'], 'readonly');
      const store = transaction.objectStore('items');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getItem(id) {
    const db = await this._ensureDb();
    if (!db) {
      const items = await this.getAllItems();
      return items.find((i) => i.id === id) || null;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['items'], 'readonly');
      const store = transaction.objectStore('items');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveItem(item) {
    const db = await this._ensureDb();
    const itemToSave = {
      id: item.id || 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: item.name.trim(),
      category: item.category || 'Other',
      storageLocation: item.storageLocation || 'Fridge',
      quantity: Number(item.quantity) || 1,
      unit: item.unit || 'pcs',
      purchaseDate: item.purchaseDate || new Date().toISOString().split('T')[0],
      expiryDate: item.expiryDate, // YYYY-MM-DD
      image: item.image || null, // data URL or thumbnail
      notes: item.notes || '',
      status: item.status || 'active', // active, consumed, discarded
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db) {
      const items = await this.getAllItems();
      const idx = items.findIndex((i) => i.id === itemToSave.id);
      if (idx >= 0) {
        items[idx] = itemToSave;
      } else {
        items.unshift(itemToSave);
      }
      localStorage.setItem('freshguard_items', JSON.stringify(items));
      return itemToSave;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');
      const request = store.put(itemToSave);

      request.onsuccess = () => resolve(itemToSave);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteItem(id) {
    const db = await this._ensureDb();
    if (!db) {
      let items = await this.getAllItems();
      items = items.filter((i) => i.id !== id);
      localStorage.setItem('freshguard_items', JSON.stringify(items));
      return true;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async markItemStatus(id, newStatus) {
    const item = await this.getItem(id);
    if (!item) return null;

    item.status = newStatus;
    item.statusChangedAt = new Date().toISOString();
    await this.saveItem(item);

    // Record action log
    await this.logActivity(newStatus, {
      itemId: id,
      name: item.name,
      category: item.category,
      expiryDate: item.expiryDate
    });

    return item;
  }

  // --- Settings ---

  async getSetting(key, defaultValue = null) {
    const db = await this._ensureDb();
    if (!db) {
      const val = localStorage.getItem('freshguard_setting_' + key);
      return val !== null ? JSON.parse(val) : defaultValue;
    }

    return new Promise((resolve) => {
      const transaction = db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result && request.result.value !== undefined) {
          resolve(request.result.value);
        } else {
          resolve(defaultValue);
        }
      };
      request.onerror = () => resolve(defaultValue);
    });
  }

  async setSetting(key, value) {
    const db = await this._ensureDb();
    if (!db) {
      localStorage.setItem('freshguard_setting_' + key, JSON.stringify(value));
      return value;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value });

      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Logs & Stats ---

  async logActivity(action, details = {}) {
    const db = await this._ensureDb();
    const entry = {
      action,
      details,
      timestamp: new Date().toISOString()
    };

    if (!db) {
      const logs = JSON.parse(localStorage.getItem('freshguard_logs') || '[]');
      logs.push(entry);
      localStorage.setItem('freshguard_logs', JSON.stringify(logs.slice(-500)));
      return;
    }

    return new Promise((resolve) => {
      const transaction = db.transaction(['logs'], 'readwrite');
      const store = transaction.objectStore('logs');
      store.add(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  async getStats() {
    const allItems = await this.getAllItems();
    const active = allItems.filter((i) => i.status === 'active');
    const consumed = allItems.filter((i) => i.status === 'consumed');
    const discarded = allItems.filter((i) => i.status === 'discarded');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expiredCount = 0;
    let expiringSoonCount = 0; // <= 3 days
    let freshCount = 0;

    active.forEach((item) => {
      const exp = new Date(item.expiryDate);
      exp.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        expiredCount++;
      } else if (diffDays <= 3) {
        expiringSoonCount++;
      } else {
        freshCount++;
      }
    });

    const totalResolved = consumed.length + discarded.length;
    const saveRate = totalResolved > 0 ? Math.round((consumed.length / totalResolved) * 100) : 100;

    return {
      totalActive: active.length,
      expired: expiredCount,
      expiringSoon: expiringSoonCount,
      fresh: freshCount,
      consumed: consumed.length,
      discarded: discarded.length,
      saveRate
    };
  }

  // --- Import / Export ---

  async exportAll() {
    const items = await this.getAllItems();
    return JSON.stringify(
      {
        version: DB_VERSION,
        exportedAt: new Date().toISOString(),
        items
      },
      null,
      2
    );
  }

  async importAll(jsonData) {
    try {
      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      const itemsToImport = Array.isArray(parsed) ? parsed : parsed.items || [];
      if (!Array.isArray(itemsToImport)) {
        throw new Error('Invalid backup file structure.');
      }

      for (const item of itemsToImport) {
        if (item.name && item.expiryDate) {
          await this.saveItem(item);
        }
      }
      return itemsToImport.length;
    } catch (e) {
      console.error('Import failed:', e);
      throw e;
    }
  }
}

// Export singleton
window.FreshDB = new FreshGuardDB();
