import { useMemo, useState } from "react";
import { Clock, Flag, Settings, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { businessConfig } from "./config/businessConfig";
import { mockProducts } from "./data/mockProducts";
import { mockPromotions } from "./data/mockPromotions";
import { addToCart, removeFromCart, getCartTotal } from "./stores/cartStore";
import { confirmPayment } from "./services/paymentService";
import { createCloverOrder } from "./services/cloverService";
import { notifyStaff } from "./services/notificationService";
import "./style.css";

export default function App() {
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(businessConfig.categories[0]);
  const [pickupTime, setPickupTime] = useState("15 minutes");
  const [orderStatus, setOrderStatus] = useState(null);
  const [adminMode, setAdminMode] = useState(false);

  const products = useMemo(() => mockProducts.filter((product) => product.category === selectedCategory), [selectedCategory]);
  const featuredProducts = mockProducts.filter((product) => product.featured);
  const total = getCartTotal(cart);

  async function submitOrder() { return; }

  return <main><section id="menu" className="section"><div className="filters">{businessConfig.categories.map((category)=><button key={category} className={selectedCategory===category?"filter active":"filter"} onClick={()=>setSelectedCategory(category)}>{category}</button>)}</div><div className="productGrid">{products.map((product)=><ProductCard key={product.id} product={product} onAdd={()=>setCart(addToCart(cart,product))} />)}</div></section></main>;
}

function ProductCard({ product, onAdd }) {
 return <article className="productCard"><div className="productInfo"><span className="category">{product.category}</span><h3>{product.name}</h3><button onClick={onAdd}>Add</button></div></article>;
}

function OwnerPreview(){ return null; }