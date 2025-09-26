import { describe, expect, it } from 'vitest';
import { generateSecurePassword } from './password';

describe('generateSecurePassword', () => {
  it('creates a password that meets Supabase complexity expectations', () => {
    const password = generateSecurePassword();

    expect(password).toHaveLength(16);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/.test(password)).toBe(true);
  });

  it('generates varied passwords across multiple invocations', () => {
    const passwords = Array.from({ length: 10 }, () => generateSecurePassword());
    const uniquePasswords = new Set(passwords);

    expect(uniquePasswords.size).toBeGreaterThan(1);
  });

  it('supports generating longer passwords', () => {
    const password = generateSecurePassword(24);

    expect(password).toHaveLength(24);
  });
});
