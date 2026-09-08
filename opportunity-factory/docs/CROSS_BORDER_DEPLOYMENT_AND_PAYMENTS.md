# Cross-border deployment and payments

Verified on 2026-08-18 against official provider documentation.

## Decision

Keep the current Alibaba Cloud service and SQLite database as the production
system of record until an overseas account with persistent storage exists.
Use Lemon Squeezy as the first global checkout candidate. A personal WeChat
static code may be used only as a low-value, manually verified domestic
experiment; it is not an automatic payment channel.

## Payment options

### Personal WeChat or Alipay QR code

Not suitable for unattended production checkout. The current ¥9.90 first-order
experiment uses it only with an explicit manual verification gate:

- Personal static collection codes are not the correct product for obvious
  commercial activity and are generally restricted for remote, non-face-to-face
  collection.
- A static code has no signed order callback, amount binding, refund state, or
  reliable idempotency key.
- A screenshot, payer name, or user-entered transaction number is not payment
  proof.
- Opening the QR page and submitting a payment claim are tracked separately.
- An authenticated operator must verify the actual WeChat receipt and click
  confirm before the report unlocks or revenue is recorded.
- The QR image remains in a private server directory and is not committed.

This is a deliberate bridge to the first real payment, not the final payments
architecture. Replace it with a merchant API when payment volume justifies
onboarding or when unattended fulfillment becomes mandatory.

References:

- https://www.news.cn/politics/2022-01/06/c_1128238509.htm
- https://opendocs.alipay.com/support/01raw5
- https://opendocs.alipay.com/open/llms.txt

### Direct WeChat Pay or Alipay merchant API

Technically suitable after merchant onboarding.

- Requires merchant/application onboarding, signing keys, product approval, and
  a public asynchronous notification endpoint.
- Payment confirmation must use the signed server callback or an active order
  query, never the browser return URL alone.
- Best for a China-focused checkout after a compliant merchant account exists.

### Lemon Squeezy

Recommended first for global one-time digital-product sales, subject to account
approval and payout eligibility.

- Merchant of record: handles checkout, tax, fraud, and customer receipts.
- Customer methods can include cards, PayPal, Apple Pay, Google Pay, Alipay,
  WeChat Pay, and UnionPay depending on customer location and device.
- Provides signed `order_created` webhooks and checkout custom data for mapping a
  payment to a report.
- Mainland China is not listed for bank payouts. Confirm that the seller can
  receive an approved PayPal payout or use another eligible payout account
  before relying on it.

Implemented environment variables:

```text
LEMONSQUEEZY_CHECKOUT_URL=
LEMONSQUEEZY_VARIANT_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
REPORT_PRICE_USD_CENTS=3900
```

Webhook URL:

```text
https://lifeyoume.icu/api/lemonsqueezy-webhook
```

The service verifies HMAC, event type, paid status, production mode, variant,
USD subtotal, and report token before idempotent fulfillment.

References:

- https://docs.lemonsqueezy.com/help/checkout/payment-methods
- https://docs.lemonsqueezy.com/help/getting-started/supported-countries
- https://docs.lemonsqueezy.com/help/checkout/passing-custom-data
- https://docs.lemonsqueezy.com/help/webhooks/webhook-requests

### Paddle

A valid second merchant-of-record candidate. It supports one-time digital
products and `transaction.completed` fulfillment webhooks. Seller onboarding
and payout eligibility still require manual verification before integration.

References:

- https://developer.paddle.com/get-started/how-paddle-works/digital-products/
- https://developer.paddle.com/webhooks/transactions/transaction-completed/

## Overseas hosting options

| Platform | Free commercial production fit | Persistence | Decision |
|---|---|---|---|
| GitHub Pages | No; official limits prohibit online business/e-commerce/SaaS hosting | Static only | Reject |
| Vercel Hobby | No; non-commercial personal use only | Not a SQLite host | Reject |
| Render Free | Officially not for production; sleeps after 15 minutes | Local SQLite is deleted on sleep/restart; free Postgres expires after 30 days | Reject |
| Koyeb Free | Sleeps after one idle hour | Do not treat local files as the order database | Preview only |
| Railway | Trial/free credit, not a durable zero-cost production guarantee | Trial volumes are deleted after expiry | Reject as permanent free host |
| Cloud Run | Has a monthly free allowance but requires a billing account | Ephemeral container disk; external database required | Viable after account setup |
| Oracle Cloud Always Free | Yes for a small VM when capacity is available | Persistent boot/block volume | Best lift-and-shift target |
| Cloudflare Workers + D1 | Strong global free tier and provider subdomain | D1 persists data | Best long-term edge target, requires a port from Python/SQLite |

Official references:

- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://vercel.com/docs/plans/hobby
- https://render.com/docs/free
- https://www.koyeb.com/docs/run-and-scale/scale-to-zero
- https://docs.railway.com/reference/pricing/free-trial
- https://cloud.google.com/run/pricing
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/

## Deployment sequence

1. Revoke the exposed classic GitHub token. Create a fine-grained token with an
   expiration and access only to the deployment repository.
2. Apply for Lemon Squeezy and confirm payout eligibility before displaying its
   checkout.
3. Create one product and a USD 39 one-time variant.
4. Configure the checkout URL, variant ID, and webhook signing secret.
5. Run a sandbox/test webhook. Test orders must remain rejected by production
   fulfillment.
6. Run one real low-value transaction and verify report unlock, USD accounting,
   refund handling requirements, and payout.
7. For overseas hosting, create an Oracle Always Free account and VM. Deployment
   can then reuse the existing systemd service and SQLite backup process.
8. Treat Cloudflare Workers+D1 as a separate migration, not a copy command.

## Oracle Always Free deployment

Create an Ubuntu VM using an Always Free-eligible shape. In the Oracle VCN
security list or network security group, allow inbound TCP 22, 80, and 443.
Point a DNS A record at the VM public IP before running:

```bash
ORACLE_HOST=203.0.113.10 \
ORACLE_DOMAIN=app.example.com \
ORACLE_KEY=$HOME/.ssh/oracle.key \
./deploy/push-oracle-free.sh
```

The installer:

- runs on Oracle ARM or AMD Ubuntu images;
- installs Python, Nginx, Certbot, and a hardened systemd service;
- stores SQLite under `/opt/opportunity-factory/runtime` on the persistent boot
  volume;
- creates HTTPS after DNS resolves;
- does not copy production secrets or the Alibaba Cloud database.

After installation, add payment and GitHub credentials directly to
`/opt/opportunity-factory/.env` on the VM and restart the service. Do not pass
credentials as command-line arguments.
