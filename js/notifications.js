/**
 * FreshGuard - Notifications & Audio Chime System
 * Provides desktop/mobile push notifications, in-app notification center, and audio alerts.
 */

class FreshGuardNotifier {
  constructor() {
    this.audioCtx = null;
    this.alertThresholdDays = 3; // Default: notify items expiring in 3 days or fewer
    this.checkIntervalId = null;
    this.unreadCount = 0;
  }

  async init() {
    // Load custom threshold from settings
    if (window.FreshDB) {
      const savedThreshold = await window.FreshDB.getSetting('alert_threshold_days', 3);
      this.alertThresholdDays = Number(savedThreshold) || 3;
    }

    // Start background check loop (every 30 mins while app is open)
    this.checkExpiringItems();
    this.checkIntervalId = setInterval(() => {
      this.checkExpiringItems();
    }, 30 * 60 * 1000);
  }

  // --- Web Audio Synthesizer (No MP3 dependencies needed!) ---

  _getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  playChime(type = 'alert') {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'urgent') {
        // High attention double beep (for expired or expires today)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880.0, now + 0.12); // A5

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.start(now);
        osc.stop(now + 0.36);
      } else if (type === 'success') {
        // Gentle uplifting chime (when item added / consumed)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.42);
      } else {
        // Gentle reminder chime (expiring in 2-3 days)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.setValueAtTime(554.37, now + 0.15); // C#5

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.start(now);
        osc.stop(now + 0.42);
      }
    } catch (e) {
      console.warn('Audio playback error (can occur if user has not interacted with page):', e);
    }
  }

  // --- Browser Push Notifications ---

  async requestPermission() {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.sendSystemNotification('FreshGuard Alerts Enabled 🔔', {
          body: 'You will receive reminders when your groceries are close to expiring.',
          tag: 'freshguard_welcome'
        });
        return true;
      }
    }
    return false;
  }

  sendSystemNotification(title, options = {}) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          ...options
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (err) {
        // Fallback for service worker notification
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, options);
          });
        }
      }
    }
  }

  // --- Expiry Check Engine ---

  async checkExpiringItems(forceSound = false) {
    if (!window.FreshDB) return;

    const items = await window.FreshDB.getAllItems();
    const activeItems = items.filter((i) => i.status === 'active');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expired = [];
    const expiresToday = [];
    const expiringSoon = []; // 1 to threshold days

    activeItems.forEach((item) => {
      const exp = new Date(item.expiryDate);
      exp.setHours(0, 0, 0, 0);

      const diffTime = exp.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        expired.push({ ...item, diffDays });
      } else if (diffDays === 0) {
        expiresToday.push({ ...item, diffDays });
      } else if (diffDays <= this.alertThresholdDays) {
        expiringSoon.push({ ...item, diffDays });
      }
    });

    const totalUrgent = expired.length + expiresToday.length + expiringSoon.length;
    this.unreadCount = totalUrgent;
    this.updateBadgeUI(totalUrgent);

    // If there are urgent items, trigger sound and system notification
    if (totalUrgent > 0) {
      if (forceSound) {
        this.playChime(expiresToday.length > 0 || expired.length > 0 ? 'urgent' : 'alert');
      }

      // Format summary notification text
      let notifBody = '';
      if (expiresToday.length > 0) {
        const sample = expiresToday.map((i) => i.name).slice(0, 2).join(', ');
        notifBody += `⚠️ ${expiresToday.length} item(s) expire TODAY (${sample})! `;
      }
      if (expiringSoon.length > 0) {
        const sample = expiringSoon.map((i) => i.name).slice(0, 2).join(', ');
        notifBody += `⏳ ${expiringSoon.length} item(s) expiring within ${this.alertThresholdDays} days (${sample}). `;
      }
      if (expired.length > 0) {
        notifBody += `❌ ${expired.length} item(s) already expired.`;
      }

      // Check if we already alerted today to prevent spamming
      const lastAlertDate = localStorage.getItem('freshguard_last_alert_date');
      const todayStr = today.toISOString().split('T')[0];

      if (lastAlertDate !== todayStr || forceSound) {
        this.sendSystemNotification('FreshGuard Expiry Alert', {
          body: notifBody.trim(),
          tag: 'freshguard_daily_summary'
        });
        localStorage.setItem('freshguard_last_alert_date', todayStr);
      }
    }

    return {
      expired,
      expiresToday,
      expiringSoon,
      totalUrgent
    };
  }

  updateBadgeUI(count) {
    const badge = document.getElementById('notifBadge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} animate-slide-in`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('animate-fade-out');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }
}

window.FreshNotifier = new FreshGuardNotifier();
