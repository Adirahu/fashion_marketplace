# Taking Kloset live

This guide connects the site to a real backend so that shoppers can create accounts and place orders, and local brands can apply, upload products and manage orders. It takes about an hour. You don't need to write any code.

You'll use:

| Service | What it does | Cost to start |
|---|---|---|
| **Supabase** (supabase.com) | Accounts, database, product photos | Free plan |
| **Netlify** (netlify.com) | Puts the website online | Free plan |
| **An email provider** (e.g. Resend or Brevo) | Sends sign-up and password-reset emails | Free plans available |

---

## 1. Try it in demo mode first

Open `index.html` in your browser. A yellow **Demo mode** bar appears at the top. In demo mode, everything is saved only in that browser, which makes it a safe place to practise:

1. Create an account. The **first** account you create in demo mode becomes the admin.
2. Sign out, create a second account, and go to **Sell your brand** to apply as a brand. Add a product with photos.
3. Sign back in as the admin. Open **Review brands** and approve the brand. Its products now appear in the shop.
4. Create a third account as a shopper, add items to the bag and place an order.
5. Sign in as the brand. The order appears under **Seller dashboard → Orders**.

To start the demo over, clear the site data in your browser.

---

## 2. Create a Supabase project

1. Go to **supabase.com**, sign up, and click **New project**.
2. Name it `kloset`. Choose a strong database password and save it somewhere safe (you won't need it day to day).
3. For **Region**, pick the one closest to your customers. For Nigeria, a Europe region such as London is usually the closest option.
4. Wait a minute or two while the project is created.

## 3. Create the database

1. In your project, open **SQL Editor** in the left menu, then click **New query**.
2. Open the file `supabase/schema.sql` from this folder, copy **all** of it, and paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned".

This creates the tables for profiles, brands, products and orders, plus the security rules. For example, a brand can only edit its own products, only admins can approve brands, and prices are always taken from the database, never from the shopper's browser. It also creates the storage space for product photos.

## 4. Connect the website to Supabase

1. In Supabase, open **Project Settings → API Keys** (on some projects it's under **Data API**).
2. Copy the **Project URL** (it looks like `https://abcdefghijkl.supabase.co`).
3. Copy the **public** key. It's labelled **anon public** or **publishable**.
4. Open `js/config.js` in a text editor (Notepad works) and paste the two values:

   ```js
   window.KLOSET_CONFIG = {
     supabaseUrl: "https://abcdefghijkl.supabase.co",
     supabaseKey: "eyJhbGciOi...your public key...",
   };
   ```

5. Save the file.

> **Never** use the `service_role` or `secret` key here. It bypasses every security rule. If you paste it by mistake, the site refuses to start and shows a warning.

## 5. Put the website online

The simplest option is Netlify Drop:

1. Make a new folder (for example `kloset-site`) and copy in only **`index.html`**, the **`css`** folder and the **`js`** folder.
2. Go to **app.netlify.com/drop** and drag that folder onto the page.
3. Netlify gives you a web address such as `https://random-name-123.netlify.app`. Create a free Netlify account to keep the site and rename it (e.g. `klosetng.netlify.app`). You can connect your own domain name later.

To update the site later, drag the folder in again from your site's **Deploys** page.

## 6. Tell Supabase your website address

Email links (confirming an account, resetting a password) need to know where to send people back to.

1. In Supabase, open **Authentication → URL Configuration**.
2. Set **Site URL** to your Netlify address, e.g. `https://klosetng.netlify.app`.
3. Under **Redirect URLs**, click **Add URL** and enter your address followed by `/**`, e.g. `https://klosetng.netlify.app/**`.

## 7. Set up email sending (important)

Supabase's built-in email is for testing only. It only sends to members of your Supabase team and has a very low hourly limit. **Real customers will not receive sign-up or password-reset emails until you connect your own email provider.**

1. Create an account with an email provider such as **Resend** (resend.com) or **Brevo** (brevo.com). Most providers ask you to verify a domain name you own (for example `kloset.com.ng`).
2. Copy the SMTP details they give you (host, port, username, password).
3. In Supabase, open **Authentication → Emails → SMTP Settings**, turn on custom SMTP and paste the details. Use a sender address on your domain, e.g. `hello@kloset.com.ng`.
4. Optional: under **Authentication → Emails → Templates**, edit the wording of the emails to match your brand.

**If you aren't ready for this yet:** under **Authentication → Sign In / Providers → Email**, you can turn off **Confirm email** so people can sign up without clicking an email link. Password-reset emails still need step 7, so set it up before you promote the site widely.

## 8. Make yourself the admin

1. Open your live site and create your own account.
2. In Supabase, go to **SQL Editor → New query**, paste this line with your email, and click **Run**:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

3. Refresh the site. **Review brands** now appears in the menu.

## 9. Test everything once

Use two or three real email addresses (yours, a friend's):

- [ ] Sign up and confirm the email. Sign out, then sign back in.
- [ ] **Forgot password** sends an email, and the link lets you set a new password.
- [ ] Apply as a brand with a logo. The application shows as "Pending review".
- [ ] Add a product with photos while pending. It does **not** appear in the shop yet.
- [ ] As admin, approve the brand. The product appears in the shop and the brand's store link works.
- [ ] As a shopper, place an order. It appears under **My orders**.
- [ ] As the brand, the order appears under **Orders** with the customer's phone and address. Change its status and check the shopper sees the new status.

---

## Running the marketplace day to day

- **New brand applications** appear under **Review brands**, with a number badge in the menu. Check the brand's Instagram and WhatsApp before approving. When you reject or suspend a brand, you can write a reason; the brand sees it in their dashboard. A rejected brand can fix its profile and save, which sends it back for review.
- **Orders** go straight to the brand. No payment is taken on the site: the brand contacts the customer on WhatsApp or by phone to arrange payment and delivery, then updates the status (Confirmed, Shipped, Delivered or Cancelled).
- **Product photos** are resized in the browser before upload (about 1400px), so they load quickly on mobile data and use little storage.
- **Your data** can be viewed in Supabase under **Table Editor**: `brands`, `products`, `orders`, `order_items` and `profiles`.

## Things to know about the free plans

- Supabase pauses free projects after about a week with no activity. Restore a paused project from the dashboard. Once real customers are using the site, upgrade to the paid plan so it never pauses and you get daily backups.
- Check **supabase.com/pricing** and **netlify.com/pricing** for current storage and bandwidth limits.

## Security notes

- The public key in `js/config.js` is designed to be visible. The rules in `supabase/schema.sql` are what protect the data.
- Keep your Supabase account, the database password and the `service_role`/`secret` key private.
- You collect names, phone numbers and addresses, so publish a privacy policy and terms of use before launch. Nigeria's Data Protection Act 2023 applies.

## Good next steps

1. **Online payments with Paystack**, using split payments so each brand is paid directly. This needs a verified Paystack business account and a small server function (Supabase Edge Function) to confirm payments securely.
2. **New-order alerts**: email or WhatsApp notifications to brands when an order comes in.
3. **Stock and sold-out** status per size.
4. **Reviews and ratings** for brands.
5. **A custom domain** (e.g. `kloset.com.ng`) on Netlify, and the same domain for email.
