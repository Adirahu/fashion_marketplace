# Kloset — Nigerian Fashion Marketplace

A marketplace for independent Nigerian fashion labels. Shoppers browse, save and order pieces. Brands apply to sell, upload products with photos, and manage their orders. An admin approves each brand before it goes live.

Built with plain HTML, CSS and JavaScript, with [Supabase](https://supabase.com) for accounts, the database and photo storage.

## Run it

- **Demo mode** (no setup): open `index.html` in a browser. Data is saved only in that browser, and the first account you create becomes the admin.
- **Live mode**: follow [SETUP.md](SETUP.md) to connect Supabase and put the site online.

## What's included

**Shoppers**
- Search, category and clothing-style filters, wishlist
- Product pages with up to 4 photos, size selection and shareable links
- Bag with sizes and quantities
- Checkout that creates one order per brand, plus "My orders" with status tracking
- Real accounts: sign up, sign in, password reset, profile

**Brands**
- Brand application (name, description, location, WhatsApp, Instagram, logo)
- Seller dashboard: add, edit, hide and delete products; photos are resized before upload
- Orders with customer contact details, delivery address and status updates
- A public store page with a shareable link (`#/brand/your-brand`)

**Admin**
- Review brands: approve, reject with a reason, suspend or reinstate

Orders are "order requests": no payment is taken on the site. Each brand contacts the customer to arrange payment and delivery. See SETUP.md for adding Paystack later.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Page layout, dialogs and forms |
| `css/style.css` | Styling, including mobile |
| `js/config.js` | Your Supabase project URL and public key |
| `js/api.js` | Data layer: Supabase in live mode, browser storage in demo mode |
| `js/script.js` | Site behaviour: shop, cart, checkout, seller center, admin |
| `supabase/schema.sql` | Database tables, security rules and photo storage. Run once in Supabase. |
| `backup/demo-2026-10-14/` | The previous front-end-only version |
