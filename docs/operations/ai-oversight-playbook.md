# AI Coach Oversight & Compliance Playbook

This guide centralizes the workflows, safeguards, and evidence capture required to operate the Gemini-powered coach tier in a compliant way across security, support, and coaching teams.

## 1. Access Requirements

- **Mandatory MFA** – All staff reviewing insights must keep TOTP/passkey active. Enrollment status is stored in `profiles.mfa_enrolled` and surfaced via the Security Center. Access requests without active 2FA are auto-denied.
- **Stripe entitlement sync** – AI access is unlocked only for subscriptions mapped to `ai`, `premium`, or `enterprise` tiers. Downgrades trigger a background job that revokes `content_unlocks` and prevents new `ai_usage_events` for that profile until billing is restored.
- **Role-based controls** – Coaches and admins inherit read access to `ai_insights`, `ai_insight_cards`, and `ai_escalations` when they are assigned to a client (`profiles.coach_id`). Clients only view their own data.

## 2. Insight Lifecycle

1. **Generation** – Gemini middleware writes structured insights into `ai_insights` with accompanying cards, guardrail checks, and usage events.
2. **Review** – Clients see inline highlights on the Today view plus the dedicated Coach IA tab. Coaches can escalate or acknowledge insights via `ai_escalations`.
3. **Feedback loop** – Any rating submitted persists to `ai_insight_feedback`. Support audits these entries weekly to tune prompt templates in `ai_prompt_templates`.
4. **Follow-up** – Escalations move to `status = 'en_progreso'` once a coach accepts the task. Resolution timestamps are captured for compliance.

## 3. Guardrails & Monitoring

- **Toxicity & policy checks** – `ai_guardrail_events` stores failed policy evaluations (e.g., medical risk, self-harm). Automated alerts feed into the security channel via the Supabase webhook integration.
- **Usage analytics** – `ai_usage_events` captures refresh requests, content unlocks, and escalations. Dashboards in Metabase slice these events by cohort to monitor adoption.
- **Audit retention** – Insight records and guardrail events follow a 24-month retention period with quarterly export to cold storage for HIPAA/GDPR readiness.

## 4. Support Playbooks

- **MFA reset** – Agents reference the Security Center to revoke trusted devices and regenerate backup codes. All actions must log a `session_audit_logs` entry.
- **Insight dispute** – Capture the client’s concern, attach supporting metrics, and escalate via `ai_escalations` with reason `disputa`. Coaches must respond within 2 business days.
- **Data correction** – If telemetry is incorrect, coordinate with the data team to replay wearable ingestion jobs. Once fixed, trigger a new insight batch with `insight_refresh_requested`.

## 5. Training & Communications

- Run quarterly enablement sessions covering the AI roadmap, common failure modes, and updated guardrails.
- Publish a client-facing FAQ explaining how insights are generated, how to request human review, and how billing impacts availability.
- Maintain changelog entries in Notion whenever prompt templates or guardrail thresholds change.

By following this playbook, teams keep AI insights trustworthy, auditable, and aligned with NutriWhole’s holistic health promise.
