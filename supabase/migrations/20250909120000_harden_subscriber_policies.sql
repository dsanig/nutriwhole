BEGIN;

DROP POLICY IF EXISTS "update_own_subscription" ON public.subscribers;
DROP POLICY IF EXISTS "insert_subscription" ON public.subscribers;

CREATE POLICY "user_manage_own_subscription"
ON public.subscribers
FOR UPDATE
USING (auth.uid() = user_id AND email = auth.email())
WITH CHECK (auth.uid() = user_id AND email = auth.email());

CREATE POLICY "user_insert_own_subscription"
ON public.subscribers
FOR INSERT
WITH CHECK (auth.uid() = user_id AND email = auth.email());

CREATE POLICY "service_role_upsert_subscriptions"
ON public.subscribers
FOR UPDATE
USING (auth.jwt()->>'role' = 'service_role')
WITH CHECK (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "service_role_insert_subscriptions"
ON public.subscribers
FOR INSERT
WITH CHECK (auth.jwt()->>'role' = 'service_role');

COMMIT;
