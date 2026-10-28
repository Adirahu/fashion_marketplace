// Kloset data layer.
// With Supabase details in js/config.js, everything is stored in Supabase ("live" mode).
// Without them, the site runs in "demo" mode and keeps data in this browser only.
(function () {
  const cfg = window.KLOSET_CONFIG || {};
  const url = String(cfg.supabaseUrl || "");
  const key = String(cfg.supabaseKey || "");
  const configured = /^https:\/\/\S+$/.test(url) && key.length > 20 && !/YOUR_/.test(url + key);

  if (!configured) window.api = createDemoApi();
  else if (looksSecret(key)) window.api = unavailableApi("js/config.js contains a SECRET key. Replace it with the public anon/publishable key.");
  else if (!window.supabase) window.api = unavailableApi("Couldn't load the Supabase library. Check your internet connection and refresh.");
  else window.api = createLiveApi(url, key);

  function looksSecret(k) {
    if (/^sb_secret_/.test(k)) return true;
    try {
      const payload = JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.role === "service_role";
    } catch {
      return false;
    }
  }

  function unavailableApi(message) {
    const base = { mode: "live", error: message, imageMaxSize: 1400, onAuthChange() {} };
    return new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => Promise.reject(new Error(message))) });
  }

  // -------------------------------------------------------------------
  // Live: Supabase
  // -------------------------------------------------------------------
  function createLiveApi(supabaseUrl, supabaseKey) {
    const sb = window.supabase.createClient(supabaseUrl, supabaseKey);
    const BUCKET = "product-images";
    const siteUrl = () => location.origin + location.pathname;
    const must = ({ data, error }) => {
      if (error) throw error;
      return data;
    };
    const uid = async () => {
      const { data } = await sb.auth.getSession();
      const id = data.session?.user?.id;
      if (!id) throw new Error("Please sign in first");
      return id;
    };
    const PRODUCT_WITH_BRAND = "*, brand:brands!inner(id,name,slug,city,state,whatsapp,instagram,logo_url,status)";

    return {
      mode: "live",
      imageMaxSize: 1400,

      onAuthChange(cb) {
        // Supabase warns against awaiting other calls inside this callback, so defer.
        sb.auth.onAuthStateChange((event) => setTimeout(() => cb(event), 0));
      },
      async getUser() {
        const { data } = await sb.auth.getSession();
        const user = data.session?.user;
        if (!user) return null;
        const { data: profile } = await sb.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle();
        return {
          id: user.id,
          email: user.email,
          name: profile?.full_name || user.user_metadata?.full_name || user.email.split("@")[0],
          phone: profile?.phone || "",
          role: profile?.role || "customer",
        };
      },
      async signUp({ name, email, password }) {
        const data = must(await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: siteUrl() } }));
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw new Error("An account with this email already exists. Try signing in.");
        }
        return { needsConfirmation: !data.session };
      },
      async signIn({ email, password }) {
        must(await sb.auth.signInWithPassword({ email, password }));
      },
      async signOut() {
        must(await sb.auth.signOut());
      },
      async sendPasswordReset(email) {
        must(await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() }));
      },
      async updatePassword(password) {
        must(await sb.auth.updateUser({ password }));
      },
      async updateProfile({ full_name, phone }) {
        must(await sb.from("profiles").update({ full_name, phone }).eq("id", await uid()));
      },

      async listProducts() {
        return must(await sb.from("products").select(PRODUCT_WITH_BRAND).eq("is_active", true).eq("brand.status", "approved").order("created_at", { ascending: false }).limit(500));
      },
      async listBrands() {
        return must(await sb.from("brands").select("id,name,slug,description,city,state,whatsapp,instagram,logo_url,approved_at").eq("status", "approved").order("approved_at", { ascending: true }));
      },

      async getMyBrand() {
        return must(await sb.from("brands").select("*").eq("owner_id", await uid()).maybeSingle());
      },
      async saveBrand(fields, brandId) {
        if (brandId) return must(await sb.from("brands").update(fields).eq("id", brandId).select().single());
        return must(await sb.from("brands").insert({ ...fields, owner_id: await uid() }).select().single());
      },
      async listMyProducts(brandId) {
        return must(await sb.from("products").select("*").eq("brand_id", brandId).order("created_at", { ascending: false }));
      },
      async saveProduct(fields, productId, brandId) {
        if (productId) return must(await sb.from("products").update(fields).eq("id", productId).select().single());
        return must(await sb.from("products").insert({ ...fields, brand_id: brandId }).select().single());
      },
      async deleteProduct(id) {
        must(await sb.from("products").delete().eq("id", id));
      },
      async uploadImage(blob) {
        const path = `${await uid()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        must(await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" }));
        return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      },
      async removeImages(urls) {
        const marker = `/storage/v1/object/public/${BUCKET}/`;
        const paths = urls.filter((u) => String(u).includes(marker)).map((u) => decodeURIComponent(u.split(marker)[1]));
        if (paths.length) must(await sb.storage.from(BUCKET).remove(paths));
      },

      async placeOrder(items, contact) {
        return must(await sb.rpc("place_order", { items, contact }));
      },
      async listMyOrders() {
        return must(await sb.from("orders").select("*, items:order_items(*), brand:brands(name,slug,whatsapp)").eq("buyer_id", await uid()).order("created_at", { ascending: false }));
      },
      async listBrandOrders(brandId) {
        return must(await sb.from("orders").select("*, items:order_items(*)").eq("brand_id", brandId).order("created_at", { ascending: false }));
      },
      async setOrderStatus(id, status) {
        must(await sb.from("orders").update({ status }).eq("id", id));
      },

      async listAllBrands() {
        return must(await sb.from("brands").select("*, owner:profiles(full_name,email), products(count)").order("created_at", { ascending: false }));
      },
      async setBrandStatus(id, status, note) {
        must(await sb.rpc("set_brand_status", { target: id, new_status: status, note: note || null }));
      },
    };
  }

  // -------------------------------------------------------------------
  // Demo: same functions, stored in localStorage
  // -------------------------------------------------------------------
  function createDemoApi() {
    const KEY = "vh_demo_db_v2";
    const listeners = [];
    let db;
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
    if (!db || !Array.isArray(db.products)) db = emptyDemoDb();

    const persist = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch {
        throw new Error("Demo storage is full. Remove some products or connect Supabase.");
      }
    };
    try { persist(); } catch { /* storage blocked: demo still works until refresh */ }

    const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    const now = () => new Date().toISOString();
    const reply = (value) => new Promise((resolve) => setTimeout(() => resolve(value == null ? value : JSON.parse(JSON.stringify(value))), 150));
    const emit = (event) => listeners.forEach((cb) => setTimeout(() => cb(event), 0));
    const newest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
    const me = () => db.users.find((u) => u.id === db.session) || null;
    const requireUser = () => {
      const u = me();
      if (!u) throw new Error("Please sign in first");
      return u;
    };
    const requireAdmin = () => {
      const u = requireUser();
      if (u.role !== "admin") throw new Error("Only Kloset admins can review brands");
      return u;
    };
    const myBrand = () => {
      const u = me();
      return u ? db.brands.find((b) => b.owner_id === u.id) || null : null;
    };
    const brandFields = (f) => {
      const out = {};
      ["name", "description", "city", "state", "whatsapp", "instagram", "logo_url"].forEach((k) => { if (k in f) out[k] = f[k]; });
      return out;
    };
    const slugFor = (name) => {
      const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "brand";
      let slug = base;
      for (let n = 2; db.brands.some((b) => b.slug === slug); n++) slug = `${base}-${n}`;
      return slug;
    };

    return {
      mode: "demo",
      imageMaxSize: 800,

      onAuthChange(cb) {
        listeners.push(cb);
        setTimeout(() => cb("INITIAL_SESSION"), 0);
      },
      async getUser() {
        const u = me();
        return reply(u && { id: u.id, email: u.email, name: u.full_name, phone: u.phone, role: u.role });
      },
      async signUp({ name, email }) {
        email = email.toLowerCase();
        if (db.users.some((u) => u.email === email)) throw new Error("An account with this email already exists. Try signing in.");
        // The first account created in demo mode becomes the admin, so you can try brand approval.
        const user = { id: newId(), email, full_name: name || email.split("@")[0], phone: "", role: db.users.length ? "customer" : "admin" };
        db.users.push(user);
        db.session = user.id;
        persist();
        emit("SIGNED_IN");
        return reply({ needsConfirmation: false });
      },
      async signIn({ email }) {
        const u = db.users.find((x) => x.email === email.toLowerCase());
        if (!u) throw new Error("Invalid login credentials");
        db.session = u.id;
        persist();
        emit("SIGNED_IN");
        return reply(null);
      },
      async signOut() {
        db.session = null;
        persist();
        emit("SIGNED_OUT");
        return reply(null);
      },
      async sendPasswordReset() {
        throw new Error("Password reset emails work once Supabase is connected.");
      },
      async updatePassword() {
        requireUser();
        return reply(null);
      },
      async updateProfile({ full_name, phone }) {
        Object.assign(requireUser(), { full_name, phone });
        persist();
        emit("USER_UPDATED");
        return reply(null);
      },

      async listProducts() {
        const live = new Map(db.brands.filter((b) => b.status === "approved").map((b) => [b.id, b]));
        return reply(db.products.filter((p) => p.is_active && live.has(p.brand_id)).sort(newest).map((p) => ({ ...p, brand: live.get(p.brand_id) })));
      },
      async listBrands() {
        return reply(db.brands.filter((b) => b.status === "approved").sort((a, b) => String(a.approved_at).localeCompare(String(b.approved_at))));
      },

      async getMyBrand() {
        requireUser();
        return reply(myBrand());
      },
      async saveBrand(fields, brandId) {
        const u = requireUser();
        const existing = myBrand();
        if (brandId) {
          if (!existing || existing.id !== brandId) throw new Error("You don't have permission to do that.");
          Object.assign(existing, brandFields(fields));
          if (existing.status === "rejected") Object.assign(existing, { status: "pending", review_note: null });
          persist();
          return reply(existing);
        }
        if (existing) throw new Error("You already have a brand on Kloset.");
        const brand = { instagram: "", logo_url: null, ...brandFields(fields), id: newId(), owner_id: u.id, slug: slugFor(fields.name), status: "pending", review_note: null, created_at: now(), approved_at: null };
        db.brands.push(brand);
        persist();
        return reply(brand);
      },
      async listMyProducts(brandId) {
        return reply(db.products.filter((p) => p.brand_id === brandId).sort(newest));
      },
      async saveProduct(fields, productId) {
        const brand = myBrand();
        if (!brand) throw new Error("Set up your brand first.");
        if (productId) {
          const p = db.products.find((x) => x.id === productId && x.brand_id === brand.id);
          if (!p) throw new Error("You don't have permission to do that.");
          Object.assign(p, fields, { updated_at: now() });
          persist();
          return reply(p);
        }
        const p = { ...fields, id: newId(), brand_id: brand.id, created_at: now(), updated_at: now() };
        db.products.push(p);
        persist();
        return reply(p);
      },
      async deleteProduct(id) {
        const brand = myBrand();
        db.products = db.products.filter((p) => !(p.id === id && brand && p.brand_id === brand.id));
        persist();
        return reply(null);
      },
      async uploadImage(blob) {
        requireUser();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Couldn't read that photo."));
          reader.readAsDataURL(blob);
        });
      },
      async removeImages() {},

      async placeOrder(items, contact) {
        const u = requireUser();
        if (!Array.isArray(items) || !items.length) throw new Error("Your bag is empty");
        if (!["name", "phone", "address", "city", "state"].every((k) => String(contact[k] || "").trim())) {
          throw new Error("Please fill in your name, phone number and delivery address");
        }
        const lines = items.map((i) => {
          const p = db.products.find((x) => x.id === i.product_id);
          const b = p && db.brands.find((x) => x.id === p.brand_id);
          if (!p || !p.is_active || !b || b.status !== "approved" || !(i.qty >= 1 && i.qty <= 20)) {
            throw new Error("Some items in your bag are no longer available. Please refresh and try again.");
          }
          return { p, b, size: i.size || null, qty: i.qty };
        });
        const results = [];
        [...new Set(lines.map((l) => l.b))].forEach((b) => {
          const orderItems = lines.filter((l) => l.b === b).map((l) => ({ id: newId(), product_id: l.p.id, product_name: l.p.name, image: l.p.images[0], size: l.size, unit_price: l.p.price, qty: l.qty }));
          const order = {
            id: newId(), order_number: db.nextOrder++, buyer_id: u.id, brand_id: b.id, status: "new",
            total: orderItems.reduce((s, i) => s + i.unit_price * i.qty, 0),
            buyer_name: contact.name.trim(), buyer_phone: contact.phone.trim(), buyer_email: u.email,
            address: contact.address.trim(), city: contact.city.trim(), state: contact.state.trim(), note: String(contact.note || "").trim(),
            created_at: now(), updated_at: now(), items: orderItems,
          };
          db.orders.push(order);
          results.push({ order_id: order.id, order_number: order.order_number, brand_id: b.id, brand_name: b.name, brand_whatsapp: b.whatsapp, total: order.total });
        });
        persist();
        return reply(results);
      },
      async listMyOrders() {
        const u = requireUser();
        return reply(db.orders.filter((o) => o.buyer_id === u.id).sort(newest).map((o) => {
          const b = db.brands.find((x) => x.id === o.brand_id);
          return { ...o, brand: b ? { name: b.name, slug: b.slug, whatsapp: b.whatsapp } : null };
        }));
      },
      async listBrandOrders(brandId) {
        const brand = myBrand();
        return reply(brand && brand.id === brandId ? db.orders.filter((o) => o.brand_id === brandId).sort(newest) : []);
      },
      async setOrderStatus(id, status) {
        const brand = myBrand();
        const order = db.orders.find((o) => o.id === id && brand && o.brand_id === brand.id);
        if (!order) throw new Error("You don't have permission to do that.");
        Object.assign(order, { status, updated_at: now() });
        persist();
        return reply(null);
      },

      async listAllBrands() {
        requireAdmin();
        return reply(db.brands.slice().sort(newest).map((b) => {
          const owner = db.users.find((u) => u.id === b.owner_id);
          return { ...b, owner: owner ? { full_name: owner.full_name, email: owner.email } : { full_name: "Sample brand", email: "" }, products: [{ count: db.products.filter((p) => p.brand_id === b.id).length }] };
        }));
      },
      async setBrandStatus(id, status, note) {
        requireAdmin();
        const b = db.brands.find((x) => x.id === id);
        if (!b) throw new Error("Brand not found");
        Object.assign(b, { status, review_note: note || null });
        if (status === "approved" && !b.approved_at) b.approved_at = now();
        persist();
        return reply(null);
      },
    };
  }

  // The demo starts empty, like a new live site: products appear once a brand
  // applies, gets approved by the admin and uploads them.
  function emptyDemoDb() {
    return { users: [], session: null, brands: [], products: [], orders: [], nextOrder: 1001 };
  }
})();
