# Whole-Health Ecosystem Transformation: Action Plan

This document outlines concrete actions required to execute the transformation roadmap across the NutriWhole platform. Activities are grouped by strategic stream with notes on owners, dependencies, and initial deliverables.

## Execution Log

- ✅ **Security & account experience foundation (Sprint 1)** – MFA artifacts, trusted device registry, and session hygiene logging delivered alongside a new security center UI.
- ✅ **Client telemetry hub (Sprint 2)** – Unified Supabase schema for metrics, streaks, sentiment, wearables, and milestones with dashboards for clients and coaches (web) plus inline Today highlights.
- ✅ **Gemini AI coach tier (Sprint 3)** – Middleware-ready Supabase schema, usage logging, escalation workflows, and dedicated web surfaces (AI tab + Today inline cards) gated by MFA and Stripe tier.
- ✅ **Lifestyle agenda + client-first refresh (Sprint 3)** – Unified daily agenda, habit streak rollups, responsive Today view enhancements, and premium content gating tied to subscriptions.
- ✅ **Operational readiness & compliance (Sprint 3)** – Insight audit logs, guardrail tables, and support playbooks codified in the new AI oversight runbook.

## 1. Security & Account Experience

1. **Supabase MFA enforcement**
   - Update auth policies to require TOTP/passkey enrollment for all roles.
   - Implement admin override workflow and backup code generation stored in encrypted columns.
   - Deliverables: ERD updates, migration scripts, MFA enrollment UI wireframes.
2. **Account settings refresh**
   - Redesign settings page to surface MFA status, device management, and backup codes.
   - Add flows for device trust registration and biometric opt-in (mobile/web hybrid).
   - Deliverables: responsive Figma screens, React component backlog, analytics events.
3. **Stripe–identity sync**
   - Extend Stripe customer metadata with MFA status flags.
   - Add webhook-driven jobs to disable premium entitlements when MFA lapses or billing fails.
   - Deliverables: Supabase functions for entitlement checks, Stripe webhook handlers.
4. **Session hygiene**
   - Configure inactivity timeouts and session revocation triggers (e.g., device removal, billing changes).
   - Document compliance checks and audit log schema for MFA-related actions.
   - Deliverables: session policy spec, automated tests, compliance checklist update.

## 2. Client Telemetry & Insights

1. **Metric schema expansion**
   - Model tables for anthropometrics, biometrics, streaks, and sentiment with row-level security.
   - Define retention and access policies per data type; align with compliance requirements.
   - Deliverables: ERD, migration plan, sample queries for dashboards.
2. **Data ingestion connectors**
   - Scope integrations for Apple Health, Google Fit, and lab APIs via background workers.
   - Normalize metric units and timestamps; queue reconciliation jobs for late data.
   - Deliverables: integration architecture diagrams, connector backlog, testing harnesses.
3. **Role-based dashboards**
   - Design client and coach telemetry dashboards with progressive disclosure and alerting.
   - Prioritize client-first metrics while providing coach rollups and export options.
   - Deliverables: dashboard UX prototypes, component specs, alert rule definitions.

## 3. Gemini-Powered AI Coach Tier

1. **Middleware service architecture**
   - Define runtime (e.g., Cloud Run) and secrets management for Gemini access.
   - Implement API that consumes client goals/metrics and returns structured insights.
   - Deliverables: service design doc, contract schema, monitoring plan.
2. **AI insights surfaces**
   - Create "AI Insights" tab and inline cards across nutrition, workout, and biomarker views.
   - Ensure availability gating via subscription + MFA status checks.
   - Deliverables: UI prototypes, component implementation tickets, feature flag strategy.
3. **Safety & oversight**
   - Establish prompt templates, toxicity filters, and escalation workflows to human coaches.
   - Store insight logs with audit metadata and review dashboards for compliance.
   - Deliverables: prompt library, review SOP, logging schema updates.
4. **Monetization flow**
   - Configure Stripe product/pricing for AI tier; map entitlements to Supabase roles.
   - Build in-app upgrade flow with contextual marketing placements.
   - Deliverables: pricing configuration doc, checkout UX specs, event tracking plan.

## 4. Multi-Domain Lifestyle Programming

1. **Integrated daily agenda**
   - Merge meal plans, workouts, mindfulness, and recovery tasks into a single agenda view.
   - Support mobile-first interaction with offline-friendly caching.
   - Deliverables: agenda wireframes, task schema updates, synchronization plan.
2. **Dynamic plan adjustments**
   - Use AI insights and coach overrides to auto-adjust macros, training loads, and habits.
   - Surface change logs and notification cadence guidelines.
   - Deliverables: adjustment rule matrix, notification copy deck, QA scenarios.
3. **Content library enhancements**
   - Tag recipes, lessons, and wellbeing exercises by goals and subscription tier.
   - Integrate premium gating via Stripe metadata; surface recommendations in agenda view.
   - Deliverables: content taxonomy, CMS updates, recommendation algorithm outline.

## 5. Client-First Interface Modernization

1. **Design system audit**
   - Inventory current Shadcn/Tailwind components, assess responsive behavior, and fill token gaps.
   - Extend system to support native wrappers (React Native/Capacitor) with shared tokens.
   - Deliverables: audit report, token update plan, component parity matrix.
2. **Today-centric home experience**
   - Rework home screen to highlight today’s agenda, key metrics, and AI insights with progressive disclosure.
   - Move coach tools into secondary navigation with clear affordances.
   - Deliverables: UX storyboard, navigation spec, usability test plan.
3. **Accessibility & performance**
   - Target WCAG AA compliance, add skeleton loaders, and implement background sync strategies.
   - Benchmark mobile web performance and set optimization targets.
   - Deliverables: accessibility checklist, performance budget, monitoring dashboards.

## 6. Operations, Compliance & Enablement

1. **Workflow enablement**
   - Draft coach support flows for telemetry reviews, AI escalations, and batch feedback.
   - Provide training materials and internal knowledge base updates.
   - Deliverables: training curriculum, workflow diagrams, FAQ scripts.
2. **Governance & documentation**
   - Update consent flows, incident response plans, and audit logging procedures.
   - Maintain data classification matrix and RACI for cross-team decisions.
   - Deliverables: policy documents, compliance runbook updates, approval checklist.
3. **Measurement & iteration**
   - Instrument usage analytics and client satisfaction surveys tied to roadmap milestones.
   - Feed results into quarterly reviews to balance AI and human coaching investments.
   - Deliverables: KPI dashboard requirements, survey templates, retrospective agenda.

## Immediate Next Steps (First 4 Weeks)

- **Security**: finalize MFA policy draft, prototype Supabase 2FA enforcement, audit Stripe metadata.
- **Telemetry**: validate metric schema, define governance rules, shortlist wearable/lab partners.
- **AI Coach**: design AI insight IA, prepare prompt templates, outline middleware architecture.
- **Lifestyle**: map current journeys, identify rapid habit module candidates, prototype daily agenda.
- **UI**: inventory Shadcn components, define responsive breakpoints, run usability tests with target personas.
- **Ops**: outline consent/PII flows, refresh incident response checklist, establish transformation KPIs.

## Readiness Workstreams

1. **Architecture & Environment**: finalize ERDs, document Gemini service topology, ensure environment parity.
2. **Delivery Roadmap**: decompose epics into sprint-ready stories, map dependencies with RACI, publish 90-day milestone calendar.
3. **Design & UX**: audit tokens, build Figma libraries, schedule usability sessions focused on Today view and AI comprehension.
4. **Data & Analytics**: create data classification matrix, define observability events, set automated validation gates.
5. **Operational Rollout**: draft training curriculum, build support playbooks, align launch communications with milestone calendar.

This plan provides actionable steps for engineering, design, data, and operations teams to execute the whole-health transformation with clear outputs and accountability.
