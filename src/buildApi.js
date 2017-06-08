import request from './request';
import { isRequestLoading } from './selectors';
import applyUrlWithPlaceholders from './applyUrlWithPlaceholders';

const pendingPromises = {};

const defaultConfigure = (options) => options;

export default function buildApi(endpoints, config = {}) {
  const {
    baseUrl,
    configureOptions = defaultConfigure,
    configureHeaders = defaultConfigure,
  } = config;

  return Object.keys(endpoints).reduce((acc, key) => {
    const { path, required, method: normalizeArguments } = endpoints[key];

    const requiredPlaceholders = required || [];
    const placeholderRegexp = /:([^\/$]+)/g;
    let match;

    while (match = placeholderRegexp.exec(path)) {
      requiredPlaceholders.push(match[1]);
    }

    acc[key] = (...args) => {
      const normalizedArguments = normalizeArguments(...args);

      const placeholders = normalizedArguments.placeholders || {};
      const options = normalizedArguments.options || {};

      const augmentedOptions = {
        ...options,
        headers: configureHeaders({
          ...options.headers,
          'Content-Type': 'application/vnd.api+json',
          Accept: 'application/vnd.api+json',
        }),
      };

      const missingPlaceholders = requiredPlaceholders.filter(key => !placeholders[key]);

      if (missingPlaceholders.length > 0) {
        const message = `The "${key}" API call cannot be performed. The following params were not specified: ${missingPlaceholders.join(', ')}`;
        console.error(message);
        const neverendingPromise = new Promise(() => 1);
        neverendingPromise.noop = true;

        return neverendingPromise;
      }

      const promiseId = JSON.stringify([key, args]);

      if (pendingPromises[promiseId]) {
        return pendingPromises[promiseId];
      }

      const req = request(
        baseUrl,
        applyUrlWithPlaceholders(path, placeholders),
        configureOptions(augmentedOptions)
      );

      pendingPromises[promiseId] = req;

      const promise = req
        .then((result) => {
          delete pendingPromises[promiseId];
          return result;
        })
        .catch((error) => {
          delete pendingPromises[promiseId];
          return Promise.reject(error);
        });

      promise.actionName = key;
      promise.params = args;

      return promise;
    };

    acc[key].actionName = key;

    return acc;
  }, {});
};
