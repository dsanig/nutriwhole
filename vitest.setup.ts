import { webcrypto } from 'node:crypto';

declare global {
  // eslint-disable-next-line no-var
  var crypto: Crypto | undefined;
}

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true
  });
}
