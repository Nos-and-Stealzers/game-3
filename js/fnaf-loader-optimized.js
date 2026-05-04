/**
 * Optimized FNAF Loader
 * Improves loading performance by:
 * - Skipping preflight checks by default
 * - Parallelizing fetches with aggressive timeouts
 * - Streaming resources.zip if available
 * - Better error recovery
 */
(function () {
  window.__GAMEHUB_FNAF_LOADER_OPTIMIZED__ = {
    install: function(config) {
      const {
        parts = 20,
        skipPreflight = true,
        preflightTimeout = 5000,
        fetchTimeout = 30000,
        maxRetries = 2,
        parallelFetches = 4
      } = config || {};

      // Store in window for access from FNAF pages
      window.__FNAF_LOADER_CONFIG__ = {
        parts,
        skipPreflight,
        preflightTimeout,
        fetchTimeout,
        maxRetries,
        parallelFetches
      };

      return {
        createFetcher: createOptimizedFetcher,
        createPreflightChecker: createOptimizedPreflightChecker
      };
    }
  };

  function createOptimizedFetcher(config) {
    const {
      fetchTimeout = 30000,
      maxRetries = 2
    } = config || {};

    return async function fetchWithRetry(url, options = {}, retries = maxRetries) {
      let lastError = null;
      
      for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutMs = document.hidden ? fetchTimeout * 6 : fetchTimeout;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
          const response = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          clearTimeout(timeoutId);
          lastError = error;
          // Exponential backoff between retries
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
          }
        }
      }
      throw lastError || new Error('Request failed');
    };
  }

  function createOptimizedPreflightChecker(config) {
    const {
      preflightTimeout = 5000,
      skipPreflight = true
    } = config || {};

    return async function preflightParts(fileParts, fetchFunc) {
      if (skipPreflight) {
        // Skip preflight checks and rely on fetch errors
        return [];
      }

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(fileParts.map(() => null)), preflightTimeout);
      });

      const checksPromise = Promise.all(
        fileParts.map(async (part) => {
          try {
            // Try quick HEAD request with very short timeout
            const headResponse = await Promise.race([
              fetchFunc(part, { method: "HEAD" }),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('HEAD timeout')), 3000)
              )
            ]);
            if (headResponse && headResponse.ok) {
              return null; // OK
            }
          } catch (_headError) {
            // HEAD failed or timed out, that's ok - will retry on full fetch
          }
          return null; // Assume OK, will fail on actual fetch if needed
        })
      );

      const results = await Promise.race([checksPromise, timeoutPromise]);
      return results.filter(Boolean);
    };
  }

})();
