const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const defaultProducts = [
  {id:1,name:"Sculpted Oversized Tee",brand:"Atelier Noir",price:28000,category:"Clothing",subcategory:"Streetwear",image:"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=85",description:"A clean oversized silhouette designed for everyday movement. Heavyweight cotton with a relaxed fit.",sizes:["S","M","L","XL"]},
  {id:2,name:"The Everyday Sneaker",brand:"Forme Studio",price:65000,category:"Shoes",image:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=85",description:"Minimal low-top sneakers built for daily wear, with a soft cushioned sole.",sizes:["40","41","42","43","44"]},
  {id:3,name:"Utility Cargo Trouser",brand:"Rare Threads",price:52000,category:"Clothing",subcategory:"Streetwear",image:"https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=800&q=85",description:"Relaxed cargo trousers with utility pockets and an adjustable waist.",sizes:["S","M","L","XL"]},
  {id:4,name:"Structured Mini Bag",brand:"Mono House",price:39000,category:"Accessories",image:"https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=85",description:"A compact structured bag with a clean profile that works day to night.",sizes:["ONE SIZE"]},
  {id:5,name:"Washed Denim Jacket",brand:"Atelier Noir",price:72000,category:"Clothing",subcategory:"Streetwear",image:"https://images.unsplash.com/photo-1576871337622-98d48d1cf531?auto=format&fit=crop&w=800&q=85",description:"A vintage-inspired denim jacket with a relaxed shoulder and washed finish.",sizes:["S","M","L","XL"]},
  {id:6,name:"Classic Runner",brand:"Forme Studio",price:58000,category:"Shoes",image:"https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=800&q=85",description:"A lightweight runner combining a classic profile with everyday comfort.",sizes:["40","41","42","43","44"]},
  {id:7,name:"Signature Cap",brand:"Rare Threads",price:18000,category:"Accessories",image:"https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=800&q=85",description:"Six-panel cotton cap finished with a subtle embroidered mark.",sizes:["ONE SIZE"]},
  {id:8,name:"Relaxed Linen Shirt",brand:"Mono House",price:44000,category:"Clothing",subcategory:"Casual wear",image:"https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=800&q=85",description:"Breathable linen blend shirt with a relaxed cut and clean collar.",sizes:["S","M","L","XL"]},
  {id:9,name:"Ankara Co-ord Set",brand:"High Fashin",price:68000,category:"Clothing",subcategory:"Native wear",image:"https://images.unsplash.com/photo-1591369822096-ffd140ec948f?auto=format&fit=crop&w=800&q=85",description:"A vibrant two-piece set inspired by contemporary Nigerian style.",sizes:["S","M","L","XL"]},
  {id:10,name:"Classic Senator Set",brand:"YL Collective",price:85000,category:"Clothing",subcategory:"Native wear",image:"https://images.unsplash.com/photo-1592878904946-b3cd8ae243d0?auto=format&fit=crop&w=800&q=85",description:"A clean, tailored traditional set for celebrations and special gatherings.",sizes:["S","M","L","XL"]},
  {id:11,name:"Everyday Tailored Blazer",brand:"AsheLuxe",price:96000,category:"Clothing",subcategory:"Corporate wear",image:"https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=800&q=85",description:"A polished tailored layer designed for workdays and beyond.",sizes:["S","M","L","XL"]},
  {id:12,name:"Occasion Midi Dress",brand:"AsheLuxe",price:74000,category:"Clothing",subcategory:"Occasion wear",image:"https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=85",description:"An elegant statement dress for celebrations and evenings out.",sizes:["S","M","L","XL"]}
];

const savedProducts = JSON.parse(localStorage.getItem("vh_products"));
let products = (savedProducts || defaultProducts).map(product => {
  if (product.category !== "Clothing" || product.subcategory) return product;
  const name = product.name.toLowerCase();
  const subcategory = /cargo|denim|oversized|sneaker|hoodie|graphic/.test(name) ? "Streetwear"
    : /suit|blazer|trouser|formal|office/.test(name) ? "Corporate wear"
    : /ankara|senator|aso|agbada|native/.test(name) ? "Native wear"
    : "Casual wear";
  return {...product, subcategory};
});
if (savedProducts) {
  const productIds = new Set(products.map(product => product.id));
  defaultProducts.filter(product => product.id >= 9 && !productIds.has(product.id)).forEach(product => products.push(product));
}
let cart = JSON.parse(localStorage.getItem("vh_cart")) || [];
let wishlist = JSON.parse(localStorage.getItem("vh_wishlist")) || [];
let currentUser = JSON.parse(localStorage.getItem("vh_user")) || null;
let activeCategory = "All";
let activeStyle = "All";
let searchTerm = "";
let authMode = "signin";

const money = n => "₦" + Number(n).toLocaleString("en-NG");
const save = () => {
  localStorage.setItem("vh_products", JSON.stringify(products));
  localStorage.setItem("vh_cart", JSON.stringify(cart));
  localStorage.setItem("vh_wishlist", JSON.stringify(wishlist));
};

function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>t.classList.remove("show"),2200);
}

function renderProducts(){
  const grid = $("#productGrid");
  const filtered = products.filter(p => {
    const categoryMatch = activeCategory==="All" || activeCategory==="New In" ? true : p.category===activeCategory;
    const styleMatch = activeCategory !== "Clothing" || activeStyle === "All" || p.subcategory === activeStyle;
    const searchMatch = !searchTerm || `${p.name} ${p.brand} ${p.category} ${p.subcategory || ""}`.toLowerCase().includes(searchTerm.toLowerCase());
    return categoryMatch && styleMatch && searchMatch;
  });
  grid.setAttribute("aria-label", `${filtered.length} products`);
  grid.innerHTML = filtered.map(p => `
    <article class="product-card">
      <div class="product-image" data-product="${p.id}">
        <button class="heart ${wishlist.includes(p.id) ? "liked":""}" data-wish="${p.id}">${wishlist.includes(p.id)?"♥":"♡"}</button>
        <img src="${p.image}" alt="${escapeHtml(p.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
        <div class="image-placeholder" style="display:none">${escapeHtml(p.name.slice(0,1))}</div>
      </div>
      <div class="product-info">
        <span class="brand-name">${escapeHtml(p.brand)}</span>
        <h3>${escapeHtml(p.name)}</h3>
        ${p.category==="Clothing" && p.subcategory ? `<span class="product-style">${escapeHtml(p.subcategory)}</span>` : ""}
        <div class="price-row"><span class="price">${money(p.price)}</span><button class="add-btn" data-add="${p.id}">+ Add</button></div>
      </div>
    </article>
  `).join("");
  $("#emptyState").hidden = filtered.length > 0;
}

function renderCart(){
  const count = cart.reduce((sum,i)=>sum+i.qty,0);
  $("#cartCount").textContent=count; $("#headerCartCount").textContent=count;
  const box=$("#cartItems");
  if(!cart.length){
    box.innerHTML=`<div class="empty-state"><div>🛒</div><h3>Your bag is empty</h3><p>Add something you love from the collection.</p></div>`;
  } else {
    box.innerHTML=cart.map(item=>{
      const p=products.find(x=>x.id===item.id);
      if(!p) return "";
      return `<div class="cart-row">
        <div class="cart-thumb"><img src="${p.image}" alt=""></div>
        <div><h4>${escapeHtml(p.name)}</h4><p>${escapeHtml(p.brand)} · ${money(p.price)}</p>
          <div class="qty"><button data-minus="${p.id}">−</button><span>${item.qty}</span><button data-plus="${p.id}">+</button></div>
          <button class="remove" data-remove="${p.id}">Remove</button>
        </div>
        <strong>${money(p.price*item.qty)}</strong>
      </div>`;
    }).join("");
  }
  const total=cart.reduce((sum,i)=>{const p=products.find(x=>x.id===i.id);return sum+(p?p.price*i.qty:0)},0);
  $("#cartTotal").textContent=money(total);
}

function renderUser(){
  if(currentUser){
    $("#headerAuth").textContent="Account";
    $("#profileName").textContent=currentUser.name;
    $("#profileStatus").textContent=currentUser.email;
    $("#avatar").textContent=currentUser.name.slice(0,1).toUpperCase();
  } else {
    $("#headerAuth").textContent="Sign in";
    $("#profileName").textContent="Guest";
    $("#profileStatus").textContent="Sign in to continue";
    $("#avatar").textContent="G";
  }
  $("#wishCount").textContent=wishlist.length;
  $("#headerWishCount").textContent=wishlist.length;
}

function escapeHtml(str){return String(str).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

function openDrawer(){ $("#cartDrawer").classList.add("open"); $("#overlay").classList.add("open"); }
function closeDrawer(){ $("#cartDrawer").classList.remove("open"); $("#overlay").classList.remove("open"); }
function openModal(id){ $("#"+id).classList.add("open"); }
function closeModal(id){ $("#"+id).classList.remove("open"); }

function addToCart(id){
  const found=cart.find(i=>i.id===id);
  if(found) found.qty++;
  else cart.push({id,qty:1});
  save(); renderCart();
  const cartIcon = $("#headerCart"); cartIcon.classList.remove("cart-pop"); void cartIcon.offsetWidth; cartIcon.classList.add("cart-pop");
  toast("✨ Added to your bag");
}
function toggleWish(id){
  wishlist=wishlist.includes(id)?wishlist.filter(x=>x!==id):[...wishlist,id];
  save(); renderProducts(); renderUser(); toast(wishlist.includes(id)?"💗 Added to wishlist":"Removed from wishlist");
}

function showProduct(id){
  const p=products.find(x=>x.id===id); if(!p)return;
  $("#productDetail").innerHTML=`<div class="detail">
    <div class="detail-img"><img src="${p.image}" alt="${escapeHtml(p.name)}"></div>
    <div class="detail-copy">
      <span class="eyebrow">${escapeHtml(p.category)}</span>
      <div class="detail-brand">${escapeHtml(p.brand)}</div>
      <h2>${escapeHtml(p.name)}</h2>
      <div class="detail-price">${money(p.price)}</div>
      <p>${escapeHtml(p.description || "A carefully selected piece from an independent fashion brand.")}</p>
      <div class="field"><label>SELECT SIZE</label><select id="detailSize">${(p.sizes||["ONE SIZE"]).map(s=>`<option>${s}</option>`).join("")}</select></div>
      <button class="primary-btn full" data-detail-add="${p.id}">Add to bag →</button>
    </div>
  </div>`;
  openModal("productModal");
}

function setAuthMode(mode){
  authMode=mode;
  const signup=mode==="signup";
  $("#authEyebrow").textContent=signup?"JOIN VOGUEHUB":"WELCOME BACK";
  $("#authTitle").textContent=signup?"Create account":"Sign in";
  $("#authText").textContent=signup?"Create an account to save your wishlist and manage your products.":"Access your cart, wishlist and seller tools.";
  $("#nameField").hidden=!signup;
  $("#nameInput").required=signup;
  $("#authSubmit").textContent=signup?"Create account":"Sign in";
  $("#switchAuth").innerHTML=signup?'Already have an account? <b>Sign in</b>':'Don\'t have an account? <b>Create one</b>';
}

function openAuth(){setAuthMode(currentUser?"signin":authMode);openModal("authModal");}

function renderDashboard(){
  const mine=products.filter(p=>p.userId && currentUser && p.userId===currentUser.id);
  $("#statProducts").textContent=mine.length;
  $("#statOrders").textContent="0";
  $("#statRevenue").textContent=money(0);
}

function requireAuth(action){
  if(currentUser){action();}else{toast("Please sign in first");openAuth();}
}

document.addEventListener("click",e=>{
  const add=e.target.closest("[data-add]");
  if(add){addToCart(Number(add.dataset.add));return}
  const wish=e.target.closest("[data-wish]");
  if(wish){e.stopPropagation();toggleWish(Number(wish.dataset.wish));return}
  const prod=e.target.closest("[data-product]");
  if(prod){showProduct(Number(prod.dataset.product));return}
  const detailAdd=e.target.closest("[data-detail-add]");
  if(detailAdd){addToCart(Number(detailAdd.dataset.detailAdd));closeModal("productModal");return}
  const plus=e.target.closest("[data-plus]");
  if(plus){const x=cart.find(i=>i.id===Number(plus.dataset.plus));if(x)x.qty++;save();renderCart();return}
  const minus=e.target.closest("[data-minus]");
  if(minus){const x=cart.find(i=>i.id===Number(minus.dataset.minus));if(x){x.qty--;if(x.qty<=0)cart=cart.filter(i=>i.id!==x.id)}save();renderCart();return}
  const remove=e.target.closest("[data-remove]");
  if(remove){cart=cart.filter(i=>i.id!==Number(remove.dataset.remove));save();renderCart();return}
  const close=e.target.closest("[data-close]");
  if(close){closeModal(close.dataset.close);if(close.dataset.close==="authModal")$("#authForm").reset();return}
});

$("#searchInput").addEventListener("input",e=>{searchTerm=e.target.value;renderProducts()});
$("#filters").addEventListener("click",e=>{
  const btn=e.target.closest("[data-filter]"); if(!btn)return;
  activeCategory=btn.dataset.filter;
  activeStyle="All";
  $("#clothingStyles").hidden=activeCategory!=="Clothing";
  $$(".style-filter").forEach(x=>x.classList.toggle("active",x.dataset.style==="All"));
  $$(".filter").forEach(x=>x.classList.toggle("active",x===btn));
  renderProducts();
});
$("#clothingStyles").addEventListener("click",e=>{
  const btn=e.target.closest("[data-style]"); if(!btn)return;
  activeStyle=btn.dataset.style;
  $$(".style-filter").forEach(x=>x.classList.toggle("active",x===btn));
  renderProducts();
});
$$(".nav-item[data-category]").forEach(btn=>btn.addEventListener("click",()=>{
  activeCategory=btn.dataset.category;
  activeStyle="All";
  $("#clothingStyles").hidden=activeCategory!=="Clothing";
  $$(".style-filter").forEach(x=>x.classList.toggle("active",x.dataset.style==="All"));
  searchTerm="";
  $("#searchInput").value="";
  $$(".filter").forEach(x=>x.classList.toggle("active",x.dataset.filter===activeCategory || activeCategory==="New In" && x.dataset.filter==="All"));
  renderProducts();
  $("#sidebar").classList.remove("open");$("#overlay").classList.remove("open");
  document.querySelector(".content").scrollIntoView({behavior:"smooth"});
}));
$("#cartNav").onclick=()=>{closeDrawer();openDrawer()};
$("#headerCart").onclick=openDrawer;
$("#headerWish").onclick=()=>{toast(wishlist.length?`${wishlist.length} item${wishlist.length>1?"s":""} in your wishlist`:"Your wishlist is empty")};
$("#wishlistNav").onclick=()=>{toast(wishlist.length?`${wishlist.length} saved item${wishlist.length>1?"s":""}`:"Your wishlist is empty")};
$("#headerAuth").onclick=openAuth;
$("#profileBtn").onclick=openAuth;
$("#menuBtn").onclick=()=>{$("#sidebar").classList.add("open");$("#overlay").classList.add("open")};
$("#closeSidebar").onclick=()=>{$("#sidebar").classList.remove("open");$("#overlay").classList.remove("open")};
$("#overlay").onclick=()=>{closeDrawer();$("#sidebar").classList.remove("open");$("#overlay").classList.remove("open")};
$("#shopNow").onclick=()=>document.querySelector(".content").scrollIntoView({behavior:"smooth"});
$("#checkoutBtn").onclick=()=>requireAuth(()=>toast("Checkout is ready to connect to a payment provider."));
$("#sellNav").onclick=()=>requireAuth(()=>openModal("uploadModal"));
$("#dashboardNav").onclick=()=>requireAuth(()=>{renderDashboard();openModal("dashboardModal")});
$("#dashboardUpload").onclick=()=>{closeModal("dashboardModal");openModal("uploadModal")};
$("#settingsBtn").onclick=()=>toast("Settings will be connected to your account backend.");
$("#switchAuth").onclick=()=>setAuthMode(authMode==="signin"?"signup":"signin");
$("#uploadCategory").addEventListener("change",e=>{
  $("#uploadStyleField").hidden=e.target.value!=="Clothing";
});

$("#authForm").addEventListener("submit",e=>{
  e.preventDefault();
  const email=$("#emailInput").value.trim();
  const password=$("#passwordInput").value;
  if(authMode==="signup"){
    const name=$("#nameInput").value.trim();
    currentUser={id:Date.now(),name:name||"VogueHub User",email,passwordDemo:password};
    localStorage.setItem("vh_user",JSON.stringify(currentUser));
    toast("🎉 Account created — welcome to VogueHub");
  }else{
    currentUser={id:Date.now(),name:email.split("@")[0]||"VogueHub User",email};
    localStorage.setItem("vh_user",JSON.stringify(currentUser));
    toast("👋 Welcome back");
  }
  renderUser();closeModal("authModal");$("#authForm").reset();setAuthMode("signin");
});

$("#uploadForm").addEventListener("submit",e=>{
  e.preventDefault();
  requireAuth(()=>{
    const name=$("#uploadName").value.trim(),brand=$("#uploadBrand").value.trim(),price=Number($("#uploadPrice").value);
    const category=$("#uploadCategory").value,image=$("#uploadImage").value.trim();
    const p={id:Date.now(),name,brand,price,category,subcategory:category==="Clothing"?$("#uploadStyle").value:undefined,image:image||"https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=800&q=85",description:$("#uploadDescription").value.trim(),sizes:["S","M","L","XL"],userId:currentUser.id};
    products.unshift(p);save();renderProducts();closeModal("uploadModal");$("#uploadForm").reset();$("#uploadStyleField").hidden=false;toast("🎉 Product published to your marketplace");
  });
});

$$(".modal-wrap").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.classList.remove("open")}));

renderProducts();renderCart();renderUser();
