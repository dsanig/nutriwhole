const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const generateRandomBase32 = (length: number) => {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("El entorno actual no soporta generación criptográfica de claves");
  }
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += BASE32_ALPHABET[array[i] % BASE32_ALPHABET.length];
  }
  return result;
};

export const generateTotpSecret = () => generateRandomBase32(32);

export const generateBackupCodes = (count = 10) => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const segment = generateRandomBase32(16);
    codes.push(`${segment.slice(0, 4)}-${segment.slice(4, 8)}-${segment.slice(8, 12)}-${segment.slice(12, 16)}`);
  }
  return codes;
};

export const fingerprintDevice = () => {
  if (typeof window === "undefined") {
    return "server";
  }
  const platform = window.navigator?.platform ?? "unknown";
  const language = window.navigator?.language ?? "unknown";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown";
  return btoa(`${platform}|${language}|${timezone}`);
};
