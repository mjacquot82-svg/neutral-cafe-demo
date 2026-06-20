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

  const products = useMemo(() => {
    return mockProducts.filter((product) => product.category === selectedCategory);
  }, [selectedCategory]);

  const featuredProducts = mockProducts.filter((product) => product.featured);
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

  return 