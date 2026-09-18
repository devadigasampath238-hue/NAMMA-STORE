package com.nammastore;

import jakarta.persistence.*;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * ===========================================================
 * Orders.java
 * -----------------------------------------------------------
 * Cart, coupons, checkout, orders, order items and order
 * status.
 *
 * STAGE 1 FIXES
 * -------------
 *  1. SERIALIZATION. Order -> items -> OrderItem.order -> Order
 *     was an infinite Jackson cycle. Every read endpoint now
 *     returns OrderDto (Dtos.java) and the back-reference is
 *     marked @JsonIgnore as a second line of defence.
 *
 *  2. DIVIDE-BY-ZERO / NON-TERMINATING DECIMAL. The coupon
 *     maths used BigDecimal.divide() with no scale, which
 *     throws ArithmeticException for something as ordinary as
 *     a 33% coupon. Now scaled to 2dp, HALF_UP.
 *
 *  3. PRICING IS SERVER-SIDE. The client never sends a total.
 *     Subtotal comes from the product rows, the coupon is
 *     re-validated here, delivery comes from configuration,
 *     and the order is persisted with every component broken
 *     out (subtotal / discount / delivery / total).
 *
 *  4. ORDER IS SAVED BEFORE SUCCESS. checkout() is
 *     @Transactional: stock decrements, the order + items
 *     insert and the cart clear either all commit or all roll
 *     back. The API only returns 201 once the row exists.
 *
 *  5. REAL STATUS LIFECYCLE:
 *     PLACED -> CONFIRMED -> PROCESSING -> SHIPPED ->
 *     OUT_FOR_DELIVERY -> DELIVERED, plus CANCELLED.
 * ===========================================================
 */

@Entity
@Table(name = "orders")
class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Customer-facing reference, e.g. NS100042. Assigned on first save. */
    @Column(unique = true)
    private String orderNumber;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id")
    private AppUser user;

    /* ---- money, all computed on the server ---- */
    private BigDecimal subtotal = BigDecimal.ZERO;
    private BigDecimal discountAmount = BigDecimal.ZERO;
    private BigDecimal deliveryCharge = BigDecimal.ZERO;
    private BigDecimal totalAmount = BigDecimal.ZERO;

    private String couponCode;

    /** COD | UPI | CARD | NETBANKING */
    private String paymentMethod = "COD";

    /** PENDING | PAID | FAILED | REFUNDED */
    private String paymentStatus = "PENDING";

    /** PLACED | CONFIRMED | PROCESSING | SHIPPED | OUT_FOR_DELIVERY | DELIVERED | CANCELLED */
    private String status = OrderStatus.PLACED;

    /** Set once, the first time status becomes DELIVERED. Anchors the 10-day return window. */
    private Instant deliveredAt;

    /** null | REQUESTED | APPROVED | REJECTED | COMPLETED */
    private String returnStatus;

    private Instant returnRequestedAt;

    /* ---- cancellation detail (FEATURE #3) ---- */
    private String cancellationReason;

    @Column(length = 1000)
    private String cancellationComments;

    private Instant cancelledAt;
    private String returnReason;

    /* ---- customer + address snapshot taken at order time ---- */
    private String customerName;
    private String customerEmail;
    private String customerPhone;

    @Column(length = 500)
    private String addressLine;
    private String city;
    private String state;
    private String pincode;

    /** Kept for backwards compatibility with existing rows and the old API. */
    @Column(length = 1000)
    private String shippingAddressSnapshot;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<OrderItem> items = new ArrayList<>();

    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getOrderNumber() { return orderNumber; }
    public void setOrderNumber(String orderNumber) { this.orderNumber = orderNumber; }

    public AppUser getUser() { return user; }
    public void setUser(AppUser user) { this.user = user; }

    public BigDecimal getSubtotal() { return subtotal; }
    public void setSubtotal(BigDecimal subtotal) { this.subtotal = subtotal; }

    public BigDecimal getDiscountAmount() { return discountAmount; }
    public void setDiscountAmount(BigDecimal discountAmount) { this.discountAmount = discountAmount; }

    public BigDecimal getDeliveryCharge() { return deliveryCharge; }
    public void setDeliveryCharge(BigDecimal deliveryCharge) { this.deliveryCharge = deliveryCharge; }

    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

    public String getCouponCode() { return couponCode; }
    public void setCouponCode(String couponCode) { this.couponCode = couponCode; }

    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }

    public String getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(String paymentStatus) { this.paymentStatus = paymentStatus; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getDeliveredAt() { return deliveredAt; }
    public void setDeliveredAt(Instant deliveredAt) { this.deliveredAt = deliveredAt; }

    public String getReturnStatus() { return returnStatus; }
    public void setReturnStatus(String returnStatus) { this.returnStatus = returnStatus; }

    public String getCancellationReason() { return cancellationReason; }
    public void setCancellationReason(String cancellationReason) { this.cancellationReason = cancellationReason; }
    public String getCancellationComments() { return cancellationComments; }
    public void setCancellationComments(String cancellationComments) { this.cancellationComments = cancellationComments; }
    public Instant getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(Instant cancelledAt) { this.cancelledAt = cancelledAt; }
    public Instant getReturnRequestedAt() { return returnRequestedAt; }
    public void setReturnRequestedAt(Instant returnRequestedAt) { this.returnRequestedAt = returnRequestedAt; }

    public String getReturnReason() { return returnReason; }
    public void setReturnReason(String returnReason) { this.returnReason = returnReason; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }

    public String getCustomerPhone() { return customerPhone; }
    public void setCustomerPhone(String customerPhone) { this.customerPhone = customerPhone; }

    public String getAddressLine() { return addressLine; }
    public void setAddressLine(String addressLine) { this.addressLine = addressLine; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }

    public String getShippingAddressSnapshot() { return shippingAddressSnapshot; }
    public void setShippingAddressSnapshot(String s) { this.shippingAddressSnapshot = s; }

    public List<OrderItem> getItems() { return items; }
    public void setItems(List<OrderItem> items) {
        this.items.clear();
        if (items != null) this.items.addAll(items);
    }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    @PreUpdate
    void touch() { this.updatedAt = Instant.now(); }
}


/** The one place order statuses are defined. */
final class OrderStatus {
    static final String PLACED = "PLACED";
    static final String CONFIRMED = "CONFIRMED";
    static final String PROCESSING = "PROCESSING";
    static final String SHIPPED = "SHIPPED";
    static final String OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY";
    static final String DELIVERED = "DELIVERED";
    static final String CANCELLED = "CANCELLED";

    static final List<String> ALL = List.of(
            PLACED, CONFIRMED, PROCESSING, SHIPPED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED);

    /** Orders in these states count as revenue-completed. */
    static final List<String> COMPLETED = List.of(DELIVERED);

    /** Orders still owed work by the store. */
    static final List<String> PENDING = List.of(
            PLACED, CONFIRMED, PROCESSING, SHIPPED, OUT_FOR_DELIVERY);

    static boolean isValid(String status) {
        return status != null && ALL.contains(status.toUpperCase(Locale.ROOT));
    }

    private OrderStatus() { }
}

/** Why a customer cancelled. Optional - an order can be cancelled without one. */
class CancellationRequest {
    public String reason;
    public String comments;
}

/** Return request lifecycle, separate from OrderStatus because a return can only start once an order is DELIVERED. */
final class ReturnStatus {
    static final String REQUESTED = "REQUESTED";
    static final String APPROVED = "APPROVED";
    static final String REJECTED = "REJECTED";
    static final String COMPLETED = "COMPLETED";

    static final List<String> ALL = List.of(REQUESTED, APPROVED, REJECTED, COMPLETED);

    /** How many days after delivery a customer may request a return. */
    static final int WINDOW_DAYS = 10;

    static boolean isValid(String status) {
        return status != null && ALL.contains(status.toUpperCase(Locale.ROOT));
    }

    private ReturnStatus() { }
}


@Entity
@Table(name = "order_items")
class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Back-reference. @JsonIgnore is what stops the
     * Order -> items -> order -> items ... recursion if anything ever
     * serialises this entity directly again.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Order order;

    private Long productId;
    private Long customizableProductId;
    private String productName;

    /** Image path captured at order time so history survives product edits. */
    private String productImageUrl;

    private Integer quantity;
    private BigDecimal unitPrice;
    private BigDecimal finalPrice;

    // ---- customization snapshot ----
    private String customText;
    private String customImageUrl;
    private String selectedColor;
    private String selectedSize;
    private String printPosition;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Order getOrder() { return order; }
    public void setOrder(Order order) { this.order = order; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public Long getCustomizableProductId() { return customizableProductId; }
    public void setCustomizableProductId(Long customizableProductId) { this.customizableProductId = customizableProductId; }

    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }

    public String getProductImageUrl() { return productImageUrl; }
    public void setProductImageUrl(String productImageUrl) { this.productImageUrl = productImageUrl; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }

    public BigDecimal getUnitPrice() { return unitPrice; }
    public void setUnitPrice(BigDecimal unitPrice) { this.unitPrice = unitPrice; }

    public BigDecimal getFinalPrice() { return finalPrice; }
    public void setFinalPrice(BigDecimal finalPrice) { this.finalPrice = finalPrice; }

    public String getCustomText() { return customText; }
    public void setCustomText(String customText) { this.customText = customText; }

    public String getCustomImageUrl() { return customImageUrl; }
    public void setCustomImageUrl(String customImageUrl) { this.customImageUrl = customImageUrl; }

    public String getSelectedColor() { return selectedColor; }
    public void setSelectedColor(String selectedColor) { this.selectedColor = selectedColor; }

    public String getSelectedSize() { return selectedSize; }
    public void setSelectedSize(String selectedSize) { this.selectedSize = selectedSize; }

    public String getPrintPosition() { return printPosition; }
    public void setPrintPosition(String printPosition) { this.printPosition = printPosition; }
}


@Entity
@Table(name = "cart_items")
class CartItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private Long productId;
    private Long customizableProductId;
    private Integer quantity;
    private String customText;
    private String customImageUrl;
    private String selectedColor;
    private String selectedSize;
    private String printPosition;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public Long getCustomizableProductId() { return customizableProductId; }
    public void setCustomizableProductId(Long customizableProductId) { this.customizableProductId = customizableProductId; }

    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }

    public String getCustomText() { return customText; }
    public void setCustomText(String customText) { this.customText = customText; }

    public String getCustomImageUrl() { return customImageUrl; }
    public void setCustomImageUrl(String customImageUrl) { this.customImageUrl = customImageUrl; }

    public String getSelectedColor() { return selectedColor; }
    public void setSelectedColor(String selectedColor) { this.selectedColor = selectedColor; }

    public String getSelectedSize() { return selectedSize; }
    public void setSelectedSize(String selectedSize) { this.selectedSize = selectedSize; }

    public String getPrintPosition() { return printPosition; }
    public void setPrintPosition(String printPosition) { this.printPosition = printPosition; }
}


/* ===========================================================
   REPOSITORIES
   =========================================================== */

interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<Order> findAllByOrderByCreatedAtDesc();
    Optional<Order> findByOrderNumber(String orderNumber);
}

interface OrderItemRepository extends JpaRepository<OrderItem, Long> { }

interface CartItemRepository extends JpaRepository<CartItem, Long> {
    List<CartItem> findByUserId(Long userId);
}



/* ===========================================================
   REQUEST DTOs
   =========================================================== */

class CartItemRequest {
    public Long userId;
    public Long productId;
    public Long customizableProductId;
    public Integer quantity;
    public String customText;
    public String customImageUrl;
    public String selectedColor;
    public String selectedSize;
    public String printPosition;
}

class CheckoutRequest {
    public Long userId;

    /** Legacy single-string address. Still accepted. */
    public String shippingAddressSnapshot;

    public String couponCode;

    /** COD | UPI | CARD | NETBANKING. Defaults to COD. */
    public String paymentMethod;

    /* Structured customer + address fields (Stage 4 checkout form). */
    public String customerName;
    public String customerEmail;
    public String customerPhone;
    public String addressLine;
    public String city;
    public String state;
    public String pincode;
}


class ReturnRequest {
    public String reason;
}


/* ===========================================================
   PRICING
   -----------------------------------------------------------
   The single source of truth for what an order costs. Both
   /api/cart/summary (preview) and /api/checkout (the real
   thing) go through here, so the number the customer sees and
   the number that gets saved can never drift apart.
   =========================================================== */

class PricedLine {
    Long productId;
    Long customizableProductId;
    String productName;
    String productImageUrl;
    int quantity;
    BigDecimal unitPrice;
    BigDecimal lineTotal;

    CartItem source;
}

class PricingResult {
    List<PricedLine> lines = new ArrayList<>();
    BigDecimal subtotal = BigDecimal.ZERO;
    BigDecimal discount = BigDecimal.ZERO;
    BigDecimal delivery = BigDecimal.ZERO;
    BigDecimal total = BigDecimal.ZERO;
    String appliedCouponCode;
    /** Null when nothing is wrong; otherwise why the coupon was not applied. */
    String couponMessage;
    boolean couponApplied;
}


/* ===========================================================
   CONTROLLER
   =========================================================== */

@RestController
@RequestMapping("/api")
class OrdersController {

    @Autowired private CartItemRepository cartItemRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private AppUserRepository appUserRepository;
    @Autowired private CouponService couponService;
    @Autowired private CustomizableProductRepository customizableProductRepository;
    @Autowired private DtoMapper mapper;
    @Autowired private CurrentUserService currentUser;

    /**
     * An order belongs to exactly one customer. Admins are let through so the
     * admin order screens keep working off the same endpoints.
     */
    private void requireOrderOwner(String authHeader, Order order) {
        AppUser caller = currentUser.require(authHeader);
        currentUser.requireOwns(caller, order.getUser());
    }

    @Value("${app.delivery.charge:49}")
    private BigDecimal deliveryCharge;

    @Value("${app.delivery.free-above:499}")
    private BigDecimal freeDeliveryAbove;

    /** Orders under this value pay the small-order delivery charge. */
    @Value("${app.delivery.small-order-threshold:200}")
    private BigDecimal smallOrderThreshold;

    @Value("${app.delivery.small-order-charge:40}")
    private BigDecimal smallOrderDeliveryCharge;

    private static final List<String> PAYMENT_METHODS = List.of("COD", "UPI", "CARD", "NETBANKING");


    /* =======================================================
       CART
       ======================================================= */

    @GetMapping("/cart/{userId}")
    public List<CartItem> getCart(@PathVariable Long userId, @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        return cartItemRepository.findByUserId(userId);
    }

    @PostMapping("/cart")
    public ResponseEntity<?> addToCart(@RequestBody CartItemRequest req, @RequestHeader(value = "Authorization", required = false) String auth) {
        // The body carries a userId, so it must be checked against the token -
        // otherwise anyone could stuff items into someone else's cart.
        if (req.userId != null) currentUser.requireSelf(auth, req.userId);
        if (req.userId == null) {
            return ResponseEntity.badRequest().body(errorBody("Please sign in before adding to the cart."));
        }
        if (req.productId == null && req.customizableProductId == null) {
            return ResponseEntity.badRequest().body(errorBody("productId or customizableProductId is required"));
        }
        int requestedQty = req.quantity == null || req.quantity < 1 ? 1 : req.quantity;

        Integer availableStock;
        if (req.customizableProductId != null) {
            Optional<CustomizableProduct> cpOpt = customizableProductRepository.findById(req.customizableProductId);
            if (cpOpt.isEmpty()) return ResponseEntity.badRequest().body(errorBody("Customizable product not found"));
            availableStock = cpOpt.get().getStock();
        } else {
            Optional<Product> productOpt = productRepository.findById(req.productId);
            if (productOpt.isEmpty()) return ResponseEntity.badRequest().body(errorBody("Product not found"));
            availableStock = productOpt.get().getStockQuantity();
        }

        // Plain (non-customized) lines for the same product+user are merged so
        // re-adding the same item just bumps the quantity. Customized lines
        // always stay separate since each one is potentially unique.
        CartItem item = null;
        boolean isPlain = req.customText == null && req.customImageUrl == null
                && req.selectedColor == null && req.selectedSize == null && req.printPosition == null;
        if (isPlain && req.productId != null) {
            for (CartItem ci : cartItemRepository.findByUserId(req.userId)) {
                if (req.productId.equals(ci.getProductId())
                        && ci.getCustomText() == null && ci.getCustomImageUrl() == null
                        && ci.getSelectedColor() == null && ci.getSelectedSize() == null
                        && ci.getPrintPosition() == null) {
                    item = ci;
                    break;
                }
            }
        }

        int desiredQuantity = (item != null ? item.getQuantity() : 0) + requestedQty;
        if (availableStock == null || availableStock < desiredQuantity) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(errorBody("Only " + (availableStock == null ? 0 : availableStock) + " in stock"));
        }

        if (item == null) {
            item = new CartItem();
            item.setUserId(req.userId);
            item.setProductId(req.productId);
            item.setCustomizableProductId(req.customizableProductId);
            item.setQuantity(requestedQty);
            item.setCustomText(req.customText);
            item.setCustomImageUrl(req.customImageUrl);
            item.setSelectedColor(req.selectedColor);
            item.setSelectedSize(req.selectedSize);
            item.setPrintPosition(req.printPosition);
        } else {
            item.setQuantity(desiredQuantity);
        }
        return ResponseEntity.ok(cartItemRepository.save(item));
    }

    @PutMapping("/cart/{itemId}")
    public ResponseEntity<?> updateCartQuantity(@PathVariable Long itemId,
                                                @RequestParam int quantity,
                                                @RequestHeader(value = "Authorization", required = false) String auth) {
        Optional<CartItem> itemOpt = cartItemRepository.findById(itemId);
        if (itemOpt.isEmpty()) return ResponseEntity.notFound().build();

        CartItem item = itemOpt.get();
        currentUser.requireSelf(auth, item.getUserId());
        if (quantity <= 0) {
            cartItemRepository.deleteById(itemId);
            return ResponseEntity.noContent().build();
        }

        Integer availableStock = item.getCustomizableProductId() != null
                ? customizableProductRepository.findById(item.getCustomizableProductId())
                        .map(CustomizableProduct::getStock).orElse(null)
                : productRepository.findById(item.getProductId())
                        .map(Product::getStockQuantity).orElse(null);

        if (availableStock != null && quantity > availableStock) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(errorBody("Only " + availableStock + " in stock"));
        }

        item.setQuantity(quantity);
        return ResponseEntity.ok(cartItemRepository.save(item));
    }

    @DeleteMapping("/cart/{itemId}")
    public ResponseEntity<Void> removeFromCart(@PathVariable Long itemId, @RequestHeader(value = "Authorization", required = false) String auth) {
        Optional<CartItem> item = cartItemRepository.findById(itemId);
        if (item.isEmpty()) return ResponseEntity.notFound().build();
        currentUser.requireSelf(auth, item.get().getUserId());
        cartItemRepository.deleteById(itemId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/cart/user/{userId}")
    public ResponseEntity<Void> clearCart(@PathVariable Long userId, @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        cartItemRepository.deleteAll(cartItemRepository.findByUserId(userId));
        return ResponseEntity.noContent().build();
    }

    /**
     * Read-only price preview for the cart and checkout screens. Uses exactly
     * the same code path as checkout, so what is shown is what is charged.
     */
    @GetMapping("/cart/{userId}/summary")
    public Map<String, Object> cartSummary(
            @PathVariable Long userId,
            @RequestParam(required = false) String couponCode,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        currentUser.requireSelf(auth, userId);
        PricingResult pricing = priceCart(cartItemRepository.findByUserId(userId), couponCode);

        Map<String, Object> body = new HashMap<>();
        body.put("subtotal", pricing.subtotal);
        body.put("discountAmount", pricing.discount);
        body.put("deliveryCharge", pricing.delivery);
        body.put("totalAmount", pricing.total);
        body.put("couponCode", pricing.appliedCouponCode);
        body.put("couponApplied", pricing.couponApplied);
        body.put("couponMessage", pricing.couponMessage);
        body.put("itemCount", pricing.lines.stream().mapToInt(l -> l.quantity).sum());
        return body;
    }


    /* =======================================================
       CHECKOUT
       ======================================================= */

    /**
     * Creates the order. Everything here happens inside one transaction, so
     * the frontend's success screen can only ever be reached after the row is
     * safely committed to PostgreSQL.
     */
    @PostMapping("/checkout")
    @Transactional
    public ResponseEntity<OrderDto> checkout(
            @RequestBody CheckoutRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        if (req.userId == null) {
            throw new BadRequestException("You need to be signed in to place an order.");
        }
        // Without this, the body's userId alone decided whose cart was
        // charged and whose order was created.
        currentUser.requireSelf(auth, req.userId);

        AppUser user = appUserRepository.findById(req.userId)
                .orElseThrow(() -> new BadRequestException("We could not find your account. Please sign in again."));

        List<CartItem> cartItems = cartItemRepository.findByUserId(req.userId);
        if (cartItems.isEmpty()) {
            throw new BadRequestException("Your cart is empty.");
        }

        PricingResult pricing = priceCart(cartItems, req.couponCode);
        if (pricing.lines.isEmpty()) {
            throw new BadRequestException("None of the items in your cart are available any more.");
        }

        String paymentMethod = normalizePaymentMethod(req.paymentMethod);

        // Re-check stock against the live rows. The cart may have been sitting
        // open for hours, and two customers can race for the last unit - the
        // add-to-cart check is not enough on its own.
        for (PricedLine line : pricing.lines) {
            Integer available = line.customizableProductId != null
                    ? customizableProductRepository.findById(line.customizableProductId)
                            .map(CustomizableProduct::getStock).orElse(0)
                    : productRepository.findById(line.productId)
                            .map(Product::getStockQuantity).orElse(0);

            int have = available == null ? 0 : available;
            if (have < line.quantity) {
                throw new BadRequestException(
                        have <= 0
                                ? "\"" + line.productName + "\" just went out of stock. "
                                        + "Please remove it from your cart and try again."
                                : "Only " + have + " left of \"" + line.productName
                                        + "\". Please lower the quantity and try again.");
            }
        }

        Order order = new Order();
        order.setUser(user);
        order.setCustomerName(firstNonBlank(req.customerName, user.getDisplayName()));
        order.setCustomerEmail(firstNonBlank(req.customerEmail, user.getEmail()));
        order.setCustomerPhone(firstNonBlank(req.customerPhone, user.getPhone()));
        order.setAddressLine(req.addressLine);
        order.setCity(req.city);
        order.setState(req.state);
        order.setPincode(req.pincode);
        order.setShippingAddressSnapshot(
                firstNonBlank(req.shippingAddressSnapshot, composeAddress(req)));

        order.setSubtotal(pricing.subtotal);
        order.setDiscountAmount(pricing.discount);
        order.setDeliveryCharge(pricing.delivery);
        order.setTotalAmount(pricing.total);
        order.setCouponCode(pricing.couponApplied ? pricing.appliedCouponCode : null);

        order.setPaymentMethod(paymentMethod);
        // Dummy payment simulation only. No real money moves anywhere: COD is
        // collected on delivery, and the other methods are marked PAID purely
        // so the demo flow can continue. Replace with Razorpay verification
        // before this ever touches a real customer.
        order.setPaymentStatus("COD".equals(paymentMethod) ? "PENDING" : "PAID");
        order.setStatus(OrderStatus.PLACED);

        List<OrderItem> items = new ArrayList<>();
        for (PricedLine line : pricing.lines) {
            OrderItem oi = new OrderItem();
            oi.setOrder(order);
            oi.setProductId(line.productId);
            oi.setCustomizableProductId(line.customizableProductId);
            oi.setProductName(line.productName);
            oi.setProductImageUrl(line.productImageUrl);
            oi.setQuantity(line.quantity);
            oi.setUnitPrice(line.unitPrice);
            oi.setFinalPrice(line.lineTotal);

            CartItem ci = line.source;
            if (ci != null) {
                oi.setCustomText(ci.getCustomText());
                oi.setCustomImageUrl(ci.getCustomImageUrl());
                oi.setSelectedColor(ci.getSelectedColor());
                oi.setSelectedSize(ci.getSelectedSize());
                oi.setPrintPosition(ci.getPrintPosition());
            }
            items.add(oi);
        }
        order.setItems(items);

        // Decrement stock only now that we know the whole order is valid.
        for (PricedLine line : pricing.lines) {
            if (line.customizableProductId != null) {
                customizableProductRepository.findById(line.customizableProductId).ifPresent(cp -> {
                    int current = cp.getStock() == null ? 0 : cp.getStock();
                    cp.setStock(Math.max(0, current - line.quantity));
                    customizableProductRepository.save(cp);
                });
            } else if (line.productId != null) {
                productRepository.findById(line.productId).ifPresent(p -> {
                    int current = p.getStockQuantity() == null ? 0 : p.getStockQuantity();
                    p.setStockQuantity(Math.max(0, current - line.quantity));
                    productRepository.save(p);
                });
            }
        }

        Order saved = orderRepository.save(order);

        // Human-friendly reference, derived from the generated id.
        if (saved.getOrderNumber() == null) {
            saved.setOrderNumber("NS" + (100000 + saved.getId()));
            saved = orderRepository.save(saved);
        }

        // Count the redemption only now that the order is committed.
        if (pricing.couponApplied) {
            couponService.recordRedemption(pricing.appliedCouponCode);
        }

        cartItemRepository.deleteAll(cartItems);

        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toDto(saved));
    }


    /* =======================================================
       ORDER READS
       ======================================================= */

    @GetMapping("/orders/{userId}")
    public List<OrderDto> myOrders(@PathVariable Long userId, @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        return mapper.toOrderDtos(orderRepository.findByUserIdOrderByCreatedAtDesc(userId));
    }

    @GetMapping("/orders/detail/{orderId}")
    public ResponseEntity<OrderDto> orderDetail(@PathVariable Long orderId, @RequestHeader(value = "Authorization", required = false) String auth) {
        Optional<Order> found = orderRepository.findById(orderId);
        if (found.isEmpty()) return ResponseEntity.notFound().build();
        requireOrderOwner(auth, found.get());
        return ResponseEntity.ok(mapper.toDto(found.get()));
    }

    @GetMapping("/orders/number/{orderNumber}")
    public ResponseEntity<OrderDto> orderByNumber(@PathVariable String orderNumber, @RequestHeader(value = "Authorization", required = false) String auth) {
        Optional<Order> found = orderRepository.findByOrderNumber(orderNumber);
        if (found.isEmpty()) return ResponseEntity.notFound().build();
        // Order numbers are guessable, so this needs the same check as the id.
        requireOrderOwner(auth, found.get());
        return ResponseEntity.ok(mapper.toDto(found.get()));
    }

    /** Customer-initiated cancellation, only while the order has not shipped. */
    @PutMapping("/orders/{orderId}/cancel")
    public ResponseEntity<OrderDto> cancelOrder(
            @PathVariable Long orderId,
            @RequestBody(required = false) CancellationRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        Optional<Order> existing = orderRepository.findById(orderId);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Order order = existing.get();
        requireOrderOwner(auth, order);
        if (OrderStatus.CANCELLED.equals(order.getStatus())) {
            return ResponseEntity.ok(mapper.toDto(order));
        }
        if (!List.of(OrderStatus.PLACED, OrderStatus.CONFIRMED, OrderStatus.PROCESSING)
                .contains(order.getStatus())) {
            throw new BadRequestException(
                    "This order has already been dispatched and can no longer be cancelled.");
        }

        order.setStatus(OrderStatus.CANCELLED);
        // Keep why the customer cancelled, so the admin order screen and the
        // customer's own order detail can both show it.
        if (req != null && req.reason != null && !req.reason.isBlank()) {
            order.setCancellationReason(req.reason.trim());
        }
        if (req != null && req.comments != null && !req.comments.isBlank()) {
            order.setCancellationComments(req.comments.trim());
        }
        order.setCancelledAt(Instant.now());
        return ResponseEntity.ok(mapper.toDto(orderRepository.save(order)));
    }

    /**
     * Customer-initiated return request. Only allowed once the order has
     * actually been DELIVERED, and only within RETURN_WINDOW_DAYS of the
     * delivery timestamp - after that the window has closed. Can only be
     * requested once; the admin then approves/rejects/completes it.
     */
    @PutMapping("/orders/{orderId}/return")
    public ResponseEntity<OrderDto> requestReturn(
            @PathVariable Long orderId,
            @RequestBody(required = false) ReturnRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        Optional<Order> existing = orderRepository.findById(orderId);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Order order = existing.get();
        requireOrderOwner(auth, order);

        if (!OrderStatus.DELIVERED.equals(order.getStatus()) || order.getDeliveredAt() == null) {
            throw new BadRequestException("This order has not been delivered yet, so it can't be returned.");
        }
        if (order.getReturnStatus() != null) {
            throw new BadRequestException("A return has already been requested for this order.");
        }

        Instant windowCloses = order.getDeliveredAt().plus(ReturnStatus.WINDOW_DAYS, ChronoUnit.DAYS);
        if (Instant.now().isAfter(windowCloses)) {
            throw new BadRequestException(
                    "The " + ReturnStatus.WINDOW_DAYS + "-day return window for this order has closed.");
        }

        order.setReturnStatus(ReturnStatus.REQUESTED);
        order.setReturnRequestedAt(Instant.now());
        order.setReturnReason(req != null ? req.reason : null);
        return ResponseEntity.ok(mapper.toDto(orderRepository.save(order)));
    }


    /* =======================================================
       PRICING ENGINE
       ======================================================= */

    PricingResult priceCart(List<CartItem> cartItems, String couponCode) {
        PricingResult result = new PricingResult();

        for (CartItem ci : cartItems) {
            int qty = ci.getQuantity() == null || ci.getQuantity() < 1 ? 1 : ci.getQuantity();
            PricedLine line = new PricedLine();
            line.source = ci;
            line.quantity = qty;

            if (ci.getCustomizableProductId() != null) {
                Optional<CustomizableProduct> cpOpt =
                        customizableProductRepository.findById(ci.getCustomizableProductId());
                if (cpOpt.isEmpty()) continue;
                CustomizableProduct cp = cpOpt.get();
                line.customizableProductId = cp.getId();
                line.productName = cp.getName();
                line.productImageUrl = cp.getImageUrl();
                line.unitPrice = cp.getBasePrice() == null ? BigDecimal.ZERO : cp.getBasePrice();
            } else {
                Optional<Product> productOpt = productRepository.findById(ci.getProductId());
                if (productOpt.isEmpty() || !productOpt.get().isActive()) continue;
                Product product = productOpt.get();
                line.productId = product.getId();
                line.productName = product.getName();
                line.productImageUrl = product.getThumbnailUrl();
                line.unitPrice = DtoMapper.effectivePrice(product);
            }

            line.lineTotal = line.unitPrice
                    .multiply(BigDecimal.valueOf(qty))
                    .setScale(2, RoundingMode.HALF_UP);

            result.lines.add(line);
            result.subtotal = result.subtotal.add(line.lineTotal);
        }

        result.subtotal = result.subtotal.setScale(2, RoundingMode.HALF_UP);
        applyCoupon(result, couponCode);

        BigDecimal afterDiscount = result.subtotal.subtract(result.discount);

        /*
         * Delivery is banded, and calculated HERE - the client never sends a
         * delivery charge and could not make one stick if it did.
         *
         *   empty cart                      -> 0
         *   at or above app.delivery.free-above (default 499) -> free
         *   below app.delivery.small-order-threshold (200)    -> 40
         *   anything in between                               -> 49
         *
         * All four numbers are configuration, not literals, so the bands can
         * be retuned without a code change.
         */
        if (result.subtotal.compareTo(BigDecimal.ZERO) <= 0) {
            result.delivery = BigDecimal.ZERO;
        } else if (afterDiscount.compareTo(freeDeliveryAbove) >= 0) {
            result.delivery = BigDecimal.ZERO;
        } else if (afterDiscount.compareTo(smallOrderThreshold) < 0) {
            result.delivery = smallOrderDeliveryCharge;
        } else {
            result.delivery = deliveryCharge;
        }
        result.delivery = result.delivery.setScale(2, RoundingMode.HALF_UP);

        result.total = afterDiscount.add(result.delivery).setScale(2, RoundingMode.HALF_UP);
        if (result.total.compareTo(BigDecimal.ZERO) < 0) {
            result.total = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return result;
    }

    /**
     * Discounts are NEVER computed here. CouponService.evaluate() is the one
     * place that knows the rules (type, minimum order, cap, expiry, usage
     * limit), and it reads them straight from the database - so whatever the
     * frontend sends is irrelevant beyond the code string itself.
     */
    private void applyCoupon(PricingResult result, String couponCode) {
        CouponEvaluation evaluation = couponService.evaluate(couponCode, result.subtotal);

        result.discount = evaluation.discount == null
                ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                : evaluation.discount;
        result.couponApplied = evaluation.valid;
        result.appliedCouponCode = evaluation.code;
        result.couponMessage = evaluation.message;
    }


    /* =======================================================
       SMALL HELPERS
       ======================================================= */

    private String normalizePaymentMethod(String value) {
        if (value == null || value.isBlank()) return "COD";
        String upper = value.trim().toUpperCase(Locale.ROOT).replace("-", "").replace("_", "");
        if ("NETBANKING".equals(upper)) return "NETBANKING";
        if (PAYMENT_METHODS.contains(upper)) return upper;
        throw new BadRequestException("Unsupported payment method: " + value);
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        return b;
    }

    private static String composeAddress(CheckoutRequest req) {
        StringBuilder sb = new StringBuilder();
        appendPart(sb, req.addressLine);
        appendPart(sb, req.city);
        appendPart(sb, req.state);
        appendPart(sb, req.pincode);
        return sb.length() == 0 ? null : sb.toString();
    }

    private static void appendPart(StringBuilder sb, String part) {
        if (part == null || part.isBlank()) return;
        if (sb.length() > 0) sb.append(", ");
        sb.append(part.trim());
    }

    private Map<String, String> errorBody(String message) {
        Map<String, String> body = new HashMap<>();
        body.put("error", message);
        return body;
    }
}
