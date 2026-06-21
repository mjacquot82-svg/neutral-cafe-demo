import { useMemo, useState } from "react";
import { Clock, MapPin, Settings, ShoppingBag, UtensilsCrossed } from "lucide-react";
import wgccLogo from "./assets/wgcc-logo.webp";
import outdoorDiningImage from "./assets/wgcc-outdoor-dining.webp";
import { businessConfig } from "./config/businessConfig";
import { mockProducts } from "./data/mockProducts";
import { addToCart, removeFromCart, getCartTotal } from "./stores/cartStore";
import { confirmPayment } from "./services/paymentService";
import { createCloverOrder } from "./services/cloverService";
import { notifyStaff } from "./services/notificationService";
import "./style.css";

export default function App() {
  const kitchenWaitTime = "25 Minutes";
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [pickupTime, setPickupTime] = useState("15 minutes");
  const [orderStatus, setOrderStatus] = useState(null);
  const [adminMode, setAdminMode] = useState(false);

  const products = useMemo(() => {
    if (selectedCategory === "All") return mockProducts;
    return mockProducts.filter((product) => product.category === selectedCategory);
  }, [selectedCategory]);

  const total = getCartTotal(cart);

  async function submitOrder() {
    const order = {
      items: cart,
      pickupTime,
      total,
      businessName: businessConfig.businessName
    };

    const payment = await confirmPayment(order);
    const clover = await createCloverOrder({ ...order, payment });
    await notifyStaff({ ...order, payment, clover });

    setOrderStatus({
      message: "Order submitted",
      pickupTime,
      total,
      cloverOrderId: clover.cloverOrderId
    });

    setCart([]);
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
          </section>

          <section id="menu" className="section">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Menu</p>
                <h2>Build your pickup order</h2>
              </div>
            </div>

            <div className="filters">
              {["All", ...businessConfig.categories].map((category) => (
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

          <aside className="cartPanel">
            <div className="cartHeader">
              <ShoppingBag size={20} />
              <strong>Your Order</strong>
            </div>

            {cart.length === 0 ? (
              <p className="muted">Your cart is empty.</p>
            ) : (
              <>
                {cart.map((item) => (
                  <div className="cartItem" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>Qty {item.quantity}</span>
                    </div>
                    <button onClick={() => setCart(removeFromCart(cart, item.id))}>Remove</button>
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

                <div className="readyTime">
                  <span>Estimated Ready Time</span>
                  <strong>{pickupTime}</strong>
                </div>

                <div className="total">
                  <span>Total</span>
                  <strong>${total.toFixed(2)}</strong>
                </div>

                <button className="primaryButton full" onClick={submitOrder}>
                  Fake Checkout
                </button>
              </>
            )}
          </aside>

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
        <OwnerPreview />
      )}
    </main>
  );
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

function OwnerPreview() {
  return (
    <section className="admin">
      <p className="eyebrow">Owner tools preview</p>
      <h1>Catalog & Promotions</h1>
      <p>
        This area is intentionally structured for future Supabase admin login,
        product editing, pricing, availability toggles, photos, and promotions.
      </p>

      <div className="adminGrid">
        <div className="adminCard">
          <h3>Products</h3>
          <p>Add breakfast items, sandwiches, clubhouse meals, prices, descriptions, categories, and availability.</p>
          <button>Add Product</button>
        </div>

        <div className="adminCard">
          <h3>Promotions</h3>
          <p>Create homepage banners, seasonal specials, featured products, and announcements.</p>
          <button>Create Promotion</button>
        </div>

        <div className="adminCard">
          <h3>Future Integrations</h3>
          <p>Supabase, Clover order sync, payment confirmation, and notifications are separated into services.</p>
          <button>View Services</button>
        </div>

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
      </div>
    </section>
  );
}
