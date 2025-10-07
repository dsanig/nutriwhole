import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface StripeSyncResult {
  synced: boolean;
  customerId?: string;
}

export interface WebauthnChallengeOptions {
  userId: string;
  type: "registration" | "authentication";
  challenge: string;
  expiresAt?: Date;
}

export interface PasskeyCredential {
  id: string;
  credential_id: string;
  public_key: string;
  transports: string[] | null;
  sign_count: number;
  friendly_name: string | null;
  last_used_at: string | null;
}

const DEFAULT_CHALLENGE_EXPIRATION_MINUTES = 10;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const generateBackupCodes = (count = 10) => {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let raw = "";
    const randomValues = crypto.getRandomValues(new Uint8Array(10));
    randomValues.forEach((byte) => {
      raw += BASE32_ALPHABET[byte % BASE32_ALPHABET.length];
    });
    const normalized = raw.slice(0, 16);
    codes.push(
      `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}`
    );
  }
  return codes;
};

export const hashValue = async (value: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const getServiceSupabase = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Supabase service role credentials are not configured");
  }
  return createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
};

export const getRpSettings = () => {
  const rpId = Deno.env.get("PASSKEY_RP_ID") ?? new URL(Deno.env.get("SUPABASE_URL") ?? "http://localhost:54321").hostname;
  const rpName = Deno.env.get("PASSKEY_RP_NAME") ?? "NutriWhole";
  const origin = Deno.env.get("PASSKEY_ORIGIN") ?? "http://localhost:5173";
  return { rpId, rpName, origin };
};

export const persistWebauthnChallenge = async (
  supabase: SupabaseClient,
  { userId, type, challenge, expiresAt }: WebauthnChallengeOptions,
) => {
  const expiration = expiresAt ?? new Date(Date.now() + DEFAULT_CHALLENGE_EXPIRATION_MINUTES * 60 * 1000);
  await supabase.from("mfa_webauthn_challenges").delete().eq("user_id", userId).eq("challenge_type", type);
  await supabase.from("mfa_webauthn_challenges").insert({
    user_id: userId,
    challenge,
    challenge_type: type,
    expires_at: expiration.toISOString(),
  });
};

export const consumeWebauthnChallenge = async (
  supabase: SupabaseClient,
  userId: string,
  type: "registration" | "authentication",
) => {
  const { data, error } = await supabase
    .from("mfa_webauthn_challenges")
    .select("id, challenge, expires_at")
    .eq("user_id", userId)
    .eq("challenge_type", type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  await supabase.from("mfa_webauthn_challenges").delete().eq("id", data.id);
  if (new Date(data.expires_at) < new Date()) {
    throw new Error("El desafío WebAuthn expiró, intenta nuevamente");
  }
  return data.challenge;
};

export const getPasskeyCredentials = async (supabase: SupabaseClient, userId: string) => {
  const { data, error } = await supabase
    .from("mfa_passkeys")
    .select("id, credential_id, public_key, transports, sign_count, friendly_name, last_used_at")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as PasskeyCredential[];
};

export const updatePasskeyUsage = async (
  supabase: SupabaseClient,
  credentialId: string,
  signCount: number,
) => {
  await supabase
    .from("mfa_passkeys")
    .update({ sign_count: signCount, last_used_at: new Date().toISOString() })
    .eq("credential_id", credentialId);
};

export const syncStripeMfaState = async (
  userId: string,
  email: string,
  mfaActive: boolean,
  options?: { profileId?: string; supabaseClient?: SupabaseClient }
): Promise<StripeSyncResult> => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabase = options?.supabaseClient ?? getServiceSupabase();
  if (!stripeKey) {
    await supabase
      .from("profiles")
      .update({
        premium_locked: !mfaActive,
        premium_locked_reason: mfaActive ? null : "MFA requerida para mantener beneficios premium",
        stripe_mfa_synced_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return { synced: false };
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  const { data: subscriber } = await supabase
    .from("subscribers")
    .select("stripe_customer_id, subscription_tier")
    .eq("user_id", userId)
    .maybeSingle();

  let customerId = subscriber?.stripe_customer_id ?? null;
  if (!customerId) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      await supabase
        .from("subscribers")
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }
  }

  if (customerId) {
    await stripe.customers.update(customerId, {
      metadata: {
        mfa_required: "true",
        mfa_active: mfaActive ? "true" : "false",
        mfa_verified_at: mfaActive ? new Date().toISOString() : null,
      },
    });
  }

  const requiresPremiumLock = !mfaActive && Boolean(subscriber?.subscription_tier);

  await supabase
    .from("profiles")
    .update({
      premium_locked: requiresPremiumLock,
      premium_locked_reason: requiresPremiumLock
        ? "Activa MFA para mantener tus beneficios premium"
        : null,
      stripe_mfa_synced_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (requiresPremiumLock && options?.profileId) {
    await supabase
      .from("content_unlocks")
      .delete()
      .eq("profile_id", options.profileId)
      .eq("source", "premium");
  }

  return { synced: true, customerId: customerId ?? undefined };
};
