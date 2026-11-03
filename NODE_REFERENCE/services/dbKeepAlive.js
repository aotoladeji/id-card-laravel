const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const createStopper = () => () => {};

const startDbKeepAlive = (pool) => {
  if (!pool || typeof pool.query !== 'function') {
    return createStopper();
  }

  const enabled = parseBoolean(process.env.DB_KEEPALIVE_ENABLED, !process.env.VERCEL);
  if (!enabled) {
    return createStopper();
  }

  const intervalMs = parsePositiveInt(process.env.DB_KEEPALIVE_INTERVAL_MS, 240000);
  const jitterMs = parsePositiveInt(process.env.DB_KEEPALIVE_JITTER_MS, 15000);
  const timeoutMs = parsePositiveInt(process.env.DB_KEEPALIVE_TIMEOUT_MS, 15000);
  const runImmediate = parseBoolean(process.env.DB_KEEPALIVE_RUN_IMMEDIATE, false);
  const logFailures = parseBoolean(process.env.DB_KEEPALIVE_LOG_FAILURES, false);

  let stopped = false;
  let timer = null;
  let inFlight = false;

  const scheduleNext = () => {
    if (stopped) return;
    const randomizedDelay = intervalMs + Math.floor(Math.random() * jitterMs);
    timer = setTimeout(runPing, randomizedDelay);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  };

  const runPing = async () => {
    if (stopped || inFlight) {
      scheduleNext();
      return;
    }

    inFlight = true;
    try {
      await Promise.race([
        pool.query('SELECT 1'),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('DB keep-alive timeout')), timeoutMs);
        }),
      ]);
    } catch (error) {
      if (logFailures) {
        console.warn('DB keep-alive ping failed:', error.code || error.message);
      }
    } finally {
      inFlight = false;
      scheduleNext();
    }
  };

  if (runImmediate) {
    runPing();
  } else {
    scheduleNext();
  }

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
};

module.exports = { startDbKeepAlive };
