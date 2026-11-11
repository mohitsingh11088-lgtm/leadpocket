This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Connect Supabase

LeadPocket uses Supabase for account sign-in and private lead storage. To connect it:

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. In the Supabase project settings, copy the Project URL and publishable key into `.env.local`. Do not add a secret/service-role key to this app.
4. Open the Supabase SQL Editor and run [`supabase/schema.sql`](./supabase/schema.sql). This creates the leads table and its owner-only row security policies.
5. In Supabase Authentication settings, set the site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the allowed redirect URLs.
6. Restart the dev server with `npm run dev`, then open `http://localhost:3000` and create an account.

For production password recovery, set `NEXT_PUBLIC_APP_URL` to `https://leadpocket.vercel.app` (or your chosen public site origin) in Vercel's environment settings and redeploy so the value is included in the client bundle. The app uses that origin for password recovery and signup confirmation; production falls back to `https://leadpocket.vercel.app` and never uses localhost or a Codespaces host. In Supabase Authentication → URL Configuration, set the production Site URL and allow `https://leadpocket.vercel.app/auth/callback` as a redirect URL (and `http://localhost:3000/auth/callback` only for local development). The callback exchanges the one-time authorization code, stores the Supabase session, and sends password recovery users to `/reset-password`.

## Website lead capture

The Integrations page lets each signed-in user create multiple public enquiry forms. Each form has a unique shareable URL, configurable title and fields, and can be paused or reactivated. Submissions create `New` leads owned by that form's user.

Before using website forms:

1. If your project already has the original CRM schema, run the additive migration [`supabase/migrations/20261111000100_public_website_forms.sql`](./supabase/migrations/20261111000100_public_website_forms.sql) in the Supabase SQL Editor. Review it before running. It adds integration connections, website forms, source tracking, webhook events, rate limits, and owner-only RLS policies. Do not rerun the original schema as a substitute for this migration.
2. Install/use the Supabase CLI, sign in, and link this folder to your project:

   ```sh
   npx supabase login
   npx supabase link --project-ref your-project-ref
   ```

3. Generate a random HMAC key with `openssl rand -hex 32`. Set that generated value as an Edge Function secret:

   ```sh
   npx supabase secrets set RATE_LIMIT_HMAC_SECRET=your-generated-random-value
   ```

4. Deploy the capture function:

   ```sh
   npx supabase functions deploy capture-lead
   ```

   The function uses Supabase's Edge Function environment for its service-role key. Never put that key in `.env.local`, browser code, or a public form. Only the HMAC key is an additional secret configured above.

5. Open **Integrations** in LeadPocket, create a form, and use **Copy link** to share it.

The public form endpoint validates submissions, ignores its hidden honeypot field, limits each IP to 5 submissions per form per 10 minutes and each form to 100 per hour, and deduplicates retries using a unique event ID. The rate-limit store contains keyed IP hashes rather than raw IP addresses and prunes old buckets. These are basic protections, not a substitute for CAPTCHA or stronger abuse monitoring if a form becomes a target.

Leads, forms, and integration connections are scoped to the signed-in owner by RLS. Public form submissions do not accept a user ID: the Edge Function resolves the owner from the form record and inserts the lead through a service-only database function. The browser never receives a service-role key.

## Google Forms lead capture

Google Forms setup in LeadPocket is a four-step guide with simple instructions and visual examples. The Apps Script template sends each form response to the `google-forms` Edge Function. Every connection belongs to the signed-in LeadPocket user who created it.

### Before connecting

The Google Forms backend must be installed in Supabase:

1. Run [`supabase/migrations/20261111000200_google_forms.sql`](./supabase/migrations/20261111000200_google_forms.sql) in the Supabase SQL Editor. It adds the enquiry field, private credential storage, rate limits, last-success tracking, and the protected lead-submission function. Existing leads are preserved.
2. Deploy the Edge Function from the repository root:

   ```sh
   npx supabase functions deploy google-forms --project-ref your-project-ref
   ```

   The function checks signed-in users for connection management and verifies the private per-user setup code for form responses. The private code is never stored in readable form.

### Connect a form

1. In LeadPocket, open **Integrations → Google Forms → Connect Google Forms** and follow the four steps.
2. Add questions called **Name**, **Email**, **Phone**, **Company**, and **Enquiry** to your Google Form. Name must be filled in; the others are optional.
3. Open **Extensions → Apps Script** in Google Forms. Copy the ready-made helper from the LeadPocket guide, replace the sample code, and save it.
4. In Apps Script, open **Project Settings → Script Properties**. Add the setting name `LEADPOCKET_WEBHOOK_CREDENTIAL` and paste in the private setup code shown by LeadPocket. The code is shown once. Do not put it in a form question, a public link, or the helper text.
5. In Apps Script, choose `installLeadPocketTrigger` from the function list and click **Run**. Approve Google’s prompt.
6. Choose `testLeadPocketConnection` from the same function list and click **Run**. A successful check appears in the execution log. Then submit a real test response. Confirm the new lead appears in LeadPocket with source **Google Forms**.

LeadPocket’s **Check LeadPocket is ready** button verifies the connection from the app. It does not send a form response; run `testLeadPocketConnection` in Apps Script, then submit a real test response to check the full path.

### If you need a new private code

The current code is only shown once. If it is lost, use **Replace my private code** in the guide, then update `LEADPOCKET_WEBHOOK_CREDENTIAL` in Apps Script Script Properties. Replacing it immediately disables the old code. You can disconnect Google Forms from the final step.

Google Forms submissions are limited to 10 per minute and 100 per hour per connection. Duplicate response IDs are ignored, requests are limited to 16 KiB, and field values are validated before lead creation. The function never accepts a user ID from Google Forms; it finds the owner from the active private code.

## WhatsApp Business

The prototype captures WhatsApp-sourced leads through a simple hosted enquiry form; it does **not** read or import WhatsApp messages.

1. Run [`supabase/migrations/20261111000400_whatsapp_click_to_chat.sql`](./supabase/migrations/20261111000400_whatsapp_click_to_chat.sql) and then [`supabase/migrations/20261111000500_whatsapp_public_enquiries.sql`](./supabase/migrations/20261111000500_whatsapp_public_enquiries.sql) in the Supabase SQL Editor, in order.
2. Deploy the updated public form function:

   ```sh
   npx supabase functions deploy capture-lead --project-ref your-project-ref
   ```

3. Configure `NEXT_PUBLIC_APP_URL` in the production frontend environment as the public site origin only, for example `https://your-leadpocket-domain.com` (no path or trailing `/capture/...`). In Vercel, add it under **Project → Settings → Environment Variables** for Production, then redeploy. For local work, use `http://localhost:3000` only in development. WhatsApp QR/link creation deliberately refuses Codespaces (`*.app.github.dev` and `*.github.dev`) URLs and does not fall back to the current browser origin.
4. In LeadPocket, open **Integrations → WhatsApp Business**, enter your business number with its international country code (for example `+91 9876543210`), and save.
5. LeadPocket creates a private owner-scoped public enquiry form with Name and Phone required, and Email, Company, and Message optional. The page generates the QR code locally in your browser.
6. When someone scans the QR code, WhatsApp opens with a ready-made message containing your public form link. They send that message, open the link, and submit the enquiry. The new lead is assigned to the form owner and appears with source and source channel **WhatsApp**.
7. On the Leads page, use the WhatsApp button next to any lead with a valid international phone number to send a personalized follow-up. The configured default message supports `{name}` and `{company}`.

Public form pages are excluded from the app's sign-in redirect. The capture Edge Function has JWT verification disabled and resolves the owner from the opaque public form ID. The form uses the existing capture endpoint, validation, honeypot, rate limits, and stable submission event IDs for retry deduplication. Visitors do not need a LeadPocket account and cannot provide a user ID or choose the lead source. Existing Website Forms continue to default to the Website channel and retain their behavior. No Meta credentials, OAuth, or WhatsApp webhooks are required. The Meta Cloud API implementation remains available for a future upgrade.

## Integration roadmap

Website enquiry forms, Google Forms, and WhatsApp-sourced public enquiries are implemented. Facebook Lead Ads, Instagram, Email, Phone, and automatic WhatsApp message capture are future integrations; Click-to-Chat does not automatically read incoming WhatsApp messages. Provider credentials must be stored server-side when those integrations are built.

Leads, Contacts, Pipeline, Dashboard, and Integrations use Supabase data. Tasks and Settings remain prototypes. Meta-based WhatsApp message capture is retained as a future implementation and is separate from Click-to-Chat.
