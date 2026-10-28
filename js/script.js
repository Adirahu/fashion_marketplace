/* Kloset storefront. All data goes through `api` (js/api.js). */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const DEFAULT_SIZES = { Clothing: "S, M, L, XL", Shoes: "40, 41, 42, 43, 44", Accessories: "One size" };
const NG_STATES = ["Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"];
const ORDER_STATUS = { new: "New", confirmed: "Confirmed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };
const BRAND_STATUS = { pending: "Pending review", approved: "Live", rejected: "Not approved", suspended: "Suspended" };
const VIEWS = { home: "#viewHome", brand: "#viewBrand", sell: "#viewSell", orders: "#viewOrders", admin: "#viewAdmin" };
const GRID_TITLES = {
  All: ["CURATED FOR YOU", "Trending now"],
  "New In": ["JUST LANDED", "New in"],
  Clothing: ["SHOP", "Clothing"],
  Shoes: ["SHOP", "Shoes"],
  Accessories: ["SHOP", "Accessories"],
  Wishlist: ["SAVED BY YOU", "Your wishlist"],
};

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const state = {
  user: null,
  userSeq: 0,
  products: [],
  brands: [],
  loaded: false,
  catalogError: null,
  myBrand: undefined, // undefined = not loaded yet, null = no brand
  myProducts: [],
  brandOrders: [],
  sellerLoading: false,
  sellerError: null,
  myOrders: undefined,
  myOrdersError: null,
  adminBrands: undefined,
  adminError: null,
  cart: store.get("vh_cart_v2", []),
  wishlist: store.get("vh_wishlist_v2", []),
  category: "All",
  style: "All",
  search: "",
  authMode: "signin",
  afterAuth: null,
  view: null,
  viewParam: null,
  scrollTarget: null, // section to scroll to after switching to the home view
  returnHash: "#/",
  sellTab: "products",
  adminTab: "pending",
  editingProduct: null,
  pendingImages: [],
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const money = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const safeUrl = (u) => (/^(https:\/\/|data:image\/|blob:)/i.test(String(u || "")) ? String(u) : "");
const digits = (s) => String(s || "").replace(/\D/g, "");
const fmtDate = (d) => new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const brandPlace = (b) => [...new Set([b?.city, b?.state].filter(Boolean))].join(", ");
const storeUrl = (b) => `${location.origin}${location.pathname}#/brand/${encodeURIComponent(b.slug)}`;
const findProduct = (id) => state.products.find((p) => p.id === id);
const sizeLabel = (size) => (size && !/^one size$/i.test(size) ? size : "");

function toIntlPhone(s) {
  let d = digits(s);
  if (d.startsWith("0") && d.length === 11) d = "234" + d.slice(1);
  return d;
}

function waLink(phone, text) {
  const d = toIntlPhone(phone);
  return d.length >= 10 ? `https://wa.me/${d}${text ? "?text=" + encodeURIComponent(text) : ""}` : "";
}

function friendly(err) {
  const m = (err && (err.message || err.error_description)) || String(err);
  if (/Invalid login credentials/i.test(m)) return "Wrong email or password.";
  if (/Email not confirmed/i.test(m)) return "Please confirm your email first. Check your inbox for the link.";
  if (/rate limit|too many/i.test(m)) return "Too many attempts. Please wait a few minutes and try again.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Can't reach the server. Check your internet connection.";
  if (/owner_id/i.test(m) && /duplicate|unique/i.test(m)) return "You already have a brand on Kloset.";
  if (/violates check constraint/i.test(m)) return "Some details aren't valid. Please check the form and try again.";
  if (/row-level security|permission denied/i.test(m)) return "You don't have permission to do that.";
  return m;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), Math.max(2400, msg.length * 55));
}

// Disables a button while `fn` runs; shows any error as a toast.
async function busy(btn, label, fn) {
  if (btn?.disabled) return;
  const html = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = label; }
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(friendly(err));
  } finally {
    if (btn?.isConnected) { btn.disabled = false; btn.innerHTML = html; }
  }
}

function imgTag(src, alt) {
  if (!src) return `<div class="image-placeholder">${esc(String(alt || "?").slice(0, 1))}</div>`;
  return `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'image-placeholder',textContent:this.alt.slice(0,1)}))">`;
}

const emptyBlock = (title, text, extra = "") => `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(text)}</p>${extra ? `<div class="empty-actions">${extra}</div>` : ""}</div>`;
const pageLoading = () => `<section class="page"><div class="empty-state"><div class="spinner" aria-hidden="true"></div><p>Loading…</p></div></section>`;
const errorPage = (msg, action) => `<section class="page narrow">${emptyBlock("Something went wrong", msg, `<button class="primary-btn" data-action="${action}">Try again</button>`)}</section>`;
const tab = (key, label, current, action) => `<button class="tab ${key === current ? "active" : ""}" data-action="${action}" data-id="${key}">${esc(label)}</button>`;

function fillStateSelect(select, value = "") {
  if (!select) return;
  select.innerHTML = `<option value="">Choose state</option>` + NG_STATES.map((s) => `<option ${s === value ? "selected" : ""}>${s}</option>`).join("");
}

function showNotice(title, text) {
  $("#noticeTitle").textContent = title;
  $("#noticeText").textContent = text;
  openModal("noticeModal");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Link copied");
  } catch {
    prompt("Copy this link:", text);
  }
}

// Resizes photos in the browser before upload so they load fast on mobile data.
function compressImage(file, max = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file (JPG, PNG or WebP)."));
    if (file.size > 20 * 1024 * 1024) return reject(new Error("That photo is too large. Please use one under 20 MB."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo."))), "image/jpeg", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo. Please use a JPG or PNG."));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------
// Panels, modals, routing
// ---------------------------------------------------------------------
function openModal(id) { $("#" + id).classList.add("open"); }
function closeModal(id) {
  $("#" + id).classList.remove("open");
  if (id === "authModal") $("#authForm").reset();
}
function openDrawer() { $("#cartDrawer").classList.add("open"); $("#overlay").classList.add("open"); }
function closeDrawer() { $("#cartDrawer").classList.remove("open"); $("#overlay").classList.remove("open"); }
function openSidebar() { $("#sidebar").classList.add("open"); $("#overlay").classList.add("open"); }
function closeSidebar() { $("#sidebar").classList.remove("open"); $("#overlay").classList.remove("open"); }

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  return { name: parts[0] || "home", param: parts[1] || null };
}

function router() {
  if (/access_token=|error_description=/.test(location.hash)) return showView("home"); // Supabase auth redirect
  const r = parseHash();
  if (r.name === "product") {
    if (!state.view) showView("home");
    openProduct(r.param);
    return;
  }
  closeModal("productModal");
  showView(VIEWS[r.name] ? r.name : "home", r.param);
}

function showView(name, param = null) {
  const changed = state.view !== name || state.viewParam !== param;
  state.view = name;
  state.viewParam = param;
  Object.entries(VIEWS).forEach(([v, sel]) => { $(sel).hidden = v !== name; });
  renderView();
  updateNav();
  if (state.scrollTarget && name === "home") {
    const target = state.scrollTarget;
    state.scrollTarget = null;
    $(target).scrollIntoView({ behavior: "smooth" });
  } else if (changed) {
    window.scrollTo({ top: 0 });
  }
}

function renderView() {
  ({ home: renderHome, brand: renderBrandPage, sell: renderSell, orders: renderOrders, admin: renderAdmin })[state.view]?.();
}

function goProduct(id) {
  if (parseHash().name !== "product") state.returnHash = location.hash || "#/";
  location.hash = "#/product/" + encodeURIComponent(id);
}

function closeProduct() {
  closeModal("productModal");
  if (parseHash().name === "product") location.hash = state.returnHash || "#/";
}

function goShop(category, style = "All") {
  state.category = category;
  state.style = style;
  state.search = "";
  $("#searchInput").value = "";
  closeSidebar();
  goHome(category === "All" ? null : "#shop");
}

// Shows the home view, then scrolls to `target` (or the top).
function goHome(target) {
  state.scrollTarget = target;
  if (state.view !== "home" || parseHash().name !== "home") location.hash = "#/";
  else {
    showView("home");
    if (!target) window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// Updates every badge showing a count (header, menu and phone tab bar).
function setCount(kind, n) {
  $$(`[data-count="${kind}"]`).forEach((el) => {
    el.textContent = n;
    el.hidden = !n;
  });
}

function updateNav() {
  const u = state.user;
  $("#headerAuth").textContent = u ? "Account" : "Sign in";
  $("#profileName").textContent = u ? u.name : "Guest";
  $("#profileStatus").textContent = u ? u.email : "Sign in to continue";
  $("#avatar").textContent = u ? (u.name[0] || "U").toUpperCase() : "G";
  setCount("wish", state.wishlist.length);
  $$("[data-sell-label]").forEach((el) => { el.textContent = state.myBrand ? "Seller dashboard" : "Sell on Kloset"; });
  $("#adminNav").hidden = u?.role !== "admin";
  const pending = (state.adminBrands || []).filter((b) => b.status === "pending").length;
  $("#pendingCount").hidden = !pending;
  $("#pendingCount").textContent = pending;
  $$(".active[data-category], .active[data-view]").forEach((el) => el.classList.remove("active"));
  const selector = state.view === "home" ? `.nav-item[data-category="${state.category}"]` : `[data-view="${state.view}"]`;
  $$(selector).forEach((el) => el.classList.add("active"));
}

// ---------------------------------------------------------------------
// Loading data
// ---------------------------------------------------------------------
async function refreshCatalog() {
  try {
    const [products, brands] = await Promise.all([api.listProducts(), api.listBrands()]);
    state.products = products;
    state.brands = brands;
    state.catalogError = null;
    state.loaded = true;
    pruneCart();
  } catch (err) {
    console.error(err);
    state.catalogError = friendly(err);
    state.loaded = true;
  }
  if (state.view === "home" || state.view === "brand") renderView(); // other views don't use the catalog
  renderCart();
  const r = parseHash();
  if (r.name === "product" && !$("#productModal").classList.contains("open")) openProduct(r.param);
}

async function refreshUser() {
  const seq = ++state.userSeq;
  let user;
  try {
    user = await api.getUser();
  } catch (err) {
    console.error(err);
    return;
  }
  if (seq !== state.userSeq) return;
  const changed = (user?.id || null) !== (state.user?.id || null);
  state.user = user;
  if (changed) {
    Object.assign(state, { myBrand: undefined, myProducts: [], brandOrders: [], sellerError: null, myOrders: undefined, myOrdersError: null, adminBrands: undefined, adminError: null });
    renderView();
    if (user) loadSeller();
    if (user?.role === "admin") loadAdmin();
  }
  updateNav();
}

async function loadSeller() {
  if (!state.user || state.sellerLoading) return;
  state.sellerLoading = true;
  state.sellerError = null;
  try {
    const brand = await api.getMyBrand();
    const [products, orders] = brand ? await Promise.all([api.listMyProducts(brand.id), api.listBrandOrders(brand.id)]) : [[], []];
    Object.assign(state, { myBrand: brand, myProducts: products, brandOrders: orders });
  } catch (err) {
    console.error(err);
    state.sellerError = friendly(err);
  } finally {
    state.sellerLoading = false;
  }
  if (state.view === "sell") renderSell();
  updateNav();
}

async function loadMyOrders() {
  if (!state.user || state.myOrdersLoading) return;
  state.myOrdersLoading = true;
  try {
    state.myOrders = await api.listMyOrders();
    state.myOrdersError = null;
  } catch (err) {
    console.error(err);
    state.myOrdersError = friendly(err);
  } finally {
    state.myOrdersLoading = false;
  }
  if (state.view === "orders") renderOrders();
}

async function loadAdmin() {
  if (state.user?.role !== "admin" || state.adminLoading) return;
  state.adminLoading = true;
  try {
    state.adminBrands = await api.listAllBrands();
    state.adminError = null;
  } catch (err) {
    console.error(err);
    state.adminError = friendly(err);
  } finally {
    state.adminLoading = false;
  }
  if (state.view === "admin") renderAdmin();
  updateNav();
}

// ---------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------
function filteredProducts() {
  let list = state.products;
  if (state.category === "Wishlist") list = list.filter((p) => state.wishlist.includes(p.id));
  else if (state.category === "New In") list = list.slice(0, 12);
  else if (state.category !== "All") list = list.filter((p) => p.category === state.category);
  if (state.category === "Clothing" && state.style !== "All") list = list.filter((p) => p.subcategory === state.style);
  const q = state.search.trim().toLowerCase();
  if (q) list = list.filter((p) => `${p.name} ${p.brand?.name} ${p.category} ${p.subcategory || ""} ${brandPlace(p.brand)}`.toLowerCase().includes(q));
  return list;
}

const isNew = (p) => Date.now() - new Date(p.created_at).getTime() < 21 * 86400000;

function productCard(p) {
  const liked = state.wishlist.includes(p.id);
  const b = p.brand || {};
  const second = safeUrl(p.images?.[1]);
  return `<article class="product-card">
    <div class="product-image" data-product="${esc(p.id)}">
      ${isNew(p) ? `<span class="badge-new">New</span>` : ""}
      <button class="heart ${liked ? "liked" : ""}" data-wish="${esc(p.id)}" aria-label="${liked ? "Remove from wishlist" : "Save to wishlist"}">${liked ? "♥" : "♡"}</button>
      ${imgTag(safeUrl(p.images?.[0]), p.name)}
      ${second ? `<img class="alt" src="${esc(second)}" alt="" loading="lazy">` : ""}
    </div>
    <div class="product-info">
      <a class="brand-name" href="#/brand/${encodeURIComponent(b.slug || "")}">${esc(b.name)}</a>
      <h3>${esc(p.name)}</h3>
      ${p.category === "Clothing" && p.subcategory ? `<span class="product-style">${esc(p.subcategory)}</span>` : ""}
      <div class="price-row"><span class="price">${money(p.price)}</span><button class="add-btn" data-add="${esc(p.id)}">+ Add</button></div>
    </div>
  </article>`;
}

function renderHome() {
  // Until the first brand uploads, the shop shows a "coming soon" block instead of products.
  const launching = state.loaded && !state.catalogError && !state.products.length;
  const [eyebrow, title] = GRID_TITLES[state.category] || GRID_TITLES.All;
  $("#gridEyebrow").textContent = launching ? "COMING SOON" : state.search ? "SEARCH" : eyebrow;
  $("#gridTitle").textContent = launching ? "Fresh collections, landing soon" : state.search ? `Results for “${state.search}”` : title;
  $("#filters").hidden = launching;
  $$(".filter").forEach((b) => b.classList.toggle("active", b.dataset.filter === state.category || (b.dataset.filter === "All" && state.category === "New In")));
  $("#clothingStyles").hidden = launching || state.category !== "Clothing";
  $$(".style-filter").forEach((b) => b.classList.toggle("active", b.dataset.style === state.style));

  const list = state.loaded ? filteredProducts() : [];
  $("#productGrid").innerHTML = list.map(productCard).join("");
  const empty = $("#emptyState");
  empty.hidden = list.length > 0;
  empty.className = launching ? "" : "empty-state";
  if (!list.length) {
    let html;
    if (!state.loaded) html = `<div class="spinner" aria-hidden="true"></div><p>Loading pieces…</p>`;
    else if (state.catalogError) html = `<h3>Couldn't load products</h3><p>${esc(state.catalogError)}</p><div class="empty-actions"><button class="primary-btn" data-action="reload-catalog">Try again</button></div>`;
    else if (launching) html = launchHtml();
    else if (state.category === "Wishlist" && !state.search) html = `<h3>Nothing saved yet</h3><p>Tap ♡ on any piece to save it here.</p>`;
    else html = `<h3>No pieces found</h3><p>Try another search or category.</p>`;
    empty.innerHTML = html;
  }
  renderBrandStrip();
}

function launchHtml() {
  return `<div class="launch pattern">
    <div>
      <h3>The first designers are setting up their stores</h3>
      <p>Pieces from independent Nigerian labels will appear here as soon as brands upload them. Check back soon.</p>
    </div>
    <div class="launch-card">
      <strong>Are you a designer?</strong>
      <span>Be one of the first labels on Kloset.</span>
      <a class="primary-btn gold" href="#/sell">Open your store <span aria-hidden="true">→</span></a>
    </div>
  </div>`;
}

function renderBrandStrip() {
  $("#brands").hidden = !state.brands.length; // no approved brands yet: the seller band below invites designers instead
  const counts = {};
  state.products.forEach((p) => { counts[p.brand_id] = (counts[p.brand_id] || 0) + 1; });
  const tiles = state.brands.map((b) => `<a class="brand-tile" href="#/brand/${encodeURIComponent(b.slug)}">
      ${b.logo_url ? `<img class="brand-logo" src="${esc(safeUrl(b.logo_url))}" alt="">` : `<span class="brand-mono">${esc(b.name.slice(0, 1).toUpperCase())}</span>`}
      <span class="brand-origin">${esc(brandPlace(b).toUpperCase() || "INDEPENDENT LABEL")}</span>
      <strong>${esc(b.name)}</strong>
      <span class="brand-description">${esc(b.description ? (b.description.length > 110 ? b.description.slice(0, 107) + "…" : b.description) : "Independent fashion label.")}</span>
      <span class="brand-count">${plural(counts[b.id] || 0, "piece")} →</span>
    </a>`);
  tiles.push(`<a class="brand-tile cta" href="#/sell">
      <span class="brand-origin">FOR DESIGNERS</span>
      <strong>Your label<br>here</strong>
      <span class="brand-description">Apply to open your own store on Kloset and reach new customers.</span>
      <span class="brand-count">Apply now →</span>
    </a>`);
  $("#brandStrip").innerHTML = tiles.join("");
}

function renderBrandPage() {
  const el = $("#viewBrand");
  if (!state.loaded) { el.innerHTML = pageLoading(); return; }
  const b = state.brands.find((x) => x.slug === state.viewParam);
  if (!b) {
    el.innerHTML = `<section class="page narrow">${emptyBlock("This store isn't available", "It may still be under review, or it's no longer on Kloset.", '<a class="primary-btn" href="#/">Back to the shop</a>')}</section>`;
    return;
  }
  const items = state.products.filter((p) => p.brand_id === b.id);
  const wa = waLink(b.whatsapp, `Hi ${b.name}, I found your store on Kloset.`);
  el.innerHTML = `<section class="page">
    <div class="store-hero pattern">
      <div class="store-logo">${b.logo_url ? `<img src="${esc(safeUrl(b.logo_url))}" alt="">` : esc(b.name.slice(0, 1))}</div>
      <div class="store-copy">
        <p class="eyebrow">${esc(brandPlace(b).toUpperCase() || "INDEPENDENT LABEL")}</p>
        <h1>${esc(b.name)}</h1>
        ${b.description ? `<p>${esc(b.description)}</p>` : ""}
        <div class="store-actions">
          ${wa ? `<a class="primary-btn" href="${esc(wa)}" target="_blank" rel="noopener">Chat on WhatsApp</a>` : ""}
          ${b.instagram ? `<a class="secondary-btn" href="https://instagram.com/${encodeURIComponent(b.instagram)}" target="_blank" rel="noopener">@${esc(b.instagram)}</a>` : ""}
          <button class="secondary-btn" data-action="copy-link" data-id="${esc(storeUrl(b))}">Copy store link</button>
        </div>
      </div>
    </div>
    <div class="section-heading"><div><p class="eyebrow">THE COLLECTION</p><h2>${plural(items.length, "piece")}</h2></div></div>
    ${items.length ? `<div class="product-grid">${items.map(productCard).join("")}</div>` : emptyBlock("No pieces listed yet", "Check back soon.")}
  </section>`;
}

function openProduct(id) {
  const p = findProduct(id);
  if (!p) {
    if (state.loaded) {
      toast("This piece is no longer available");
      location.hash = "#/";
    }
    return;
  }
  const images = (p.images || []).map(safeUrl).filter(Boolean);
  const sizes = p.sizes?.length ? p.sizes : ["One size"];
  const b = p.brand || {};
  const wa = waLink(b.whatsapp, `Hi ${b.name}, I'm interested in "${p.name}" (${money(p.price)}) on Kloset.`);
  $("#productDetail").innerHTML = `<div class="detail">
    <div class="detail-media">
      <div class="detail-img" id="detailMain">${imgTag(images[0], p.name)}</div>
      ${images.length > 1 ? `<div class="detail-thumbs">${images.map((src, i) => `<button class="${i ? "" : "active"}" data-thumb="${esc(src)}" aria-label="Photo ${i + 1}"><img src="${esc(src)}" alt=""></button>`).join("")}</div>` : ""}
    </div>
    <div class="detail-copy">
      <span class="eyebrow">${esc(p.category)}${p.category === "Clothing" && p.subcategory ? " · " + esc(p.subcategory) : ""}</span>
      <a class="detail-brand" href="#/brand/${encodeURIComponent(b.slug || "")}">${esc(b.name)}${brandPlace(b) ? " · " + esc(brandPlace(b)) : ""}</a>
      <h2>${esc(p.name)}</h2>
      <div class="detail-price">${money(p.price)}</div>
      <p class="detail-description">${esc(p.description || "A carefully made piece from an independent fashion label.")}</p>
      <div class="field"><label for="detailSize">SIZE</label><select id="detailSize">${sizes.map((s) => `<option>${esc(s)}</option>`).join("")}</select></div>
      <button class="primary-btn full" data-detail-add="${esc(p.id)}">Add to bag →</button>
      ${wa ? `<a class="secondary-btn full center" href="${esc(wa)}" target="_blank" rel="noopener">Ask the brand on WhatsApp</a>` : ""}
    </div>
  </div>`;
  openModal("productModal");
}

function toggleWish(id) {
  const had = state.wishlist.includes(id);
  state.wishlist = had ? state.wishlist.filter((x) => x !== id) : [...state.wishlist, id];
  store.set("vh_wishlist_v2", state.wishlist);
  renderView();
  updateNav();
  toast(had ? "Removed from wishlist" : "Saved to your wishlist");
}

// ---------------------------------------------------------------------
// Cart and checkout
// ---------------------------------------------------------------------
function saveCart() { store.set("vh_cart_v2", state.cart); }

function pruneCart() {
  const before = state.cart.length;
  state.cart = state.cart.filter((l) => findProduct(l.id));
  if (state.cart.length !== before) {
    saveCart();
    toast("Some items in your bag are no longer available and were removed");
  }
}

function addToCart(id, size) {
  if (!findProduct(id)) return;
  const line = state.cart.find((l) => l.id === id && (l.size || "") === (size || ""));
  if (line) line.qty = Math.min(20, line.qty + 1);
  else state.cart.push({ id, size: size || null, qty: 1 });
  saveCart();
  renderCart();
  const icon = $("#headerCart");
  icon.classList.remove("cart-pop");
  void icon.offsetWidth;
  icon.classList.add("cart-pop");
  toast("Added to your bag");
}

function quickAdd(id) {
  const p = findProduct(id);
  if (!p) return;
  if ((p.sizes || []).length > 1) {
    goProduct(id);
    toast("Choose your size");
  } else {
    addToCart(id, p.sizes?.[0] || null);
  }
}

function renderCart() {
  setCount("cart", state.cart.reduce((s, l) => s + l.qty, 0));
  const box = $("#cartItems");
  if (!state.cart.length) {
    box.innerHTML = `<div class="empty-state"><h3>Your bag is empty</h3><p>Add something you love from the collection.</p></div>`;
  } else if (!state.loaded) {
    box.innerHTML = `<div class="empty-state"><div class="spinner" aria-hidden="true"></div></div>`;
  } else {
    box.innerHTML = state.cart.map((l, i) => {
      const p = findProduct(l.id);
      if (!p) return "";
      return `<div class="cart-row">
        <div class="cart-thumb">${imgTag(safeUrl(p.images?.[0]), p.name)}</div>
        <div><h4>${esc(p.name)}</h4><p>${esc(p.brand?.name)}${sizeLabel(l.size) ? " · Size " + esc(l.size) : ""} · ${money(p.price)}</p>
          <div class="qty"><button data-minus="${i}" aria-label="Fewer">−</button><span>${l.qty}</span><button data-plus="${i}" aria-label="More">+</button></div>
          <button class="remove" data-remove="${i}">Remove</button>
        </div>
        <strong>${money(p.price * l.qty)}</strong>
      </div>`;
    }).join("");
  }
  $("#cartTotal").textContent = money(cartTotal());
  $("#checkoutBtn").disabled = !state.cart.length;
}

function cartTotal() {
  return state.cart.reduce((sum, l) => sum + (findProduct(l.id)?.price || 0) * l.qty, 0);
}

function openCheckout() {
  if (!state.cart.length) return toast("Your bag is empty");
  requireAuth(() => {
    closeDrawer();
    const groups = new Map();
    state.cart.forEach((l) => {
      const p = findProduct(l.id);
      if (!p) return;
      if (!groups.has(p.brand_id)) groups.set(p.brand_id, { brand: p.brand, lines: [] });
      groups.get(p.brand_id).lines.push({ ...l, p });
    });
    const sections = [...groups.values()].map((g) => `<div class="summary-brand">
        <strong>${esc(g.brand?.name)}</strong>
        ${g.lines.map((l) => `<div class="summary-line"><span>${l.qty} × ${esc(l.p.name)}${sizeLabel(l.size) ? " (" + esc(l.size) + ")" : ""}</span><span>${money(l.p.price * l.qty)}</span></div>`).join("")}
      </div>`).join("");
    $("#checkoutSummary").innerHTML = `<div class="summary">${sections}
      <div class="summary-total"><span>Total</span><strong>${money(cartTotal())}</strong></div>
      ${groups.size > 1 ? `<p class="summary-note">Your bag has pieces from ${groups.size} brands, so this creates ${groups.size} orders. Each brand contacts you separately.</p>` : ""}
    </div>`;
    const saved = store.get("vh_delivery", {});
    $("#coName").value = state.user.name || "";
    $("#coPhone").value = state.user.phone || saved.phone || "";
    $("#coAddress").value = saved.address || "";
    $("#coCity").value = saved.city || "";
    fillStateSelect($("#coState"), saved.state || "");
    openModal("checkoutModal");
  });
}

async function submitCheckout(e) {
  e.preventDefault();
  const contact = {
    name: $("#coName").value.trim(),
    phone: $("#coPhone").value.trim(),
    address: $("#coAddress").value.trim(),
    city: $("#coCity").value.trim(),
    state: $("#coState").value,
    note: $("#coNote").value.trim(),
  };
  if (digits(contact.phone).length < 10) return toast("Please enter a valid phone number");
  await busy($("#coSubmit"), "Placing order…", async () => {
    const items = state.cart.filter((l) => findProduct(l.id)).map((l) => ({ product_id: l.id, qty: l.qty, size: l.size }));
    const orders = await api.placeOrder(items, contact);
    store.set("vh_delivery", { phone: contact.phone, address: contact.address, city: contact.city, state: contact.state });
    if (!state.user.phone) api.updateProfile({ full_name: state.user.name, phone: contact.phone }).then(refreshUser).catch(() => {});
    state.cart = [];
    saveCart();
    renderCart();
    state.myOrders = undefined;
    $("#checkoutForm").reset();
    closeModal("checkoutModal");
    $("#successOrders").innerHTML = orders.map((o) => {
      const wa = waLink(o.brand_whatsapp, `Hi ${o.brand_name}, I just placed order KL-${o.order_number} (${money(o.total)}) on Kloset.`);
      return `<div class="success-order"><div><strong>KL-${o.order_number}</strong><span>${esc(o.brand_name)} · ${money(o.total)}</span></div>${wa ? `<a class="secondary-btn" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp brand</a>` : ""}</div>`;
    }).join("");
    openModal("successModal");
  });
}

// ---------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------
const AUTH_COPY = {
  signin: ["WELCOME BACK", "Sign in", "Access your bag, orders and seller tools.", "Sign in", "Don't have an account? <b>Create one</b>"],
  signup: ["JOIN KLOSET", "Create account", "Save your details, track your orders and apply to sell your brand.", "Create account", "Already have an account? <b>Sign in</b>"],
  reset: ["FORGOT PASSWORD", "Reset password", "Enter your email and we'll send you a link to choose a new password.", "Send reset link", "Remembered it? <b>Sign in</b>"],
};

function setAuthMode(mode) {
  state.authMode = mode;
  const [eyebrow, title, text, submit, sw] = AUTH_COPY[mode];
  $("#authEyebrow").textContent = eyebrow;
  $("#authTitle").textContent = title;
  $("#authText").textContent = text;
  $("#authSubmit").textContent = submit;
  $("#switchAuth").innerHTML = sw;
  $("#nameField").hidden = mode !== "signup";
  $("#nameInput").required = mode === "signup";
  $("#passwordField").hidden = mode === "reset";
  const pw = $("#passwordInput");
  pw.required = mode !== "reset";
  if (mode === "signup") pw.setAttribute("minlength", "8"); else pw.removeAttribute("minlength");
  pw.autocomplete = mode === "signup" ? "new-password" : "current-password";
  pw.placeholder = mode === "signup" ? "At least 8 characters" : "Your password";
  $("#forgotBtn").hidden = mode !== "signin";
}

function openAuth(mode = "signin", after = null) {
  state.afterAuth = after;
  setAuthMode(mode);
  openModal("authModal");
  setTimeout(() => $(mode === "signup" ? "#nameInput" : "#emailInput").focus(), 50);
}

function requireAuth(action) {
  if (state.user) return action();
  toast("Please sign in first");
  openAuth("signin", action);
}

async function submitAuth(e) {
  e.preventDefault();
  const email = $("#emailInput").value.trim();
  const password = $("#passwordInput").value;
  const name = $("#nameInput").value.trim();
  const mode = state.authMode;
  await busy($("#authSubmit"), "Please wait…", async () => {
    if (mode === "reset") {
      await api.sendPasswordReset(email);
      closeModal("authModal");
      showNotice("Check your inbox", `If an account exists for ${email}, we've sent a link to reset your password.`);
      return;
    }
    if (mode === "signup") {
      const { needsConfirmation } = await api.signUp({ name, email, password });
      closeModal("authModal");
      if (needsConfirmation) {
        showNotice("Confirm your email", `We sent a confirmation link to ${email}. Open it to finish creating your account, then sign in.`);
        return;
      }
      toast("Account created. Welcome to Kloset!");
    } else {
      await api.signIn({ email, password });
      closeModal("authModal");
      toast("Welcome back");
    }
    await refreshUser();
    const next = state.afterAuth;
    state.afterAuth = null;
    if (next && state.user) next();
  });
}

function openAccount() {
  if (!state.user) return openAuth("signin");
  $("#accountName").textContent = state.user.name;
  $("#accountEmail").textContent = state.user.email;
  $("#profileNameInput").value = state.user.name;
  $("#profilePhoneInput").value = state.user.phone || "";
  $("#accountSellLink").textContent = state.myBrand ? "Seller dashboard" : "Sell your brand";
  $("#accountAdminLink").hidden = state.user.role !== "admin";
  closeSidebar();
  openModal("accountModal");
}

async function submitProfile(e) {
  e.preventDefault();
  const full_name = $("#profileNameInput").value.trim();
  const phone = $("#profilePhoneInput").value.trim();
  await busy($("#profileSubmit"), "Saving…", async () => {
    await api.updateProfile({ full_name, phone });
    await refreshUser();
    $("#accountName").textContent = state.user.name;
    toast("Details saved");
  });
}

async function submitPassword(e) {
  e.preventDefault();
  const pw = $("#newPassword").value;
  if (pw !== $("#confirmPassword").value) return toast("The two passwords don't match");
  await busy($("#passwordSubmit"), "Saving…", async () => {
    await api.updatePassword(pw);
    $("#passwordForm").reset();
    closeModal("passwordModal");
    toast("Password updated");
  });
}

// ---------------------------------------------------------------------
// Seller area
// ---------------------------------------------------------------------
function renderSell() {
  const el = $("#viewSell");
  if (!state.user) { el.innerHTML = sellIntro(); return; }
  if (state.sellerError) { el.innerHTML = errorPage(state.sellerError, "reload-seller"); return; }
  if (state.myBrand === undefined) { el.innerHTML = pageLoading(); loadSeller(); return; }
  if (!state.myBrand) {
    el.innerHTML = sellIntro();
    fillStateSelect($("#bfState"));
    return;
  }
  el.innerHTML = sellerDashboard();
  if (state.sellTab === "profile") fillStateSelect($("#bfState"), state.myBrand.state);
}

function sellIntro() {
  const steps = `<ol class="steps">
      <li><strong>Apply</strong><span>Tell us about your brand. It takes two minutes.</span></li>
      <li><strong>Get approved</strong><span>The Kloset team reviews every brand to keep shoppers safe.</span></li>
      <li><strong>Start selling</strong><span>Upload your pieces. Orders come to your dashboard and WhatsApp.</span></li>
    </ol>`;
  const action = state.user
    ? `<h2 class="form-title">Brand application</h2>${brandFormHtml(null)}`
    : `<div class="gate-actions"><button class="primary-btn" data-action="sign-up">Create an account to apply</button><button class="secondary-btn" data-action="sign-in">I already have an account</button></div>`;
  return `<section class="page narrow">
    <p class="eyebrow">SELL ON KLOSET</p>
    <h1 class="page-title">Open your store</h1>
    <p class="lead">Reach shoppers looking for independent Nigerian fashion. You manage your products and orders; customers contact you directly to pay and arrange delivery.</p>
    ${steps}
    ${action}
  </section>`;
}

function brandFormHtml(b) {
  return `<form id="brandForm" class="panel">
    <div class="form-row">
      <div class="field"><label for="bfName">Brand name</label><input id="bfName" required minlength="2" maxlength="60" value="${esc(b?.name)}"></div>
      <div class="field"><label for="bfWhatsapp">WhatsApp number for orders</label><input id="bfWhatsapp" type="tel" required maxlength="20" placeholder="0803 000 0000" value="${b?.whatsapp ? "+" + esc(b.whatsapp) : ""}"></div>
    </div>
    <div class="field"><label for="bfDescription">About your brand</label><textarea id="bfDescription" rows="3" maxlength="600" placeholder="What you make, your style, how long delivery takes...">${esc(b?.description)}</textarea></div>
    <div class="form-row">
      <div class="field"><label for="bfCity">City</label><input id="bfCity" required maxlength="60" value="${esc(b?.city)}"></div>
      <div class="field"><label for="bfState">State</label><select id="bfState" required></select></div>
    </div>
    <div class="form-row">
      <div class="field"><label for="bfInstagram">Instagram handle (optional)</label><input id="bfInstagram" maxlength="60" placeholder="@yourbrand" value="${b?.instagram ? "@" + esc(b.instagram) : ""}"></div>
      <div class="field"><label for="bfLogo">Logo (optional)</label><input id="bfLogo" type="file" accept="image/*"></div>
    </div>
    <button class="primary-btn" type="submit" id="bfSubmit">${b ? "Save changes" : "Submit application →"}</button>
  </form>`;
}

async function submitBrand(e) {
  e.preventDefault();
  const fields = {
    name: $("#bfName").value.trim(),
    description: $("#bfDescription").value.trim(),
    city: $("#bfCity").value.trim(),
    state: $("#bfState").value,
    whatsapp: toIntlPhone($("#bfWhatsapp").value),
    instagram: $("#bfInstagram").value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, ""),
  };
  if (!/^\d{10,15}$/.test(fields.whatsapp)) return toast("Please enter a valid WhatsApp number, e.g. 0803 000 0000");
  if (fields.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(fields.instagram)) return toast("That Instagram handle doesn't look right");
  const logo = $("#bfLogo").files[0];
  const previous = state.myBrand;
  await busy($("#bfSubmit"), "Saving…", async () => {
    if (logo) fields.logo_url = await api.uploadImage(await compressImage(logo, 400));
    const saved = await api.saveBrand(fields, previous?.id);
    if (logo && previous?.logo_url) api.removeImages([previous.logo_url]).catch(() => {});
    state.myBrand = saved;
    if (!previous) {
      state.myProducts = [];
      state.brandOrders = [];
      state.sellTab = "products";
      window.scrollTo({ top: 0 });
      toast("Application sent! You can add products while we review your brand.");
    } else {
      toast(previous.status === "rejected" ? "Saved and sent for review again" : "Brand profile saved");
    }
    renderSell();
    updateNav();
    if (saved.status === "approved") refreshCatalog();
  });
}

function statusNotice(b) {
  const note = b.review_note ? ` Reason: ${esc(b.review_note)}` : "";
  switch (b.status) {
    case "approved":
      return `<div class="notice ok"><span>Your store is live at <a href="#/brand/${encodeURIComponent(b.slug)}">${esc(storeUrl(b))}</a>. Share it on Instagram and WhatsApp.</span><button class="secondary-btn" data-action="copy-link" data-id="${esc(storeUrl(b))}">Copy link</button></div>`;
    case "rejected":
      return `<div class="notice bad"><span>Your application wasn't approved.${note} Update your brand profile and save to send it for review again.</span></div>`;
    case "suspended":
      return `<div class="notice bad"><span>Your store is hidden from shoppers.${note} Contact the Kloset team to resolve this.</span></div>`;
    default:
      return `<div class="notice"><span>Your brand is being reviewed. Add your products now. They'll appear in the shop as soon as you're approved.</span></div>`;
  }
}

function sellerDashboard() {
  const b = state.myBrand;
  const listed = state.myProducts.filter((p) => p.is_active).length;
  const fresh = state.brandOrders.filter((o) => o.status === "new").length;
  const sales = state.brandOrders.filter((o) => ["confirmed", "shipped", "delivered"].includes(o.status)).reduce((s, o) => s + o.total, 0);
  const body = state.sellTab === "orders" ? sellerOrders() : state.sellTab === "profile" ? brandFormHtml(b) : sellerProducts();
  return `<section class="page">
    <div class="page-head">
      <div><p class="eyebrow">SELLER CENTER</p><h1 class="page-title">${esc(b.name)}</h1></div>
      <span class="pill ${b.status}">${BRAND_STATUS[b.status]}</span>
    </div>
    ${statusNotice(b)}
    <div class="stats">
      <div><strong>${listed}</strong><span>Listed products</span></div>
      <div><strong>${fresh}</strong><span>New orders</span></div>
      <div><strong>${money(sales)}</strong><span>Confirmed sales</span></div>
    </div>
    <div class="tabs">
      ${tab("products", `Products (${state.myProducts.length})`, state.sellTab, "sell-tab")}
      ${tab("orders", `Orders (${state.brandOrders.length})`, state.sellTab, "sell-tab")}
      ${tab("profile", "Brand profile", state.sellTab, "sell-tab")}
    </div>
    ${body}
  </section>`;
}

function sellerProducts() {
  const live = state.myBrand.status === "approved";
  const rows = state.myProducts.map((p) => `<div class="manage-row">
      <div class="manage-thumb">${imgTag(safeUrl(p.images?.[0]), p.name)}</div>
      <div class="manage-info"><strong>${esc(p.name)}</strong><span>${esc(p.category)}${p.category === "Clothing" && p.subcategory ? " · " + esc(p.subcategory) : ""} · ${money(p.price)}</span></div>
      <span class="pill ${p.is_active ? "approved" : "muted"}">${p.is_active ? "Listed" : "Hidden"}</span>
      <div class="manage-actions">
        <button class="link-btn" data-action="edit-product" data-id="${esc(p.id)}">Edit</button>
        <button class="link-btn" data-action="toggle-product" data-id="${esc(p.id)}">${p.is_active ? "Hide" : "List"}</button>
        <button class="link-btn danger" data-action="delete-product" data-id="${esc(p.id)}">Delete</button>
      </div>
    </div>`).join("");
  return `<div class="tab-head">
      <p class="muted">Listed products appear in the shop${live ? "" : " once your brand is approved"}. Hidden ones stay in your dashboard only.</p>
      <button class="primary-btn" data-action="new-product">+ Add product</button>
    </div>
    ${rows ? `<div class="manage-list">${rows}</div>` : emptyBlock("No products yet", "Add your first piece. Good photos make all the difference.")}`;
}

function orderItemsHtml(items = []) {
  return `<div class="order-items">${items.map((i) => `<div class="order-item">
      <div class="order-thumb">${imgTag(safeUrl(i.image), i.product_name)}</div>
      <span>${esc(i.product_name)}${sizeLabel(i.size) ? ` <em>Size ${esc(i.size)}</em>` : ""}</span>
      <span>${i.qty} × ${money(i.unit_price)}</span>
    </div>`).join("")}</div>`;
}

function sellerOrders() {
  const head = `<div class="tab-head"><p class="muted">Contact each customer to arrange payment and delivery, then update the status.</p><button class="secondary-btn" data-action="reload-seller">Refresh</button></div>`;
  if (!state.brandOrders.length) return head + emptyBlock("No orders yet", "When a shopper orders from your store, it shows up here with their contact details.");
  return `${head}<div class="order-list">${state.brandOrders.map((o) => {
    const wa = waLink(o.buyer_phone, `Hi ${o.buyer_name}, this is ${state.myBrand.name} about your Kloset order KL-${o.order_number}.`);
    const tel = toIntlPhone(o.buyer_phone);
    return `<article class="order-card">
      <div class="order-head">
        <div><strong>KL-${o.order_number}</strong><span>${fmtDate(o.created_at)}</span></div>
        <select class="status-select ${o.status}" data-order-status="${esc(o.id)}" aria-label="Order status">${Object.entries(ORDER_STATUS).map(([v, l]) => `<option value="${v}" ${o.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
      ${orderItemsHtml(o.items)}
      <div class="order-buyer">
        <div><span class="label">Customer</span><strong>${esc(o.buyer_name)}</strong><span>${esc(o.buyer_phone)}${o.buyer_email ? " · " + esc(o.buyer_email) : ""}</span></div>
        <div><span class="label">Deliver to</span><span>${esc(o.address)}, ${esc(o.city)}, ${esc(o.state)}</span></div>
        ${o.note ? `<div><span class="label">Note</span><span>${esc(o.note)}</span></div>` : ""}
      </div>
      <div class="order-foot"><strong>Total ${money(o.total)}</strong><div class="order-contact">
        ${wa ? `<a class="secondary-btn" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp customer</a>` : ""}
        ${tel ? `<a class="secondary-btn" href="tel:+${esc(tel)}">Call</a>` : ""}
      </div></div>
    </article>`;
  }).join("")}</div>`;
}

function openProductForm(p = null) {
  state.editingProduct = p;
  clearPendingImages();
  $("#productForm").reset();
  $("#productFormTitle").textContent = p ? "Edit product" : "Add a product";
  $("#pfName").value = p?.name || "";
  $("#pfPrice").value = p?.price || "";
  $("#pfCategory").value = p?.category || "Clothing";
  $("#pfStyle").value = p?.subcategory || "Native wear";
  $("#pfSizes").value = p ? (p.sizes || []).join(", ") : DEFAULT_SIZES.Clothing;
  $("#pfDescription").value = p?.description || "";
  $("#pfActive").checked = p ? p.is_active : true;
  $("#pfStyleField").hidden = $("#pfCategory").value !== "Clothing";
  renderImagePreview();
  openModal("productFormModal");
}

function clearPendingImages() {
  state.pendingImages.forEach((i) => URL.revokeObjectURL(i.preview));
  state.pendingImages = [];
}

function renderImagePreview() {
  const box = $("#pfPreview");
  const fig = (src, i) => `<figure><img src="${esc(src)}" alt="">${i === 0 ? "<figcaption>Cover</figcaption>" : ""}</figure>`;
  if (state.pendingImages.length) box.innerHTML = state.pendingImages.map((img, i) => fig(img.preview, i)).join("");
  else if (state.editingProduct) box.innerHTML = state.editingProduct.images.map((src, i) => fig(safeUrl(src), i)).join("") + `<p class="hint">Choose new photos to replace these.</p>`;
  else box.innerHTML = "";
}

async function submitProduct(e) {
  e.preventDefault();
  const editing = state.editingProduct;
  const category = $("#pfCategory").value;
  const fields = {
    name: $("#pfName").value.trim(),
    price: Math.round(Number($("#pfPrice").value)),
    category,
    subcategory: category === "Clothing" ? $("#pfStyle").value : null,
    description: $("#pfDescription").value.trim(),
    sizes: [...new Set($("#pfSizes").value.split(",").map((s) => s.trim().slice(0, 20)).filter(Boolean))].slice(0, 15),
    is_active: $("#pfActive").checked,
  };
  if (fields.name.length < 2) return toast("Please enter a product name");
  if (!(fields.price >= 100)) return toast("Please enter a price of at least ₦100");
  if (!editing && !state.pendingImages.length) return toast("Please add at least one photo");
  const btn = $("#pfSubmit");
  await busy(btn, "Saving…", async () => {
    let images = editing?.images || [];
    const uploaded = [];
    try {
      for (const [i, img] of state.pendingImages.entries()) {
        btn.textContent = `Uploading photo ${i + 1} of ${state.pendingImages.length}…`;
        uploaded.push(await api.uploadImage(await compressImage(img.file, api.imageMaxSize)));
      }
      if (uploaded.length) images = uploaded;
      btn.textContent = "Saving…";
      const saved = await api.saveProduct({ ...fields, images }, editing?.id, state.myBrand.id);
      if (editing && uploaded.length) api.removeImages(editing.images).catch(() => {});
      state.myProducts = editing ? state.myProducts.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...state.myProducts];
    } catch (err) {
      if (uploaded.length) api.removeImages(uploaded).catch(() => {});
      throw err;
    }
    clearPendingImages();
    closeModal("productFormModal");
    toast(editing ? "Product updated" : state.myBrand.status === "approved" ? "Product published" : "Product saved. It goes live when your brand is approved.");
    renderSell();
    refreshCatalog();
  });
}

async function toggleProduct(id, btn) {
  const p = state.myProducts.find((x) => x.id === id);
  if (!p) return;
  await busy(btn, "…", async () => {
    const saved = await api.saveProduct({ is_active: !p.is_active }, p.id, state.myBrand.id);
    Object.assign(p, saved);
    renderSell();
    refreshCatalog();
  });
}

async function deleteProduct(id, btn) {
  const p = state.myProducts.find((x) => x.id === id);
  if (!p || !confirm(`Delete "${p.name}"? This can't be undone.`)) return;
  await busy(btn, "…", async () => {
    await api.deleteProduct(p.id);
    api.removeImages(p.images).catch(() => {});
    state.myProducts = state.myProducts.filter((x) => x.id !== p.id);
    toast("Product deleted");
    renderSell();
    refreshCatalog();
  });
}

async function changeOrderStatus(select) {
  const o = state.brandOrders.find((x) => x.id === select.dataset.orderStatus);
  if (!o) return;
  const prev = o.status;
  select.disabled = true;
  try {
    await api.setOrderStatus(o.id, select.value);
    o.status = select.value;
    toast(`Order KL-${o.order_number} marked ${ORDER_STATUS[o.status].toLowerCase()}`);
  } catch (err) {
    o.status = prev;
    toast(friendly(err));
  }
  renderSell();
}

// ---------------------------------------------------------------------
// Buyer orders
// ---------------------------------------------------------------------
function signInGate(eyebrow, title, text) {
  return `<section class="page narrow"><div class="gate">
    <p class="eyebrow">${esc(eyebrow)}</p><h1 class="page-title">${esc(title)}</h1><p class="lead">${esc(text)}</p>
    <div class="gate-actions"><button class="primary-btn" data-action="sign-in">Sign in</button><button class="secondary-btn" data-action="sign-up">Create account</button></div>
  </div></section>`;
}

function renderOrders() {
  const el = $("#viewOrders");
  if (!state.user) { el.innerHTML = signInGate("MY ORDERS", "Track your orders", "Sign in to see the orders you've placed."); return; }
  if (state.myOrdersError) { el.innerHTML = errorPage(state.myOrdersError, "reload-orders"); return; }
  if (state.myOrders === undefined) { el.innerHTML = pageLoading(); loadMyOrders(); return; }
  const cards = state.myOrders.map((o) => {
    const b = o.brand;
    const wa = b && waLink(b.whatsapp, `Hi ${b.name}, I'm following up on my Kloset order KL-${o.order_number}.`);
    return `<article class="order-card">
      <div class="order-head">
        <div><strong>KL-${o.order_number}</strong><span>${fmtDate(o.created_at)} · ${b ? `<a href="#/brand/${encodeURIComponent(b.slug)}">${esc(b.name)}</a>` : "Brand no longer available"}</span></div>
        <span class="pill ${o.status}">${ORDER_STATUS[o.status]}</span>
      </div>
      ${orderItemsHtml(o.items)}
      <div class="order-foot"><strong>Total ${money(o.total)}</strong>${wa ? `<a class="secondary-btn" href="${esc(wa)}" target="_blank" rel="noopener">Message brand</a>` : ""}</div>
    </article>`;
  }).join("");
  el.innerHTML = `<section class="page">
    <div class="page-head"><div><p class="eyebrow">MY ORDERS</p><h1 class="page-title">Your orders</h1></div></div>
    ${cards ? `<div class="order-list">${cards}</div>` : emptyBlock("No orders yet", "When you place an order, you can follow it here.", '<a class="primary-btn" href="#/">Start shopping</a>')}
  </section>`;
}

// ---------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------
function renderAdmin() {
  const el = $("#viewAdmin");
  if (!state.user) { el.innerHTML = signInGate("ADMIN", "Review brands", "Sign in with your admin account."); return; }
  if (state.user.role !== "admin") {
    el.innerHTML = `<section class="page narrow">${emptyBlock("Admins only", "This page is for the Kloset team.", '<a class="primary-btn" href="#/">Back to the shop</a>')}</section>`;
    return;
  }
  if (state.adminError) { el.innerHTML = errorPage(state.adminError, "reload-admin"); return; }
  if (state.adminBrands === undefined) { el.innerHTML = pageLoading(); loadAdmin(); return; }
  const pending = state.adminBrands.filter((b) => b.status === "pending");
  const list = state.adminTab === "pending" ? pending : state.adminBrands;
  const empty = state.adminTab === "pending" ? emptyBlock("All caught up", "No brands are waiting for review.") : emptyBlock("No brands yet", "Brands appear here when they apply.");
  el.innerHTML = `<section class="page">
    <div class="page-head"><div><p class="eyebrow">ADMIN</p><h1 class="page-title">Review brands</h1></div></div>
    <div class="tabs">
      ${tab("pending", `Waiting for review (${pending.length})`, state.adminTab, "admin-tab")}
      ${tab("all", `All brands (${state.adminBrands.length})`, state.adminTab, "admin-tab")}
    </div>
    ${list.length ? `<div class="admin-list">${list.map(adminBrandCard).join("")}</div>` : empty}
  </section>`;
}

function adminBrandCard(b) {
  const count = b.products?.[0]?.count ?? 0;
  const wa = waLink(b.whatsapp, `Hi ${b.name}, this is the Kloset team about your brand.`);
  const actions = {
    pending: [["approved", "Approve", "primary-btn"], ["rejected", "Reject", "secondary-btn"]],
    approved: [["suspended", "Suspend", "secondary-btn"]],
    rejected: [["approved", "Approve", "primary-btn"]],
    suspended: [["approved", "Reinstate", "primary-btn"]],
  }[b.status] || [];
  return `<article class="admin-card">
    <div class="store-logo small">${b.logo_url ? `<img src="${esc(safeUrl(b.logo_url))}" alt="">` : esc(b.name.slice(0, 1))}</div>
    <div class="admin-body">
      <div class="admin-title"><strong>${esc(b.name)}</strong><span class="pill ${b.status}">${BRAND_STATUS[b.status]}</span></div>
      <p>${esc(b.description || "No description.")}</p>
      <dl>
        <div><dt>Owner</dt><dd>${esc(b.owner?.full_name || "—")}${b.owner?.email ? " · " + esc(b.owner.email) : ""}</dd></div>
        <div><dt>Location</dt><dd>${esc(brandPlace(b) || "—")}</dd></div>
        <div><dt>WhatsApp</dt><dd>${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">+${esc(b.whatsapp)}</a>` : "—"}</dd></div>
        <div><dt>Instagram</dt><dd>${b.instagram ? `<a href="https://instagram.com/${encodeURIComponent(b.instagram)}" target="_blank" rel="noopener">@${esc(b.instagram)}</a>` : "—"}</dd></div>
        <div><dt>Products</dt><dd>${count}</dd></div>
        <div><dt>Applied</dt><dd>${fmtDate(b.created_at)}</dd></div>
      </dl>
      ${b.review_note ? `<p class="review-note">Note to brand: ${esc(b.review_note)}</p>` : ""}
      <div class="admin-actions">${actions.map(([s, label, cls]) => `<button class="${cls}" data-action="brand-status" data-id="${esc(b.id)}" data-status="${s}">${label}</button>`).join("")}</div>
    </div>
  </article>`;
}

async function setBrandStatus(btn) {
  const status = btn.dataset.status;
  let note = null;
  if (status === "rejected" || status === "suspended") {
    note = prompt(status === "rejected" ? "Why isn't this brand approved? The brand will see this." : "Why is this store suspended? The brand will see this.", "");
    if (note === null) return;
  }
  await busy(btn, "…", async () => {
    await api.setBrandStatus(btn.dataset.id, status, note);
    const b = state.adminBrands.find((x) => x.id === btn.dataset.id);
    toast(`${b?.name || "Brand"} is now ${BRAND_STATUS[status].toLowerCase()}`);
    await Promise.all([loadAdmin(), refreshCatalog()]);
  });
}

// ---------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------
const actions = {
  "sign-in": () => openAuth("signin"),
  "sign-up": () => openAuth("signup"),
  "sign-out": async () => {
    closeModal("accountModal");
    await busy(null, "", () => api.signOut());
    toast("Signed out");
  },
  "change-password": () => { closeModal("accountModal"); openModal("passwordModal"); },
  "copy-link": (el) => copyText(el.dataset.id),
  "reload-catalog": () => { state.loaded = false; renderView(); refreshCatalog(); },
  "reload-seller": () => { state.sellerError = null; state.myBrand = undefined; renderSell(); },
  "reload-orders": () => { state.myOrdersError = null; state.myOrders = undefined; renderOrders(); },
  "reload-admin": () => { state.adminError = null; state.adminBrands = undefined; renderAdmin(); },
  "sell-tab": (el) => { state.sellTab = el.dataset.id; renderSell(); },
  "admin-tab": (el) => { state.adminTab = el.dataset.id; renderAdmin(); },
  "new-product": () => openProductForm(),
  "edit-product": (el) => openProductForm(state.myProducts.find((p) => p.id === el.dataset.id)),
  "toggle-product": (el) => toggleProduct(el.dataset.id, el),
  "delete-product": (el) => deleteProduct(el.dataset.id, el),
  "brand-status": (el) => setBrandStatus(el),
  shop: (el) => {
    const [category, style] = el.dataset.id.split("|");
    goShop(category, style || "All");
  },
  "go-brands": () => { closeSidebar(); goHome(state.brands.length ? "#brands" : ".seller-band"); },
};

document.addEventListener("click", (e) => {
  const t = e.target;
  const action = t.closest("[data-action]");
  if (action) { actions[action.dataset.action]?.(action); return; }
  const wish = t.closest("[data-wish]");
  if (wish) { e.stopPropagation(); toggleWish(wish.dataset.wish); return; }
  const add = t.closest("[data-add]");
  if (add) { quickAdd(add.dataset.add); return; }
  const prod = t.closest("[data-product]");
  if (prod) { goProduct(prod.dataset.product); return; }
  const detailAdd = t.closest("[data-detail-add]");
  if (detailAdd) { addToCart(detailAdd.dataset.detailAdd, $("#detailSize")?.value || null); closeProduct(); return; }
  const thumb = t.closest("[data-thumb]");
  if (thumb) {
    $("#detailMain").innerHTML = imgTag(thumb.dataset.thumb, "");
    $$(".detail-thumbs button").forEach((b) => b.classList.toggle("active", b === thumb));
    return;
  }
  const plus = t.closest("[data-plus]");
  if (plus) { const l = state.cart[plus.dataset.plus]; if (l) l.qty = Math.min(20, l.qty + 1); saveCart(); renderCart(); return; }
  const minus = t.closest("[data-minus]");
  if (minus) {
    const i = Number(minus.dataset.minus);
    if (state.cart[i] && --state.cart[i].qty <= 0) state.cart.splice(i, 1);
    saveCart();
    renderCart();
    return;
  }
  const remove = t.closest("[data-remove]");
  if (remove) { state.cart.splice(Number(remove.dataset.remove), 1); saveCart(); renderCart(); return; }
  const close = t.closest("[data-close]");
  if (close) closeModal(close.dataset.close);
});

document.addEventListener("change", (e) => {
  if (e.target.matches("[data-order-status]")) changeOrderStatus(e.target);
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "brandForm") submitBrand(e);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = $$(".modal-wrap.open").pop();
  if (open) open.id === "productModal" ? closeProduct() : closeModal(open.id);
  else { closeDrawer(); closeSidebar(); }
});

$$(".modal-wrap").forEach((m) => m.addEventListener("click", (e) => {
  if (e.target !== m) return;
  if (m.id === "productModal") closeProduct();
  else closeModal(m.id);
}));

$$(".nav-item[data-category]").forEach((btn) => btn.addEventListener("click", () => goShop(btn.dataset.category)));
$$(".nav-item[data-view], .account-links a").forEach((a) => a.addEventListener("click", closeSidebar));
$("#filters").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  state.category = btn.dataset.filter;
  state.style = "All";
  renderHome();
  updateNav();
});
$("#clothingStyles").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-style]");
  if (!btn) return;
  state.style = btn.dataset.style;
  renderHome();
});
$("#searchInput").addEventListener("input", (e) => {
  state.search = e.target.value;
  if (state.view !== "home" || parseHash().name !== "home") location.hash = "#/";
  else renderHome();
});

$("#shopNow").onclick = () => $("#shop").scrollIntoView({ behavior: "smooth" });
$("#menuBtn").onclick = openSidebar;
$("#closeSidebar").onclick = closeSidebar;
$("#overlay").onclick = () => { closeDrawer(); closeSidebar(); };
$("#cartNav").onclick = () => { closeSidebar(); openDrawer(); };
$("#headerCart").onclick = openDrawer;
$("#closeCart").onclick = closeDrawer;
$("#headerWish").onclick = () => goShop("Wishlist");
$("#bottomBag").onclick = openDrawer;
$("#bottomAccount").onclick = () => (state.user ? openAccount() : openAuth("signin"));
$("#bottomSearch").onclick = () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("#searchInput").focus({ preventScroll: true });
};
$("#headerAuth").onclick = () => (state.user ? openAccount() : openAuth("signin"));
$("#profileBtn").onclick = () => (state.user ? openAccount() : openAuth("signin"));
$("#closeProduct").onclick = closeProduct;
$("#checkoutBtn").onclick = openCheckout;
$("#forgotBtn").onclick = () => setAuthMode("reset");
$("#switchAuth").onclick = () => setAuthMode(state.authMode === "signin" ? "signup" : "signin");
$("#authForm").addEventListener("submit", submitAuth);
$("#profileForm").addEventListener("submit", submitProfile);
$("#passwordForm").addEventListener("submit", submitPassword);
$("#checkoutForm").addEventListener("submit", submitCheckout);
$("#productForm").addEventListener("submit", submitProduct);
$("#pfCategory").addEventListener("change", (e) => {
  $("#pfStyleField").hidden = e.target.value !== "Clothing";
  const sizes = $("#pfSizes");
  if (!sizes.value.trim() || Object.values(DEFAULT_SIZES).includes(sizes.value)) sizes.value = DEFAULT_SIZES[e.target.value];
});
$("#pfImages").addEventListener("change", (e) => {
  const files = [...e.target.files];
  if (files.length > 4) toast("Only the first 4 photos will be used");
  clearPendingImages();
  state.pendingImages = files.slice(0, 4).map((file) => ({ file, preview: URL.createObjectURL(file) }));
  renderImagePreview();
});

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
function onAuthEvent(event) {
  if (/access_token=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + "#/");
  if (event === "PASSWORD_RECOVERY") openModal("passwordModal");
  if (event !== "TOKEN_REFRESHED") refreshUser();
}

function showAuthRedirectError() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const message = params.get("error_description");
  if (!message) return;
  history.replaceState(null, "", location.pathname + location.search + "#/");
  showNotice("That link didn't work", `${message}. Please try again or request a new link.`);
}

(function init() {
  if (api.mode === "demo") $("#demoBanner").hidden = false;
  if (api.error) {
    $("#errorBanner").textContent = api.error;
    $("#errorBanner").hidden = false;
  }
  showAuthRedirectError();
  api.onAuthChange(onAuthEvent);
  window.addEventListener("hashchange", router);
  router();
  renderCart();
  updateNav();
  refreshCatalog();
})();
