import { useEffect, useMemo, useState } from "react";
import { Clock, MapPin, Settings, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import wgccLogo from "./assets/wgcc-logo.webp";
import outdoorDiningImage from "./assets/wgcc-outdoor-dining.webp";
import { businessConfig } from "./config/businessConfig";
import { mockProducts } from "./data/mockProducts";
import { mockPromotions } from "./data/mockPromotions";
import { addToCart, removeFromCart, getCartTotal } from "./stores/cartStore";
import { confirmPayment } from "./services/paymentService";
import { createCloverOrder } from "./services/cloverService";
import { notifyStaff } from "./services/notificationService";
import "./style.css";

const STORAGE_KEYS = {
  products: "wgcc-managed-products",
  promotions: "wgcc-managed-promotions"
};

const ADMIN_CATEGORIES = [
  "Breakfast",
  "Starters",
  "Sandwiches & Wraps",
  "Burgers",
  "Salads",
  "Mains",
  "Beverages"
];

const emptyProductForm = {
  name: "",
  description: "",
  price: "",
  category: ADMIN_CATEGORIES[0],
  featured: false,
  active: true
};

const emptyPromotionForm = {
  title: "",
  message: "",
  cta: ""
};

function createId(value, prefix) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${prefix}-${slug || "item"}-${Date.now()}`;
}

function normaliseProduct(product) {
  const isActive = product.active ?? product.available ?? true;

  return {
    ...product,
    active: isActive,
    available: isActive
  };
}

function loadStoredList(key, fallback) {
  if (typeof window === "undefined") return fallback;

  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallback;
  } catch {
    return fallback;
  }
}

function persistList(key, value) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(key, JSON.stringify(value));
}

export default function App() {
  const kitchenWaitTime = "25 Minutes";
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [pickupTime, setPickupTime] = useState("15 minutes");
  const [orderStatus, setOrderStatus] = useState(null);
  const [adminMode, setAdminMode] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [managedProducts, setManagedProducts] = useState(() =>
    loadStoredList(STORAGE_KEYS.products, mockProducts.map(normaliseProduct))
  );
  const [managedPromotions, setManagedPromotions] = useState(() =>
    loadStoredList(STORAGE_KEYS.promotions, mockPromotions)
  );

  useEffect(() => {
    persistList(STORAGE_KEYS.products, managedProducts);
  }, [managedProducts]);

  useEffect(() => {
    persistList(STORAGE_KEYS.promotions, managedPromotions);
  }, [managedPromotions]);

  const activeProducts = useMemo(
    () => managedProducts.filter((product) => product.active !== false && product.available !== false),
    [managedProducts]
  );

  const menuCategories = useMemo(
    () => Array.from(new Set(activeProducts.map((product) => product.category).filter(Boolean))),
    [activeProducts]
  );

  const products = useMemo(() => {
    if (selectedCategory === "All") return activeProducts;
    return activeProducts.filter((product) => product.category === selectedCategory);
  }, [activeProducts, selectedCategory]);

  const total = getCartTotal(cart);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const pickupSchedule = useMemo(
    () => getPickupSchedule(pickupTime, kitchenWaitTime),
    [pickupTime, kitchenWaitTime]
  );

  useEffect(() => {
    if (selectedCategory !== "All" && !menuCategories.includes(selectedCategory)) {
      setSelectedCategory("All");
    }
  }, [menuCategories, selectedCategory]);

  async function submitOrder() {
    if (!pickupSchedule.isValid) return;

    const order = {
      items: cart,
      pickupTime,
      scheduledPickup: pickupSchedule.scheduledPickup,
      total,
      businessName: businessConfig.businessName
    };

    const payment = await confirmPayment(order);
    const clover = await createCloverOrder({ ...order, payment });
    await notifyStaff({ ...order, payment, clover });

    setOrderStatus({
      message: "Order submitted",
      pickupTime: pickupSchedule.scheduledPickup,
      total,
      cloverOrderId: clover.cloverOrderId
    });

    setCart([]);
  }

  function decreaseQuantity(productId) {
    const currentItem = cart.find((item) => item.id === productId);

    if (!currentItem) return;
    if (currentItem.quantity <= 1) {
      setCart(removeFromCart(cart, productId));
      return;
    }

    setCart(
      cart.map((item) =>
        item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
      )
    );
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">
            <img src={wgccLogo} alt="" />
          </div>
          <div>
            <strong>{businessConfig.shortName}</strong>
            <span>Preorder</span>
          </div>
        </div>

        <button className="ghostButton" onClick={() => setAdminMode(!adminMode)}>
          <Settings size={16} />
          {adminMode ? "Customer View" : "Owner Preview"}
        </button>
      </header>

      {!adminMode ? (
        <>
          <section className="hero">
            <div className="heroCopy">
              <img className="heroLogo" src={wgccLogo} alt="Walkerton Golf & Curling Club" />
              <p className="eyebrow">Outdoor Dining at WGCC</p>
              <h1>Fresh clubhouse dining, ready when you are</h1>
              <p>
                Order from the WGCC menu for patio, deck, or clubhouse pickup and enjoy a relaxed meal with views across the course.
              </p>
              <div className="heroActions">
                <a href="#menu" className="primaryButton">Order Now</a>
                <a href="#menu" className="secondaryButton">View Menu</a>
              </div>
              <div className="heroMeta" aria-label="Dining highlights">
                <span>Wednesday to Sunday</span>
                <span>11:00 AM - 7:00 PM</span>
                <span>Patio & deck seating</span>
              </div>
            </div>

            <div className="heroCard" style={{ backgroundImage: `url(${outdoorDiningImage})` }}>
              <div className="heroCardContent">
                <UtensilsCrossed size={34} />
                <h3>Easy outdoor ordering</h3>
                <p>Use the upper deck service window, take a pager, and settle in while your order is prepared.</p>
                <span>
                  <MapPin size={15} />
                  164 Bruce Rd 2, Walkerton
                </span>
              </div>
            </div>
          </section>

          <section className="waitStatus" aria-label="Current kitchen wait time">
            <Clock size={18} />
            <span>Current Estimated Wait: {kitchenWaitTime}</span>
          </section>

          <section id="specials" className="promo">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Clubhouse Restaurant</p>
                <h2>Clubhouse Dining</h2>
              </div>
            </div>
            <div className="clubhouseInfo">
              <p>
                Enjoy fresh food and beverages before your round, at the turn, or after the game.
                Order ahead and pick up when ready.
              </p>
              <span>Fresh food, patio seating, and quick pickup from the Walkerton Golf &amp; Curling Club Restaurant.</span>
            </div>

            {managedPromotions.length > 0 && (
              <div className="promotionList">
                {managedPromotions.map((promotion) => (
                  <article className="promotionCard" key={promotion.id}>
                    <strong>{promotion.title}</strong>
                    <p>{promotion.message}</p>
                    {promotion.cta && <span>{promotion.cta}</span>}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section id="menu" className="section">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Menu</p>
                <h2>Build your pickup order</h2>
              </div>
            </div>

            <div className="filters">
              {["All", ...menuCategories].map((category) => (
                <button
                  key={category}
                  className={selectedCategory === category ? "filter active" : "filter"}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="productGrid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} onAdd={() => setCart(addToCart(cart, product))} />
              ))}
            </div>
          </section>

          {!cartExpanded ? (
            <button className="cartSummaryButton" type="button" onClick={() => setCartExpanded(true)}>
              🛒 Cart ({cartItemCount} {cartItemCount === 1 ? "item" : "items"}) • ${total.toFixed(2)}
            </button>
          ) : (
            <aside className="cartPanel">
              <div className="cartHeader">
                <div>
                  <ShoppingBag size={20} />
                  <strong>Your Order</strong>
                </div>
                <button className="cartCloseButton" type="button" onClick={() => setCartExpanded(false)}>
                  <X size={16} />
                  Close
                </button>
              </div>

              {cart.length === 0 ? (
                <p className="muted">Your cart is empty.</p>
              ) : (
                <>
                  {cart.map((item) => (
                    <div className="cartItem" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                      </div>
                      <div className="quantityControls" aria-label={`${item.name} quantity`}>
                        <button
                          type="button"
                          aria-label={`Decrease ${item.name} quantity`}
                          onClick={() => decreaseQuantity(item.id)}
                        >
                          -
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Increase ${item.name} quantity`}
                          onClick={() => setCart(addToCart(cart, item))}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}

                  <label className="pickup">
                    <Clock size={16} />
                    Pickup time
                    <select value={pickupTime} onChange={(event) => setPickupTime(event.target.value)}>
                      <option>15 minutes</option>
                      <option>30 minutes</option>
                      <option>45 minutes</option>
                      <option>1 hour</option>
                    </select>
                  </label>

                  <div className="cartTiming">
                    <div className="readyTime">
                      <span>Current Estimated Wait</span>
                      <strong>{kitchenWaitTime}</strong>
                    </div>
                    <div className="readyTime">
                      <span>Earliest Available Pickup</span>
                      <strong>{pickupSchedule.earliestPickup}</strong>
                    </div>
                    {pickupSchedule.showScheduledPickup && (
                      <div className="readyTime">
                        <span>Scheduled Pickup</span>
                        <strong>{pickupSchedule.scheduledPickup}</strong>
                      </div>
                    )}
                  </div>

                  {!pickupSchedule.isValid && (
                    <p className="pickupWarning">
                      Kitchen requires at least {kitchenWaitTime.toLowerCase()} notice.
                      Earliest available pickup is {pickupSchedule.earliestPickup}.
                    </p>
                  )}

                  <div className="total">
                    <span>Total</span>
                    <strong>${total.toFixed(2)}</strong>
                  </div>

                  <button className="primaryButton full" onClick={submitOrder} disabled={!pickupSchedule.isValid}>
                    Fake Checkout
                  </button>
                </>
              )}
            </aside>
          )}

          {orderStatus && (
            <div className="confirmation">
              <strong>{orderStatus.message}</strong>
              <p>Pickup: {orderStatus.pickupTime}</p>
              <p>Total: ${orderStatus.total.toFixed(2)}</p>
              <small>Mock Clover ID: {orderStatus.cloverOrderId}</small>
            </div>
          )}
        </>
      ) : (
        <OwnerPreview
          products={managedProducts}
          promotions={managedPromotions}
          onProductsChange={setManagedProducts}
          onPromotionsChange={setManagedPromotions}
        />
      )}
    </main>
  );
}

function getPickupSchedule(pickupTime, kitchenWaitTime) {
  const now = new Date();
  const kitchenWaitMinutes = parseMinutes(kitchenWaitTime);
  const selectedPickupMinutes = parseMinutes(pickupTime);
  const earliestPickupDate = addMinutes(now, kitchenWaitMinutes);
  const scheduledPickupDate = addMinutes(now, selectedPickupMinutes);
  const isValid = selectedPickupMinutes >= kitchenWaitMinutes;

  return {
    earliestPickup: formatPickupTime(earliestPickupDate),
    scheduledPickup: formatPickupTime(scheduledPickupDate),
    isValid,
    showScheduledPickup: isValid && selectedPickupMinutes !== kitchenWaitMinutes
  };
}

function parseMinutes(value) {
  if (value === "1 hour") return 60;
  return Number.parseInt(value, 10);
}

function addMinutes(date, minutes) {
  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate;
}

function formatPickupTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function ProductCard({ product, onAdd }) {
  return (
    <article className="productCard">
      <div className="imagePlaceholder">
        <UtensilsCrossed size={28} />
      </div>
      <div className="productInfo">
        <div>
          <span className="category">{product.category}</span>
          <h3>{product.name}</h3>
          <p>{product.description}</p>
        </div>
        <div className="productFooter">
          <strong>${product.price.toFixed(2)}</strong>
          <button onClick={onAdd}>Add</button>
        </div>
      </div>
    </article>
  );
}

function OwnerPreview({ products, promotions, onProductsChange, onPromotionsChange }) {
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState(null);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [editingPromotionId, setEditingPromotionId] = useState(null);

  const currentCategoryOptions = useMemo(() => {
    if (productForm.category && !ADMIN_CATEGORIES.includes(productForm.category)) {
      return [productForm.category, ...ADMIN_CATEGORIES];
    }

    return ADMIN_CATEGORIES;
  }, [productForm.category]);

  function updateProductForm(field, value) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  function resetProductForm() {
    setProductForm(emptyProductForm);
    setEditingProductId(null);
  }

  function submitProduct(event) {
    event.preventDefault();

    const price = Number.parseFloat(productForm.price);
    if (!productForm.name.trim() || Number.isNaN(price)) return;

    const productPayload = {
      name: productForm.name.trim(),
      description: productForm.description.trim(),
      price,
      category: productForm.category,
      featured: productForm.featured,
      active: productForm.active,
      available: productForm.active
    };

    if (editingProductId) {
      onProductsChange(
        products.map((product) =>
          product.id === editingProductId ? { ...product, ...productPayload } : product
        )
      );
    } else {
      onProductsChange([
        ...products,
        {
          id: createId(productPayload.name, "product"),
          ...productPayload
        }
      ]);
    }

    resetProductForm();
  }

  function editProduct(product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      category: product.category,
      featured: Boolean(product.featured),
      active: product.active !== false && product.available !== false
    });
  }

  function toggleProduct(productId) {
    onProductsChange(
      products.map((product) => {
        if (product.id !== productId) return product;

        const nextActive = !(product.active !== false && product.available !== false);
        return { ...product, active: nextActive, available: nextActive };
      })
    );
  }

  function deleteProduct(productId) {
    onProductsChange(products.filter((product) => product.id !== productId));

    if (editingProductId === productId) {
      resetProductForm();
    }
  }

  function updatePromotionForm(field, value) {
    setPromotionForm((current) => ({ ...current, [field]: value }));
  }

  function resetPromotionForm() {
    setPromotionForm(emptyPromotionForm);
    setEditingPromotionId(null);
  }

  function submitPromotion(event) {
    event.preventDefault();

    if (!promotionForm.title.trim() || !promotionForm.message.trim()) return;

    const promotionPayload = {
      title: promotionForm.title.trim(),
      message: promotionForm.message.trim(),
      cta: promotionForm.cta.trim()
    };

    if (editingPromotionId) {
      onPromotionsChange(
        promotions.map((promotion) =>
          promotion.id === editingPromotionId ? { ...promotion, ...promotionPayload } : promotion
        )
      );
    } else {
      onPromotionsChange([
        ...promotions,
        {
          id: createId(promotionPayload.title, "promotion"),
          ...promotionPayload
        }
      ]);
    }

    resetPromotionForm();
  }

  function editPromotion(promotion) {
    setEditingPromotionId(promotion.id);
    setPromotionForm({
      title: promotion.title,
      message: promotion.message,
      cta: promotion.cta || ""
    });
  }

  function deletePromotion(promotionId) {
    onPromotionsChange(promotions.filter((promotion) => promotion.id !== promotionId));

    if (editingPromotionId === promotionId) {
      resetPromotionForm();
    }
  }

  return (
    <section className="admin">
      <p className="eyebrow">Owner tools preview</p>
      <h1>Catalog & Promotions</h1>
      <p className="adminIntro">
        Manage menu items and clubhouse promotions for the ordering experience. Changes are stored locally in this browser for the board demo.
      </p>

      <div className="adminStack">
        <section className="adminPanel">
          <div className="adminPanelHeader">
            <div>
              <p className="eyebrow">Products</p>
              <h2>Menu Catalog</h2>
            </div>
            <span>{products.length} items</span>
          </div>

          <form className="adminForm" onSubmit={submitProduct}>
            <div className="formGrid">
              <label className="formField">
                Product Name
                <input
                  value={productForm.name}
                  onChange={(event) => updateProductForm("name", event.target.value)}
                  required
                />
              </label>

              <label className="formField">
                Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.price}
                  onChange={(event) => updateProductForm("price", event.target.value)}
                  required
                />
              </label>

              <label className="formField">
                Category
                <select
                  value={productForm.category}
                  onChange={(event) => updateProductForm("category", event.target.value)}
                >
                  {currentCategoryOptions.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>

              <label className="formField wide">
                Description
                <textarea
                  value={productForm.description}
                  onChange={(event) => updateProductForm("description", event.target.value)}
                  rows="3"
                />
              </label>
            </div>

            <div className="adminControls">
              <label className="toggleField">
                <input
                  type="checkbox"
                  checked={productForm.featured}
                  onChange={(event) => updateProductForm("featured", event.target.checked)}
                />
                Featured
              </label>

              <label className="toggleField">
                <input
                  type="checkbox"
                  checked={productForm.active}
                  onChange={(event) => updateProductForm("active", event.target.checked)}
                />
                Active
              </label>

              <button className="goldButton" type="submit">
                {editingProductId ? "Save Product" : "Add Product"}
              </button>
              {editingProductId && (
                <button className="mutedButton" type="button" onClick={resetProductForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="managerList" aria-label="Managed menu products">
            {products.map((product) => {
              const isActive = product.active !== false && product.available !== false;

              return (
                <article className="managerRow" key={product.id}>
                  <div className="managerMeta">
                    <strong>{product.name}</strong>
                    <span>{product.category} • ${product.price.toFixed(2)}</span>
                  </div>
                  <span className={isActive ? "statusPill" : "statusPill inactive"}>
                    {isActive ? "Active" : "Inactive"}
                  </span>
                  <div className="managerActions">
                    <button type="button" onClick={() => editProduct(product)}>Edit</button>
                    <button type="button" onClick={() => toggleProduct(product.id)}>
                      {isActive ? "Disable" : "Activate"}
                    </button>
                    <button className="dangerButton" type="button" onClick={() => deleteProduct(product.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="adminPanel">
          <div className="adminPanelHeader">
            <div>
              <p className="eyebrow">Promotions</p>
              <h2>Clubhouse Messages</h2>
            </div>
            <span>{promotions.length} active</span>
          </div>

          <form className="adminForm" onSubmit={submitPromotion}>
            <div className="formGrid">
              <label className="formField">
                Promotion Title
                <input
                  value={promotionForm.title}
                  onChange={(event) => updatePromotionForm("title", event.target.value)}
                  required
                />
              </label>

              <label className="formField">
                Supporting Label
                <input
                  value={promotionForm.cta}
                  onChange={(event) => updatePromotionForm("cta", event.target.value)}
                />
              </label>

              <label className="formField wide">
                Description
                <textarea
                  value={promotionForm.message}
                  onChange={(event) => updatePromotionForm("message", event.target.value)}
                  rows="3"
                  required
                />
              </label>
            </div>

            <div className="adminControls">
              <button className="goldButton" type="submit">
                {editingPromotionId ? "Save Promotion" : "Add Promotion"}
              </button>
              {editingPromotionId && (
                <button className="mutedButton" type="button" onClick={resetPromotionForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="promotionManagerList">
            {promotions.map((promotion) => (
              <article className="promotionManagerCard" key={promotion.id}>
                <div>
                  <strong>{promotion.title}</strong>
                  <p>{promotion.message}</p>
                  {promotion.cta && <span>{promotion.cta}</span>}
                </div>
                <div className="managerActions">
                  <button type="button" onClick={() => editPromotion(promotion)}>Edit</button>
                  <button className="dangerButton" type="button" onClick={() => deletePromotion(promotion.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="adminGrid">
          <div className="adminCard">
            <h3>Kitchen Wait Time</h3>
            <p>Placeholder setting for showing customers the current estimated kitchen wait.</p>
            <select defaultValue="30 minutes">
              <option>10 minutes</option>
              <option>20 minutes</option>
              <option>30 minutes</option>
              <option>45 minutes</option>
              <option>60 minutes</option>
              <option>Custom</option>
            </select>
          </div>

          <div className="adminCard">
            <h3>Future Integrations</h3>
            <p>Supabase login, Clover order sync, payment confirmation, and staff notifications remain separated into services.</p>
          </div>
        </section>
      </div>
    </section>
  );
}
