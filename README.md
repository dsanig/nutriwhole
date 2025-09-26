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
