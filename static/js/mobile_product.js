// static/js/mobile_product.js

document.addEventListener("DOMContentLoaded", () => {
  const productList = document.getElementById("productList");
  const emptyMsg = document.getElementById("emptyMsg");

  const itemModal = document.getElementById("itemModal");
  const closeModalBtn = document.getElementById("closeModal");
  const modalName = document.getElementById("modalName");
  const modalDesc = document.getElementById("modalDesc");
  const sizeSelect = document.getElementById("sizeSelect");
  const colorSelect = document.getElementById("colorSelect");
  const addBtn = document.getElementById("addBtn");
  const changeBtn = document.getElementById("changeBtn");

  // ----------------------
  // 세션 ID (쿠키)
  // ----------------------
  const sessionId = getCookie("sessionId");
  if (!sessionId) {
    console.error("sessionId 쿠키 없음");
    return;
  }

  // ----------------------
  // NFC productId 파라미터
  // ----------------------
  const params = new URLSearchParams(window.location.search);
  const nfcProductId = params.get("productId");

  init();

  async function init() {
    if (nfcProductId) {
      await autoAddProduct(nfcProductId);
    }
    await loadProducts();

    if (nfcProductId) {
      await openProductById(nfcProductId);
    }
  }

  // ----------------------
  // API: 장바구니 → 상품 리스트
  // ----------------------
  async function loadProducts() {
    const res = await fetch(`/api/session/${sessionId}/products`);
    const items = await res.json();
    renderProductList(items);
  }

  async function openProductById(productId) {
    const res = await fetch(`/api/product/${productId}`);
    const product = await res.json();
    openProductModal(product);
  }

  async function autoAddProduct(productId) {
    const res = await fetch(`/api/product/${productId}`);
    const product = await res.json();

    const payload = {
      productId: product.id,
      size: product.sizes?.[0] || product.size,
      color: product.colors?.[0] || product.color
    };

    await fetch(`/api/session/${sessionId}/add`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });
  }

  // ----------------------
  // 모달 UI
  // ----------------------
  let currentProduct = null;

  function openProductModal(product) {
    currentProduct = product;
    modalName.textContent = product.name;
    modalDesc.textContent = product.desc || "";

    sizeSelect.innerHTML = (product.sizes || [product.size])
      .map(s => `<option value="${s}">${s}</option>`).join("");

    colorSelect.innerHTML = (product.colors || [product.color])
      .map(c => `<option value="${c}">${c}</option>`).join("");

    itemModal.classList.remove("hidden");
  }

  closeModalBtn.addEventListener("click", () => {
    itemModal.classList.add("hidden");
  });

  addBtn.addEventListener("click", async () => {
    if (!currentProduct) return;

    const payload = {
      productId: currentProduct.id,
      size: sizeSelect.value,
      color: colorSelect.value,
    };

    await fetch(`/api/session/${sessionId}/add`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });

    itemModal.classList.add("hidden");
    await loadProducts();
  });

  changeBtn.addEventListener("click", () => {
    sizeSelect.selectedIndex = Math.floor(Math.random() * sizeSelect.options.length);
    colorSelect.selectedIndex = Math.floor(Math.random() * colorSelect.options.length);
  });

  // ----------------------
  // 렌더링 (cart → product)
  // ----------------------
  function renderProductList(items) {
    productList.innerHTML = "";

    if (!items || items.length === 0) {
      emptyMsg.style.display = "block";
      productList.appendChild(emptyMsg);
      return;
    }

    emptyMsg.style.display = "none";

    items.forEach(item => {
      const card = document.createElement("div");
      card.className = "product-card";

      card.innerHTML = `
        <button class="product-remove" data-id="${item.id}">×</button>
        <div class="product-img">LOOK</div>
        <div class="product-name">${item.name}</div>
        <div class="product-meta">${item.size} / ${item.color}</div>
      `;

      // 삭제
      card.querySelector(".product-remove").addEventListener("click", async (e) => {
        const itemId = e.target.dataset.id;
        await fetch(`/api/session/${sessionId}/products/${itemId}`, {
          method: "DELETE"
        });
        await loadProducts();
      });

      productList.appendChild(card);
    });
  }

  // ----------------------
  // 쿠키 유틸
  // ----------------------
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
    return null;
  }
});
