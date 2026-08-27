# Stripe-testrunden (2026-08-27)

Denne branchen finnes for aa faa en deploy preview med TESTMILJOE for betaling:
deploy-preview-konteksten i Netlify har sk_test-noekkel, BILLING_ENABLED=true
og et eget test-webhook-endepunkt. Produksjonskonteksten er uroert.

Protokoll (fra juli): kjoep med 4242-kortet paa previewen, webhook-replay, og
bevis paa at NOEYAKTIG EN oppfyllelse skrives i org_topups (idempotens paa
stripe_session_id). Resultatet foeres i minnet og i PR-en.
