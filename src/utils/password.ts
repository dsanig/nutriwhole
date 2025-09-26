const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SPECIAL = '!@#$%^&*()-_=+[]{}|;:,.<>?';

const ALL_CHARACTERS = `${LOWERCASE}${UPPERCASE}${NUMBERS}${SPECIAL}`;
const DEFAULT_LENGTH = 16;

const getCrypto = (): Crypto => {
  const cryptoObj = globalThis.crypto;

  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Secure random number generator is not available.');
  }

  return cryptoObj;
};

const getRandomIndex = (cryptoObj: Crypto, max: number): number => {
  const randomBuffer = new Uint32Array(1);
  cryptoObj.getRandomValues(randomBuffer);
  return Math.floor((randomBuffer[0] / (0xffffffff + 1)) * max);
};

const pickRandomChar = (cryptoObj: Crypto, charset: string): string => {
  const index = getRandomIndex(cryptoObj, charset.length);
  return charset[index];
};

const shuffleCharacters = (cryptoObj: Crypto, characters: string[]): string[] => {
  const result = [...characters];

  for (let i = result.length - 1; i > 0; i--) {
    const j = getRandomIndex(cryptoObj, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
};

export const generateSecurePassword = (length: number = DEFAULT_LENGTH): string => {
  if (length < 12) {
    throw new Error('Password length must be at least 12 characters.');
  }

  const cryptoObj = getCrypto();

  const guaranteedCharacters = [
    pickRandomChar(cryptoObj, LOWERCASE),
    pickRandomChar(cryptoObj, UPPERCASE),
    pickRandomChar(cryptoObj, NUMBERS),
    pickRandomChar(cryptoObj, SPECIAL)
  ];

  const remainingCharacters: string[] = [];
  for (let i = guaranteedCharacters.length; i < length; i++) {
    remainingCharacters.push(pickRandomChar(cryptoObj, ALL_CHARACTERS));
  }

  const passwordCharacters = shuffleCharacters(cryptoObj, [
    ...guaranteedCharacters,
    ...remainingCharacters
  ]);

  return passwordCharacters.join('');
};
