import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock, Settings, ShoppingBag, ShoppingCart, UtensilsCrossed, X } from "lucide-react";
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
  promotions: "wgcc-managed-promotions",
  orders: "wgcc-managed-orders"
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

const emptyCustomerInfo = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  specialInstructions: ""
};

const ORDER_STATUSES = ["New", "Preparing", "Ready", "Completed", "Cancelled"];
const ACTIVE_ORDER_STATUSES = ["New", "Preparing", "Ready"];
const COMPLETED_ORDER_STATUSES = ["Completed", "Cancelled"];
const KITCHEN_WAIT_OPTIONS = ["10 Minutes", "20 Minutes", "30 Minutes", "45 Minutes", "60 Minutes"];

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

function createOrderRecord({ items, total, scheduledPickup, customerInfo }) {
  const createdAt = new Date();
  const customerName = `${customerInfo.firstName} ${customerInfo.lastName}`.trim();

  return {
    id: createId("wgcc-order", "order"),
    orderNumber: `WGCC-${String(createdAt.getTime()).slice(-6)}`,
    customerName,
    phoneNumber: customerInfo.phone,
    email: customerInfo.email,
    orderTime: formatPickupTime(createdAt),
    createdAt: createdAt.toISOString(),
    scheduledPickupTime: scheduledPickup,
    status: "New",
    viewed: false,
    notes: customerInfo.specialInstructions.trim() || "None",
    total,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price
    }))
  };
}

function isToday(isoDate) {
  const date = new Date(isoDate);
  const today = new Date();

  return date.toDateString() === today.toDateString();
}

function queueReadyNotification(order) {
  // Future Twilio SMS integration:
  // Send this message to order.phoneNumber when SMS credentials and consent capture are added.
  const message = "Your order is ready for pickup at the Walkerton Golf & Curling Club Restaurant.";

  return {
    orderId: order.id,
    channel: "sms",
    provider: "twilio",
    message
  };
}

export default function App() {
  const [kitchenWaitTime, setKitchenWaitTime] = useState("25 Minutes");
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [pickupTime, setPickupTime] = useState("asap");
  const [customPickupTime, setCustomPickupTime] = useState("");
  const [customerInfo, setCustomerInfo] = useState(emptyCustomerInfo);
  const [orderStatus, setOrderStatus] = useState(null);
  const [adminMode, setAdminMode] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [cartStep, setCartStep] = useState("review");
  const [managedProducts, setManagedProducts] = useState(() =>
    loadStoredList(STORAGE_KEYS.products, mockProducts.map(normaliseProduct))
  );
  const [managedPromotions, setManagedPromotions] = useState(() =>
    loadStoredList(STORAGE_KEYS.promotions, mockPromotions)
  );
  const [managedOrders, setManagedOrders] = useState(() =>
    loadStoredList(STORAGE_KEYS.orders, [])
  );

  useEffect(() => {
    persistList(STORAGE_KEYS.products, managedProducts);
  }, [managedProducts]);

  useEffect(() => {
    persistList(STORAGE_KEYS.promotions, managedPromotions);
  }, [managedPromotions]);

  useEffect(() => {
    persistList(STORAGE_KEYS.orders, managedOrders);
  }, [managedOrders]);

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
    () => getPickupSchedule(pickupTime, kitchenWaitTime, customPickupTime),
    [customPickupTime, pickupTime, kitchenWaitTime]
  );
  const pickupOptions = useMemo(() => getPickupOptions(kitchenWaitTime), [kitchenWaitTime]);
  const customerInfoComplete = Boolean(customerInfo.firstName.trim()
    && customerInfo.lastName.trim()
    && customerInfo.phone.trim());
  const canPlaceOrder = pickupSchedule.isValid && customerInfoComplete;

  useEffect(() => {
    if (selectedCategory !== "All" && !menuCategories.includes(selectedCategory)) {
      setSelectedCategory("All");
    }
  }, [menuCategories, selectedCategory]);

  useEffect(() => {
    if (!customPickupTime) {
      setCustomPickupTime(getTimeInputValue(pickupSchedule.earliestPickupDate));
    }
  }, [customPickupTime, pickupSchedule.earliestPickupDate]);

  async function submitOrder() {
    if (!canPlaceOrder) return;

    const order = {
      items: cart,
      pickupTime,
      scheduledPickup: pickupSchedule.scheduledPickup,
      customer: customerInfo,
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

    setManagedOrders((orders) => [
      createOrderRecord({
        items: cart,
        total,
        scheduledPickup: pickupSchedule.scheduledPickup,
        customerInfo
      }),
      ...orders
    ]);
    setCart([]);
    setCustomerInfo(emptyCustomerInfo);
    setCartStep("review");
    setCartExpanded(false);
  }

  function updateCustomerInfo(field, value) {
    setCustomerInfo((current) => ({ ...current, [field]: value }));
  }

  function updatePickupTime(value) {
    setPickupTime(value);

    if (value === "custom") {
      setCustomPickupTime(getTimeInputValue(addMinutes(new Date(), parseMinutes(kitchenWaitTime))));
    }
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

  function openCart() {
    setCartStep("review");
    setCartExpanded(true);
  }

  function closeCart() {
    setCartStep("review");
    setCartExpanded(false);
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
          {adminMode ? "Customer View" : "Admin"}
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

            <div className="heroCard" style={{ backgroundImage: `url(${outdoorDiningImage})` }} />
          </section>

          <section className="waitStatus" aria-label="Current kitchen wait time">
            <Clock size={18} />
            <span>Current Estimated Wait: {kitchenWaitTime}</span>
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
            <button className="cartSummaryButton" type="button" onClick={openCart}>
              <ShoppingCart size={18} />
              Cart ({cartItemCount} {cartItemCount === 1 ? "item" : "items"}) • ${total.toFixed(2)}
            </button>
          ) : (
            <aside className="cartPanel" aria-label={cartStep === "review" ? "Cart review" : "Checkout"}>
              <div className="cartHeader">
                <div>
                  {cartStep === "checkout" && (
                    <button className="iconButton" type="button" onClick={() => setCartStep("review")} aria-label="Back to cart review">
                      <ArrowLeft size={17} />
                    </button>
                  )}
                  <ShoppingBag size={20} />
                  <strong>{cartStep === "review" ? "Cart Review" : "Checkout"}</strong>
                </div>
                <button className="cartCloseButton" type="button" onClick={closeCart}>
                  <X size={16} />
                  Close
                </button>
              </div>

              {cart.length === 0 ? (
                <p className="muted">Your cart is empty.</p>
              ) : (
                cartStep === "review" ? (
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
                      <select value={pickupTime} onChange={(event) => updatePickupTime(event.target.value)}>
                        {pickupOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        <option value="custom">Custom Time</option>
                      </select>
                    </label>

                    {pickupTime === "custom" && (
                      <label className="cartField">
                        Custom pickup time
                        <input
                          type="time"
                          min={getTimeInputValue(pickupSchedule.earliestPickupDate)}
                          value={customPickupTime}
                          onChange={(event) => setCustomPickupTime(event.target.value)}
                        />
                      </label>
                    )}

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

                    <button
                      className="primaryButton full"
                      type="button"
                      onClick={() => setCartStep("checkout")}
                      disabled={!pickupSchedule.isValid}
                    >
                      Continue Checkout
                    </button>
                  </>
                ) : (
                  <>
                    <section className="checkoutSection" aria-labelledby="customer-info-heading">
                      <h3 id="customer-info-heading">Customer Information</h3>
                      <div className="checkoutFields">
                        <label className="cartField">
                          First Name
                          <input
                            value={customerInfo.firstName}
                            onChange={(event) => updateCustomerInfo("firstName", event.target.value)}
                            required
                          />
                        </label>
                        <label className="cartField">
                          Last Name
                          <input
                            value={customerInfo.lastName}
                            onChange={(event) => updateCustomerInfo("lastName", event.target.value)}
                            required
                          />
                        </label>
                        <label className="cartField wide">
                          Mobile Phone Number
                          <input
                            type="tel"
                            value={customerInfo.phone}
                            onChange={(event) => updateCustomerInfo("phone", event.target.value)}
                            required
                          />
                        </label>
                        <label className="cartField wide">
                          Email Address <span>Optional</span>
                          <input
                            type="email"
                            value={customerInfo.email}
                            onChange={(event) => updateCustomerInfo("email", event.target.value)}
                          />
                        </label>
                      </div>
                    </section>

                    <section className="checkoutSection" aria-labelledby="special-instructions-heading">
                      <h3 id="special-instructions-heading">Special Instructions</h3>
                      <label className="cartField">
                        Examples: No mayo, no pickles, extra onions, allergy notes
                        <textarea
                          value={customerInfo.specialInstructions}
                          onChange={(event) => updateCustomerInfo("specialInstructions", event.target.value)}
                          placeholder="No mayo, no pickles, extra onions, allergy notes"
                          rows="3"
                        />
                      </label>
                    </section>

                    <section className="checkoutSection" aria-labelledby="order-summary-heading">
                      <h3 id="order-summary-heading">Order Summary</h3>
                      <div className="orderSummaryList">
                        {cart.map((item) => (
                          <div className="orderSummaryItem" key={item.id}>
                            <span>{item.quantity} x {item.name}</span>
                            <strong>${(item.price * item.quantity).toFixed(2)}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="readyTime">
                        <span>Pickup</span>
                        <strong>{pickupSchedule.scheduledPickup}</strong>
                      </div>
                      <div className="total">
                        <span>Total</span>
                        <strong>${total.toFixed(2)}</strong>
                      </div>
                    </section>

                    <button className="primaryButton full" onClick={submitOrder} disabled={!canPlaceOrder}>
                      Place Order
                    </button>
                  </>
                )
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
        <AdminDashboard
          products={managedProducts}
          promotions={managedPromotions}
          orders={managedOrders}
          kitchenWaitTime={kitchenWaitTime}
          onKitchenWaitTimeChange={setKitchenWaitTime}
          onProductsChange={setManagedProducts}
          onPromotionsChange={setManagedPromotions}
          onOrdersChange={setManagedOrders}
        />
      )}
    </main>
  );
}

function getPickupSchedule(pickupTime, kitchenWaitTime, customPickupTime) {
  const now = new Date();
  const kitchenWaitMinutes = parseMinutes(kitchenWaitTime);
  const earliestPickupDate = addMinutes(now, kitchenWaitMinutes);
  const scheduledPickupDate = pickupTime === "custom"
    ? getCustomPickupDate(now, customPickupTime || getTimeInputValue(earliestPickupDate))
    : addMinutes(now, pickupTime === "asap" ? kitchenWaitMinutes : parseMinutes(pickupTime));
  const isValid = scheduledPickupDate.getTime() >= earliestPickupDate.getTime();

  return {
    earliestPickupDate,
    earliestPickup: formatPickupTime(earliestPickupDate),
    scheduledPickup: formatPickupTime(scheduledPickupDate),
    isValid,
    showScheduledPickup: isValid && scheduledPickupDate.getTime() !== earliestPickupDate.getTime()
  };
}

function getPickupOptions(kitchenWaitTime) {
  const kitchenWaitMinutes = parseMinutes(kitchenWaitTime);
  const presetMinutes = [30, 45, 60].filter((minutes) => minutes > kitchenWaitMinutes);

  return [
    {
      value: "asap",
      label: `ASAP (${kitchenWaitMinutes} minutes)`
    },
    ...presetMinutes.map((minutes) => ({
      value: minutes === 60 ? "1 hour" : `${minutes} minutes`,
      label: minutes === 60 ? "60 minutes" : `${minutes} minutes`
    }))
  ];
}

function parseMinutes(value) {
  if (value === "1 hour") return 60;
  return Number.parseInt(value, 10);
}

function addMinutes(date, minutes) {
  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() + minutes, 0, 0);
  return nextDate;
}

function formatPickupTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function getTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getCustomPickupDate(now, timeValue) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const pickupDate = new Date(now);

  pickupDate.setHours(hours, minutes, 0, 0);

  return pickupDate;
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

function AdminDashboard({
  products,
  promotions,
  orders,
  kitchenWaitTime,
  onKitchenWaitTimeChange,
  onProductsChange,
  onPromotionsChange,
  onOrdersChange
}) {
  const [activeAdminTab, setActiveAdminTab] = useState("orders");
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState(null);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [editingPromotionId, setEditingPromotionId] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [completedOrdersExpanded, setCompletedOrdersExpanded] = useState(false);
  const [waitTimeMode, setWaitTimeMode] = useState("preset");

  const ordersToday = useMemo(() => orders.filter((order) => isToday(order.createdAt)), [orders]);
  const activeOrders = useMemo(
    () => ordersToday.filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status)),
    [ordersToday]
  );
  const completedOrders = useMemo(
    () => ordersToday.filter((order) => COMPLETED_ORDER_STATUSES.includes(order.status)),
    [ordersToday]
  );
  const revenueOrders = ordersToday.filter((order) => order.status !== "Cancelled");
  const revenueToday = revenueOrders.reduce((sum, order) => sum + order.total, 0);
  const averageOrderValue = revenueOrders.length > 0 ? revenueToday / revenueOrders.length : 0;
  const kitchenWaitSelectValue = waitTimeMode === "custom" || !KITCHEN_WAIT_OPTIONS.includes(kitchenWaitTime)
    ? "Custom"
    : kitchenWaitTime;

  const currentCategoryOptions = useMemo(() => {
    if (productForm.category && !ADMIN_CATEGORIES.includes(productForm.category)) {
      return [productForm.category, ...ADMIN_CATEGORIES];
    }

    return ADMIN_CATEGORIES;
  }, [productForm.category]);

  function updateOrderStatus(orderId, status) {
    if (!ORDER_STATUSES.includes(status)) return;

    onOrdersChange(
      orders.map((order) => {
        if (order.id !== orderId) return order;

        const updatedOrder = { ...order, status };

        if (status === "Ready") {
          updatedOrder.readyNotification = queueReadyNotification(updatedOrder);
        }

        return updatedOrder;
      })
    );
  }

  function toggleOrderExpansion(order) {
    const isExpanded = expandedOrderId === order.id;

    setExpandedOrderId(isExpanded ? null : order.id);

    if (!isExpanded && order.viewed !== true) {
      onOrdersChange(
        orders.map((currentOrder) =>
          currentOrder.id === order.id ? { ...currentOrder, viewed: true } : currentOrder
        )
      );
    }
  }

  function updateKitchenWaitTime(value) {
    if (value === "Custom") {
      setWaitTimeMode("custom");
      return;
    }

    setWaitTimeMode("preset");
    onKitchenWaitTimeChange(value);
  }

  function updateCustomKitchenWaitTime(value) {
    const minutes = Number.parseInt(value, 10);

    if (!Number.isNaN(minutes) && minutes > 0) {
      onKitchenWaitTimeChange(`${minutes} Minutes`);
    }
  }

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

  function renderOrderCard(order) {
    const isExpanded = expandedOrderId === order.id;
    const isUnviewed = order.viewed !== true;

    return (
      <article className={isUnviewed ? "orderCard unviewed" : "orderCard"} key={order.id}>
        <button
          className="orderSummaryButton"
          type="button"
          onClick={() => toggleOrderExpansion(order)}
          aria-expanded={isExpanded}
        >
          <span className="orderNumberCell">
            {order.orderNumber}
            {isUnviewed && (
              <span className="newOrderBadge" title="This order has not yet been reviewed by staff.">
                New
              </span>
            )}
          </span>
          <span>{order.customerName}</span>
          <span>{order.scheduledPickupTime}</span>
          <span className={isUnviewed && order.status === "New" ? "orderStatusText" : `orderStatus ${order.status.toLowerCase()}`}>
            {order.status}
          </span>
          <strong>${order.total.toFixed(2)}</strong>
        </button>

        {isExpanded && (
          <div className="orderDetails">
            <div className="orderDetailGrid">
              <div>
                <span>Customer Name</span>
                <strong>{order.customerName}</strong>
              </div>
              <div>
                <span>Phone Number</span>
                <strong>{order.phoneNumber}</strong>
              </div>
              <div>
                <span>Order Time</span>
                <strong>{order.orderTime}</strong>
              </div>
              <div>
                <span>Scheduled Pickup Time</span>
                <strong>{order.scheduledPickupTime}</strong>
              </div>
              <div>
                <span>Special Instructions</span>
                <strong>{order.notes}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>${order.total.toFixed(2)}</strong>
              </div>
            </div>

            <div className="orderedItems">
              <strong>Items Ordered</strong>
              {order.items.map((item) => (
                <div className="orderedItem" key={item.id}>
                  <span>{item.name}</span>
                  <span>Qty {item.quantity}</span>
                </div>
              ))}
            </div>

            {order.readyNotification && (
              <p className="notificationNote">
                Ready notification queued for future Twilio SMS workflow.
              </p>
            )}

            <div className="orderActions">
              <button type="button" onClick={() => updateOrderStatus(order.id, "Preparing")}>
                Mark Preparing
              </button>
              <button type="button" onClick={() => updateOrderStatus(order.id, "Ready")}>
                Mark Ready
              </button>
              <button type="button" onClick={() => updateOrderStatus(order.id, "Completed")}>
                Mark Completed
              </button>
              <button className="dangerButton" type="button" onClick={() => updateOrderStatus(order.id, "Cancelled")}>
                Cancel Order
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="admin">
      <p className="eyebrow">Restaurant Operations</p>
      <h1>Admin</h1>
      <p className="adminIntro">
        Track daily orders, kitchen status, menu availability, and clubhouse promotions from one local operations dashboard.
      </p>

      <div className="adminTabs" role="tablist" aria-label="Admin sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeAdminTab === "orders"}
          className={activeAdminTab === "orders" ? "adminTab active" : "adminTab"}
          onClick={() => setActiveAdminTab("orders")}
        >
          Orders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeAdminTab === "catalog"}
          className={activeAdminTab === "catalog" ? "adminTab active" : "adminTab"}
          onClick={() => setActiveAdminTab("catalog")}
        >
          Catalog & Promotions
        </button>
      </div>

      {activeAdminTab === "orders" ? (
        <div className="adminStack">
          <section className="reportGrid" aria-label="Daily reporting">
            <article className="reportCard">
              <span>Orders Today</span>
              <strong>{ordersToday.length}</strong>
            </article>
            <article className="reportCard">
              <span>Revenue Today</span>
              <strong>${revenueToday.toFixed(2)}</strong>
            </article>
            <article className="reportCard">
              <span>Average Order Value</span>
              <strong>${averageOrderValue.toFixed(2)}</strong>
            </article>
            <article className="reportCard">
              <span>Current Kitchen Wait Time</span>
              <strong>{kitchenWaitTime}</strong>
            </article>
          </section>

          <section className="adminPanel">
            <div className="adminPanelHeader">
              <div>
                <p className="eyebrow">Kitchen</p>
                <h2>Current Wait Time</h2>
              </div>
              <span>{kitchenWaitTime}</span>
            </div>
            <div className="waitControl">
              <strong>{kitchenWaitTime}</strong>
              <label className="formField compact">
                Change Wait Time
                <select value={kitchenWaitSelectValue} onChange={(event) => updateKitchenWaitTime(event.target.value)}>
                  {KITCHEN_WAIT_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                  <option>Custom</option>
                </select>
              </label>
              {kitchenWaitSelectValue === "Custom" && (
                <label className="formField compact">
                  Custom Minutes
                  <input
                    type="number"
                    min="1"
                    value={parseMinutes(kitchenWaitTime)}
                    onChange={(event) => updateCustomKitchenWaitTime(event.target.value)}
                  />
                </label>
              )}
            </div>
          </section>

          <section className="adminPanel">
            <div className="adminPanelHeader">
              <div>
                <p className="eyebrow">Orders</p>
                <h2>Active Orders ({activeOrders.length})</h2>
              </div>
              <span>New, Preparing, Ready</span>
            </div>

            <div className="ordersList">
              <div className="ordersHeader">
                <span>Order Number</span>
                <span>Customer Name</span>
                <span>Scheduled Pickup</span>
                <span>Status</span>
                <span>Total</span>
              </div>

              {activeOrders.length === 0 ? (
                <p className="emptyState">No active orders right now.</p>
              ) : (
                activeOrders.map(renderOrderCard)
              )}
            </div>
          </section>

          <section className="adminPanel">
            <button
              className="completedOrdersToggle"
              type="button"
              onClick={() => setCompletedOrdersExpanded(!completedOrdersExpanded)}
              aria-expanded={completedOrdersExpanded}
            >
              <span>Completed Orders ({completedOrders.length})</span>
              <strong>{completedOrdersExpanded ? "Hide" : "Show"}</strong>
            </button>

            {completedOrdersExpanded && (
              <div className="ordersList">
                <div className="ordersHeader">
                  <span>Order Number</span>
                  <span>Customer Name</span>
                  <span>Scheduled Pickup</span>
                  <span>Status</span>
                  <span>Total</span>
                </div>

                {completedOrders.length === 0 ? (
                  <p className="emptyState">No completed or cancelled orders today.</p>
                ) : (
                  completedOrders.map(renderOrderCard)
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
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

          <div className="managerTable" aria-label="Managed menu products">
            <div className="managerTableHeader">
              <span>Name</span>
              <span>Category</span>
              <span>Price</span>
              <span>Featured</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {products.map((product) => {
              const isActive = product.active !== false && product.available !== false;

              return (
                <article className="managerRow productManagerRow" key={product.id}>
                  <div className="managerMeta">
                    <strong>{product.name}</strong>
                  </div>
                  <span>{product.category}</span>
                  <span>${product.price.toFixed(2)}</span>
                  <span>{product.featured ? "Yes" : "No"}</span>
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
        </div>
      )}
    </section>
  );
}
