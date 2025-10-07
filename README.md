# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/87fffd14-bdbc-4035-8870-84e8d7b51386

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/87fffd14-bdbc-4035-8870-84e8d7b51386) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/87fffd14-bdbc-4035-8870-84e8d7b51386) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Subscription data safeguards

To verify the hardened `public.subscribers` policies locally, use the Supabase CLI test runner:

```sh
supabase db reset --linked
supabase db test --pattern subscribers_policies
```

The companion test in `supabase/tests/subscribers_policies.test.sql` runs through the following scenarios:

1. An authenticated member can only insert or update their row when the JWT `sub` and `email` claims match the payload being written.
2. Anonymous or mismatched members are denied when attempting to touch someone else’s row.
3. The Stripe sync edge function, which operates with `role = service_role`, can still upsert records for billing reconciliation.

For production observability, consider enabling [Postgres audit triggers](https://supabase.com/docs/guides/database/extensions/pgaudit) or lightweight log-based alerts that watch for unexpected `UPDATE`/`INSERT` events on `public.subscribers`. Pairing those alerts with routine Supabase `db test` runs in CI will help surface policy regressions early.

## Environment additions

Recent security and telemetry upgrades introduce two new secrets that must be configured before running the updated middleware:

- `GEMINI_API_KEY` – Google Gemini API key used by the `gemini-insights` edge function to generate structured AI recommendations.
- `TELEMETRY_CONNECTOR_TOKEN` – Shared secret for the `ingest-telemetry` endpoint when pushing wearable or lab metrics from background connectors. When omitted, authenticated requests from authorized users are still permitted.

Add both values to your Supabase environment (`supabase/.env` or dashboard) and mirror them locally in `.env` when executing the new workflows.

### Additional secrets for the whole-health rollout

The remaining execution work relies on the following environment variables and Supabase secrets:

| Scope | Variable | Purpose |
| --- | --- | --- |
| Passkeys | `PASSKEY_RP_ID`, `PASSKEY_RP_NAME`, `PASSKEY_ORIGIN` | Configure the WebAuthn relying party information used by the MFA edge functions. Set `PASSKEY_RP_ID` to your production domain, `PASSKEY_ORIGIN` to the HTTPS origin, and `PASSKEY_RP_NAME` to the user-facing organization name. |
| Connectors | `APPLE_HEALTH_BASE_URL`, `APPLE_HEALTH_API_KEY` | Apple Health partner endpoint and bearer token consumed by `sync-apple-health`. |
| Connectors | `GOOGLE_FIT_BASE_URL`, `GOOGLE_FIT_CLIENT_ID`, `GOOGLE_FIT_CLIENT_SECRET` | OAuth client used by `sync-google-fit` to refresh access tokens and pull datasets. |
| Connectors | `LAB_RESULTS_BASE_URL`, `LAB_RESULTS_API_KEY` | Lab integration endpoint leveraged by `sync-lab-results` to ingest biomarker panels. |
| Edge orchestration | `SUPABASE_SERVICE_ROLE_KEY` | Required for the orchestration functions (`refresh-telemetry-integrations`, `lifestyle-automation-dispatcher`) to authenticate against other edge handlers. Already present for existing flows but must be kept in sync across environments. |
| MFA + Stripe | `STRIPE_SECRET_KEY` | Ensures Stripe metadata stays aligned with MFA enforcement after passkey enrollment or revocation. |

Document the values in your team’s secrets manager and populate them in the Supabase dashboard (`Project Settings` → `API` → `Edge Functions`) as well as the local `.env` file when running the stack offline.

> **Heads-up:** the Docker build expects `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to be set. If you previously relied on `VITE_SUPABASE_PUBLISHABLE_KEY`, keep it alongside the new `VITE_SUPABASE_ANON_KEY` so both local development and container builds resolve the correct publishable key.

### Deployment checklist

1. **Apply the new migrations:**
   ```sh
   supabase db push
   ```
   This creates the passkey credential tables, automation queue, and connector artifacts introduced in `20251001120000_finalize_passkeys_and_automation.sql`.

2. **Deploy the edge functions:**
   ```sh
   supabase functions deploy \
     mfa-passkey-start \
     mfa-passkey-finish \
     mfa-passkey-challenge \
     mfa-passkey-revoke \
     sync-apple-health \
     sync-google-fit \
     sync-lab-results \
     refresh-telemetry-integrations \
     lifestyle-automation-dispatcher
   ```
   Re-deploy existing functions (`gemini-insights`, `apply-lifestyle-adjustments`, etc.) if you changed their configuration or secrets.

3. **Schedule background jobs:** Use Supabase scheduled triggers (or your orchestration platform) to invoke `refresh-telemetry-integrations` and `lifestyle-automation-dispatcher` at the cadence agreed with product (e.g., every 30 minutes for wearables and every hour for lifestyle automation).

4. **Update `.env` locally:** Mirror the secret keys listed above so the Vite app and Supabase CLI run against the same configuration when validating flows.
