# Eric's Portfolio — secured multi-page version

## Pages
| URL | What it is |
|---|---|
| `/` | Home: services + latest lessons |
| `/about` | About Eric (edit the text in `public/about.html`) |
| `/services` | Services with prices (set in the admin) |
| `/portfolio` | Your projects (add them in the admin) |
| `/lessons` | Free and paid lessons |
| `/lesson?id=...` | A single lesson (paid ones unlock after payment) |
| `/booking` | Booking form |
| `/admin` | Private owner dashboard (login required, not linked anywhere) |

## Run locally
```
npm install
npm run dev
```
In dev mode a temporary admin password is printed in the terminal each time the server starts.

## Go live safely
1. `npm run set-password` and copy the `ADMIN_PASSWORD_HASH=...` line it prints.
2. Set these environment variables on your host (see `.env.example`):
   `NODE_ENV=production`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` (long random text), `TRUST_PROXY=1`, and `DATA_DIR` pointing to a persistent disk.
3. Start with `npm start`. In production the server refuses to start without a password hash.
4. Serve it over HTTPS (Render, Railway, Fly, etc. do this for you).

## What was fixed
- Admin API was open to everyone: now needs login (scrypt-hashed password, signed HttpOnly cookie, 5 attempts per 15 min).
- All admin changes need a CSRF token; cross-site requests are blocked.
- XSS: all user text is rendered with `textContent`, plus a strict Content-Security-Policy (no inline scripts or styles).
- Input validation, honeypot spam trap, rate limits on forms, 10 KB body limit.
- Security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy).
- Data is saved to `data/db.json` (survives restarts) instead of memory. `data/` is git-ignored.
- CSV export is protected against spreadsheet formula injection.

## Backups
Back up the `data/db.json` file regularly: it holds bookings, posts and subscribers.

## Earning money
1. **Set your prices:** log in at `/admin` > *Services & prices*. Services at 0 show "Get a quote".
2. **Add portfolio projects:** *Portfolio projects* in the admin.
3. **Sell lessons:** when publishing, set a price in Naira and fill the *Paid content* box. The free preview is public; the paid part is only sent to buyers.
4. **Paystack setup:**
   - Add `PAYSTACK_SECRET_KEY` and `SITE_URL` to your environment.
   - In the Paystack dashboard (Settings > API Keys & Webhooks) set the webhook URL to `https://your-domain.com/api/paystack/webhook`.
   - Test with an `sk_test_` key and Paystack's test cards before going live.
5. **WhatsApp button:** set `WHATSAPP_NUMBER`.

Buyers get a private unlock link after paying (also remembered on their device). Sales show in the admin under *Lesson sales*.

## Email alerts for bookings and sales
The site emails you for every booking (with a Reply button to the customer), emails the customer a confirmation, and emails buyers their private lesson link after payment.
1. Make a free account at brevo.com.
2. In Brevo: *Senders, Domains & IPs > Senders* > add the email you want to send from, then click the verification link Brevo emails you.
3. In Brevo: *SMTP & API > API Keys* > create a key.
4. In your host (Render) set `BREVO_API_KEY`, `MAIL_FROM` (the verified sender) and optionally `NOTIFY_EMAIL`.
5. Open `/admin` and tap **Test email**. If it says it sent, bookings will email you too.
The booking form also asks for an optional WhatsApp/phone number. In the admin each booking shows an **Open WhatsApp** link.

## Selling a PDF / Word masterclass
1. Log in at `/admin` and use **Publish a lesson or announcement**.
2. Write a short free description in *Public content* (this is what visitors see before buying).
3. Set the price in Naira (for example `5000`).
4. Under *Masterclass file*, choose your PDF, Word, PowerPoint, Excel or ZIP file (up to 25 MB), then tap **Publish**.
5. Buyers pay with Paystack, then get a Download button (and an email with their private link if email is set up). The file is stored privately and can only be downloaded with a valid purchase.
Files are saved in the `private` folder inside `DATA_DIR`, so keep the Render disk attached or they disappear on restart.

## Saving data permanently with Supabase (recommended)
Without this, your data is saved in files on the server and is ERASED whenever a free host restarts or redeploys.
1. In Supabase, open your project (or create a new one), go to **SQL Editor**, paste the contents of `supabase-setup.sql` and run it once.
2. In Supabase go to **Project Settings > API Keys** and copy the **Project URL** and the **secret** key (not the publishable/anon one).
3. In Render > Environment add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, then save (Render redeploys).
4. Check the Render logs: you should see `Storage: Supabase (your data survives restarts)`.
Bookings, lessons, orders, subscribers, pictures and masterclass PDFs are then all stored in Supabase. If Supabase can't be reached when the site starts, the site refuses to start rather than risk overwriting your saved data.

## Portfolio pictures and graphic designs
In `/admin` > **Portfolio projects** you can:
- choose one or many pictures from your phone (they are resized automatically), or
- paste a picture link. Google Drive links work if the picture is shared as "Anyone with the link" (paste the link of ONE picture, not a folder).
Titles are optional for pictures. Give pictures a category (for example "Graphic Design") and visitors get filter buttons on the Portfolio page, and can tap any picture to view it large.
For reliability, uploading directly is better than a Drive link, because Google can limit pictures that are loaded from Drive.

## Home page upgrade (animated globe, numbers, who it is for, reads, testimonials, contact)
- The home page has a rotating 3D globe behind the headline, scroll animations, floating cards, and cards that burst out from the centre.
- In `/admin` > **Home page numbers, contact & availability** you set up to four counters (for example `50+` Projects completed), your phone/WhatsApp, contact email and opening hours. Anything left empty is hidden. Do not add numbers that are not true.
- In `/admin` > **Testimonials** add real feedback from real people (with their permission). The section appears once you add one.
- "Recommended reads" shows your latest lessons, marked Free or with the price. "Browse Library" goes to the Lessons page.
- The "Who is this for?" text is in `public/index.html` if you want to change the wording.
- Footer links: Explore (Home, About, Services, Portfolio, Library, Booking) and Information (Privacy Policy, Terms of Service). Review `public/terms.html` and `public/privacy.html` and edit anything that is not true for you.
- Animations switch off automatically for visitors who have "reduce motion" turned on.

## Booking alerts with Formspree
1. In Formspree, open your form and copy its address (it looks like `https://formspree.io/f/abcd1234`).
2. In the form's settings turn OFF reCAPTCHA and "Restrict to domain", because the website sends bookings from its server.
3. In Render > Environment add `FORMSPREE_URL` with that address and save.
4. Open `/admin` and tap **Test email**. You should get a test message in the inbox linked to your Formspree form.
Every booking and every lesson sale then arrives as an email. The free Formspree plan allows 50 submissions a month. Customers see an on-screen confirmation; confirmation emails to customers need an email service such as Brevo.
