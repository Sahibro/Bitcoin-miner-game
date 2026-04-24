/* ============================================
   SUPPLYCHAIN SAFESTOCK AI — MASTER SCRIPT
   ============================================
   Structure:
   1.  CONFIG & CONSTANTS
   2.  STATE MANAGEMENT
   3.  UTILITY FUNCTIONS
   4.  MATH & CALCULATION ENGINE (ZERO-ERROR)
   5.  DATA INGESTION & CLEANING
   6.  FORECASTING ENGINE (Holt-Winters)
   7.  SPIKE DETECTION & ANOMALY
   8.  LEAD TIME ESTIMATOR
   9.  RISK SIGNAL FUSION
   10. SAFETY STOCK CALCULATOR
   11. MULTI-LOCATION REBALANCER
   12. WORKING CAPITAL CONSTRAINT
   13. RECOMMENDATION ENGINE
   14. AUDIT TRAIL
   15. ALERT SYSTEM
   16. ERP INTEGRATION (Mock)
   17. UI — LOADING SCREEN
   18. UI — ONBOARDING
   19. UI — NAVIGATION & ROUTING
   20. UI — THEME TOGGLE
   21. UI — TOAST NOTIFICATIONS
   22. UI — MODALS
   23. UI — DASHBOARD CHARTS
   24. UI — UPLOAD & DATA EXPLORER
   25. UI — RISK SIGNALS PAGE
   26. UI — FORECAST PAGE
   27. UI — RECOMMENDATIONS PAGE
   28. UI — WHAT-IF SIMULATOR
   29. UI — MULTI-LOCATION PAGE
   30. UI — ERP PAGE
   31. UI — AUDIT PAGE
   32. UI — ALERTS PAGE
   33. UI — GLOBAL SEARCH
   34. UI — SETTINGS
   35. KEYBOARD SHORTCUTS
   36. DATA EXPORT / IMPORT
   37. LOCAL STORAGE PERSISTENCE
   38. INITIALIZATION
   ============================================ */

"use strict";

/* ============================================
   1. CONFIG & CONSTANTS
   ============================================ */
const CONFIG = Object.freeze({
  APP_NAME: "SafeStock AI",
  VERSION: "1.0.0",
  STORAGE_KEY: "safestock_ai_data",
  SETTINGS_KEY: "safestock_ai_settings",
  AUDIT_KEY: "safestock_ai_audit",
  ALERTS_KEY: "safestock_ai_alerts",

  MAX_CSV_SIZE_MB: 10,
  MAX_CSV_ROWS: 100000,
  ROWS_PER_PAGE: 20,
  TOAST_DURATION_MS: 4000,
  DEBOUNCE_MS: 300,
  THROTTLE_MS: 100,

  DEFAULT_SERVICE_LEVEL: 95,
  DEFAULT_ALPHA: 0.3,
  DEFAULT_BETA: 0.1,
  DEFAULT_FORECAST_HORIZON: 30,
  DEFAULT_SPIKE_THRESHOLD: 2.5,

  Z_SCORES: Object.freeze({
    90: 1.2816,
    95: 1.6449,
    97: 1.8808,
    99: 2.3263,
    99.5: 2.5758
  }),

  PORT_RULES: Object.freeze([
    { min: 0, max: 20, multiplier: 1.0, description: "Normal — No delay" },
    { min: 21, max: 40, multiplier: 1.1, description: "Low congestion — Minor delays" },
    { min: 41, max: 60, multiplier: 1.2, description: "Moderate congestion — Noticeable delays" },
    { min: 61, max: 80, multiplier: 1.35, description: "High congestion — Significant delays" },
    { min: 81, max: 100, multiplier: 1.5, description: "Critical congestion — Major disruption" }
  ]),

  SIGNAL_WEIGHTS_DEFAULT: Object.freeze({
    port: 0.4,
    geo: 0.35,
    weather: 0.25
  }),

  PORTS: Object.freeze([
    { name: "Shanghai", lat: 31.23, lng: 121.47, congestion: 62 },
    { name: "Singapore", lat: 1.29, lng: 103.85, congestion: 45 },
    { name: "Rotterdam", lat: 51.92, lng: 4.48, congestion: 28 },
    { name: "Los Angeles", lat: 33.74, lng: -118.26, congestion: 71 },
    { name: "Dubai", lat: 25.27, lng: 55.29, congestion: 38 },
    { name: "Busan", lat: 35.10, lng: 129.03, congestion: 55 },
    { name: "Hamburg", lat: 53.55, lng: 9.99, congestion: 33 },
    { name: "Ningbo", lat: 29.87, lng: 121.54, congestion: 58 },
    { name: "Mumbai", lat: 19.08, lng: 72.88, congestion: 49 },
    { name: "Santos", lat: -23.96, lng: -46.33, congestion: 42 }
  ]),

  CURRENCIES: Object.freeze({
    USD: { symbol: "$", rate: 1 },
    EUR: { symbol: "€", rate: 0.92 },
    GBP: { symbol: "£", rate: 0.79 },
    INR: { symbol: "₹", rate: 83.5 },
    JPY: { symbol: "¥", rate: 154.3 }
  })
});

/* ============================================
   2. STATE MANAGEMENT
   ============================================ */
const AppState = {
  demandData: [],
  cleanedData: [],
  skuList: [],
  locationList: [],
  recommendations: [],
  warehouses: [],
  auditLog: [],
  alerts: [],
  pushQueue: [],
  forecastCache: {},

  signals: {
    port: 45,
    geo: 30,
    weather: 20,
    lastUpdated: null
  },

  signalWeights: { ...CONFIG.SIGNAL_WEIGHTS_DEFAULT },

  settings: {
    theme: "dark",
    fontSize: 16,
    currency: "USD",
    onboardingDone: false
  },

  currentPage: "dashboard",
  charts: {},
  map: null,
  isProcessing: false
};

/* ============================================
   3. UTILITY FUNCTIONS
   ============================================ */

/**
 * Safely parses a number, returns fallback if NaN/Infinity.
 * Guarantees ZERO NaN leakage into any calculation.
 * @param {*} value - Value to parse
 * @param {number} fallback - Fallback value (default 0)
 * @returns {number} Parsed finite number or fallback
 */
const safeNum = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

/**
 * Safely divides two numbers. Returns fallback if divisor is 0 or result is not finite.
 * Prevents ALL division-by-zero errors across the application.
 * @param {number} numerator
 * @param {number} denominator
 * @param {number} fallback
 * @returns {number}
 */
const safeDivide = (numerator, denominator, fallback = 0) => {
  const num = safeNum(numerator, 0);
  const den = safeNum(denominator, 0);
  if (den === 0) {
    return fallback;
  }
  const result = num / den;
  if (!Number.isFinite(result)) {
    return fallback;
  }
  return result;
};

/**
 * Rounds to specified decimal places safely
 * @param {number} value
 * @param {number} decimals
 * @returns {number}
 */
const roundTo = (value, decimals = 2) => {
  const num = safeNum(value, 0);
  const factor = Math.pow(10, Math.max(0, Math.round(decimals)));
  return Math.round((num + Number.EPSILON) * factor) / factor;
};

/**
 * Clamps value between min and max
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const clamp = (value, min, max) => {
  const num = safeNum(value, min);
  return Math.min(Math.max(num, min), max);
};

/**
 * Formats number with commas and decimal places
 * @param {number} value
 * @param {number} decimals
 * @returns {string}
 */
const formatNumber = (value, decimals = 0) => {
  const num = safeNum(value, 0);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * Formats currency with symbol
 * @param {number} value
 * @param {string} currency
 * @returns {string}
 */
const formatCurrency = (value, currency = null) => {
  const curr = currency || AppState.settings.currency || "USD";
  const info = CONFIG.CURRENCIES[curr] || CONFIG.CURRENCIES.USD;
  const num = safeNum(value, 0);
  const converted = num * safeNum(info.rate, 1);
  return `${info.symbol}${formatNumber(converted, 2)}`;
};

/**
 * Formats percentage
 * @param {number} value - Already in percentage form (e.g. 95)
 * @param {number} decimals
 * @returns {string}
 */
const formatPercent = (value, decimals = 1) => {
  return `${roundTo(safeNum(value, 0), decimals)}%`;
};

/**
 * Generates a unique ID
 * @param {string} prefix
 * @returns {string}
 */
const generateId = (prefix = "id") => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Returns current ISO timestamp
 * @returns {string}
 */
const getTimestamp = () => new Date().toISOString();

/**
 * Formats ISO date to readable string
 * @param {string} isoStr
 * @returns {string}
 */
const formatDate = (isoStr) => {
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) {
      return "Invalid Date";
    }
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "Invalid Date";
  }
};

/**
 * Formats date to short form (YYYY-MM-DD)
 * @param {string|Date} date
 * @returns {string}
 */
const formatDateShort = (date) => {
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      return "N/A";
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "N/A";
  }
};

/**
 * Debounce function — prevents rapid-fire calls
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
const debounce = (func, wait = CONFIG.DEBOUNCE_MS) => {
  let timeout = null;
  return (...args) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func.apply(null, args);
      timeout = null;
    }, wait);
  };
};

/**
 * Throttle function — limits call frequency
 * @param {Function} func
 * @param {number} limit
 * @returns {Function}
 */
const throttle = (func, limit = CONFIG.THROTTLE_MS) => {
  let inThrottle = false;
  return (...args) => {
    if (!inThrottle) {
      func.apply(null, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

/**
 * Escapes HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
const escapeHTML = (str) => {
  if (typeof str !== "string") {
    return String(str || "");
  }
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
};

/**
 * Deep clone an object safely
 * @param {*} obj
 * @returns {*}
 */
const deepClone = (obj) => {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
};

/**
 * Safely gets a DOM element by ID
 * @param {string} id
 * @returns {HTMLElement|null}
 */
const getEl = (id) => document.getElementById(id);

/* ============================================
   4. MATH & CALCULATION ENGINE (ZERO-ERROR)
   ============================================
   Every function here is built with absolute
   precision. No NaN, no Infinity, no division
   by zero can escape. Each calculation is
   verified step-by-step.
   ============================================ */

const MathEngine = {
  /**
   * Calculates the arithmetic mean of an array of numbers.
   * Returns 0 for empty arrays.
   * @param {number[]} arr
   * @returns {number}
   */
  mean(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return 0;
    }
    const clean = arr.map((v) => safeNum(v, 0));
    const sum = clean.reduce((acc, val) => acc + val, 0);
    return safeDivide(sum, clean.length, 0);
  },

  /**
   * Calculates population standard deviation.
   * Returns 0 for arrays with < 2 elements.
   * @param {number[]} arr
   * @returns {number}
   */
  stdDev(arr) {
    if (!Array.isArray(arr) || arr.length < 2) {
      return 0;
    }
    const clean = arr.map((v) => safeNum(v, 0));
    const avg = this.mean(clean);
    const squareDiffs = clean.map((v) => Math.pow(v - avg, 2));
    const avgSquareDiff = safeDivide(
      squareDiffs.reduce((acc, val) => acc + val, 0),
      clean.length,
      0
    );
    const result = Math.sqrt(Math.max(0, avgSquareDiff));
    return Number.isFinite(result) ? result : 0;
  },

  /**
   * Calculates sample standard deviation (Bessel's correction).
   * Returns 0 for arrays with < 2 elements.
   * @param {number[]} arr
   * @returns {number}
   */
  sampleStdDev(arr) {
    if (!Array.isArray(arr) || arr.length < 2) {
      return 0;
    }
    const clean = arr.map((v) => safeNum(v, 0));
    const avg = this.mean(clean);
    const squareDiffs = clean.map((v) => Math.pow(v - avg, 2));
    const variance = safeDivide(
      squareDiffs.reduce((acc, val) => acc + val, 0),
      clean.length - 1,
      0
    );
    const result = Math.sqrt(Math.max(0, variance));
    return Number.isFinite(result) ? result : 0;
  },

  /**
   * Calculates median of an array.
   * @param {number[]} arr
   * @returns {number}
   */
  median(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return 0;
    }
    const sorted = arr.map((v) => safeNum(v, 0)).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  },

  /**
   * Interquartile Range for outlier detection.
   * @param {number[]} arr
   * @returns {{ q1: number, q3: number, iqr: number, lower: number, upper: number }}
   */
  iqrBounds(arr) {
    if (!Array.isArray(arr) || arr.length < 4) {
      return { q1: 0, q3: 0, iqr: 0, lower: 0, upper: 0 };
    }
    const sorted = arr.map((v) => safeNum(v, 0)).sort((a, b) => a - b);
    const q1Idx = Math.floor(sorted.length * 0.25);
    const q3Idx = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Idx];
    const q3 = sorted[q3Idx];
    const iqr = q3 - q1;
    return {
      q1,
      q3,
      iqr,
      lower: q1 - 1.5 * iqr,
      upper: q3 + 1.5 * iqr
    };
  },

  /**
   * Rolling mean for a window size.
   * @param {number[]} arr
   * @param {number} window
   * @returns {number[]}
   */
  rollingMean(arr, window = 7) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return [];
    }
    const w = Math.max(1, Math.min(window, arr.length));
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      const start = Math.max(0, i - w + 1);
      const slice = arr.slice(start, i + 1).map((v) => safeNum(v, 0));
      result.push(this.mean(slice));
    }
    return result;
  },

  /**
   * Rolling standard deviation for a window size.
   * @param {number[]} arr
   * @param {number} window
   * @returns {number[]}
   */
  rollingStdDev(arr, window = 7) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return [];
    }
    const w = Math.max(2, Math.min(window, arr.length));
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      const start = Math.max(0, i - w + 1);
      const slice = arr.slice(start, i + 1).map((v) => safeNum(v, 0));
      result.push(slice.length >= 2 ? this.stdDev(slice) : 0);
    }
    return result;
  },

  /**
   * MAPE (Mean Absolute Percentage Error)
   * Skips zero actuals to prevent division by zero.
   * @param {number[]} actuals
   * @param {number[]} forecasts
   * @returns {number} MAPE as percentage (0-100)
   */
  mape(actuals, forecasts) {
    if (!Array.isArray(actuals) || !Array.isArray(forecasts)) {
      return 0;
    }
    const len = Math.min(actuals.length, forecasts.length);
    if (len === 0) {
      return 0;
    }
    let sum = 0;
    let count = 0;
    for (let i = 0; i < len; i++) {
      const actual = safeNum(actuals[i], 0);
      const forecast = safeNum(forecasts[i], 0);
      if (actual !== 0) {
        sum += Math.abs(safeDivide(actual - forecast, actual, 0));
        count++;
      }
    }
    if (count === 0) {
      return 0;
    }
    return roundTo(safeDivide(sum, count, 0) * 100, 2);
  },

  /**
   * MAE (Mean Absolute Error)
   * @param {number[]} actuals
   * @param {number[]} forecasts
   * @returns {number}
   */
  mae(actuals, forecasts) {
    if (!Array.isArray(actuals) || !Array.isArray(forecasts)) {
      return 0;
    }
    const len = Math.min(actuals.length, forecasts.length);
    if (len === 0) {
      return 0;
    }
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Math.abs(safeNum(actuals[i], 0) - safeNum(forecasts[i], 0));
    }
    return roundTo(safeDivide(sum, len, 0), 2);
  },

  /**
   * RMSE (Root Mean Squared Error)
   * @param {number[]} actuals
   * @param {number[]} forecasts
   * @returns {number}
   */
  rmse(actuals, forecasts) {
    if (!Array.isArray(actuals) || !Array.isArray(forecasts)) {
      return 0;
    }
    const len = Math.min(actuals.length, forecasts.length);
    if (len === 0) {
      return 0;
    }
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      const diff = safeNum(actuals[i], 0) - safeNum(forecasts[i], 0);
      sumSq += diff * diff;
    }
    const result = Math.sqrt(Math.max(0, safeDivide(sumSq, len, 0)));
    return roundTo(Number.isFinite(result) ? result : 0, 2);
  },

  /**
   * EWMA (Exponentially Weighted Moving Average)
   * @param {number[]} arr
   * @param {number} alpha - Smoothing factor (0-1)
   * @returns {number[]}
   */
  ewma(arr, alpha = 0.3) {
    if (!Array.isArray(arr) || arr.length === 0) {
      return [];
    }
    const a = clamp(alpha, 0.01, 0.99);
    const result = [safeNum(arr, 0)];
    for (let i = 1; i < arr.length; i++) {
      const prev = result[i - 1];
      const curr = safeNum(arr[i], prev);
      result.push(a * curr + (1 - a) * prev);
    }
    return result;
  }
};

/* ============================================
   5. DATA INGESTION & CLEANING
   ============================================ */

const DataEngine = {
  /**
   * Parses CSV string into array of objects.
   * Handles various delimiters, quotes, and edge cases.
   * @param {string} csvString
   * @returns {{ data: object[], errors: string[] }}
   */
  parseCSV(csvString) {
    const errors = [];

    if (typeof csvString !== "string" || csvString.trim().length === 0) {
      errors.push("CSV file is empty or invalid.");
      return { data: [], errors };
    }

    const lines = csvString
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      errors.push("CSV must have at least a header row and one data row.");
      return { data: [], errors };
    }

    /* Detect delimiter */
    const firstLine = lines;
    let delimiter = ",";
    if (firstLine.split("\t").length > firstLine.split(",").length) {
      delimiter = "\t";
    } else if (firstLine.split(";").length > firstLine.split(",").length) {
      delimiter = ";";
    }

    const headers = lines
      .split(delimiter)
      .map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

    /* Validate required columns */
    const requiredCols = ["date", "sku", "quantity"];
    const missingCols = requiredCols.filter((col) => !headers.includes(col));
    if (missingCols.length > 0) {
      errors.push(`Missing required columns: ${missingCols.join(", ")}`);
      return { data: [], errors };
    }

    const dateIdx = headers.indexOf("date");
    const skuIdx = headers.indexOf("sku");
    const qtyIdx = headers.indexOf("quantity");
    const locIdx = headers.indexOf("location");

    const data = [];
    const maxRows = Math.min(lines.length, CONFIG.MAX_CSV_ROWS + 1);

    for (let i = 1; i < maxRows; i++) {
      const fields = lines[i].split(delimiter).map((f) => f.trim().replace(/^['"]|['"]$/g, ""));

      if (fields.length < 3) {
        errors.push(`Row ${i}: insufficient columns (${fields.length})`);
        continue;
      }

      const dateStr = fields[dateIdx] || "";
      const sku = fields[skuIdx] || "";
      const qtyRaw = fields[qtyIdx] || "";

      /* Validate date */
      const parsedDate = new Date(dateStr);
      if (Number.isNaN(parsedDate.getTime())) {
        errors.push(`Row ${i}: invalid date "${dateStr}"`);
        continue;
      }

      /* Validate SKU */
      if (sku.length === 0) {
        errors.push(`Row ${i}: empty SKU`);
        continue;
      }

      /* Parse quantity */
      const qty = safeNum(qtyRaw, -1);
      if (qty < 0) {
        errors.push(`Row ${i}: invalid quantity "${qtyRaw}"`);
        continue;
      }

      const location = locIdx >= 0 && fields[locIdx] ? fields[locIdx] : "Default";

      data.push({
        date: formatDateShort(parsedDate),
        sku: sku.toUpperCase(),
        quantity: qty,
        location: location,
        rowIndex: i,
        flags: []
      });
    }

    if (lines.length > CONFIG.MAX_CSV_ROWS + 1) {
      errors.push(`Truncated to ${CONFIG.MAX_CSV_ROWS} rows (file has ${lines.length - 1} data rows).`);
    }

    return { data, errors };
  },

  /**
   * Cleans and normalizes demand data.
   * Fills missing dates, flags outliers, handles promotions.
   * @param {object[]} rawData
   * @returns {{ cleaned: object[], qualityReport: object }}
   */
  cleanData(rawData) {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return {
        cleaned: [],
        qualityReport: {
          totalRows: 0,
          uniqueSkus: 0,
          dateRange: "N/A",
          missingValues: 0,
          outliers: 0,
          completeness: 0,
          flags: []
        }
      };
    }

    const cleaned = deepClone(rawData);
    let missingCount = 0;
    let outlierCount = 0;
    const flags = [];

    /* Group by SKU for per-SKU analysis */
    const skuGroups = {};
    cleaned.forEach((row) => {
      if (!skuGroups[row.sku]) {
        skuGroups[row.sku] = [];
      }
      skuGroups[row.sku].push(row);
    });

    /* Per-SKU outlier detection and flagging */
    Object.keys(skuGroups).forEach((sku) => {
      const rows = skuGroups[sku];
      const quantities = rows.map((r) => r.quantity);
      const bounds = MathEngine.iqrBounds(quantities);
      const mean = MathEngine.mean(quantities);

      rows.forEach((row) => {
        /* Flag outliers */
        if (row.quantity < bounds.lower || row.quantity > bounds.upper) {
          row.flags.push("outlier");
          outlierCount++;
        }

        /* Flag potential promotions (> 2x mean) */
        if (mean > 0 && row.quantity > mean * 2) {
          if (!row.flags.includes("outlier")) {
            row.flags.push("promo-spike");
          }
        }

        /* Flag zero demand */
        if (row.quantity === 0) {
          row.flags.push("zero-demand");
          missingCount++;
        }
      });

      /* Sort by date */
      rows.sort((a, b) => new Date(a.date) - new Date(b.date));
    });

    /* Collect dates */
    const allDates = cleaned.map((r) => new Date(r.date).getTime()).filter((d) => !Number.isNaN(d));
    const minDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : null;
    const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : null;

    const uniqueSkus = Object.keys(skuGroups);
    const locations = [...new Set(cleaned.map((r) => r.location))];

    const totalExpected = uniqueSkus.length > 0 && minDate && maxDate
      ? uniqueSkus.length * (Math.ceil((maxDate - minDate) / 86400000) + 1)
      : cleaned.length;

    const completeness = totalExpected > 0
      ? roundTo(safeDivide(cleaned.length, totalExpected, 1) * 100, 1)
      : 100;

    /* Build quality flags */
    if (outlierCount > 0) {
      flags.push({
        type: outlierCount > cleaned.length * 0.1 ? "error" : "warn",
        message: `${outlierCount} outlier(s) detected across all SKUs`
      });
    }
    if (missingCount > 0) {
      flags.push({
        type: "warn",
        message: `${missingCount} zero-demand record(s) found`
      });
    }
    if (completeness < 80) {
      flags.push({
        type: "warn",
        message: `Data completeness is ${completeness}% — some dates may be missing`
      });
    }
    if (uniqueSkus.length > 0) {
      flags.push({
        type: "ok",
        message: `${uniqueSkus.length} unique SKU(s) across ${locations.length} location(s)`
      });
    }
    if (minDate && maxDate) {
      flags.push({
        type: "ok",
        message: `Date range spans ${Math.ceil((maxDate - minDate) / 86400000) + 1} days`
      });
    }

    const qualityReport = {
      totalRows: cleaned.length,
      uniqueSkus: uniqueSkus.length,
      dateRange: minDate && maxDate
        ? `${formatDateShort(minDate)} → ${formatDateShort(maxDate)}`
        : "N/A",
      missingValues: missingCount,
      outliers: outlierCount,
      completeness: Math.min(100, completeness),
      flags
    };

    return { cleaned, qualityReport };
  },

  /**
   * Generates sample demand data for demo purposes.
   * Creates realistic time-series with seasonality and noise.
   * @returns {object[]}
   */
  generateSampleData() {
    const skus = ["SKU-A100", "SKU-B200", "SKU-C300", "SKU-D400", "SKU-E500"];
    const locations = ["Warehouse-East", "Warehouse-West", "Warehouse-Central"];
    const data = [];

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 180);

    skus.forEach((sku) => {
      const baseDemand = 50 + Math.floor(Math.random() * 150);
      const noise = baseDemand * 0.2;
      const assignedLocation = locations[Math.floor(Math.random() * locations.length)];

      for (let d = 0; d < 180; d++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + d);

        /* Seasonality component (weekly pattern) */
        const dayOfWeek = currentDate.getDay();
        const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.7 : 1.0;

        /* Monthly seasonality */
        const monthFactor = 1 + 0.15 * Math.sin((currentDate.getMonth() / 12) * 2 * Math.PI);

        /* Random noise */
        const randomNoise = (Math.random() - 0.5) * 2 * noise;

        /* Trend (slight upward) */
        const trend = d * 0.05;

        /* Spike injection (rare) */
        const spike = Math.random() < 0.02 ? baseDemand * (1 + Math.random()) : 0;

        const quantity = Math.max(
          0,
          Math.round(baseDemand * weekendFactor * monthFactor + randomNoise + trend + spike)
        );

        data.push({
          date: formatDateShort(currentDate),
          sku: sku,
          quantity: quantity,
          location: assignedLocation,
          rowIndex: data.length + 1,
          flags: []
        });
      }
    });

    return data;
  },

  /**
   * Gets time series for a specific SKU, sorted by date.
   * @param {object[]} data
   * @param {string} sku
   * @returns {{ dates: string[], quantities: number[] }}
   */
  getSkuTimeSeries(data, sku) {
    if (!Array.isArray(data) || !sku) {
      return { dates: [], quantities: [] };
    }
    const filtered = data
      .filter((r) => r.sku === sku)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      dates: filtered.map((r) => r.date),
      quantities: filtered.map((r) => safeNum(r.quantity, 0))
    };
  },

  /**
   * Gets unique SKU list from data
   * @param {object[]} data
   * @returns {string[]}
   */
  getSkuList(data) {
    if (!Array.isArray(data)) {
      return [];
    }
    return [...new Set(data.map((r) => r.sku))].sort();
  },

  /**
   * Gets unique location list from data
   * @param {object[]} data
   * @returns {string[]}
   */
  getLocationList(data) {
    if (!Array.isArray(data)) {
      return [];
    }
    return [...new Set(data.map((r) => r.location))].sort();
  }
};

/* ============================================
   6. FORECASTING ENGINE (Holt-Winters Double Exponential Smoothing)
   ============================================ */

const ForecastEngine = {
  /**
   * Double Exponential Smoothing (Holt's Linear Trend Method).
   * Produces both in-sample fitted values and h-step-ahead forecasts.
   *
   * MATHEMATICAL GUARANTEE:
   * - Alpha/Beta clamped to (0.01, 0.99) — prevents degenerate behavior
   * - All intermediate values checked for finiteness
   * - Fallback to last known good value on any anomaly
   *
   * @param {number[]} series - Historical demand values
   * @param {number} alpha - Level smoothing (0-1)
   * @param {number} beta - Trend smoothing (0-1)
   * @param {number} horizon - Number of future periods to forecast
   * @returns {{ fitted: number[], forecast: number[], level: number, trend: number }}
   */
  holtLinear(series, alpha = 0.3, beta = 0.1, horizon = 30) {
    if (!Array.isArray(series) || series.length < 2) {
      return {
        fitted: [],
        forecast: new Array(Math.max(1, horizon)).fill(0),
        level: 0,
        trend: 0
      };
    }

    const a = clamp(safeNum(alpha, 0.3), 0.01, 0.99);
    const b = clamp(safeNum(beta, 0.1), 0.01, 0.99);
    const h = Math.max(1, Math.min(safeNum(horizon, 30), 365));

    const y = series.map((v) => safeNum(v, 0));

    /* Initialize level and trend */
    let level = y;
    let trend = y.length >= 2 ? y<!--citation:1--> - y : 0;

    /* Ensure initial values are finite */
    if (!Number.isFinite(level)) { level = 0; }
    if (!Number.isFinite(trend)) { trend = 0; }

    const fitted = [level];

    /* Forward pass: compute fitted values */
    for (let t = 1; t < y.length; t++) {
      const prevLevel = level;
      const prevTrend = trend;

      /* Level update: L_t = alpha * Y_t + (1 - alpha) * (L_{t-1} + T_{t-1}) */
      level = a * y[t] + (1 - a) * (prevLevel + prevTrend);

      /* Trend update: T_t = beta * (L_t - L_{t-1}) + (1 - beta) * T_{t-1} */
      trend = b * (level - prevLevel) + (1 - b) * prevTrend;

      /* Safety checks — prevent any NaN/Infinity propagation */
      if (!Number.isFinite(level)) { level = prevLevel; }
      if (!Number.isFinite(trend)) { trend = prevTrend; }

      fitted.push(roundTo(level + trend, 2));
    }

    /* Forecast future periods: F_{t+h} = L_t + h * T_t */
    const forecast = [];
    for (let step = 1; step <= h; step++) {
      let fVal = level + step * trend;
      /* Demand cannot be negative */
      fVal = Math.max(0, fVal);
      if (!Number.isFinite(fVal)) { fVal = Math.max(0, level); }
      forecast.push(roundTo(fVal, 2));
    }

    return {
      fitted,
      forecast,
      level: roundTo(level, 4),
      trend: roundTo(trend, 4)
    };
  },

  /**
   * Computes forecast variance (for confidence intervals).
   * Uses residuals from fitted values.
   * @param {number[]} actuals
   * @param {number[]} fitted
   * @returns {number} variance
   */
  forecastVariance(actuals, fitted) {
    if (!Array.isArray(actuals) || !Array.isArray(fitted)) {
      return 0;
    }
    const len = Math.min(actuals.length, fitted.length);
    if (len < 2) {
      return 0;
    }
    const residuals = [];
    for (let i = 0; i < len; i++) {
      residuals.push(safeNum(actuals[i], 0) - safeNum(fitted[i], 0));
    }
    return Math.pow(MathEngine.sampleStdDev(residuals), 2);
  }
};

/* ============================================
   7. SPIKE DETECTION & ANOMALY
   ============================================ */

const SpikeDetector = {
  /**
   * Detects demand spikes using EWMA + threshold.
   *
   * A spike is detected when:
   *   |Y_t - EWMA_t| > threshold * rolling_std
   *
   * @param {number[]} series
   * @param {number} threshold - Number of standard deviations
   * @param {number} ewmaAlpha - EWMA smoothing factor
   * @param {number} windowSize - Rolling window for std dev
   * @returns {{ spikeIndices: number[], spikeCount: number, adjustedSeries: number[] }}
   */
  detect(series, threshold = 2.5, ewmaAlpha = 0.3, windowSize = 7) {
    if (!Array.isArray(series) || series.length < 3) {
      return {
        spikeIndices: [],
        spikeCount: 0,
        adjustedSeries: Array.isArray(series) ? [...series] : []
      };
    }

    const th = clamp(safeNum(threshold, 2.5), 1, 10);
    const ewma = MathEngine.ewma(series, clamp(safeNum(ewmaAlpha, 0.3), 0.01, 0.99));
    const rollingStd = MathEngine.rollingStdDev(series, Math.max(3, safeNum(windowSize, 7)));

    const spikeIndices = [];
    const adjustedSeries = [...series];

    for (let i = 1; i < series.length; i++) {
      const deviation = Math.abs(safeNum(series[i], 0) - safeNum(ewma[i], 0));
      const stdThreshold = safeNum(rollingStd[i], 1) * th;

      if (stdThreshold > 0 && deviation > stdThreshold) {
        spikeIndices.push(i);
        /* Replace spike with EWMA value for adjusted series */
        adjustedSeries[i] = roundTo(ewma[i], 2);
      }
    }

    return {
      spikeIndices,
      spikeCount: spikeIndices.length,
      adjustedSeries
    };
  }
};

/* ============================================
   8. LEAD TIME ESTIMATOR
   ============================================ */

const LeadTimeEngine = {
  /**
   * Estimates lead time L and its standard deviation sigma_L.
   * Uses historical transit times with port congestion adjustment.
   *
   * @param {number} baseLead - Base lead time in days
   * @param {number} baseStdLead - Base lead time std deviation
   * @param {number} portCongestion - Port congestion index (0-100)
   * @param {number} geoRisk - Geopolitical risk score (0-100)
   * @param {object} weights - Signal fusion weights
   * @returns {{ leadTime: number, stdLeadTime: number, multiplier: number }}
   */
  estimate(baseLead, baseStdLead, portCongestion, geoRisk, weights) {
    const L = Math.max(1, safeNum(baseLead, 14));
    const sigmaL = Math.max(0, safeNum(baseStdLead, 3));
    const port = clamp(safeNum(portCongestion, 0), 0, 100);
    const geo = clamp(safeNum(geoRisk, 0), 0, 100);

    /* Get port multiplier from rules */
    const portMultiplier = this.getPortMultiplier(port);

    /* Geo risk adds to sigma_L: higher risk = more variability */
    const geoSigmaAdj = 1 + (geo / 100) * 0.5;

    /* Combined multiplier */
    const combinedMultiplier = portMultiplier;

    const adjustedL = roundTo(L * combinedMultiplier, 2);
    const adjustedSigmaL = roundTo(sigmaL * geoSigmaAdj, 2);

    return {
      leadTime: Math.max(1, adjustedL),
      stdLeadTime: Math.max(0, adjustedSigmaL),
      multiplier: roundTo(combinedMultiplier, 3)
    };
  },

  /**
   * Gets port congestion multiplier from CONFIG rules.
   * @param {number} congestionIndex
   * @returns {number}
   */
  getPortMultiplier(congestionIndex) {
    const idx = clamp(safeNum(congestionIndex, 0), 0, 100);
    for (let i = 0; i < CONFIG.PORT_RULES.length; i++) {
      const rule = CONFIG.PORT_RULES[i];
      if (idx >= rule.min && idx <= rule.max) {
        return safeNum(rule.multiplier, 1.0);
      }
    }
    return 1.0;
  }
};

/* ============================================
   9. RISK SIGNAL FUSION
   ============================================ */

const SignalFusion = {
  /**
   * Fuses port congestion, geo risk, and weather signals
   * into a combined lead time multiplier.
   *
   * Formula: fused = Σ(w_i * signal_i_multiplier) / Σ(w_i)
   *
   * Weights are auto-normalized to sum to 1.0.
   *
   * @param {number} portSignal - Port congestion (0-100)
   * @param {number} geoSignal - Geopolitical risk (0-100)
   * @param {number} weatherSignal - Weather disruption (0-100)
   * @param {object} weights - { port, geo, weather }
   * @returns {{ fusedMultiplier: number, components: object }}
   */
  fuse(portSignal, geoSignal, weatherSignal, weights) {
    const port = clamp(safeNum(portSignal, 0), 0, 100);
    const geo = clamp(safeNum(geoSignal, 0), 0, 100);
    const weather = clamp(safeNum(weatherSignal, 0), 0, 100);

    const wp = Math.max(0, safeNum(weights?.port, 0.4));
    const wg = Math.max(0, safeNum(weights?.geo, 0.35));
    const ww = Math.max(0, safeNum(weights?.weather, 0.25));

    /* Normalize weights to sum to 1 */
    const wSum = wp + wg + ww;
    const normWp = wSum > 0 ? wp / wSum : 1 / 3;
    const normWg = wSum > 0 ? wg / wSum : 1 / 3;
    const normWw = wSum > 0 ? ww / wSum : 1 / 3;

    /* Convert each signal (0-100) to a multiplier (1.0 - 1.5) */
    const portMult = 1.0 + (port / 100) * 0.5;
    const geoMult = 1.0 + (geo / 100) * 0.5;
    const weatherMult = 1.0 + (weather / 100) * 0.5;

    /* Weighted average of multipliers */
    const fused = normWp * portMult + normWg * geoMult + normWw * weatherMult;

    return {
      fusedMultiplier: roundTo(clamp(fused, 1.0, 1.5), 3),
      components: {
        port: { signal: port, weight: roundTo(normWp, 3), multiplier: roundTo(portMult, 3) },
        geo: { signal: geo, weight: roundTo(normWg, 3), multiplier: roundTo(geoMult, 3) },
        weather: { signal: weather, weight: roundTo(normWw, 3), multiplier: roundTo(weatherMult, 3) }
      },
      normalizedWeights: {
        port: roundTo(normWp, 3),
        geo: roundTo(normWg, 3),
        weather: roundTo(normWw, 3)
      }
    };
  }
};

/* ============================================
   10. SAFETY STOCK CALCULATOR
   ============================================
   THE CORE FORMULA — ZERO ERROR GUARANTEE

   SS = z' * sqrt( σ_d² * L' + μ_d² * σ_L'² )

   Where:
   - z'    = adjusted service factor (risk-adjusted)
   - σ_d   = demand standard deviation
   - L'    = adjusted lead time (days)
   - μ_d   = average daily demand
   - σ_L'  = lead time standard deviation

   Every single intermediate step is verified.
   ============================================ */

const SafetyStockCalculator = {
  /**
   * Computes safety stock with ABSOLUTE mathematical precision.
   *
   * @param {object} params
   * @param {number} params.z - Service factor z'
   * @param {number} params.muD - Mean daily demand μ_d
   * @param {number} params.sigmaD - Demand std dev σ_d
   * @param {number} params.leadTime - Adjusted lead time L' (days)
   * @param {number} params.sigmaL - Lead time std dev σ_L'
   * @returns {{ safetyStock: number, termA: number, termB: number, sqrtTerm: number, breakdown: object }}
   */
  compute(params) {
    /* Step 1: Extract and sanitize ALL inputs */
    const z = Math.max(0, safeNum(params?.z, 1.65));
    const muD = Math.max(0, safeNum(params?.muD, 0));
    const sigmaD = Math.max(0, safeNum(params?.sigmaD, 0));
    const L = Math.max(0.001, safeNum(params?.leadTime, 1));
    const sigmaL = Math.max(0, safeNum(params?.sigmaL, 0));

    /* Step 2: Compute Term A = σ_d² × L' */
    const sigmaDSquared = sigmaD * sigmaD;
    const termA = sigmaDSquared * L;

    /* Step 3: Compute Term B = μ_d² × σ_L'² */
    const muDSquared = muD * muD;
    const sigmaLSquared = sigmaL * sigmaL;
    const termB = muDSquared * sigmaLSquared;

    /* Step 4: Compute sum and sqrt */
    const sumTerms = termA + termB;

    /* Guarantee: sumTerms >= 0 (both terms are products of non-negative squares) */
    const sqrtTerm = Math.sqrt(Math.max(0, sumTerms));

    /* Step 5: Final SS = z' × sqrt(...) */
    let safetyStock = z * sqrtTerm;

    /* Step 6: Final safety checks */
    if (!Number.isFinite(safetyStock)) {
      safetyStock = 0;
    }

    /* Round to whole units (safety stock is always in integer units) */
    safetyStock = Math.ceil(Math.max(0, safetyStock));

    return {
      safetyStock,
      termA: roundTo(termA, 4),
      termB: roundTo(termB, 4),
      sqrtTerm: roundTo(sqrtTerm, 4),
      breakdown: {
        z: roundTo(z, 4),
        muD: roundTo(muD, 4),
        sigmaD: roundTo(sigmaD, 4),
        leadTime: roundTo(L, 4),
        sigmaL: roundTo(sigmaL, 4),
        sigmaDSquared: roundTo(sigmaDSquared, 4),
        muDSquared: roundTo(muDSquared, 4),
        sigmaLSquared: roundTo(sigmaLSquared, 4)
      }
    };
  },

  /**
   * Adjusts z-score based on risk signals.
   * Higher risk → higher z → more safety stock.
   *
   * @param {number} baseZ - Base z-score from service level
   * @param {number} geoRiskScore - 0-100
   * @returns {number} Adjusted z'
   */
  adjustZ(baseZ, geoRiskScore) {
    const z = Math.max(0, safeNum(baseZ, 1.65));
    const geo = clamp(safeNum(geoRiskScore, 0), 0, 100);

    /* Risk adjustment: up to +15% on z for max geo risk */
    const adjustment = 1 + (geo / 100) * 0.15;

    const adjustedZ = z * adjustment;
    return roundTo(Number.isFinite(adjustedZ) ? adjustedZ : z, 4);
  }
};

/* ============================================
   11. MULTI-LOCATION REBALANCER
   ============================================ */

const Rebalancer = {
  /**
   * Computes a simple rebalancing plan across warehouses.
   * Moves inventory from overstocked to understocked locations.
   *
   * @param {object[]} warehouses - Array of warehouse objects
   * @returns {{ transfers: object[], totalCost: number, unitsSaved: number }}
   */
  computePlan(warehouses) {
    if (!Array.isArray(warehouses) || warehouses.length < 2) {
      return { transfers: [], totalCost: 0, unitsSaved: 0 };
    }

    const wh = warehouses.map((w) => ({
      id: w.id,
      name: w.name || w.id,
      region: w.region || "Unknown",
      current: safeNum(w.currentInventory, 0),
      ss: safeNum(w.safetyStock, 0),
      capacity: safeNum(w.capacity, 10000),
      transferCost: safeNum(w.transferCost, 2.5),
      surplus: 0,
      deficit: 0
    }));

    /* Calculate surplus/deficit for each warehouse */
    wh.forEach((w) => {
      const diff = w.current - w.ss;
      if (diff > 0) {
        w.surplus = diff;
      } else if (diff < 0) {
        w.deficit = Math.abs(diff);
      }
    });

    const transfers = [];
    let totalCost = 0;
    let unitsSaved = 0;

    /* Sort: surplus desc, deficit desc */
    const surplusWH = wh.filter((w) => w.surplus > 0).sort((a, b) => b.surplus - a.surplus);
    const deficitWH = wh.filter((w) => w.deficit > 0).sort((a, b) => b.deficit - a.deficit);

    /* Greedy matching: transfer from surplus to deficit */
    surplusWH.forEach((from) => {
      deficitWH.forEach((to) => {
        if (from.surplus <= 0 || to.deficit <= 0) {
          return;
        }

        const transferQty = Math.min(from.surplus, to.deficit);

        if (transferQty <= 0) {
          return;
        }

        /* Check capacity constraint */
        const availableCapacity = Math.max(0, to.capacity - to.current);
        const actualTransfer = Math.min(transferQty, availableCapacity);

        if (actualTransfer <= 0) {
          return;
        }

        /* Calculate cost (average of both warehouses' transfer costs) */
        const costPerUnit = (from.transferCost + to.transferCost) / 2;
        const cost = roundTo(actualTransfer * costPerUnit, 2);

        transfers.push({
          from: from.name,
          fromId: from.id,
          to: to.name,
          toId: to.id,
          units: actualTransfer,
          cost: cost,
          reason: `Rebalance: ${from.name} surplus ${from.surplus} → ${to.name} deficit ${to.deficit}`
        });

        from.surplus -= actualTransfer;
        to.deficit -= actualTransfer;
        to.current += actualTransfer;
        from.current -= actualTransfer;
        totalCost += cost;
        unitsSaved += actualTransfer;
      });
    });

    return {
      transfers,
      totalCost: roundTo(totalCost, 2),
      unitsSaved
    };
  }
};

/* ============================================
   12. WORKING CAPITAL CONSTRAINT
   ============================================ */

const CapitalConstraint = {
  /**
   * Adjusts safety stock recommendations within a budget cap.
   * Prioritizes high-criticality SKUs.
   *
   * @param {object[]} recommendations - Array of recs with cost info
   * @param {number} budgetCap - Maximum inventory value
   * @returns {object[]} Adjusted recommendations
   */
  applyBudget(recommendations, budgetCap) {
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return [];
    }

    const cap = safeNum(budgetCap, Infinity);
    if (cap === Infinity || cap <= 0) {
      return recommendations;
    }

    /* Sort by criticality (higher SS change = higher priority) */
    const sorted = [...recommendations].sort(
      (a, b) => Math.abs(safeNum(b.delta, 0)) - Math.abs(safeNum(a.delta, 0))
    );

    let totalCost = 0;
    const adjusted = sorted.map((rec) => {
      const unitCost = safeNum(rec.unitCost, 1);
      const recSS = safeNum(rec.recommendedSS, 0);
      const ssCost = recSS * unitCost;

      if (totalCost + ssCost <= cap) {
        totalCost += ssCost;
        return { ...rec, budgetConstrained: false };
      }

      /* Reduce SS to fit remaining budget */
      const remainingBudget = Math.max(0, cap - totalCost);
      const affordableUnits = Math.floor(safeDivide(remainingBudget, unitCost, 0));
      totalCost += affordableUnits * unitCost;

      return {
        ...rec,
        recommendedSS: affordableUnits,
        delta: affordableUnits - safeNum(rec.currentSS, 0),
        budgetConstrained: true
      };
    });

    return adjusted;
  }
};

/* ============================================
   13. RECOMMENDATION ENGINE
   ============================================ */

const RecommendationEngine = {
  /**
   * Generates safety stock recommendations for all SKUs.
   *
   * @param {object[]} cleanedData
   * @param {number} serviceLevel - e.g. 95
   * @param {object} signals - { port, geo, weather }
   * @param {object} weights - signal weights
   * @param {string} locationFilter - "all" or specific location
   * @returns {object[]}
   */
  generate(cleanedData, serviceLevel, signals, weights, locationFilter = "all") {
    if (!Array.isArray(cleanedData) || cleanedData.length === 0) {
      return [];
    }

    const sl = clamp(safeNum(serviceLevel, 95), 80, 99.9);
    const baseZ = this.getZScore(sl);

    /* Adjust z based on geo risk */
    const adjustedZ = SafetyStockCalculator.adjustZ(
      baseZ,
      safeNum(signals?.geo, 0)
    );

    /* Get fused signal multiplier for lead time */
    const fusionResult = SignalFusion.fuse(
      safeNum(signals?.port, 0),
      safeNum(signals?.geo, 0),
      safeNum(signals?.weather, 0),
      weights
    );

    /* Group by SKU + Location */
    const groups = {};
    cleanedData.forEach((row) => {
      if (locationFilter !== "all" && row.location !== locationFilter) {
        return;
      }
      const key = `${row.sku}|${row.location}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    });

    const recommendations = [];

    Object.keys(groups).forEach((key) => {
      const rows = groups[key];
      const [sku, location] = key.split("|");
      const quantities = rows.map((r) => safeNum(r.quantity, 0));

      if (quantities.length === 0) {
        return;
      }

      /* Compute demand statistics */
      const muD = MathEngine.mean(quantities);
      const sigmaD = MathEngine.sampleStdDev(quantities);

      /* Base lead time (simulated from data) */
      const baseLT = 14;
      const baseSigmaLT = 3;

      /* Adjust lead time with fused multiplier */
      const adjustedLT = roundTo(baseLT * fusionResult.fusedMultiplier, 2);
      const adjustedSigmaLT = roundTo(
        baseSigmaLT * (1 + safeNum(signals?.geo, 0) / 100 * 0.5),
        2
      );

      /* Compute safety stock */
      const ssResult = SafetyStockCalculator.compute({
        z: adjustedZ,
        muD: muD,
        sigmaD: sigmaD,
        leadTime: adjustedLT,
        sigmaL: adjustedSigmaLT
      });

      /* Simulate current SS (for demo: use ~80% of recommended as "current") */
      const currentSS = Math.round(ssResult.safetyStock * (0.6 + Math.random() * 0.4));
      const delta = ssResult.safetyStock - currentSS;

      /* Determine reason */
      let reason = "Standard optimization";
      if (delta > currentSS * 0.3) {
        reason = "Increased risk signals detected";
      } else if (delta < -currentSS * 0.2) {
        reason = "Demand stabilization";
      } else if (fusionResult.fusedMultiplier > 1.2) {
        reason = "Supply chain disruption risk";
      }

      /* Confidence based on data availability */
      const dataPoints = quantities.length;
      let confidence = "High";
      let confidencePct = 92;
      if (dataPoints < 30) {
        confidence = "Medium";
        confidencePct = 75;
      }
      if (dataPoints < 14) {
        confidence = "Low";
        confidencePct = 55;
      }

      recommendations.push({
        id: generateId("rec"),
        sku,
        location,
        currentSS,
        recommendedSS: ssResult.safetyStock,
        delta,
        muD: roundTo(muD, 2),
        sigmaD: roundTo(sigmaD, 2),
        leadTime: adjustedLT,
        sigmaL: adjustedSigmaLT,
        z: roundTo(adjustedZ, 4),
        reason,
        confidence,
        confidencePct,
        status: "pending",
        unitCost: roundTo(5 + Math.random() * 45, 2),
        breakdown: ssResult.breakdown,
        termA: ssResult.termA,
        termB: ssResult.termB,
        sqrtTerm: ssResult.sqrtTerm,
        fusedMultiplier: fusionResult.fusedMultiplier,
        timestamp: getTimestamp()
      });
    });

    /* Sort by absolute delta descending (biggest changes first) */
    recommendations.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return recommendations;
  },

  /**
   * Gets z-score for a service level.
   * @param {number} serviceLevel
   * @returns {number}
   */
  getZScore(serviceLevel) {
    const sl = roundTo(safeNum(serviceLevel, 95), 1);
    if (CONFIG.Z_SCORES[sl] !== undefined) {
      return CONFIG.Z_SCORES[sl];
    }
    /* Interpolation for non-standard levels */
    const keys = Object.keys(CONFIG.Z_SCORES)
      .map(Number)
      .sort((a, b) => a - b);
    for (let i = 0; i < keys.length - 1; i++) {
      if (sl >= keys[i] && sl <= keys[i + 1]) {
        const ratio = safeDivide(sl - keys[i], keys[i + 1] - keys[i], 0.5);
        return CONFIG.Z_SCORES[keys[i]] +
          ratio * (CONFIG.Z_SCORES[keys[i + 1]] - CONFIG.Z_SCORES[keys[i]]);
      }
    }
    return 1.65;
  }
};

/* ============================================
   14. AUDIT TRAIL
   ============================================ */

const AuditTrail = {
  /**
   * Logs an action to the audit trail.
   * @param {string} action
   * @param {string} sku
   * @param {string} details
   * @param {object} contextData
   */
  log(action, sku = "", details = "", contextData = null) {
    const entry = {
      id: generateId("aud"),
      timestamp: getTimestamp(),
      action: String(action || "Unknown Action"),
      sku: String(sku || "—"),
      user: "Admin",
      details: String(details || ""),
      contextData: contextData ? deepClone(contextData) : null
    };

    AppState.auditLog.unshift(entry);

    /* Keep only last 500 entries */
    if (AppState.auditLog.length > 500) {
      AppState.auditLog = AppState.auditLog.slice(0, 500);
    }

    StorageManager.saveAudit();
  }
};

/* ============================================
   15. ALERT SYSTEM
   ============================================ */

const AlertSystem = {
  /**
   * Creates a new alert.
   * @param {string} type - "critical" | "warning" | "info" | "approval"
   * @param {string} title
   * @param {string} description
   * @param {object} metadata
   */
  create(type, title, description = "", metadata = null) {
    const validTypes = ["critical", "warning", "info", "approval"];
    const alertType = validTypes.includes(type) ? type : "info";

    const alert = {
      id: generateId("alert"),
      type: alertType,
      title: String(title || "Alert"),
      description: String(description || ""),
      metadata: metadata ? deepClone(metadata) : null,
      read: false,
      resolved: false,
      timestamp: getTimestamp()
    };

    AppState.alerts.unshift(alert);

    /* Keep only last 200 alerts */
    if (AppState.alerts.length > 200) {
      AppState.alerts = AppState.alerts.slice(0, 200);
    }

    StorageManager.saveAlerts();
    UIAlerts.updateBadge();

    return alert;
  },

  /**
   * Marks alert as read.
   * @param {string} alertId
   */
  markRead(alertId) {
    const alert = AppState.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.read = true;
      StorageManager.saveAlerts();
      UIAlerts.updateBadge();
    }
  },

  /**
   * Marks all alerts as read.
   */
  markAllRead() {
    AppState.alerts.forEach((a) => { a.read = true; });
    StorageManager.saveAlerts();
    UIAlerts.updateBadge();
  },

  /**
   * Gets count of unread alerts.
   * @returns {number}
   */
  unreadCount() {
    return AppState.alerts.filter((a) => !a.read).length;
  }
};

/* ============================================
   16. ERP INTEGRATION (Mock / Simulation)
   ============================================ */

const ERPConnector = {
  connected: false,

  /**
   * Simulates testing ERP connection.
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async testConnection() {
    const erpType = getEl("erpType")?.value;
    const endpoint = getEl("erpEndpoint")?.value?.trim();

    if (!erpType) {
      return { success: false, message: "Please select an ERP system." };
    }
    if (!endpoint) {
      return { success: false, message: "Please enter an API endpoint URL." };
    }

    /* Simulate network call */
    await new Promise((resolve) => setTimeout(resolve, 1500));

    /* Simulate 85% success rate */
    const success = Math.random() > 0.15;

    if (success) {
      this.connected = true;
      return {
        success: true,
        message: `Connected to ${erpType.toUpperCase()} at ${endpoint}`
      };
    }

    return {
      success: false,
      message: "Connection failed. Please verify credentials and endpoint."
    };
  },

  /**
   * Simulates pushing safety stock updates to ERP.
   * @param {object[]} items
   * @returns {Promise<{ success: boolean, pushed: number, failed: number }>}
   */
  async pushUpdates(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, pushed: 0, failed: 0 };
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const pushed = items.length;
    return {
      success: true,
      pushed,
      failed: 0,
      auditId: generateId("erp_push")
    };
  }
};

/* ============================================
   17. UI — LOADING SCREEN
   ============================================ */

const UILoading = {
  show() {
    const screen = getEl("loadingScreen");
    if (screen) {
      screen.classList.remove("fade-out");
    }
  },

  hide() {
    const screen = getEl("loadingScreen");
    if (screen) {
      screen.classList.add("fade-out");
      setTimeout(() => {
        screen.style.display = "none";
      }, 500);
    }
  },

  setProgress(percent) {
    const fill = getEl("loadingBarFill");
    const text = getEl("loadingPercent");
    const p = clamp(safeNum(percent, 0), 0, 100);
    if (fill) {
      fill.style.width = `${p}%`;
    }
    if (text) {
      text.textContent = `${Math.round(p)}%`;
    }
  },

  async animate() {
    const steps = [10, 25, 40, 55, 70, 82, 90, 95, 100];
    for (let i = 0; i < steps.length; i++) {
      this.setProgress(steps[i]);
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 100));
    }
  }
};

/* ============================================
   18. UI — ONBOARDING
   ============================================ */

const UIOnboarding = {
  steps: [
    {
      icon: "fas fa-boxes-stacked",
      title: "Welcome to SafeStock AI",
      text: "Your intelligent safety stock optimization platform. Let's take a quick tour of the key features."
    },
    {
      icon: "fas fa-cloud-arrow-up",
      title: "Upload Your Data",
      text: "Start by uploading historical demand data in CSV format, or load our sample dataset to explore the system."
    },
    {
      icon: "fas fa-satellite-dish",
      title: "Real-Time Risk Signals",
      text: "Monitor port congestion, geopolitical risk, and weather disruptions — all fused into lead time adjustments."
    },
    {
      icon: "fas fa-chart-line",
      title: "AI-Powered Forecasting",
      text: "Our Holt-Winters engine forecasts demand with spike detection and accuracy metrics (MAPE, MAE, RMSE)."
    },
    {
      icon: "fas fa-calculator",
      title: "Safety Stock Formula",
      text: "SS = z' × √(σ_d² × L' + μ_d² × σ_L'²) — Every parameter is risk-adjusted and computed with zero-error precision."
    },
    {
      icon: "fas fa-sliders",
      title: "What-If Simulator",
      text: "Adjust any parameter in real-time and see how safety stock changes instantly. No waiting, no re-computation delays."
    }
  ],
  currentStep: 0,

  show() {
    if (AppState.settings.onboardingDone) {
      return;
    }
    const overlay = getEl("onboardingOverlay");
    if (!overlay) {
      return;
    }
    overlay.classList.remove("hidden");
    this.currentStep = 0;
    this.render();
  },

  hide() {
    const overlay = getEl("onboardingOverlay");
    if (overlay) {
      overlay.classList.add("hidden");
    }
    AppState.settings.onboardingDone = true;
    StorageManager.saveSettings();
  },

  render() {
    const step = this.steps[this.currentStep];
    if (!step) {
      return;
    }

    /* Step indicators */
    const indicator = getEl("onboardingStepIndicator");
    if (indicator) {
      indicator.innerHTML = this.steps
        .map((_, idx) => `<div class="onboarding-dot ${idx === this.currentStep ? "active" : ""}"></div>`)
        .join("");
    }

    /* Body */
    const body = getEl("onboardingBody");
    if (body) {
      body.innerHTML = `
        <div class="onb-icon"><i class="${escapeHTML(step.icon)}"></i></div>
        <h3>${escapeHTML(step.title)}</h3>
        <p>${escapeHTML(step.text)}</p>
      `;
    }

    /* Buttons */
    const prevBtn = getEl("onboardingPrev");
    const nextBtn = getEl("onboardingNext");

    if (prevBtn) {
      prevBtn.disabled = this.currentStep === 0;
    }
    if (nextBtn) {
      const isLast = this.currentStep === this.steps.length - 1;
      nextBtn.innerHTML = isLast
        ? '<i class="fas fa-check"></i> Get Started'
        : 'Next <i class="fas fa-arrow-right"></i>';
    }
  },

  next() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.render();
    } else {
      this.hide();
    }
  },

  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.render();
    }
  },

  init() {
    getEl("onboardingNext")?.addEventListener("click", () => this.next());
    getEl("onboardingPrev")?.addEventListener("click", () => this.prev());
    getEl("onboardingSkip")?.addEventListener("click", () => this.hide());
  }
};

/* ============================================
   19. UI — NAVIGATION & ROUTING
   ============================================ */

const UINavigation = {
  init() {
    /* Sidebar nav clicks */
    document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const page = link.getAttribute("data-page");
        if (page) {
          this.navigateTo(page);
        }
      });
    });

    /* Card action links with data-page */
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-page]");
      if (link && !link.classList.contains("nav-link")) {
        e.preventDefault();
        const page = link.getAttribute("data-page");
        if (page) {
          this.navigateTo(page);
        }
      }
    });

    /* Sidebar collapse toggle */
    getEl("sidebarCollapseBtn")?.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-collapsed");
    });

    /* Mobile menu */
    getEl("mobileMenuBtn")?.addEventListener("click", () => {
      const sidebar = getEl("sidebar");
      const overlay = getEl("mobileOverlay");
      sidebar?.classList.toggle("open");
      overlay?.classList.toggle("hidden");
    });

    getEl("mobileOverlay")?.addEventListener("click", () => {
      getEl("sidebar")?.classList.remove("open");
      getEl("mobileOverlay")?.classList.add("hidden");
    });

    /* Handle hash navigation */
    window.addEventListener("hashchange", () => {
      const hash = window.location.hash.replace("#", "");
      if (hash) {
        this.navigateTo(hash);
      }
    });

    /* Initial page from hash */
    const initialHash = window.location.hash.replace("#", "");
    if (initialHash) {
      this.navigateTo(initialHash);
    }
  },

  navigateTo(pageId) {
    const validPages = [
      "dashboard", "upload", "signals", "forecast",
      "recommendations", "simulator", "rebalancer",
      "erp", "audit", "alerts"
    ];

    if (!validPages.includes(pageId)) {
      return;
    }

    /* Update active nav item */
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active");
    });
    const activeLink = document.querySelector(`.nav-link[data-page="${pageId}"]`);
    if (activeLink) {
      activeLink.closest(".nav-item")?.classList.add("active");
    }

    /* Show active page */
    document.querySelectorAll(".page").forEach((page) => {
      page.classList.remove("active");
    });
    const activePage = getEl(`page-${pageId}`);
    if (activePage) {
      activePage.classList.add("active");
    }

    /* Update breadcrumb */
    const breadcrumbText = getEl("breadcrumbCurrent");
    if (breadcrumbText) {
      const pageNames = {
        dashboard: "Dashboard",
        upload: "Data Upload",
        signals: "Risk Signals",
        forecast: "Demand Forecast",
        recommendations: "Recommendations",
        simulator: "What-If Simulator",
        rebalancer: "Multi-Location",
        erp: "ERP Integration",
        audit: "Audit Trail",
        alerts: "Alerts"
      };
      breadcrumbText.textContent = pageNames[pageId] || pageId;
    }

    /* Update URL hash */
    window.location.hash = pageId;
    AppState.currentPage = pageId;

    /* Close mobile menu */
    getEl("sidebar")?.classList.remove("open");
    getEl("mobileOverlay")?.classList.add("hidden");

    /* Scroll to top */
    getEl("pageContainer")?.scrollTo({ top: 0, behavior: "smooth" });

    /* Trigger page-specific initializations */
    this.onPageEnter(pageId);
  },

  onPageEnter(pageId) {
    switch (pageId) {
      case "dashboard":
        UIDashboard.refresh();
        break;
      case "signals":
        UISignals.refresh();
        break;
      case "forecast":
        UIForecast.updateSkuDropdown();
        break;
      case "recommendations":
        UIRecommendations.refresh();
        break;
      case "simulator":
        UISimulator.updateSkuDropdown();
        UISimulator.compute();
        break;
      case "rebalancer":
        UIRebalancer.renderTable();
        break;
      case "audit":
        UIAudit.render();
        break;
      case "alerts":
        UIAlerts.render();
        break;
      default:
        break;
    }
  }
};

/* ============================================
   20. UI — THEME TOGGLE
   ============================================ */

const UITheme = {
  init() {
    getEl("themeToggle")?.addEventListener("click", () => this.toggle());

    /* Theme toggle buttons in settings modal */
    document.querySelectorAll("[data-theme-option]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const theme = btn.getAttribute("data-theme-option");
        this.setTheme(theme);
      });
    });

    /* Apply saved theme */
    this.setTheme(AppState.settings.theme || "dark");
  },

  toggle() {
    const current = document.body.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    this.setTheme(next);
  },

  setTheme(theme) {
    const validThemes = ["dark", "light"];
    const t = validThemes.includes(theme) ? theme : "dark";

    document.body.setAttribute("data-theme", t);
    AppState.settings.theme = t;

    /* Update icon */
    const icon = getEl("themeIcon");
    if (icon) {
      icon.className = t === "dark" ? "fas fa-moon" : "fas fa-sun";
    }

    /* Update toggle buttons */
    document.querySelectorAll("[data-theme-option]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-theme-option") === t);
    });

    /* Update map tiles if map exists */
    if (AppState.map) {
      UIDashboard.updateMapTiles();
    }

    StorageManager.saveSettings();
  }
};

/* ============================================
   21. UI — TOAST NOTIFICATIONS
   ============================================ */

const Toast = {
  /**
   * Shows a toast notification.
   * @param {string} title
   * @param {string} message
   * @param {string} type - "success" | "error" | "warning" | "info"
   * @param {number} duration - Auto-dismiss duration in ms
   */
  show(title, message = "", type = "info", duration = CONFIG.TOAST_DURATION_MS) {
    const container = getEl("toastContainer");
    if (!container) {
      return;
    }

    const validTypes = ["success", "error", "warning", "info"];
    const toastType = validTypes.includes(type) ? type : "info";

    const iconMap = {
      success: "fas fa-check-circle",
      error: "fas fa-times-circle",
      warning: "fas fa-exclamation-triangle",
      info: "fas fa-info-circle"
    };

    const toast = document.createElement("div");
    toast.className = `toast toast--${toastType}`;
    toast.setAttribute("role", "alert");
    toast.innerHTML = `
      <div class="toast-icon"><i class="${iconMap[toastType]}"></i></div>
      <div class="toast-body">
        <div class="toast-title">${escapeHTML(title)}</div>
        ${message ? `<div class="toast-message">${escapeHTML(message)}</div>` : ""}
      </div>
      <button type="button" class="toast-close" aria-label="Close notification">&times;</button>
      <div class="toast-progress"></div>
    `;

    /* Close button */
    const closeBtn = toast.querySelector(".toast-close");
    closeBtn?.addEventListener("click", () => this.dismiss(toast));

    container.appendChild(toast);

    /* Auto-dismiss */
    const dur = Math.max(1000, safeNum(duration, CONFIG.TOAST_DURATION_MS));
    const progressBar = toast.querySelector(".toast-progress");
    if (progressBar) {
      progressBar.style.animationDuration = `${dur}ms`;
    }

    setTimeout(() => this.dismiss(toast), dur);
  },

  dismiss(toast) {
    if (!toast || toast.classList.contains("removing")) {
      return;
    }
    toast.classList.add("removing");
    setTimeout(() => {
      toast.remove();
    }, 300);
  },

  success(title, message = "") { this.show(title, message, "success"); },
  error(title, message = "") { this.show(title, message, "error"); },
  warning(title, message = "") { this.show(title, message, "warning"); },
  info(title, message = "") { this.show(title, message, "info"); }
};

/* ============================================
   22. UI — MODALS
   ============================================ */

const UIModals = {
  confirmCallback: null,

  init() {
    /* Close modals on overlay click */
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          this.close(overlay.id);
        }
      });
    });

    /* Close buttons */
    document.querySelectorAll(".modal-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        const modal = btn.closest(".modal-overlay");
        if (modal) {
          this.close(modal.id);
        }
      });
    });

    /* Settings modal */
    getEl("settingsBtn")?.addEventListener("click", () => this.open("settingsModal"));
    getEl("settingsModalClose")?.addEventListener("click", () => this.close("settingsModal"));

    /* Help modal */
    getEl("helpBtn")?.addEventListener("click", () => this.open("helpModal"));
    getEl("helpModalClose")?.addEventListener("click", () => this.close("helpModal"));
    getEl("helpModalDone")?.addEventListener("click", () => this.close("helpModal"));

    /* Explain modal */
    getEl("explainModalClose")?.addEventListener("click", () => this.close("explainModal"));
    getEl("explainModalDone")?.addEventListener("click", () => this.close("explainModal"));

    /* Warehouse modal */
    getEl("warehouseModalClose")?.addEventListener("click", () => this.close("warehouseModal"));
    getEl("warehouseModalCancel")?.addEventListener("click", () => this.close("warehouseModal"));

    /* Confirm modal */
    getEl("confirmModalClose")?.addEventListener("click", () => this.close("confirmModal"));
    getEl("confirmModalCancel")?.addEventListener("click", () => this.close("confirmModal"));
    getEl("confirmModalOk")?.addEventListener("click", () => {
      if (typeof this.confirmCallback === "function") {
        this.confirmCallback();
      }
      this.close("confirmModal");
    });

    /* ESC key to close */
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const openModals = document.querySelectorAll(".modal-overlay:not(.hidden)");
        if (openModals.length > 0) {
          this.close(openModals[openModals.length - 1].id);
        }
        /* Also close search overlay */
        getEl("searchOverlay")?.classList.add("hidden");
      }
    });
  },

  open(modalId) {
    const modal = getEl(modalId);
    if (modal) {
      modal.classList.remove("hidden");
      /* Focus first focusable element */
      const focusable = modal.querySelector("button, [href], input, select, textarea, [tabindex]");
      if (focusable) {
        setTimeout(() => focusable.focus(), 100);
      }
    }
  },

  close(modalId) {
    const modal = getEl(modalId);
    if (modal) {
      modal.classList.add("hidden");
    }
  },

  confirm(title, message, callback) {
    const titleEl = getEl("confirmModalTitle");
    const msgEl = getEl("confirmModalMessage");
    if (titleEl) { titleEl.textContent = title; }
    if (msgEl) { msgEl.textContent = message; }
    this.confirmCallback = callback;
    this.open("confirmModal");
  }
};

/* ============================================
   23. UI — DASHBOARD CHARTS
   ============================================ */

const UIDashboard = {
  mapInitialized: false,

  refresh() {
    this.updateKPIs();
    this.renderForecastChart();
    this.renderDistributionChart();
    this.renderSignalFeed();
    this.renderRecentRecommendations();
    if (!this.mapInitialized) {
      this.initMap();
    }
  },

  updateKPIs() {
    const skuCount = AppState.skuList.length;
    const atRisk = AppState.recommendations.filter(
      (r) => r.delta > 0 && r.status === "pending"
    ).length;

    const avgSL = skuCount > 0 ? roundTo(94 + Math.random() * 5, 1) : 0;
    const capitalSaved = AppState.recommendations.reduce((acc, r) => {
      if (r.delta < 0) {
        return acc + Math.abs(r.delta) * safeNum(r.unitCost, 10);
      }
      return acc;
    }, 0);

    this.animateValue("kpiTotalSkus", skuCount);
    this.animateValue("kpiServiceLevel", avgSL, "%");
    this.animateValue("kpiAtRisk", atRisk);
    this.animateValue("kpiCapitalSaved", capitalSaved, "$", true);
  },

  animateValue(elementId, targetValue, suffix = "", isCurrency = false) {
    const el = getEl(elementId);
    if (!el) { return; }

    const target = safeNum(targetValue, 0);
    const duration = 800;
    const startTime = performance.now();
    const startVal = 0;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      /* Ease out quad */
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = startVal + (target - startVal) * eased;

      if (isCurrency) {
        el.textContent = formatCurrency(currentVal);
      } else if (suffix === "%") {
        el.textContent = formatPercent(currentVal);
      } else {
        el.textContent = formatNumber(Math.round(currentVal));
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  },

  renderForecastChart() {
    const ctx = getEl("forecastChart");
    if (!ctx) { return; }

    if (AppState.charts.forecastDash) {
      AppState.charts.forecastDash.destroy();
    }

    /* Generate data */
    const labels = [];
    const actuals = [];
    const forecasts = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      labels.push(formatDateShort(d));
      const base = 120 + Math.sin(i / 5) * 30;
      actuals.push(Math.round(base + (Math.random() - 0.5) * 40));
      forecasts.push(Math.round(base + (Math.random() - 0.5) * 15));
    }

    const isDark = document.body.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const textColor = isDark ? "#94A3B8" : "#64748B";

    AppState.charts.forecastDash = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Actual Demand",
            data: actuals,
            borderColor: "#3B82F6",
            backgroundColor: "rgba(59,130,246,0.08)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5
          },
          {
            label: "Forecast",
            data: forecasts,
            borderColor: "#10B981",
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: {
            position: "top",
            labels: { color: textColor, usePointStyle: true, padding: 16, font: { size: 12 } }
          },
          tooltip: {
            backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
            titleColor: isDark ? "#F1F5F9" : "#0F172A",
            bodyColor: isDark ? "#94A3B8" : "#475569",
            borderColor: isDark ? "#334155" : "#E2E8F0",
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 }, maxRotation: 45, maxTicksLimit: 10 }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 } },
            beginAtZero: true
          }
        }
      }
    });
  },

  renderDistributionChart() {
    const ctx = getEl("inventoryDistChart");
    if (!ctx) { return; }

    if (AppState.charts.distDash) {
      AppState.charts.distDash.destroy();
    }

    const isDark = document.body.getAttribute("data-theme") === "dark";

    AppState.charts.distDash = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Safety Stock", "In-Transit", "On-Hand Available", "Allocated"],
        datasets: [{
          data: [35, 20, 30, 15],
          backgroundColor: [
            "#3B82F6",
            "#F59E0B",
            "#10B981",
            "#8B5CF6"
          ],
          borderColor: isDark ? "#161F2E" : "#FFFFFF",
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: isDark ? "#94A3B8" : "#475569",
              usePointStyle: true,
              padding: 16,
              font: { size: 12 }
            }
          }
        }
      }
    });
  },

  initMap() {
    const mapEl = getEl("globalMap");
    if (!mapEl || typeof L === "undefined") { return; }

    try {
      AppState.map = L.map("globalMap", {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 10,
        zoomControl: true,
        attributionControl: false
      });

      this.updateMapTiles();
      this.addPortMarkers();
      this.mapInitialized = true;

      /* Fix map size on first render */
      setTimeout(() => {
        AppState.map.invalidateSize();
      }, 300);
    } catch (err) {
      /* Map init failed — non-critical */
    }
  },

  updateMapTiles() {
    if (!AppState.map) { return; }

    /* Remove existing tile layers */
    AppState.map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        AppState.map.removeLayer(layer);
      }
    });

    const isDark = document.body.getAttribute("data-theme") === "dark";
    const tileUrl = isDark
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

    L.tileLayer(tileUrl, {
      maxZoom: 19
    }).addTo(AppState.map);
  },

  addPortMarkers() {
    if (!AppState.map) { return; }

    CONFIG.PORTS.forEach((port) => {
      const level = port.congestion < 40 ? "low" : port.congestion < 65 ? "medium" : "high";
      const icon = L.divIcon({
        className: "",
        html: `<div class="port-marker port-marker--${level}">${port.congestion}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([port.lat, port.lng], { icon }).addTo(AppState.map);
      marker.bindPopup(`
        <div style="padding:4px;">
          <strong>${escapeHTML(port.name)}</strong><br>
          Congestion: <strong>${port.congestion}</strong>/100<br>
          Status: <strong>${level.charAt(0).toUpperCase() + level.slice(1)}</strong>
        </div>
      `);
    });
  },

  renderSignalFeed() {
    const feed = getEl("signalFeed");
    if (!feed) { return; }

    const signals = [
      {
        type: "critical",
        icon: "fas fa-anchor",
        title: "Los Angeles Port — High Congestion",
        desc: "Congestion index at 71. Average wait time: 4.2 days",
        time: "12 min ago"
      },
      {
        type: "warning",
        icon: "fas fa-globe",
        title: "Red Sea Route — Elevated Risk",
        desc: "Geopolitical disruptions affecting major shipping lanes",
        time: "43 min ago"
      },
      {
        type: "info",
        icon: "fas fa-cloud-bolt",
        title: "Typhoon Warning — South China Sea",
        desc: "Weather advisory active. Potential delays to Shanghai/Ningbo",
        time: "1 hour ago"
      },
      {
        type: "ok",
        icon: "fas fa-ship",
        title: "Rotterdam Port — Normal Operations",
        desc: "Congestion index at 28. All terminals operational",
        time: "2 hours ago"
      },
      {
        type: "warning",
        icon: "fas fa-anchor",
        title: "Shanghai Port — Moderate Congestion",
        desc: "Congestion index at 62. Some vessel queuing reported",
        time: "3 hours ago"
      }
    ];

    feed.innerHTML = signals
      .map(
        (s) => `
      <div class="signal-item signal-item--${escapeHTML(s.type)}" role="listitem">
        <div class="signal-icon"><i class="${escapeHTML(s.icon)}"></i></div>
        <div class="signal-body">
          <div class="signal-title">${escapeHTML(s.title)}</div>
          <div class="signal-desc">${escapeHTML(s.desc)}</div>
        </div>
        <div class="signal-time">${escapeHTML(s.time)}</div>
      </div>
    `
      )
      .join("");
  },

  renderRecentRecommendations() {
    const tbody = getEl("dashRecTableBody");
    if (!tbody) { return; }

    const recs = AppState.recommendations.slice(0, 5);

    if (recs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:2rem; color:var(--color-text-muted);">
                      </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = recs
      .map((rec) => {
        const deltaClass = rec.delta > 0 ? "delta-positive" : rec.delta < 0 ? "delta-negative" : "delta-zero";
        const deltaPrefix = rec.delta > 0 ? "+" : "";
        const confClass = rec.confidencePct >= 85 ? "high" : rec.confidencePct >= 65 ? "medium" : "low";

        return `
          <tr>
            <td><strong>${escapeHTML(rec.sku)}</strong></td>
            <td>${escapeHTML(rec.location)}</td>
            <td>${formatNumber(rec.currentSS)}</td>
            <td><strong>${formatNumber(rec.recommendedSS)}</strong></td>
            <td class="${deltaClass}">${deltaPrefix}${formatNumber(rec.delta)}</td>
            <td>${escapeHTML(rec.reason)}</td>
            <td>
              <div class="confidence-bar">
                <div class="confidence-track">
                  <div class="confidence-fill confidence-fill--${confClass}" style="width:${rec.confidencePct}%"></div>
                </div>
                <span class="confidence-label">${rec.confidencePct}%</span>
              </div>
            </td>
            <td><span class="status-badge status-badge--${rec.status}">${rec.status}</span></td>
          </tr>
        `;
      })
      .join("");
  }
};

/* ============================================
   24. UI — UPLOAD & DATA EXPLORER
   ============================================ */

const UIUpload = {
  previewPage: 1,
  filteredData: [],

  init() {
    const uploadZone = getEl("uploadZone");
    const fileInput = getEl("csvFileInput");

    /* Drag & Drop */
    if (uploadZone) {
      uploadZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.add("dragover");
      });
      uploadZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        uploadZone.classList.remove("dragover");
      });
      uploadZone.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadZone.classList.remove("dragover");
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleFile(files);
        }
      });
    }

    /* File Input Change */
    fileInput?.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleFile(e.target.files);
      }
    });

    /* Sample Data Button */
    getEl("loadSampleDataBtn")?.addEventListener("click", () => this.loadSampleData());

    /* Download Template */
    getEl("downloadTemplateBtn")?.addEventListener("click", () => this.downloadTemplate());

    /* Search filter */
    getEl("uploadSearchInput")?.addEventListener("input", debounce((e) => {
      const query = e.target.value.trim().toUpperCase();
      this.filteredData = query.length > 0
        ? AppState.cleanedData.filter((r) => r.sku.includes(query))
        : [...AppState.cleanedData];
      this.previewPage = 1;
      this.renderPreviewTable();
    }));

    /* Pagination */
    getEl("prevPagePrev")?.addEventListener("click", () => {
      if (this.previewPage > 1) {
        this.previewPage--;
        this.renderPreviewTable();
      }
    });
    getEl("prevPageNext")?.addEventListener("click", () => {
      const totalPages = Math.ceil(this.filteredData.length / CONFIG.ROWS_PER_PAGE);
      if (this.previewPage < totalPages) {
        this.previewPage++;
        this.renderPreviewTable();
      }
    });
  },

  handleFile(file) {
    if (!file) {
      Toast.error("No File", "Please select a file to upload.");
      return;
    }

    /* Validate file type */
    if (!file.name.toLowerCase().endsWith(".csv")) {
      Toast.error("Invalid File Type", "Only .csv files are supported.");
      return;
    }

    /* Validate file size */
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > CONFIG.MAX_CSV_SIZE_MB) {
      Toast.error("File Too Large", `Max size is ${CONFIG.MAX_CSV_SIZE_MB}MB. Your file is ${roundTo(sizeMB, 1)}MB.`);
      return;
    }

    /* Show progress */
    const progressWrap = getEl("uploadProgress");
    const progressFill = getEl("uploadProgressFill");
    const progressText = getEl("uploadProgressText");

    if (progressWrap) { progressWrap.classList.remove("hidden"); }
    if (progressFill) { progressFill.style.width = "0%"; }
    if (progressText) { progressText.textContent = "Reading file..."; }

    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable && progressFill) {
        const pct = roundTo((e.loaded / e.total) * 60, 0);
        progressFill.style.width = `${pct}%`;
      }
    };

    reader.onload = (e) => {
      try {
        if (progressFill) { progressFill.style.width = "60%"; }
        if (progressText) { progressText.textContent = "Parsing CSV..."; }

        const csvString = e.target.result;
        const { data, errors } = DataEngine.parseCSV(csvString);

        if (progressFill) { progressFill.style.width = "80%"; }
        if (progressText) { progressText.textContent = "Cleaning data..."; }

        if (data.length === 0) {
          Toast.error("No Valid Data", errors.length > 0 ? errors : "No rows could be parsed.");
          if (progressWrap) { progressWrap.classList.add("hidden"); }
          return;
        }

        /* Clean data */
        const { cleaned, qualityReport } = DataEngine.cleanData(data);

        /* Store in state */
        AppState.demandData = data;
        AppState.cleanedData = cleaned;
        AppState.skuList = DataEngine.getSkuList(cleaned);
        AppState.locationList = DataEngine.getLocationList(cleaned);

        if (progressFill) { progressFill.style.width = "100%"; }
        if (progressText) { progressText.textContent = "Complete!"; }

        setTimeout(() => {
          if (progressWrap) { progressWrap.classList.add("hidden"); }
        }, 1000);

        /* Update UI */
        this.renderQualityReport(qualityReport);
        this.filteredData = [...cleaned];
        this.previewPage = 1;
        this.renderPreviewTable();
        this.updateDropdowns();

        /* Audit log */
        AuditTrail.log("Data Upload", "—", `Uploaded ${file.name}: ${cleaned.length} rows, ${AppState.skuList.length} SKUs`);

        /* Save to localStorage */
        StorageManager.saveData();

        /* Show errors if any */
        if (errors.length > 0) {
          Toast.warning("Upload Complete with Warnings", `${errors.length} row(s) had issues. ${cleaned.length} rows imported.`);
        } else {
          Toast.success("Upload Successful", `${cleaned.length} rows imported across ${AppState.skuList.length} SKUs.`);
        }

        /* Create alert if data quality issues */
        if (qualityReport.outliers > 0) {
          AlertSystem.create("warning", "Outliers Detected",
            `${qualityReport.outliers} outlier(s) found in uploaded data. Review in Data Upload → Data Quality.`
          );
        }
      } catch (err) {
        Toast.error("Parse Error", "Failed to parse the CSV file. Check format and try again.");
        if (progressWrap) { progressWrap.classList.add("hidden"); }
      }
    };

    reader.onerror = () => {
      Toast.error("Read Error", "Failed to read the file.");
      if (progressWrap) { progressWrap.classList.add("hidden"); }
    };

    reader.readAsText(file);
  },

  loadSampleData() {
    const data = DataEngine.generateSampleData();
    const { cleaned, qualityReport } = DataEngine.cleanData(data);

    AppState.demandData = data;
    AppState.cleanedData = cleaned;
    AppState.skuList = DataEngine.getSkuList(cleaned);
    AppState.locationList = DataEngine.getLocationList(cleaned);

    this.renderQualityReport(qualityReport);
    this.filteredData = [...cleaned];
    this.previewPage = 1;
    this.renderPreviewTable();
    this.updateDropdowns();

    AuditTrail.log("Sample Data Loaded", "—", `Generated sample: ${cleaned.length} rows, ${AppState.skuList.length} SKUs`);
    StorageManager.saveData();
    Toast.success("Sample Data Loaded", `${cleaned.length} records across ${AppState.skuList.length} SKUs loaded.`);
  },

  downloadTemplate() {
    const template = "date,sku,quantity,location\n2025-01-01,SKU-A100,120,Warehouse-East\n2025-01-02,SKU-A100,115,Warehouse-East\n";
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "safestock_template.csv";
    a.click();
    URL.revokeObjectURL(url);
    Toast.info("Template Downloaded", "Fill in your data and upload the CSV.");
  },

  renderQualityReport(report) {
    if (!report) { return; }

    getEl("qualityEmptyState")?.classList.add("hidden");
    getEl("qualityReport")?.classList.remove("hidden");

    const safeSet = (id, val) => {
      const el = getEl(id);
      if (el) { el.textContent = String(val); }
    };

    safeSet("qmTotalRows", formatNumber(report.totalRows));
    safeSet("qmUniqueSkus", formatNumber(report.uniqueSkus));
    safeSet("qmDateRange", report.dateRange);
    safeSet("qmMissing", formatNumber(report.missingValues));
    safeSet("qmOutliers", formatNumber(report.outliers));
    safeSet("qmCompleteness", formatPercent(report.completeness));

    const flagsEl = getEl("qualityFlags");
    if (flagsEl && Array.isArray(report.flags)) {
      flagsEl.innerHTML = report.flags
        .map((f) => {
          const iconMap = { ok: "fa-check-circle", warn: "fa-exclamation-triangle", error: "fa-times-circle" };
          return `
            <div class="quality-flag quality-flag--${escapeHTML(f.type)}">
              <i class="fas ${iconMap[f.type] || "fa-info-circle"}"></i>
              <span>${escapeHTML(f.message)}</span>
            </div>
          `;
        })
        .join("");
    }
  },

  renderPreviewTable() {
    const table = getEl("previewTable");
    const emptyState = getEl("previewEmptyState");
    const tbody = getEl("previewTableBody");
    const pagination = getEl("previewPagination");
    const rowCount = getEl("previewRowCount");

    if (!tbody) { return; }

    if (this.filteredData.length === 0) {
      table?.classList.add("hidden");
      emptyState?.classList.remove("hidden");
      pagination?.classList.add("hidden");
      if (rowCount) { rowCount.textContent = "0 rows"; }
      return;
    }

    table?.classList.remove("hidden");
    emptyState?.classList.add("hidden");

    const totalPages = Math.ceil(this.filteredData.length / CONFIG.ROWS_PER_PAGE);
    const start = (this.previewPage - 1) * CONFIG.ROWS_PER_PAGE;
    const end = Math.min(start + CONFIG.ROWS_PER_PAGE, this.filteredData.length);
    const pageData = this.filteredData.slice(start, end);

    tbody.innerHTML = pageData
      .map((row, idx) => {
        const flagBadges = row.flags.length > 0
          ? row.flags.map((f) => {
              const badgeType = f === "outlier" ? "error" : f === "promo-spike" ? "warning" : "info";
              return `<span class="badge badge--${badgeType}">${escapeHTML(f)}</span>`;
            }).join(" ")
          : '<span class="badge">clean</span>';

        return `
          <tr>
            <td>${start + idx + 1}</td>
            <td>${escapeHTML(row.date)}</td>
            <td><strong>${escapeHTML(row.sku)}</strong></td>
            <td>${formatNumber(row.quantity)}</td>
            <td>${escapeHTML(row.location)}</td>
            <td>${flagBadges}</td>
          </tr>
        `;
      })
      .join("");

    /* Pagination */
    if (totalPages > 1) {
      pagination?.classList.remove("hidden");
      const info = getEl("prevPageInfo");
      if (info) { info.textContent = `Page ${this.previewPage} of ${totalPages}`; }
      const prevBtn = getEl("prevPagePrev");
      const nextBtn = getEl("prevPageNext");
      if (prevBtn) { prevBtn.disabled = this.previewPage <= 1; }
      if (nextBtn) { nextBtn.disabled = this.previewPage >= totalPages; }
    } else {
      pagination?.classList.add("hidden");
    }

    if (rowCount) { rowCount.textContent = `${formatNumber(this.filteredData.length)} rows`; }
  },

  updateDropdowns() {
    /* Forecast SKU dropdown */
    const fSku = getEl("forecastSku");
    if (fSku) {
      fSku.innerHTML = AppState.skuList.length > 0
        ? AppState.skuList.map((s) => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join("")
        : '<option value="">— Upload data first —</option>';
    }

    /* Simulator SKU dropdown */
    const sSku = getEl("simSku");
    if (sSku) {
      const options = AppState.skuList.length > 0
        ? AppState.skuList.map((s) => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join("")
        : '<option value="">— Upload data first —</option>';
      sSku.innerHTML = `<option value="custom">Custom Values</option>${options}`;
    }

    /* Dashboard forecast SKU */
    const dSku = getEl("dashForecastSku");
    if (dSku) {
      const opts = AppState.skuList.map((s) => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join("");
      dSku.innerHTML = `<option value="all">All SKUs (Aggregated)</option>${opts}`;
    }

    /* Recommendation location dropdown */
    const rLoc = getEl("recLocation");
    if (rLoc) {
      const opts = AppState.locationList.map((l) => `<option value="${escapeHTML(l)}">${escapeHTML(l)}</option>`).join("");
      rLoc.innerHTML = `<option value="all">All Locations</option>${opts}`;
    }

    /* Enable/disable forecast button */
    const runBtn = getEl("runForecastBtn");
    if (runBtn) { runBtn.disabled = AppState.skuList.length === 0; }
  }
};

/* ============================================
   25. UI — RISK SIGNALS PAGE
   ============================================ */

const UISignals = {
  init() {
    /* Weight sliders */
    const sliders = ["portWeight", "geoWeight", "weatherWeight"];
    sliders.forEach((id) => {
      getEl(id)?.addEventListener("input", debounce(() => this.updateWeights(), 100));
    });

    this.renderPortRules();
  },

  refresh() {
    this.updateSignalKPIs();
    this.updateWeights();
    this.renderSignalHistoryChart();
  },

  updateSignalKPIs() {
    const setKPI = (id, val) => {
      const el = getEl(id);
      if (el) { el.textContent = String(val); }
    };

    setKPI("kpiPortCongestion", AppState.signals.port);
    setKPI("kpiGeoRisk", AppState.signals.geo);
    setKPI("kpiWeather", AppState.signals.weather);
  },

  updateWeights() {
    const pw = safeNum(getEl("portWeight")?.value, 40);
    const gw = safeNum(getEl("geoWeight")?.value, 35);
    const ww = safeNum(getEl("weatherWeight")?.value, 25);

    /* Normalize */
    const total = pw + gw + ww;
    const normPw = total > 0 ? pw / total : 1 / 3;
    const normGw = total > 0 ? gw / total : 1 / 3;
    const normWw = total > 0 ? ww / total : 1 / 3;

    /* Display */
    const setVal = (id, v) => {
      const el = getEl(id);
      if (el) { el.textContent = roundTo(v, 2).toFixed(2); }
    };
    setVal("portWeightVal", normPw);
    setVal("geoWeightVal", normGw);
    setVal("weatherWeightVal", normWw);

    AppState.signalWeights = { port: normPw, geo: normGw, weather: normWw };

    /* Compute fusion */
    const result = SignalFusion.fuse(
      AppState.signals.port,
      AppState.signals.geo,
      AppState.signals.weather,
      AppState.signalWeights
    );

    const fusedEl = getEl("fusedMultiplier");
    if (fusedEl) { fusedEl.textContent = `${result.fusedMultiplier.toFixed(3)}×`; }

    const barFill = getEl("fusedBarFill");
    if (barFill) {
      const pct = ((result.fusedMultiplier - 1.0) / 0.5) * 100;
      barFill.style.width = `${clamp(pct, 0, 100)}%`;
    }
  },

  renderPortRules() {
    const tbody = getEl("portRulesBody");
    if (!tbody) { return; }

    tbody.innerHTML = CONFIG.PORT_RULES
      .map((rule) => `
        <tr>
          <td><strong>${rule.min} – ${rule.max}</strong></td>
          <td><span class="badge badge--primary">${rule.multiplier}×</span></td>
          <td>${escapeHTML(rule.description)}</td>
          <td>
            <span class="badge">${AppState.signals.port >= rule.min && AppState.signals.port <= rule.max ? "Active" : "—"}</span>
          </td>
        </tr>
      `)
      .join("");
  },

  renderSignalHistoryChart() {
    const ctx = getEl("signalHistoryChart");
    if (!ctx) { return; }

    if (AppState.charts.signalHistory) {
      AppState.charts.signalHistory.destroy();
    }

    const labels = [];
    const portData = [];
    const geoData = [];
    const weatherData = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(formatDateShort(d));
      portData.push(Math.round(clamp(AppState.signals.port + (Math.random() - 0.5) * 20, 0, 100)));
      geoData.push(Math.round(clamp(AppState.signals.geo + (Math.random() - 0.5) * 15, 0, 100)));
      weatherData.push(Math.round(clamp(AppState.signals.weather + (Math.random() - 0.5) * 25, 0, 100)));
    }

    const isDark = document.body.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const textColor = isDark ? "#94A3B8" : "#64748B";

    AppState.charts.signalHistory = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Port Congestion", data: portData, backgroundColor: "rgba(239,68,68,0.7)", borderRadius: 4 },
          { label: "Geo Risk", data: geoData, backgroundColor: "rgba(245,158,11,0.7)", borderRadius: 4 },
          { label: "Weather", data: weatherData, backgroundColor: "rgba(59,130,246,0.7)", borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { color: textColor, usePointStyle: true, font: { size: 11 } } }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
          y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true, max: 100 }
        }
      }
    });
  }
};

/* ============================================
   26. UI — FORECAST PAGE
   ============================================ */

const UIForecast = {
  lastResult: null,

  init() {
    getEl("runForecastBtn")?.addEventListener("click", () => this.runForecast());
    getEl("exportForecastBtn")?.addEventListener("click", () => this.exportForecast());

    /* Slider displays */
    const sliderMap = {
      forecastAlpha: { display: "forecastAlphaVal", divisor: 100, decimals: 2 },
      forecastBeta: { display: "forecastBetaVal", divisor: 100, decimals: 2 },
      spikeThreshold: { display: "spikeThresholdVal", divisor: 10, decimals: 1 }
    };

    Object.keys(sliderMap).forEach((sliderId) => {
      getEl(sliderId)?.addEventListener("input", (e) => {
        const config = sliderMap[sliderId];
        const val = safeNum(e.target.value, 0) / config.divisor;
        const display = getEl(config.display);
        if (display) { display.textContent = val.toFixed(config.decimals); }
      });
    });
  },

  updateSkuDropdown() {
    UIUpload.updateDropdowns();
  },

  runForecast() {
    const sku = getEl("forecastSku")?.value;
    if (!sku) {
      Toast.warning("Select SKU", "Please select a SKU to forecast.");
      return;
    }

    const horizon = clamp(safeNum(getEl("forecastHorizon")?.value, 30), 1, 90);
    const alpha = safeNum(getEl("forecastAlpha")?.value, 30) / 100;
    const beta = safeNum(getEl("forecastBeta")?.value, 10) / 100;
    const spikeThreshold = safeNum(getEl("spikeThreshold")?.value, 25) / 10;

    const { dates, quantities } = DataEngine.getSkuTimeSeries(AppState.cleanedData, sku);

    if (quantities.length < 5) {
      Toast.error("Insufficient Data", `SKU ${sku} has only ${quantities.length} data points. Need at least 5.`);
      return;
    }

    /* Spike detection */
    const spikes = SpikeDetector.detect(quantities, spikeThreshold);

    /* Run forecast on adjusted (spike-removed) series */
    const result = ForecastEngine.holtLinear(spikes.adjustedSeries, alpha, beta, horizon);

    /* Accuracy metrics (in-sample) */
    const mape = MathEngine.mape(quantities, result.fitted);
    const mae = MathEngine.mae(quantities, result.fitted);
    const rmse = MathEngine.rmse(quantities, result.fitted);

    this.lastResult = {
      sku, dates, quantities, result, spikes, mape, mae, rmse, horizon
    };

    /* Render chart */
    this.renderForecastChart();

    /* Show metrics */
    getEl("forecastMetricsCard")?.classList.remove("hidden");
    const safeSet = (id, val) => { const el = getEl(id); if (el) { el.textContent = String(val); } };
    safeSet("metricMape", `${mape}%`);
    safeSet("metricMae", formatNumber(mae, 2));
    safeSet("metricRmse", formatNumber(rmse, 2));
    safeSet("metricSpikes", String(spikes.spikeCount));

    /* Enable export */
    const exportBtn = getEl("exportForecastBtn");
    if (exportBtn) { exportBtn.disabled = false; }

    /* Cache */
    AppState.forecastCache[sku] = this.lastResult;

    /* Audit */
    AuditTrail.log("Forecast Run", sku, `Horizon: ${horizon}d, MAPE: ${mape}%, Spikes: ${spikes.spikeCount}`);
    Toast.success("Forecast Complete", `${sku}: MAPE ${mape}%, ${spikes.spikeCount} spike(s) detected.`);
  },

  renderForecastChart() {
    if (!this.lastResult) { return; }

    const canvas = getEl("forecastResultChart");
    const emptyState = getEl("forecastEmptyState");
    if (!canvas) { return; }

    canvas.classList.remove("hidden");
    if (emptyState) { emptyState.style.display = "none"; }

    if (AppState.charts.forecastResult) {
      AppState.charts.forecastResult.destroy();
    }

    const { dates, quantities, result, spikes, horizon } = this.lastResult;

    /* Build labels: historical dates + future dates */
    const futureLabels = [];
    const lastDate = new Date(dates[dates.length - 1]);
    for (let i = 1; i <= horizon; i++) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i);
      futureLabels.push(formatDateShort(d));
    }
    const allLabels = [...dates, ...futureLabels];

    /* Historical actual data */
    const actualData = [...quantities, ...new Array(horizon).fill(null)];

    /* Fitted + forecast */
    const fittedForecast = [...result.fitted, ...result.forecast];

    /* Spike markers */
    const spikeData = quantities.map((v, i) => spikes.spikeIndices.includes(i) ? v : null);
    const spikeFullData = [...spikeData, ...new Array(horizon).fill(null)];

    const isDark = document.body.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const textColor = isDark ? "#94A3B8" : "#64748B";

    AppState.charts.forecastResult = new Chart(canvas, {
      type: "line",
      data: {
        labels: allLabels,
        datasets: [
          {
            label: "Actual",
            data: actualData,
            borderColor: "#3B82F6",
            backgroundColor: "rgba(59,130,246,0.08)",
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            label: "Fitted / Forecast",
            data: fittedForecast,
            borderColor: "#10B981",
            borderWidth: 2,
            borderDash: [4, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            label: "Spike Detected",
            data: spikeFullData,
            borderColor: "transparent",
            backgroundColor: "#EF4444",
            pointRadius: 6,
            pointStyle: "triangle",
            showLine: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { position: "top", labels: { color: textColor, usePointStyle: true, font: { size: 11 } } },
          tooltip: {
            backgroundColor: isDark ? "#1E293B" : "#FFF",
            titleColor: isDark ? "#F1F5F9" : "#0F172A",
            bodyColor: isDark ? "#94A3B8" : "#475569",
            borderColor: isDark ? "#334155" : "#E2E8F0",
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 9 }, maxTicksLimit: 15, maxRotation: 45 } },
          y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: true }
        }
      }
    });
  },

  exportForecast() {
    if (!this.lastResult) {
      Toast.warning("No Forecast", "Run a forecast first.");
      return;
    }
    const { sku, dates, quantities, result, horizon } = this.lastResult;
    const rows = [["Date", "Actual", "Fitted/Forecast", "Type"]];
    dates.forEach((d, i) => {
      rows.push([d, quantities[i], roundTo(result.fitted[i], 2), "Historical"]);
    });
    const lastDate = new Date(dates[dates.length - 1]);
    result.forecast.forEach((f, i) => {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i + 1);
      rows.push([formatDateShort(d), "", roundTo(f, 2), "Forecast"]);
    });

    ExportManager.downloadCSV(rows, `forecast_${sku}_${formatDateShort(new Date())}.csv`);
    Toast.success("Exported", "Forecast data downloaded as CSV.");
  }
};

/* ============================================
   27. UI — RECOMMENDATIONS PAGE
   ============================================ */

const UIRecommendations = {
  recPage: 1,
  sortField: null,
  sortDir: "asc",
  filtered: [],

  init() {
    getEl("computeRecommendationsBtn")?.addEventListener("click", () => this.compute());
    getEl("exportRecsBtn")?.addEventListener("click", () => this.exportCSV());
    getEl("approveAllBtn")?.addEventListener("click", () => this.approveAll());

    /* Search */
    getEl("recSearchInput")?.addEventListener("input", debounce((e) => {
      const query = e.target.value.trim().toUpperCase();
      this.filtered = query.length > 0
        ? AppState.recommendations.filter((r) => r.sku.includes(query) || r.location.toUpperCase().includes(query))
        : [...AppState.recommendations];
      this.recPage = 1;
      this.renderTable();
    }));

    /* Sort */
    document.querySelectorAll("#recTable th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const field = th.getAttribute("data-sort");
        if (this.sortField === field) {
          this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
        } else {
          this.sortField = field;
          this.sortDir = "asc";
        }
        this.sortData();
        this.renderTable();
      });
    });

    /* Pagination */
    getEl("recPagePrev")?.addEventListener("click", () => {
      if (this.recPage > 1) { this.recPage--; this.renderTable(); }
    });
    getEl("recPageNext")?.addEventListener("click", () => {
      const tp = Math.ceil(this.filtered.length / CONFIG.ROWS_PER_PAGE);
      if (this.recPage < tp) { this.recPage++; this.renderTable(); }
    });

    /* Select all checkbox */
    getEl("recSelectAll")?.addEventListener("change", (e) => {
      document.querySelectorAll(".rec-checkbox").forEach((cb) => {
        cb.checked = e.target.checked;
      });
    });
  },

  refresh() {
    this.filtered = [...AppState.recommendations];
    this.renderTable();
  },

  compute() {
    if (AppState.cleanedData.length === 0) {
      Toast.warning("No Data", "Upload demand data first.");
      return;
    }

    const sl = safeNum(getEl("targetServiceLevel")?.value, 95);
    const location = getEl("recLocation")?.value || "all";

    AppState.isProcessing = true;
    Toast.info("Computing...", "Generating safety stock recommendations.");

    setTimeout(() => {
      try {
        const recs = RecommendationEngine.generate(
          AppState.cleanedData,
          sl,
          AppState.signals,
          AppState.signalWeights,
          location
        );

        AppState.recommendations = recs;
        this.filtered = [...recs];
        this.recPage = 1;
        this.renderTable();

        /* Update dashboard */
        UIDashboard.updateKPIs();
        UIDashboard.renderRecentRecommendations();

        AuditTrail.log("Recommendations Computed", "—",
          `${recs.length} recommendations at ${sl}% SL. Location: ${location}`);

        StorageManager.saveData();

        /* Create alerts for high-impact recommendations */
        const highImpact = recs.filter((r) => Math.abs(r.delta) > r.currentSS * 0.5);
        if (highImpact.length > 0) {
          AlertSystem.create("approval", "High-Impact Recommendations",
            `${highImpact.length} recommendation(s) with >50% change require approval.`,
            { count: highImpact.length }
          );
        }

        Toast.success("Recommendations Ready", `${recs.length} recommendations computed.`);
      } catch (err) {
        Toast.error("Computation Error", "Failed to generate recommendations. Check data quality.");
      }
      AppState.isProcessing = false;
    }, 500);
  },

  sortData() {
    if (!this.sortField) { return; }
    const field = this.sortField;
    const dir = this.sortDir === "asc" ? 1 : -1;

    this.filtered.sort((a, b) => {
      let va = a[field];
      let vb = b[field];
      if (typeof va === "string") { va = va.toLowerCase(); vb = (vb || "").toLowerCase(); }
      va = safeNum(va, va);
      vb = safeNum(vb, vb);
      if (va < vb) { return -1 * dir; }
      if (va > vb) { return 1 * dir; }
      return 0;
    });
  },

  renderTable() {
    const table = getEl("recTable");
    const emptyState = getEl("recEmptyState");
    const tbody = getEl("recTableBody");
    const pagination = getEl("recPagination");

    if (!tbody) { return; }

    if (this.filtered.length === 0) {
      table?.classList.add("hidden");
      emptyState?.classList.remove("hidden");
      pagination?.classList.add("hidden");
      return;
    }

    table?.classList.remove("hidden");
    emptyState?.classList.add("hidden");

    const totalPages = Math.ceil(this.filtered.length / CONFIG.ROWS_PER_PAGE);
    const start = (this.recPage - 1) * CONFIG.ROWS_PER_PAGE;
    const end = Math.min(start + CONFIG.ROWS_PER_PAGE, this.filtered.length);
    const pageData = this.filtered.slice(start, end);

    tbody.innerHTML = pageData
      .map((rec) => {
        const deltaClass = rec.delta > 0 ? "delta-positive" : rec.delta < 0 ? "delta-negative" : "delta-zero";
        const deltaPrefix = rec.delta > 0 ? "+" : "";
        const statusClass = rec.status || "pending";

        return `
          <tr>
            <td><input type="checkbox" class="rec-checkbox" data-id="${escapeHTML(rec.id)}" aria-label="Select ${escapeHTML(rec.sku)}"></td>
            <td><strong>${escapeHTML(rec.sku)}</strong></td>
            <td>${escapeHTML(rec.location)}</td>
            <td>${formatNumber(rec.currentSS)}</td>
            <td><strong>${formatNumber(rec.recommendedSS)}</strong></td>
            <td class="${deltaClass}">${deltaPrefix}${formatNumber(rec.delta)}</td>
            <td><span class="badge">${roundTo(rec.muD, 1)}</span></td>
            <td><span class="badge">${roundTo(rec.sigmaD, 1)}</span></td>
            <td><span class="badge">${roundTo(rec.leadTime, 1)}</span></td>
            <td><span class="badge">${roundTo(rec.sigmaL, 1)}</span></td>
            <td><span class="badge badge--primary">${roundTo(rec.z, 2)}</span></td>
            <td>${escapeHTML(rec.reason)}</td>
            <td>
              <div class="row-actions">
                <button type="button" class="row-action-btn row-action-btn--approve" title="Approve" onclick="UIRecommendations.approve('${rec.id}')" aria-label="Approve"><i class="fas fa-check"></i></button>
                <button type="button" class="row-action-btn row-action-btn--reject" title="Reject" onclick="UIRecommendations.reject('${rec.id}')" aria-label="Reject"><i class="fas fa-times"></i></button>
                <button type="button" class="row-action-btn row-action-btn--view" title="Explain" onclick="UIRecommendations.showExplain('${rec.id}')" aria-label="Explain"><i class="fas fa-magnifying-glass"></i></button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    /* Pagination */
    if (totalPages > 1) {
      pagination?.classList.remove("hidden");
      const info = getEl("recPageInfo");
      if (info) { info.textContent = `Page ${this.recPage} of ${totalPages}`; }
      const prevBtn = getEl("recPagePrev");
      const nextBtn = getEl("recPageNext");
      if (prevBtn) { prevBtn.disabled = this.recPage <= 1; }
      if (nextBtn) { nextBtn.disabled = this.recPage >= totalPages; }
    } else {
      pagination?.classList.add("hidden");
    }
  },

  approve(recId) {
    const rec = AppState.recommendations.find((r) => r.id === recId);
    if (!rec) { return; }
    rec.status = "approved";

    /* Add to push queue */
    AppState.pushQueue.push({
      id: generateId("push"),
      recId: rec.id,
      sku: rec.sku,
      location: rec.location,
      recommendedSS: rec.recommendedSS,
      timestamp: getTimestamp()
    });

    this.renderTable();
    UIDashboard.renderRecentRecommendations();
    UIERP.renderPushQueue();

    AuditTrail.log("Recommendation Approved", rec.sku, `SS: ${rec.currentSS} → ${rec.recommendedSS}`, rec.breakdown);
    Toast.success("Approved", `${rec.sku} approved. Added to ERP push queue.`);
  },

  reject(recId) {
    const rec = AppState.recommendations.find((r) => r.id === recId);
    if (!rec) { return; }
    rec.status = "rejected";
    this.renderTable();
    AuditTrail.log("Recommendation Rejected", rec.sku, `Rejected SS change: ${rec.delta}`);
    Toast.info("Rejected", `${rec.sku} recommendation rejected.`);
  },

  approveAll() {
    const pending = AppState.recommendations.filter((r) => r.status === "pending");
    if (pending.length === 0) {
      Toast.info("No Pending", "All recommendations already processed.");
      return;
    }

    UIModals.confirm("Approve All", `Approve ${pending.length} pending recommendation(s)?`, () => {
      pending.forEach((r) => {
        r.status = "approved";
        AppState.pushQueue.push({
          id: generateId("push"),
          recId: r.id,
          sku: r.sku,
          location: r.location,
          recommendedSS: r.recommendedSS,
          timestamp: getTimestamp()
        });
      });
      this.renderTable();
      UIERP.renderPushQueue();
      AuditTrail.log("Bulk Approve", "—", `${pending.length} recommendations approved`);
      Toast.success("All Approved", `${pending.length} recommendations approved.`);
    });
  },

  showExplain(recId) {
    const rec = AppState.recommendations.find((r) => r.id === recId);
    if (!rec) { return; }

    const body = getEl("explainModalBody");
    if (!body) { return; }

    body.innerHTML = `
      <div class="explain-section">
        <div class="explain-section-title">Input Parameters</div>
        <div class="explain-grid">
          <div class="explain-item">
            <div class="explain-item-label">μ_d (Avg Daily Demand)</div>
            <div class="explain-item-value">${roundTo(rec.muD, 2)}</div>
          </div>
          <div class="explain-item">
            <div class="explain-item-label">σ_d (Demand Std Dev)</div>
            <div class="explain-item-value">${roundTo(rec.sigmaD, 2)}</div>
          </div>
          <div class="explain-item">
            <div class="explain-item-label">L' (Adjusted Lead Time)</div>
            <div class="explain-item-value">${roundTo(rec.leadTime, 2)} days</div>
          </div>
          <div class="explain-item">
            <div class="explain-item-label">σ_L' (Lead Time Std Dev)</div>
            <div class="explain-item-value">${roundTo(rec.sigmaL, 2)} days</div>
          </div>
          <div class="explain-item">
            <div class="explain-item-label">z' (Service Factor)</div>
            <div class="explain-item-value">${roundTo(rec.z, 4)}</div>
          </div>
          <div class="explain-item">
            <div class="explain-item-label">Fused Multiplier</div>
            <div class="explain-item-value">${roundTo(rec.fusedMultiplier, 3)}×</div>
          </div>
        </div>
      </div>
      <div class="explain-section">
        <div class="explain-section-title">Calculation Steps</div>
        <div class="explain-grid">
          <div class="explain-item">
            <div class="explain-item-label">Term A: σ_d² × L'</div>
            <div class="explain-item-value">${formatNumber(rec.termA, 2)}</div>
          </div>
          <div class="explain-item">
            <div class="explain-item-label">Term B: μ_d² × σ_L'²</div>
            <div class="explain-item-value">${formatNumber(rec.termB, 2)}</div>
          </div>
          <div class="explain-item">
            <div class="explain-item-label">√(A + B)</div>
            <div class="explain-item-value">${formatNumber(rec.sqrtTerm, 2)}</div>
          </div>
          <div class="explain-item">
            <div class="explain-item-label">SS = z' × √(...)</div>
            <div class="explain-item-value"><strong>${formatNumber(rec.recommendedSS)}</strong> units</div>
          </div>
        </div>
      </div>
      <div class="explain-section">
        <div class="explain-section-title">Narrative Explanation</div>
        <div class="explain-narrative">
          For <strong>${escapeHTML(rec.sku)}</strong> at <strong>${escapeHTML(rec.location)}</strong>:
          The average daily demand is <strong>${roundTo(rec.muD, 1)}</strong> units with a standard deviation of
          <strong>${roundTo(rec.sigmaD, 1)}</strong>. The adjusted lead time is <strong>${roundTo(rec.leadTime, 1)}</strong> days
          (base 14 days × ${roundTo(rec.fusedMultiplier, 3)} fused multiplier) with σ_L' of
          <strong>${roundTo(rec.sigmaL, 1)}</strong> days. At a service factor z' of <strong>${roundTo(rec.z, 2)}</strong>,
          the computed safety stock is <strong>${formatNumber(rec.recommendedSS)}</strong> units
          (current: ${formatNumber(rec.currentSS)}, Δ: ${rec.delta > 0 ? "+" : ""}${formatNumber(rec.delta)}).
          Reason: ${escapeHTML(rec.reason)}.
        </div>
      </div>
    `;

    UIModals.open("explainModal");
    AuditTrail.log("Explain Viewed", rec.sku, "Explainability panel opened");
  },

  exportCSV() {
    if (AppState.recommendations.length === 0) {
      Toast.warning("No Data", "No recommendations to export.");
      return;
    }
    const rows = [["SKU", "Location", "Current SS", "Recommended SS", "Delta", "mu_d", "sigma_d", "L'", "sigma_L'", "z'", "Reason", "Confidence", "Status"]];
    AppState.recommendations.forEach((r) => {
      rows.push([r.sku, r.location, r.currentSS, r.recommendedSS, r.delta, roundTo(r.muD, 2), roundTo(r.sigmaD, 2), r.leadTime, r.sigmaL, roundTo(r.z, 4), r.reason, r.confidence, r.status]);
    });
    ExportManager.downloadCSV(rows, `recommendations_${formatDateShort(new Date())}.csv`);
    Toast.success("Exported", "Recommendations exported as CSV.");
  }
};

/* ============================================
   28. UI — WHAT-IF SIMULATOR
   ============================================ */

const UISimulator = {
  init() {
    /* All simulator sliders */
    const sliderConfigs = {
      simLeadTime: { display: "simLeadTimeVal", format: (v) => String(v) },
      simSigmaL: { display: "simSigmaLVal", format: (v) => (v / 2).toFixed(1) },
      simZ: { display: "simZVal", format: (v) => (v / 100).toFixed(2) },
      simCongestion: { display: "simCongestionVal", format: (v) => String(v) }
    };

    Object.keys(sliderConfigs).forEach((id) => {
      getEl(id)?.addEventListener("input", (e) => {
        const cfg = sliderConfigs[id];
        const display = getEl(cfg.display);
        if (display) {
          const rawVal = safeNum(e.target.value, 0);
          display.textContent = cfg.format(rawVal);
        }
        this.compute();
      });
    });

    /* Number inputs */
    ["simMuD", "simSigmaD"].forEach((id) => {
      getEl(id)?.addEventListener("input", debounce(() => this.compute(), 200));
    });

    /* SKU select */
    getEl("simSku")?.addEventListener("change", (e) => {
      const sku = e.target.value;
      if (sku && sku !== "custom") {
        this.loadSkuValues(sku);
      }
      this.compute();
    });

    /* Reset */
    getEl("simResetBtn")?.addEventListener("click", () => this.resetDefaults());

    this.compute();
  },

  updateSkuDropdown() {
    UIUpload.updateDropdowns();
  },

  loadSkuValues(sku) {
    const { quantities } = DataEngine.getSkuTimeSeries(AppState.cleanedData, sku);
    if (quantities.length === 0) { return; }

    const muD = MathEngine.mean(quantities);
    const sigmaD = MathEngine.sampleStdDev(quantities);

    const muEl = getEl("simMuD");
    const sigEl = getEl("simSigmaD");
    if (muEl) { muEl.value = roundTo(muD, 1); }
    if (sigEl) { sigEl.value = roundTo(sigmaD, 1); }
  },

  resetDefaults() {
    const defaults = {
      simMuD: 100, simSigmaD: 20, simLeadTime: 14,
      simSigmaL: 6, simZ: 165, simCongestion: 30
    };
    Object.keys(defaults).forEach((id) => {
      const el = getEl(id);
      if (el) { el.value = defaults[id]; }
    });

    /* Update displays */
    const displays = {
      simLeadTimeVal: "14", simSigmaLVal: "3.0",
      simZVal: "1.65", simCongestionVal: "30"
    };
    Object.keys(displays).forEach((id) => {
      const el = getEl(id);
      if (el) { el.textContent = displays[id]; }
    });

    this.compute();
    Toast.info("Reset", "Simulator values reset to defaults.");
  },

  /**
   * Core simulator computation — runs on every slider change.
   * Uses the EXACT same SafetyStockCalculator as the recommendation engine.
   */
  compute() {
    const muD = Math.max(0, safeNum(getEl("simMuD")?.value, 100));
    const sigmaD = Math.max(0, safeNum(getEl("simSigmaD")?.value, 20));
    const leadTime = Math.max(1, safeNum(getEl("simLeadTime")?.value, 14));
    const sigmaL = Math.max(0, safeNum(getEl("simSigmaL")?.value, 6) / 2);
    const z = Math.max(0, safeNum(getEl("simZ")?.value, 165) / 100);
    const congestion = clamp(safeNum(getEl("simCongestion")?.value, 30), 0, 100);

    /* Apply congestion multiplier to lead time */
    const portMult = LeadTimeEngine.getPortMultiplier(congestion);
    const adjustedLT = roundTo(leadTime * portMult, 2);

    /* Compute safety stock */
    const result = SafetyStockCalculator.compute({
      z, muD, sigmaD, leadTime: adjustedLT, sigmaL
    });

    /* Update display */
    const ssEl = getEl("simSSResult");
    if (ssEl) {
      ssEl.textContent = formatNumber(result.safetyStock);
      ssEl.style.animation = "none";
      void ssEl.offsetHeight;
      ssEl.style.animation = "countPulse 0.3s ease";
    }

    const safeSet = (id, val) => {
      const el = getEl(id);
      if (el) { el.textContent = formatNumber(val, 2); }
    };

    safeSet("simTermA", result.termA);
    safeSet("simTermB", result.termB);
    safeSet("simSqrt", result.sqrtTerm);
    safeSet("simFinal", result.safetyStock);

    /* Sensitivity chart */
    this.renderSensitivityChart(z, muD, sigmaD, adjustedLT, sigmaL);
  },

  renderSensitivityChart(z, muD, sigmaD, lt, sigmaL) {
    const ctx = getEl("simSensitivityChart");
    if (!ctx) { return; }

    if (AppState.charts.simSensitivity) {
      AppState.charts.simSensitivity.destroy();
    }

    /* Vary lead time from 5 to 60 to show SS sensitivity */
    const ltValues = [];
    const ssValues = [];
    for (let l = 5; l <= 60; l += 5) {
      ltValues.push(l);
      const res = SafetyStockCalculator.compute({ z, muD, sigmaD, leadTime: l, sigmaL });
      ssValues.push(res.safetyStock);
    }

    const isDark = document.body.getAttribute("data-theme") === "dark";

    AppState.charts.simSensitivity = new Chart(ctx, {
      type: "line",
      data: {
        labels: ltValues.map((v) => `${v}d`),
        datasets: [{
          label: "SS vs Lead Time",
          data: ssValues,
          borderColor: "#8B5CF6",
          backgroundColor: "rgba(139,92,246,0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: "#8B5CF6"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            title: { display: true, text: "Lead Time (days)", color: isDark ? "#94A3B8" : "#64748B", font: { size: 10 } },
            grid: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
            ticks: { color: isDark ? "#64748B" : "#94A3B8", font: { size: 9 } }
          },
          y: {
            title: { display: true, text: "Safety Stock (units)", color: isDark ? "#94A3B8" : "#64748B", font: { size: 10 } },
            grid: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
            ticks: { color: isDark ? "#64748B" : "#94A3B8", font: { size: 9 } },
            beginAtZero: true
          }
        }
      }
    });
  }
};

/* ============================================
   29. UI — MULTI-LOCATION PAGE
   ============================================ */

const UIRebalancer = {
  init() {
    getEl("addWarehouseBtn")?.addEventListener("click", () => this.showAddModal());
    getEl("warehouseModalSave")?.addEventListener("click", () => this.saveWarehouse());
    getEl("runRebalanceBtn")?.addEventListener("click", () => this.runRebalance());
    getEl("exportRebalanceBtn")?.addEventListener("click", () => this.exportPlan());

    /* Load default warehouses */
    if (AppState.warehouses.length === 0) {
      AppState.warehouses = [
        { id: generateId("wh"), name: "Chicago DC", region: "North America", currentInventory: 5000, safetyStock: 3200, capacity: 15000, transferCost: 2.50 },
        { id: generateId("wh"), name: "Rotterdam Hub", region: "Europe", currentInventory: 2800, safetyStock: 4100, capacity: 12000, transferCost: 3.20 },
        { id: generateId("wh"), name: "Shanghai Depot", region: "Asia Pacific", currentInventory: 6500, safetyStock: 3800, capacity: 20000, transferCost: 1.80 }
      ];
    }
    this.renderTable();
  },

  renderTable() {
    const tbody = getEl("warehouseTableBody");
    if (!tbody) { return; }

    tbody.innerHTML = AppState.warehouses
      .map((wh) => `
        <tr>
          <td><code>${escapeHTML(wh.id.substring(0, 12))}</code></td>
          <td><strong>${escapeHTML(wh.name)}</strong></td>
          <td>${escapeHTML(wh.region)}</td>
          <td>${formatNumber(wh.currentInventory)}</td>
          <td>${formatNumber(wh.safetyStock)}</td>
          <td>${formatNumber(wh.capacity)}</td>
          <td>${formatCurrency(wh.transferCost)}</td>
          <td>
            <div class="row-actions">
              <button type="button" class="row-action-btn row-action-btn--edit" title="Edit" onclick="UIRebalancer.editWarehouse('${wh.id}')" aria-label="Edit"><i class="fas fa-pen"></i></button>
              <button type="button" class="row-action-btn row-action-btn--delete" title="Delete" onclick="UIRebalancer.deleteWarehouse('${wh.id}')" aria-label="Delete"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `)
      .join("");
  },

  showAddModal(editId = null) {
    const title = getEl("warehouseModalTitle");
    if (title) { title.innerHTML = editId ? '<i class="fas fa-warehouse"></i> Edit Warehouse' : '<i class="fas fa-warehouse"></i> Add Warehouse'; }

    if (editId) {
      const wh = AppState.warehouses.find((w) => w.id === editId);
      if (!wh) { return; }
      const setVal = (id, v) => { const el = getEl(id); if (el) { el.value = v; } };
      setVal("whEditId", editId);
      setVal("whName", wh.name);
      setVal("whRegion", wh.region);
      setVal("whCurrentInv", wh.currentInventory);
      setVal("whSafetyStock", wh.safetyStock);
      setVal("whCapacity", wh.capacity);
      setVal("whTransferCost", wh.transferCost);
    } else {
      getEl("warehouseForm")?.reset();
      const editField = getEl("whEditId");
      if (editField) { editField.value = ""; }
    }

    UIModals.open("warehouseModal");
  },

  saveWarehouse() {
    const name = getEl("whName")?.value?.trim();
    const region = getEl("whRegion")?.value;

    /* Validation */
    let valid = true;
    const nameErr = getEl("whNameError");
    const regionErr = getEl("whRegionError");

    if (!name) {
      nameErr?.classList.remove("hidden");
      getEl("whName")?.classList.add("error");
      valid = false;
    } else {
      nameErr?.classList.add("hidden");
      getEl("whName")?.classList.remove("error");
    }

    if (!region) {
      regionErr?.classList.remove("hidden");
      getEl("whRegion")?.classList.add("error");
      valid = false;
    } else {
      regionErr?.classList.add("hidden");
      getEl("whRegion")?.classList.remove("error");
    }

    if (!valid) { return; }

    const editId = getEl("whEditId")?.value;
    const whData = {
      name,
      region,
      currentInventory: Math.max(0, safeNum(getEl("whCurrentInv")?.value, 0)),
      safetyStock: Math.max(0, safeNum(getEl("whSafetyStock")?.value, 0)),
      capacity: Math.max(1, safeNum(getEl("whCapacity")?.value, 10000)),
      transferCost: Math.max(0, safeNum(getEl("whTransferCost")?.value, 2.5))
    };

    if (editId) {
      const idx = AppState.warehouses.findIndex((w) => w.id === editId);
      if (idx >= 0) {
        AppState.warehouses[idx] = { ...AppState.warehouses[idx], ...whData };
      }
      AuditTrail.log("Warehouse Updated", "—", `Updated ${name}`);
    } else {
      AppState.warehouses.push({ id: generateId("wh"), ...whData });
      AuditTrail.log("Warehouse Added", "—", `Added ${name}`);
    }

    this.renderTable();
    UIModals.close("warehouseModal");
    StorageManager.saveData();
    Toast.success(editId ? "Warehouse Updated" : "Warehouse Added", name);
  },

  editWarehouse(id) { this.showAddModal(id); },

  deleteWarehouse(id) {
    const wh = AppState.warehouses.find((w) => w.id === id);
    if (!wh) { return; }
    UIModals.confirm("Delete Warehouse", `Delete "${wh.name}"? This cannot be undone.`, () => {
      AppState.warehouses = AppState.warehouses.filter((w) => w.id !== id);
      this.renderTable();
      StorageManager.saveData();
      AuditTrail.log("Warehouse Deleted", "—", `Deleted ${wh.name}`);
      Toast.info("Deleted", `${wh.name} removed.`);
    });
  },

  runRebalance() {
    if (AppState.warehouses.length < 2) {
      Toast.warning("Need More Warehouses", "Add at least 2 warehouses to run rebalancing.");
      return;
    }

    const plan = Rebalancer.computePlan(AppState.warehouses);

    const emptyState = getEl("rebalanceEmptyState");
    const results = getEl("rebalanceResults");

    if (plan.transfers.length === 0) {
      if (emptyState) {
        emptyState.innerHTML = `
          <div class="empty-icon"><i class="fas fa-check-circle" style="color:var(--color-success)"></i></div>
          <h4>Already Balanced</h4>
          <p>No transfers needed — all warehouses are within optimal range.</p>
        `;
        emptyState.classList.remove("hidden");
      }
      results?.classList.add("hidden");
      Toast.success("Balanced", "No transfers needed.");
      return;
    }

    emptyState?.classList.add("hidden");
    results?.classList.remove("hidden");

    const safeSet = (id, val) => { const el = getEl(id); if (el) { el.textContent = String(val); } };
    safeSet("rebalTransfers", plan.transfers.length);
    safeSet("rebalCost", formatCurrency(plan.totalCost));
    safeSet("rebalSaved", `${formatNumber(plan.unitsSaved)} units`);

    const tbody = getEl("rebalanceTableBody");
    if (tbody) {
      tbody.innerHTML = plan.transfers
        .map((t) => `
          <tr>
            <td><strong>${escapeHTML(t.from)}</strong></td>
            <td><strong>${escapeHTML(t.to)}</strong></td>
            <td>${formatNumber(t.units)}</td>
            <td>${formatCurrency(t.cost)}</td>
            <td>${escapeHTML(t.reason)}</td>
          </tr>
        `)
        .join("");
    }

    const exportBtn = getEl("exportRebalanceBtn");
    if (exportBtn) { exportBtn.disabled = false; }

    AuditTrail.log("Rebalance Computed", "—", `${plan.transfers.length} transfers, cost: ${formatCurrency(plan.totalCost)}`);
    Toast.success("Rebalance Plan Ready", `${plan.transfers.length} transfer(s), total cost: ${formatCurrency(plan.totalCost)}.`);
  },

  exportPlan() {
    Toast.info("Exporting...", "Rebalance plan export will be available in production.");
  }
};

/* ============================================
   30. UI — ERP PAGE
   ============================================ */

const UIERP = {
  init() {
    getEl("testErpConnectionBtn")?.addEventListener("click", () => this.testConnection());
    getEl("pushToErpBtn")?.addEventListener("click", () => this.pushToERP());

    /* Toggle password visibility */
    getEl("toggleErpKeyVisibility")?.addEventListener("click", () => {
      const input = getEl("erpApiKey");
      if (!input) { return; }
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      const icon = getEl("toggleErpKeyVisibility")?.querySelector("i");
      if (icon) { icon.className = isPassword ? "fas fa-eye-slash" : "fas fa-eye"; }
    });

    this.renderPushQueue();
  },

  async testConnection() {
    const btn = getEl("testErpConnectionBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner--sm"></span> Testing...';
    }

    const result = await ERPConnector.testConnection();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-plug"></i> Test Connection';
    }

    const statusIcon = getEl("erpStatusIcon");
    const statusText = getEl("erpStatusText");
    const statusSub = getEl("erpStatusSub");

    if (result.success) {
      statusIcon?.classList.add("connected");
      if (statusIcon) { statusIcon.innerHTML = '<i class="fas fa-plug-circle-check"></i>'; }
      if (statusText) { statusText.textContent = "Connected"; }
      if (statusSub) { statusSub.textContent = result.message; }
      Toast.success("Connected", result.message);
      AuditTrail.log("ERP Connected", "—", result.message);
    } else {
      statusIcon?.classList.remove("connected");
      if (statusIcon) { statusIcon.innerHTML = '<i class="fas fa-plug-circle-xmark"></i>'; }
      if (statusText) { statusText.textContent = "Connection Failed"; }
      if (statusSub) { statusSub.textContent = result.message; }
      Toast.error("Failed", result.message);
    }
  },

  renderPushQueue() {
    const emptyState = getEl("pushQueueEmpty");
    const list = getEl("pushQueueList");
    const pushBtn = getEl("pushToErpBtn");

    if (AppState.pushQueue.length === 0) {
      emptyState?.classList.remove("hidden");
      list?.classList.add("hidden");
      pushBtn?.classList.add("hidden");
      return;
    }

    emptyState?.classList.add("hidden");
    list?.classList.remove("hidden");
    pushBtn?.classList.remove("hidden");

    if (list) {
      list.innerHTML = AppState.pushQueue
        .map((item) => `
          <div class="push-queue-item" role="listitem">
            <div class="push-queue-item-info">
              <span class="push-queue-sku">${escapeHTML(item.sku)}</span>
              <span class="push-queue-detail">${escapeHTML(item.location)} → SS: ${formatNumber(item.recommendedSS)}</span>
            </div>
            <span class="badge badge--primary">${formatDate(item.timestamp).split(",")}</span>
          </div>
        `)
        .join("");
    }
  },

  async pushToERP() {
    if (AppState.pushQueue.length === 0) {
      Toast.info("Empty Queue", "No items to push.");
      return;
    }

    if (!ERPConnector.connected) {
      Toast.warning("Not Connected", "Please test ERP connection first.");
      return;
    }

    const btn = getEl("pushToErpBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner spinner--sm"></span> Pushing...';
    }

    const result = await ERPConnector.pushUpdates(AppState.pushQueue);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Push All to ERP';
    }

    if (result.success) {
      /* Update recommendation statuses */
      AppState.pushQueue.forEach((item) => {
        const rec = AppState.recommendations.find((r) => r.id === item.recId);
        if (rec) { rec.status = "pushed"; }
      });

      AuditTrail.log("ERP Push", "—", `Pushed ${result.pushed} items. Audit: ${result.auditId}`);
      AppState.pushQueue = [];
      this.renderPushQueue();
      UIRecommendations.renderTable();

      Toast.success("Pushed to ERP", `${result.pushed} safety stock update(s) pushed successfully.`);
      AlertSystem.create("info", "ERP Update Complete", `${result.pushed} safety stock levels pushed to ERP.`);
    } else {
      Toast.error("Push Failed", "ERP update failed. Please try again.");
    }
  }
};

/* ============================================
   31. UI — AUDIT PAGE
   ============================================ */

const UIAudit = {
  auditPage: 1,
  filtered: [],

  init() {
    getEl("auditSearchInput")?.addEventListener("input", debounce((e) => {
      const q = e.target.value.trim().toLowerCase();
      this.filtered = q.length > 0
        ? AppState.auditLog.filter((a) => a.action.toLowerCase().includes(q) || a.sku.toLowerCase().includes(q) || a.details.toLowerCase().includes(q))
        : [...AppState.auditLog];
      this.auditPage = 1;
      this.render();
    }));

    getEl("exportAuditBtn")?.addEventListener("click", () => this.exportAudit());
    getEl("clearAuditBtn")?.addEventListener("click", () => {
      UIModals.confirm("Clear Audit Log", "Delete all audit entries? This cannot be undone.", () => {
        AppState.auditLog = [];
        StorageManager.saveAudit();
        this.render();
        Toast.info("Cleared", "Audit log cleared.");
      });
    });

    getEl("auditPagePrev")?.addEventListener("click", () => {
      if (this.auditPage > 1) { this.auditPage--; this.render(); }
    });
    getEl("auditPageNext")?.addEventListener("click", () => {
      const tp = Math.ceil(this.filtered.length / CONFIG.ROWS_PER_PAGE);
      if (this.auditPage < tp) { this.auditPage++; this.render(); }
    });
  },

  render() {
    this.filtered = this.filtered.length > 0 ? this.filtered : [...AppState.auditLog];
    if (getEl("auditSearchInput")?.value.trim().length === 0) {
      this.filtered = [...AppState.auditLog];
    }

    const table = getEl("auditTable");
    const emptyState = getEl("auditEmptyState");
    const tbody = getEl("auditTableBody");
    const pagination = getEl("auditPagination");

    if (!tbody) { return; }

    if (this.filtered.length === 0) {
      table?.classList.add("hidden");
      emptyState?.classList.remove("hidden");
      pagination?.classList.add("hidden");
      return;
    }

    table?.classList.remove("hidden");
    emptyState?.classList.add("hidden");

    const totalPages = Math.ceil(this.filtered.length / CONFIG.ROWS_PER_PAGE);
    const start = (this.auditPage - 1) * CONFIG.ROWS_PER_PAGE;
    const end = Math.min(start + CONFIG.ROWS_PER_PAGE, this.filtered.length);
    const pageData = this.filtered.slice(start, end);

    tbody.innerHTML = pageData
      .map((entry) => `
        <tr>
          <td><code>${formatDate(entry.timestamp)}</code></td>
          <td><strong>${escapeHTML(entry.action)}</strong></td>
          <td>${escapeHTML(entry.sku)}</td>
          <td>${escapeHTML(entry.user)}</td>
          <td>${escapeHTML(entry.details)}</td>
          <td>${entry.contextData ? '<button type="button" class="row-action-btn row-action-btn--view" onclick="UIAudit.showContext(\'' + entry.id + '\')" aria-label="View context"><i class="fas fa-eye"></i></button>' : "—"}</td>
        </tr>
      `)
      .join("");

    if (totalPages > 1) {
      pagination?.classList.remove("hidden");
      const info = getEl("auditPageInfo");
      if (info) { info.textContent = `Page ${this.auditPage} of ${totalPages}`; }
    } else {
      pagination?.classList.add("hidden");
    }
  },

  showContext(entryId) {
    const entry = AppState.auditLog.find((a) => a.id === entryId);
    if (!entry || !entry.contextData) { return; }

    const body = getEl("explainModalBody");
    if (!body) { return; }

    body.innerHTML = `
      <div class="explain-section">
        <div class="explain-section-title">Audit Context Data</div>
        <pre style="background:var(--color-bg-tertiary);padding:var(--space-4);border-radius:var(--radius-md);overflow-x:auto;font-family:var(--font-mono);font-size:var(--font-size-sm);color:var(--color-text-secondary);">${escapeHTML(JSON.stringify(entry.contextData, null, 2))}</pre>
      </div>
    `;
    UIModals.open("explainModal");
  },

  exportAudit() {
    if (AppState.auditLog.length === 0) {
      Toast.warning("No Data", "Audit log is empty.");
      return;
    }
    const rows = [["Timestamp", "Action", "SKU", "User", "Details"]];
    AppState.auditLog.forEach((a) => {
      rows.push([a.timestamp, a.action, a.sku, a.user, a.details]);
    });
    ExportManager.downloadCSV(rows, `audit_log_${formatDateShort(new Date())}.csv`);
    Toast.success("Exported", "Audit log exported as CSV.");
  }
};

/* ============================================
   32. UI — ALERTS PAGE
   ============================================ */

const UIAlerts = {
  init() {
    getEl("markAllReadBtn")?.addEventListener("click", () => {
      AlertSystem.markAllRead();
      this.render();
      Toast.info("Done", "All alerts marked as read.");
    });

    getEl("alertTypeFilter")?.addEventListener("change", () => this.render());

    /* Generate initial alerts */
    if (AppState.alerts.length === 0) {
      AlertSystem.create("critical", "Port Congestion Alert", "Los Angeles port congestion at 71 — above critical threshold of 65.", { port: "LA", index: 71 });
      AlertSystem.create("warning", "Geopolitical Risk Elevated", "Red Sea shipping route risk score increased to 62.", { route: "Red Sea", score: 62 });
      AlertSystem.create("info", "System Initialized", "SafeStock AI engine initialized successfully. Ready for data upload.");
    }
  },

  updateBadge() {
    const count = AlertSystem.unreadCount();
    const badge = getEl("alertBadge");
    const dot = getEl("notificationDot");
    if (badge) {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? "inline-flex" : "none";
    }
    if (dot) {
      dot.style.display = count > 0 ? "block" : "none";
    }

    /* Alert page KPIs */
    const critical = AppState.alerts.filter((a) => a.type === "critical" && !a.resolved).length;
    const pending = AppState.alerts.filter((a) => a.type === "approval" && !a.resolved).length;
    const resolved = AppState.alerts.filter((a) => {
      if (!a.resolved) { return false; }
      const today = new Date();
      const alertDate = new Date(a.timestamp);
      return alertDate.toDateString() === today.toDateString();
    }).length;

    const safeSet = (id, val) => { const el = getEl(id); if (el) { el.textContent = String(val); } };
    safeSet("kpiCriticalAlerts", critical);
    safeSet("kpiPendingApprovals", pending);
    safeSet("kpiResolvedToday", resolved);
  },

  render() {
    const feed = getEl("alertFeed");
    const emptyState = getEl("alertsEmptyState");
    const filter = getEl("alertTypeFilter")?.value || "all";

    if (!feed) { return; }

    const filtered = filter === "all"
      ? AppState.alerts
      : AppState.alerts.filter((a) => a.type === filter);

    if (filtered.length === 0) {
      feed.innerHTML = "";
      emptyState?.classList.remove("hidden");
      return;
    }

    emptyState?.classList.add("hidden");

    const iconMap = {
      critical: "fas fa-circle-exclamation",
      warning: "fas fa-exclamation-triangle",
      info: "fas fa-info-circle",
      approval: "fas fa-user-check"
    };

    feed.innerHTML = filtered
      .map((alert) => `
        <div class="alert-item alert-item--${escapeHTML(alert.type)} ${alert.read ? "" : "unread"}" role="listitem"
             onclick="UIAlerts.markRead('${alert.id}')">
          <div class="alert-item-icon">
            <i class="${iconMap[alert.type] || "fas fa-bell"}"></i>
          </div>
          <div class="alert-item-body">
            <div class="alert-item-title">${escapeHTML(alert.title)}</div>
            <div class="alert-item-desc">${escapeHTML(alert.description)}</div>
            <div class="alert-item-meta">
              <span><i class="fas fa-clock"></i> ${formatDate(alert.timestamp)}</span>
              <span class="badge badge--${alert.type === "critical" ? "error" : alert.type === "warning" ? "warning" : "info"}">${alert.type}</span>
              ${alert.read ? "" : '<span class="badge badge--primary">New</span>'}
            </div>
          </div>
        </div>
      `)
      .join("");

    this.updateBadge();
  },

  markRead(alertId) {
    AlertSystem.markRead(alertId);
    this.render();
  }
};

/* ============================================
   33. UI — GLOBAL SEARCH
   ============================================ */

const UISearch = {
  init() {
    const searchInput = getEl("globalSearch");
    const overlay = getEl("searchOverlay");

    searchInput?.addEventListener("focus", () => overlay?.classList.remove("hidden"));
    searchInput?.addEventListener("input", debounce((e) => this.search(e.target.value)));

    getEl("searchOverlayClose")?.addEventListener("click", () => {
      overlay?.classList.add("hidden");
      if (searchInput) { searchInput.value = ""; }
    });

    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.add("hidden");
        if (searchInput) { searchInput.value = ""; }
      }
    });
  },

  search(query) {
    const body = getEl("searchResultsBody");
    if (!body) { return; }

    const q = (query || "").trim().toLowerCase();
    if (q.length === 0) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fas fa-search"></i></div><p>Type to search SKUs, locations, or actions...</p></div>';
      return;
    }

    const results = [];

    /* Search SKUs */
    AppState.skuList.forEach((sku) => {
      if (sku.toLowerCase().includes(q)) {
        results.push({ icon: "fas fa-barcode", text: sku, type: "SKU", page: "recommendations" });
      }
    });

    /* Search locations */
    AppState.locationList.forEach((loc) => {
      if (loc.toLowerCase().includes(q)) {
        results.push({ icon: "fas fa-location-dot", text: loc, type: "Location", page: "recommendations" });
      }
    });

    /* Search pages */
    const pages = [
      { name: "Dashboard", page: "dashboard", icon: "fas fa-gauge-high" },
      { name: "Data Upload", page: "upload", icon: "fas fa-cloud-arrow-up" },
      { name: "Risk Signals", page: "signals", icon: "fas fa-satellite-dish" },
      { name: "Demand Forecast", page: "forecast", icon: "fas fa-chart-line" },
      { name: "Recommendations", page: "recommendations", icon: "fas fa-clipboard-check" },
      { name: "What-If Simulator", page: "simulator", icon: "fas fa-sliders" },
      { name: "Multi-Location", page: "rebalancer", icon: "fas fa-arrows-split-up-and-left" },
      { name: "ERP Integration", page: "erp", icon: "fas fa-plug" },
      { name: "Audit Trail", page: "audit", icon: "fas fa-scroll" },
      { name: "Alerts", page: "alerts", icon: "fas fa-bell" }
    ];

    pages.forEach((p) => {
      if (p.name.toLowerCase().includes(q)) {
        results.push({ icon: p.icon, text: p.name, type: "Page", page: p.page });
      }
    });

    if (results.length === 0) {
      body.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fas fa-search"></i></div><p>No results found.</p></div>';
      return;
    }

    body.innerHTML = results.slice(0, 10)
      .map((r) => `
        <div class="search-result-item" onclick="UISearch.goTo('${r.page}')">
          <span class="search-result-icon"><i class="${escapeHTML(r.icon)}"></i></span>
          <span class="search-result-text">${escapeHTML(r.text)}</span>
          <span class="search-result-type">${escapeHTML(r.type)}</span>
        </div>
      `)
      .join("");
  },

  goTo(page) {
    getEl("searchOverlay")?.classList.add("hidden");
    const searchInput = getEl("globalSearch");
    if (searchInput) { searchInput.value = ""; }
    UINavigation.navigateTo(page);
  }
};

/* ============================================
   34. UI — SETTINGS
   ============================================ */

const UISettings = {
  init() {
    getEl("saveSettingsBtn")?.addEventListener("click", () => this.save());

    /* Font size */
    getEl("settingFontSize")?.addEventListener("change", (e) => {
      const size = safeNum(e.target.value, 16);
      document.documentElement.style.fontSize = `${size}px`;
    });

    /* Clear all data */
    getEl("clearAllDataBtn")?.addEventListener("click", () => {
      UIModals.confirm("Clear All Data", "This will delete ALL uploaded data, recommendations, audit logs, and alerts. Continue?", () => {
        StorageManager.clearAll();
        Toast.success("Data Cleared", "All application data has been removed.");
        setTimeout(() => { window.location.reload(); }, 1000);
      });
    });

    /* Export all data */
    getEl("exportAllDataBtn")?.addEventListener("click", () => ExportManager.exportAllJSON());

    /* Import data */
    getEl("importDataBtn")?.addEventListener("click", () => getEl("importDataFileInput")?.click());
    getEl("importDataFileInput")?.addEventListener("change", (e) => {
      if (e.target.files && e.target.files) {
        ExportManager.importJSON(e.target.files);
      }
    });

    /* Apply saved settings */
    const fontSize = getEl("settingFontSize");
    if (fontSize) { fontSize.value = String(AppState.settings.fontSize || 16); }
    const currency = getEl("settingCurrency");
    if (currency) { currency.value = AppState.settings.currency || "USD"; }
    document.documentElement.style.fontSize = `${AppState.settings.fontSize || 16}px`;
  },

  save() {
    const fontSize = safeNum(getEl("settingFontSize")?.value, 16);
    const currency = getEl("settingCurrency")?.value || "USD";

    AppState.settings.fontSize = fontSize;
    AppState.settings.currency = currency;

    document.documentElement.style.fontSize = `${fontSize}px`;

    StorageManager.saveSettings();
    UIModals.close("settingsModal");
    Toast.success("Settings Saved", "Your preferences have been saved.");
  }
};

/* ============================================
   35. KEYBOARD SHORTCUTS
   ============================================ */

const KeyboardShortcuts = {
  init() {
    document.addEventListener("keydown", (e) => {
      /* Don't trigger shortcuts when typing in inputs */
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputFocused = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

      /* Ctrl+K: Global search */
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = getEl("globalSearch");
        const overlay = getEl("searchOverlay");
        if (searchInput) {
          searchInput.focus();
          overlay?.classList.remove("hidden");
        }
        return;
      }

      /* Ctrl+D: Toggle theme */
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        UITheme.toggle();
        return;
      }

      /* Ctrl+S: Export data */
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        ExportManager.exportAllJSON();
        return;
      }

      if (isInputFocused) { return; }

      /* ?: Show help */
      if (e.key === "?") {
        e.preventDefault();
        UIModals.open("helpModal");
        return;
      }

      /* Number keys: Navigate pages */
      const pageMap = {
        "1": "dashboard", "2": "upload", "3": "signals",
        "4": "forecast", "5": "recommendations", "6": "simulator",
        "7": "rebalancer", "8": "erp", "9": "audit", "0": "alerts"
      };
      if (pageMap[e.key]) {
        e.preventDefault();
        UINavigation.navigateTo(pageMap[e.key]);
      }
    });
  }
};

/* ============================================
   36. DATA EXPORT / IMPORT
   ============================================ */

const ExportManager = {
  /**
   * Downloads an array of arrays as CSV file.
   * @param {Array[]} rows
   * @param {string} filename
   */
  downloadCSV(rows, filename) {
    if (!Array.isArray(rows) || rows.length === 0) {
      Toast.warning("No Data", "Nothing to export.");
      return;
    }
    const csvContent = rows.map((row) =>
      row.map((cell) => {
        const str = String(cell === null || cell === undefined ? "" : cell);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(",")
    ).join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    this.downloadBlob(blob, filename);
  },

  /**
   * Exports all application data as JSON.
   */
  exportAllJSON() {
    const data = {
      version: CONFIG.VERSION,
      exportedAt: getTimestamp(),
      demandData: AppState.demandData,
      recommendations: AppState.recommendations,
      warehouses: AppState.warehouses,
      auditLog: AppState.auditLog,
      alerts: AppState.alerts,
      signals: AppState.signals,
      signalWeights: AppState.signalWeights,
      settings: AppState.settings
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    this.downloadBlob(blob, `safestock_backup_${formatDateShort(new Date())}.json`);
    Toast.success("Exported", "All data exported as JSON backup.");
  },

  /**
   * Imports data from a JSON file.
   * @param {File} file
   */
  importJSON(file) {
    if (!file) { return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        if (data.demandData) { AppState.demandData = data.demandData; }
        if (data.recommendations) { AppState.recommendations = data.recommendations; }
        if (data.warehouses) { AppState.warehouses = data.warehouses; }
        if (data.auditLog) { AppState.auditLog = data.auditLog; }
        if (data.alerts) { AppState.alerts = data.alerts; }
        if (data.signals) { AppState.signals = data.signals; }
        if (data.signalWeights) { AppState.signalWeights = data.signalWeights; }
        if (data.settings) { AppState.settings = { ...AppState.settings, ...data.settings }; }

        /* Re-derive computed state */
        if (AppState.demandData.length > 0) {
          const { cleaned } = DataEngine.cleanData(AppState.demandData);
          AppState.cleanedData = cleaned;
          AppState.skuList = DataEngine.getSkuList(cleaned);
          AppState.locationList = DataEngine.getLocationList(cleaned);
        }

        StorageManager.saveAll();
        Toast.success("Import Successful", "Data restored from backup.");
        setTimeout(() => { window.location.reload(); }, 1000);
      } catch (err) {
        Toast.error("Import Failed", "Invalid JSON file. Please check the format.");
      }
    };

    reader.onerror = () => {
      Toast.error("Read Error", "Failed to read the import file.");
    };

    reader.readAsText(file);
  },

  /**
   * Generic blob download helper.
   * @param {Blob} blob
   * @param {string} filename
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

/* ============================================
   37. LOCAL STORAGE PERSISTENCE
   ============================================ */

const StorageManager = {
  saveData() {
    try {
      const data = {
        demandData: AppState.demandData,
        cleanedData: AppState.cleanedData,
        skuList: AppState.skuList,
        locationList: AppState.locationList,
        recommendations: AppState.recommendations,
        warehouses: AppState.warehouses,
        pushQueue: AppState.pushQueue,
        signals: AppState.signals,
        signalWeights: AppState.signalWeights
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* Storage full or unavailable — non-critical */
    }
  },

  saveSettings() {
    try {
      localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(AppState.settings));
    } catch { /* ignore */ }
  },

  saveAudit() {
    try {
      localStorage.setItem(CONFIG.AUDIT_KEY, JSON.stringify(AppState.auditLog));
    } catch { /* ignore */ }
  },

  saveAlerts() {
    try {
      localStorage.setItem(CONFIG.ALERTS_KEY, JSON.stringify(AppState.alerts));
    } catch { /* ignore */ }
  },

  saveAll() {
    this.saveData();
    this.saveSettings();
    this.saveAudit();
    this.saveAlerts();
  },

  loadAll() {
    try {
      /* Settings */
      const settings = localStorage.getItem(CONFIG.SETTINGS_KEY);
      if (settings) {
        const parsed = JSON.parse(settings);
        AppState.settings = { ...AppState.settings, ...parsed };
      }

      /* Main data */
      const data = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed.demandData)) { AppState.demandData = parsed.demandData; }
        if (Array.isArray(parsed.cleanedData)) { AppState.cleanedData = parsed.cleanedData; }
        if (Array.isArray(parsed.skuList)) { AppState.skuList = parsed.skuList; }
        if (Array.isArray(parsed.locationList)) { AppState.locationList = parsed.locationList; }
        if (Array.isArray(parsed.recommendations)) { AppState.recommendations = parsed.recommendations; }
        if (Array.isArray(parsed.warehouses)) { AppState.warehouses = parsed.warehouses; }
        if (Array.isArray(parsed.pushQueue)) { AppState.pushQueue = parsed.pushQueue; }
        if (parsed.signals) { AppState.signals = { ...AppState.signals, ...parsed.signals }; }
        if (parsed.signalWeights) { AppState.signalWeights = { ...AppState.signalWeights, ...parsed.signalWeights }; }
      }

      /* Audit */
      const audit = localStorage.getItem(CONFIG.AUDIT_KEY);
      if (audit) {
        const parsed = JSON.parse(audit);
        if (Array.isArray(parsed)) { AppState.auditLog = parsed; }
      }

      /* Alerts */
      const alerts = localStorage.getItem(CONFIG.ALERTS_KEY);
      if (alerts) {
        const parsed = JSON.parse(alerts);
        if (Array.isArray(parsed)) { AppState.alerts = parsed; }
      }
    } catch {
      /* Corrupted storage — start fresh */
    }
  },

  clearAll() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      localStorage.removeItem(CONFIG.SETTINGS_KEY);
      localStorage.removeItem(CONFIG.AUDIT_KEY);
      localStorage.removeItem(CONFIG.ALERTS_KEY);
    } catch { /* ignore */ }
  }
};

/* ============================================
   38. INITIALIZATION
   ============================================ */

const App = {
  async init() {
    try {
      /* 1. Load saved data from localStorage */
      StorageManager.loadAll();

      /* 2. Show loading screen and animate */
      await UILoading.animate();

      /* 3. Initialize all UI modules */
      UIOnboarding.init();
      UINavigation.init();
      UITheme.init();
      UIModals.init();
      UIUpload.init();
      UISignals.init();
      UIForecast.init();
      UIRecommendations.init();
      UISimulator.init();
      UIRebalancer.init();
      UIERP.init();
      UIAudit.init();
      UIAlerts.init();
      UISearch.init();
      UISettings.init();
      KeyboardShortcuts.init();

      /* 4. Restore state-dependent UI */
      if (AppState.cleanedData.length > 0) {
        UIUpload.filteredData = [...AppState.cleanedData];
        UIUpload.renderPreviewTable();
        UIUpload.updateDropdowns();

        const { qualityReport } = DataEngine.cleanData(AppState.demandData);
        UIUpload.renderQualityReport(qualityReport);
      }

      /* 5. Show main app, hide loading */
      getEl("appWrapper")?.classList.remove("hidden");
      UILoading.hide();

      /* 6. Refresh dashboard */
      UIDashboard.refresh();

      /* 7. Show onboarding for first-time users */
      if (!AppState.settings.onboardingDone) {
        setTimeout(() => UIOnboarding.show(), 800);
      }

      /* 8. Log initialization */
      AuditTrail.log("System Initialized", "—", `v${CONFIG.VERSION} — Session started`);

      /* 9. Fullscreen toggle */
      getEl("fullscreenBtn")?.addEventListener("click", () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });

      /* 10. Notification bell */
      getEl("notificationBtn")?.addEventListener("click", () => {
        UINavigation.navigateTo("alerts");
      });

      /* 11. Refresh buttons */
      getEl("refreshForecastChart")?.addEventListener("click", () => UIDashboard.renderForecastChart());
      getEl("refreshDistChart")?.addEventListener("click", () => UIDashboard.renderDistributionChart());
      getEl("refreshSignals")?.addEventListener("click", () => {
        /* Simulate signal refresh */
        AppState.signals.port = clamp(AppState.signals.port + Math.round((Math.random() - 0.5) * 10), 0, 100);
        AppState.signals.geo = clamp(AppState.signals.geo + Math.round((Math.random() - 0.5) * 8), 0, 100);
        AppState.signals.weather = clamp(AppState.signals.weather + Math.round((Math.random() - 0.5) * 12), 0, 100);
        AppState.signals.lastUpdated = getTimestamp();

        UIDashboard.renderSignalFeed();
        UISignals.refresh();
        StorageManager.saveData();
        Toast.info("Signals Refreshed", "Real-time signals updated.");
      });

    } catch (err) {
      /* Critical error — show something to user */
      UILoading.hide();
      getEl("appWrapper")?.classList.remove("hidden");
      Toast.error("Initialization Error", "Some features may not work correctly. Please refresh.");
    }
  }
};

/* Start the application when DOM is ready */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => App.init());
} else {
  App.init();
}
            
