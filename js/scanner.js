/**
 * FreshGuard - Label Scanner & Expiry Date Extractor
 * Uses Tesseract OCR (offline/CDN) and Gemini Vision AI to extract expiry dates and product info from photos.
 */

class LabelScanner {
  constructor() {
    this.stream = null;
    this.ocrWorker = null;
    this.isTesseractLoading = false;
  }

  // --- Camera Operations ---

  async startCamera(videoElement, facingMode = 'environment') {
    this.stopCamera();

    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = this.stream;
      await videoElement.play();
      return true;
    } catch (err) {
      console.warn('High-res camera constraints failed, falling back to basic video:', err);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        videoElement.srcObject = this.stream;
        await videoElement.play();
        return true;
      } catch (fallbackErr) {
        console.error('Camera access completely denied or unavailable:', fallbackErr);
        throw fallbackErr;
      }
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  async toggleTorch(enabled) {
    if (!this.stream) return false;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return false;

    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (capabilities.torch) {
      try {
        await track.applyConstraints({ advanced: [{ torch: enabled }] });
        return true;
      } catch (e) {
        console.warn('Torch constraint error:', e);
      }
    }
    return false;
  }

  captureFrame(videoElement) {
    if (!videoElement || !videoElement.videoWidth) return null;

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // --- Image Pre-processing for OCR Accuracy ---

  async preprocessImage(dataUrl, options = { contrast: 1.15, grayscale: true, maxWidth: 1600 }) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > options.maxWidth) {
          height = Math.round((height * options.maxWidth) / width);
          width = options.maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, width, height);

        if (options.grayscale) {
          const imgData = ctx.getImageData(0, 0, width, height);
          const d = imgData.data;
          const factor = (259 * (options.contrast * 255 + 255)) / (255 * (259 - options.contrast * 255));

          for (let i = 0; i < d.length; i += 4) {
            // Standard luminance
            let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            // Mild contrast enhancement
            gray = factor * (gray - 128) + 128;
            gray = Math.max(0, Math.min(255, gray));

            d[i] = gray;
            d[i + 1] = gray;
            d[i + 2] = gray;
          }
          ctx.putImageData(imgData, 0, 0);
        }

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.src = dataUrl;
    });
  }

  // --- OCR Engine via Tesseract.js ---

  async initTesseract(onProgress = null) {
    if (this.ocrWorker) return this.ocrWorker;
    if (this.isTesseractLoading) {
      while (this.isTesseractLoading) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return this.ocrWorker;
    }

    this.isTesseractLoading = true;
    try {
      if (typeof Tesseract === 'undefined') {
        throw new Error('Tesseract.js library not loaded yet.');
      }

      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (onProgress && m.status) {
            const progress = m.progress ? Math.round(m.progress * 100) : 0;
            onProgress({ status: m.status, progress });
          }
        }
      });

      this.ocrWorker = worker;
      this.isTesseractLoading = false;
      return worker;
    } catch (err) {
      this.isTesseractLoading = false;
      console.error('Tesseract initialization error:', err);
      throw err;
    }
  }

  async scanWithOCR(imageDataUrl, onProgress = null) {
    const processedUrl = await this.preprocessImage(imageDataUrl);
    const worker = await this.initTesseract(onProgress);

    if (onProgress) onProgress({ status: 'Recognizing text...', progress: 50 });
    const result = await worker.recognize(processedUrl);
    if (onProgress) onProgress({ status: 'Analyzing dates...', progress: 95 });

    const rawText = result.data.text || '';
    const parsedData = this.parseGroceryDetails(rawText);

    return {
      rawText,
      ...parsedData
    };
  }

  // --- Smart Expiry Date & Label Parsing Engine ---

  parseGroceryDetails(text) {
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
    const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1. Detect Expiry Date
    const expiryInfo = this.extractExpiryDate(cleanText);

    // 2. Guess Item Category and Suggested Name
    const categoryInfo = this.guessCategoryAndName(cleanText);

    return {
      expiryDate: expiryInfo ? expiryInfo.dateIso : null,
      expiryConfidence: expiryInfo ? expiryInfo.confidence : 'none',
      matchedSnippet: expiryInfo ? expiryInfo.snippet : null,
      mfgDate: expiryInfo ? expiryInfo.mfgDateIso : null,
      suggestedName: categoryInfo.suggestedName || '',
      suggestedCategory: categoryInfo.category || 'Other',
      suggestedStorage: categoryInfo.storage || 'Fridge'
    };
  }

  extractExpiryDate(text) {
    const monthNames = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const lines = text.split('\n');

    // Priority 1: Check lines explicitly containing expiry indicators
    const expiryKeywords = [
      'exp', 'exp.', 'expiry', 'exp date', 'expiry date', 'use by', 'best before',
      'bb', 'bbd', 'best by', 'consume before', 'valid upto', 'valid till', 'expires'
    ];

    const mfgKeywords = [
      'mfd', 'mfg', 'mfg.', 'mfg date', 'pkd', 'packed', 'date of mfg'
    ];

    let foundExpiry = null;
    let foundMfg = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      // Check for Expiry keywords
      for (const kw of expiryKeywords) {
        if (lower.includes(kw)) {
          // Check this line and immediate next line
          const context = line + ' ' + (lines[i + 1] || '');
          const parsed = this._findDateInString(context);
          if (parsed && (!foundExpiry || parsed.confidence > foundExpiry.confidence)) {
            foundExpiry = {
              ...parsed,
              snippet: line.trim()
            };
          }
        }
      }

      // Check for Mfg keywords
      for (const kw of mfgKeywords) {
        if (lower.includes(kw)) {
          const context = line + ' ' + (lines[i + 1] || '');
          const parsed = this._findDateInString(context);
          if (parsed) {
            foundMfg = parsed;
          }
        }
      }
    }

    // Priority 2: Check "Best Before X months / days from manufacture" rule
    const bestBeforeMonthsMatch = text.match(/best\s+before\s+(\d+)\s+months?/i);
    if (bestBeforeMonthsMatch && foundMfg && !foundExpiry) {
      const monthsToAdd = parseInt(bestBeforeMonthsMatch[1], 10);
      const mfgDate = new Date(foundMfg.dateIso);
      mfgDate.setMonth(mfgDate.getMonth() + monthsToAdd);
      const expiryIso = mfgDate.toISOString().split('T')[0];
      return {
        dateIso: expiryIso,
        confidence: 'high',
        snippet: `Best before ${monthsToAdd} months from Mfg: ${foundMfg.dateIso}`,
        mfgDateIso: foundMfg.dateIso
      };
    }

    const bestBeforeDaysMatch = text.match(/(?:best\s+before|consume\s+within|use\s+within)\s+(\d+)\s+days?/i);
    if (bestBeforeDaysMatch && foundMfg && !foundExpiry) {
      const daysToAdd = parseInt(bestBeforeDaysMatch[1], 10);
      const mfgDate = new Date(foundMfg.dateIso);
      mfgDate.setDate(mfgDate.getDate() + daysToAdd);
      const expiryIso = mfgDate.toISOString().split('T')[0];
      return {
        dateIso: expiryIso,
        confidence: 'high',
        snippet: `Consume within ${daysToAdd} days from Mfg/Packed: ${foundMfg.dateIso}`,
        mfgDateIso: foundMfg.dateIso
      };
    }

    // Priority 3: If explicit keyword found, return it
    if (foundExpiry) {
      return {
        ...foundExpiry,
        mfgDateIso: foundMfg ? foundMfg.dateIso : null
      };
    }

    // Priority 4: Look for any isolated valid date in the text (prioritizing non-Mfg date)
    const allDates = this._findAllDatesInString(text);
    for (const d of allDates) {
      if (!foundMfg || d.dateIso !== foundMfg.dateIso) {
        return {
          ...d,
          confidence: 'medium',
          snippet: 'Detected date from label',
          mfgDateIso: foundMfg ? foundMfg.dateIso : null
        };
      }
    }

    // Fallback: if only Mfg date was found
    if (foundMfg) {
      return {
        dateIso: foundMfg.dateIso,
        confidence: 'low',
        snippet: `Packed/Mfg Date: ${foundMfg.dateIso}`,
        mfgDateIso: foundMfg.dateIso
      };
    }

    return null;
  }

  _findAllDatesInString(str) {
    const dates = [];
    const lines = str.split('\n');
    for (const l of lines) {
      const parsed = this._findDateInString(l);
      if (parsed && !dates.some((d) => d.dateIso === parsed.dateIso)) {
        dates.push(parsed);
      }
    }
    return dates;
  }

  _findDateInString(str) {
    const monthNames = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    // Pattern 1: DD MMM YYYY / DD-MMM-YY (e.g. 15 NOV 2026 or 24-OCT-26)
    const dMmmY = str.match(/\b([0-2]?[0-9]|3[01])[\s\.\,\/\-]*([A-Za-z]{3,9})[\s\.\,\/\-]+(20\d{2}|\d{2})\b/i);
    if (dMmmY) {
      const day = dMmmY[1].padStart(2, '0');
      const monStr = dMmmY[2].toLowerCase().substr(0, 3);
      let year = dMmmY[3];
      if (year.length === 2) year = '20' + year;

      if (monthNames[monStr]) {
        return {
          dateIso: `${year}-${monthNames[monStr]}-${day}`,
          confidence: 'high'
        };
      }
    }

    // Pattern 2: MMM DD, YYYY (e.g. Nov 24, 2026)
    const mmmDY = str.match(/\b([A-Za-z]{3,9})[\s\.\,\/\-]+([0-2]?[0-9]|3[01])[\s\.\,\/\-]+(20\d{2}|\d{2})\b/i);
    if (mmmDY) {
      const monStr = mmmDY[1].toLowerCase().substr(0, 3);
      const day = mmmDY[2].padStart(2, '0');
      let year = mmmDY[3];
      if (year.length === 2) year = '20' + year;

      if (monthNames[monStr]) {
        return {
          dateIso: `${year}-${monthNames[monStr]}-${day}`,
          confidence: 'high'
        };
      }
    }

    // Pattern 3: YYYY-MM-DD or YYYY/MM/DD
    const isoDate = str.match(/\b(20\d{2})[\/\.\-](0?[1-9]|1[0-2])[\/\.\-]([0-2]?[0-9]|3[01])\b/);
    if (isoDate) {
      const year = isoDate[1];
      const month = isoDate[2].padStart(2, '0');
      const day = isoDate[3].padStart(2, '0');
      return {
        dateIso: `${year}-${month}-${day}`,
        confidence: 'high'
      };
    }

    // Pattern 4: DD/MM/YYYY or DD.MM.YY or MM/DD/YYYY
    const numericDate = str.match(/\b([0-2]?[0-9]|3[01])[\/\.\-]([0-2]?[0-9]|3[01])[\/\.\-](20\d{2}|\d{2})\b/);
    if (numericDate) {
      const num1 = parseInt(numericDate[1], 10);
      const num2 = parseInt(numericDate[2], 10);
      let year = numericDate[3];
      if (year.length === 2) year = '20' + year;

      let day, month;
      if (num1 > 12) {
        // Definitely DD/MM
        day = String(num1).padStart(2, '0');
        month = String(num2).padStart(2, '0');
      } else if (num2 > 12) {
        // MM/DD
        month = String(num1).padStart(2, '0');
        day = String(num2).padStart(2, '0');
      } else {
        // Standard international format default: DD/MM/YYYY
        day = String(num1).padStart(2, '0');
        month = String(num2).padStart(2, '0');
      }

      if (parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12) {
        return {
          dateIso: `${year}-${month}-${day}`,
          confidence: 'medium'
        };
      }
    }

    // Pattern 5: Month/Year stamp (e.g. 11/26 or 11/2026 or NOV 2026)
    const myMatch = str.match(/\b(0?[1-9]|1[0-2])[\/\.\-](20\d{2}|\d{2})\b/);
    if (myMatch) {
      const month = myMatch[1].padStart(2, '0');
      let year = myMatch[2];
      if (year.length === 2) year = '20' + year;
      // Get last day of that month
      const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
      return {
        dateIso: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
        confidence: 'low'
      };
    }

    return null;
  }

  guessCategoryAndName(text) {
    const lower = text.toLowerCase();

    const dictionary = [
      {
        category: 'Dairy',
        storage: 'Fridge',
        keywords: ['milk', 'curd', 'dahi', 'yogurt', 'cheese', 'butter', 'paneer', 'cream', 'ghee', 'dairy', 'amul', 'mother dairy']
      },
      {
        category: 'Sauces & Condiments',
        storage: 'Fridge',
        keywords: ['sauce', 'ketchup', 'mayonnaise', 'mayo', 'mustard', 'soya', 'chilli', 'schezwan', 'salsa', 'jam', 'spread', 'dressing']
      },
      {
        category: 'Bakery',
        storage: 'Pantry',
        keywords: ['bread', 'bun', 'buns', 'toast', 'croissant', 'cake', 'pita', 'tortilla', 'rusk', 'cookie', 'biscuit']
      },
      {
        category: 'Produce',
        storage: 'Fridge',
        keywords: ['vegetable', 'fruit', 'tomato', 'potato', 'onion', 'spinach', 'apple', 'banana', 'lettuce', 'cucumber', 'berry', 'orange']
      },
      {
        category: 'Meat & Poultry',
        storage: 'Fridge',
        keywords: ['chicken', 'mutton', 'meat', 'beef', 'pork', 'fish', 'prawn', 'shrimp', 'egg', 'eggs', 'sausage', 'bacon']
      },
      {
        category: 'Beverages',
        storage: 'Fridge',
        keywords: ['juice', 'soda', 'coke', 'pepsi', 'drink', 'beverage', 'beer', 'wine', 'tea', 'coffee', 'shake']
      },
      {
        category: 'Pantry & Dry Goods',
        storage: 'Pantry',
        keywords: ['rice', 'pasta', 'flour', 'atta', 'noodle', 'maggi', 'cereal', 'oats', 'lentil', 'dal', 'pulse', 'grain', 'oil']
      },
      {
        category: 'Frozen Foods',
        storage: 'Freezer',
        keywords: ['frozen', 'ice cream', 'nuggets', 'fries', 'peas', 'gelato', 'waffles']
      }
    ];

    for (const entry of dictionary) {
      for (const kw of entry.keywords) {
        if (lower.includes(kw)) {
          // Capitalize keyword for suggested name
          const nameCap = kw.charAt(0).toUpperCase() + kw.slice(1);
          return {
            category: entry.category,
            storage: entry.storage,
            suggestedName: nameCap
          };
        }
      }
    }

    return {
      category: 'Other',
      storage: 'Pantry',
      suggestedName: ''
    };
  }

  // --- Optional Gemini Vision AI Integration ---

  async scanWithGemini(imageDataUrl, apiKey) {
    if (!apiKey) {
      throw new Error('Gemini API key is required for AI Vision scanning.');
    }

    // Extract base64 and mime type
    const match = imageDataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid image format');
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const prompt = `Analyze this food or grocery item label photo.
Extract the following details in strictly valid JSON format without markdown code fences or backticks:
{
  "name": "full product name with brand (e.g. Amul Taaza Milk 500ml)",
  "expiryDate": "YYYY-MM-DD",
  "category": "one of: Dairy, Sauces & Condiments, Bakery, Produce, Meat & Poultry, Beverages, Pantry & Dry Goods, Frozen Foods, Other",
  "storageLocation": "one of: Fridge, Freezer, Pantry, Countertop",
  "notes": "any specific storage warning or once-opened shelf life mentioned on label",
  "confidence": "high or medium or low"
}
If no expiry date is found on the label, estimate a safe expiry date based on the product type and standard shelf life, but set confidence to "low".`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Gemini API returned HTTP ${response.status}`);
    }

    const resJson = await response.json();
    const candidateText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Gemini returned an empty response.');
    }

    try {
      const cleanJson = candidateText.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error('Failed to parse Gemini JSON output:', candidateText);
      throw new Error('Failed to parse AI response: ' + candidateText);
    }
  }
}

window.FreshScanner = new LabelScanner();
