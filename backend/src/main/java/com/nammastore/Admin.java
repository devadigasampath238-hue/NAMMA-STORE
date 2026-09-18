package com.nammastore;

import jakarta.persistence.*;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * ===========================================================
 * Admin.java
 * -----------------------------------------------------------
 * Admin authorization, dashboard stats, and the customized-
 * product catalog (name/base price/options/min-max qty).
 *
 * Product/Category CRUD lives in Products.java's
 * AdminCatalogController.
 *
 * SECURITY:
 * AdminAuthFilter intercepts /api/admin/** requests
 * and checks the Authorization header.
 *
 * CORS:
 * Allows the Next.js frontend running on localhost:3000
 * to communicate with Spring Boot running on localhost:8080.
 * ===========================================================
 */


/* ===========================================================
   ADMIN AUTHENTICATION FILTER
   =========================================================== */

@Component
class AdminAuthFilter extends OncePerRequestFilter {

    @Autowired
    private AppUserRepository appUserRepository;

    @Autowired
    private FirebaseAuthService firebaseAuthService;

    @Value("${app.cors.allowed-origin:http://localhost:3000}")
    private String allowedOrigin;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain)
            throws ServletException, IOException {

        /*
         * ---------------------------------------------------
         * CORS PREFLIGHT REQUEST
         * ---------------------------------------------------
         *
         * Browser sends OPTIONS request before requests
         * such as GET/POST/PUT/DELETE with Authorization.
         */
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {

            response.setHeader(
                    "Access-Control-Allow-Origin",
                    allowedOrigin
            );

            response.setHeader(
                    "Access-Control-Allow-Methods",
                    "GET, POST, PUT, DELETE, OPTIONS"
            );

            response.setHeader(
                    "Access-Control-Allow-Headers",
                    "Authorization, Content-Type"
            );

            response.setHeader(
                    "Access-Control-Allow-Credentials",
                    "true"
            );

            response.setStatus(HttpServletResponse.SC_OK);
            return;
        }


        /*
         * ---------------------------------------------------
         * CORS HEADERS FOR NORMAL REQUESTS
         * ---------------------------------------------------
         */
        response.setHeader(
                "Access-Control-Allow-Origin",
                allowedOrigin
        );

        response.setHeader(
                "Access-Control-Allow-Credentials",
                "true"
        );


        /*
         * ---------------------------------------------------
         * ADMIN AUTHORIZATION
         * ---------------------------------------------------
         */
        if (request.getRequestURI().startsWith("/api/admin")) {

            String header = request.getHeader("Authorization");

            String uid = firebaseAuthService.verifyTokenAndGetUid(
                    header == null
                            ? null
                            : header.replace("Bearer ", "").trim()
            );

            // 401 = we do not know who you are; 403 = we know, you are not staff.
            if (uid == null) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json");
                response.getWriter().write(
                        "{\"error\":\"Sign in as an administrator to continue.\"}");
                return;
            }

            boolean isAdmin =
                    uid != null &&
                    appUserRepository.findByFirebaseUid(uid)
                            .map(AppUser::isAdmin)
                            .orElse(false);

            if (!isAdmin) {

                response.setStatus(
                        HttpServletResponse.SC_FORBIDDEN
                );

                response.setContentType(
                        "application/json"
                );

                response.getWriter().write(
                        "{\"error\":\"Admin access required\"}"
                );

                return;
            }
        }


        /*
         * ---------------------------------------------------
         * CONTINUE REQUEST
         * ---------------------------------------------------
         */
        chain.doFilter(request, response);
    }
}


/* ===========================================================
   CUSTOMIZABLE PRODUCT ENTITY
   =========================================================== */

@Entity
@Table(name = "customizable_products")
class CustomizableProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    private String slug;

    private BigDecimal basePrice;

    private String imageUrl;

    private Long categoryId;

    private Integer minQuantity = 1;

    private Integer maxQuantity = 100;

    private Integer stock = 0;

    private boolean active = true;

    /*
     * Example:
     * TEXT,IMAGE,COLOR,SIZE,PRINT_POSITION
     */
    private String enabledOptions;

    /*
     * Example:
     * Red,Blue,Black
     */
    private String availableColors;

    /*
     * Example:
     * S,M,L,XL
     */
    private String availableSizes;


    /* -------------------------------------------------------
       GETTERS / SETTERS
       ------------------------------------------------------- */

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSlug() {
        return slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public BigDecimal getBasePrice() {
        return basePrice;
    }

    public void setBasePrice(BigDecimal basePrice) {
        this.basePrice = basePrice;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public Long getCategoryId() {
        return categoryId;
    }

    public void setCategoryId(Long categoryId) {
        this.categoryId = categoryId;
    }

    public Integer getMinQuantity() {
        return minQuantity;
    }

    public void setMinQuantity(Integer minQuantity) {
        this.minQuantity = minQuantity;
    }

    public Integer getMaxQuantity() {
        return maxQuantity;
    }

    public void setMaxQuantity(Integer maxQuantity) {
        this.maxQuantity = maxQuantity;
    }

    public Integer getStock() {
        return stock;
    }

    public void setStock(Integer stock) {
        this.stock = stock;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public String getEnabledOptions() {
        return enabledOptions;
    }

    public void setEnabledOptions(String enabledOptions) {
        this.enabledOptions = enabledOptions;
    }

    public String getAvailableColors() {
        return availableColors;
    }

    public void setAvailableColors(String availableColors) {
        this.availableColors = availableColors;
    }

    public String getAvailableSizes() {
        return availableSizes;
    }

    public void setAvailableSizes(String availableSizes) {
        this.availableSizes = availableSizes;
    }
}


/* ===========================================================
   REPOSITORY
   =========================================================== */

interface CustomizableProductRepository
        extends JpaRepository<CustomizableProduct, Long> {

    CustomizableProduct findBySlug(String slug);
}


/* ===========================================================
   REQUEST DTO
   =========================================================== */

class CustomizableProductRequest {

    public String name;

    public String slug;

    public BigDecimal basePrice;

    public String imageUrl;

    public Long categoryId;

    public Integer minQuantity;

    public Integer maxQuantity;

    public Integer stock;

    public boolean active = true;

    public String enabledOptions;

    public String availableColors;

    public String availableSizes;
}


/* ===========================================================
   PUBLIC CUSTOMIZATION APIS
   =========================================================== */

@RestController
@RequestMapping("/api/customize")
class CustomizeController {

    @Autowired
    private CustomizableProductRepository repo;


    @GetMapping
    public List<CustomizableProduct> list() {

        return repo.findAll()
                .stream()
                .filter(CustomizableProduct::isActive)
                .toList();
    }


    @GetMapping("/{slug}")
    public CustomizableProduct bySlug(
            @PathVariable String slug) {

        return repo.findBySlug(slug);
    }
}


/* ===========================================================
   ADMIN APIS
   =========================================================== */

@RestController
@RequestMapping("/api/admin")
class AdminController {

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private AppUserRepository appUserRepository;

    @Autowired
    private CustomizableProductRepository customizableProductRepository;

    @Autowired
    private DtoMapper mapper;


    /* -------------------------------------------------------
       ADMIN VERIFY
       -------------------------------------------------------
       Reaching this method at all means AdminAuthFilter already
       accepted the request, so it only has to echo success.
       ------------------------------------------------------- */

    @GetMapping("/verify")
    public Map<String, Object> verify() {
        Map<String, Object> body = new HashMap<>();
        body.put("admin", true);
        return body;
    }


    /* -------------------------------------------------------
       DASHBOARD
       ------------------------------------------------------- */

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {

        List<Product> allProducts = productRepository.findAll();
        List<Order> allOrders = orderRepository.findAllByOrderByCreatedAtDesc();

        long outOfStock = 0;
        long lowStock = 0;
        for (Product p : allProducts) {
            String status = p.stockStatus();
            if ("OUT_OF_STOCK".equals(status)) outOfStock++;
            else if ("LOW_STOCK".equals(status)) lowStock++;
        }

        long pendingOrders = 0;
        long completedOrders = 0;
        long cancelledOrders = 0;
        BigDecimal revenue = BigDecimal.ZERO;

        for (Order o : allOrders) {
            String status = o.getStatus() == null
                    ? OrderStatus.PLACED
                    : o.getStatus().toUpperCase(Locale.ROOT);

            if (OrderStatus.CANCELLED.equals(status)) {
                cancelledOrders++;
                continue;
            }

            // Revenue counts every order that has not been cancelled.
            if (o.getTotalAmount() != null) {
                revenue = revenue.add(o.getTotalAmount());
            }

            if (OrderStatus.DELIVERED.equals(status)) {
                completedOrders++;
            } else {
                pendingOrders++;
            }
        }

        List<Order> recent = allOrders.size() > 10
                ? new ArrayList<>(allOrders.subList(0, 10))
                : allOrders;

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalProducts", allProducts.size());
        stats.put("totalCategories", categoryRepository.count());
        stats.put("totalOrders", allOrders.size());
        stats.put("totalUsers", appUserRepository.count());
        stats.put("outOfStockProducts", outOfStock);
        stats.put("lowStockProducts", lowStock);
        stats.put("pendingOrders", pendingOrders);
        stats.put("completedOrders", completedOrders);
        stats.put("cancelledOrders", cancelledOrders);
        stats.put("revenue", revenue.setScale(2, RoundingMode.HALF_UP));
        stats.put("recentOrders", mapper.toOrderDtos(recent));
        return stats;
    }


    /* -------------------------------------------------------
       ORDERS
       ------------------------------------------------------- */

    @GetMapping("/orders")
    public List<OrderDto> allOrders(@RequestParam(required = false) String status) {
        List<Order> orders = orderRepository.findAllByOrderByCreatedAtDesc();
        if (status != null && !status.isBlank()) {
            String wanted = status.trim().toUpperCase(Locale.ROOT);
            orders = new ArrayList<>(orders);
            orders.removeIf(o -> o.getStatus() == null
                    || !wanted.equals(o.getStatus().toUpperCase(Locale.ROOT)));
        }
        return mapper.toOrderDtos(orders);
    }

    @GetMapping("/orders/{id}")
    public ResponseEntity<OrderDto> orderDetail(@PathVariable Long id) {
        return orderRepository.findById(id)
                .map(o -> ResponseEntity.ok(mapper.toDto(o)))
                .orElse(ResponseEntity.notFound().build());
    }

    /** The list of statuses the admin UI is allowed to set. */
    @GetMapping("/order-statuses")
    public List<String> orderStatuses() {
        return OrderStatus.ALL;
    }

    @PutMapping("/orders/{id}/status")
    public ResponseEntity<OrderDto> updateOrderStatus(
            @PathVariable Long id,
            @RequestParam String status) {

        if (!OrderStatus.isValid(status)) {
            throw new BadRequestException(
                    "Unknown order status \"" + status + "\". Allowed: " + String.join(", ", OrderStatus.ALL));
        }

        Optional<Order> existing = orderRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Order order = existing.get();
        order.setStatus(status.toUpperCase(Locale.ROOT));

        // Delivering a COD order is the moment the money is actually collected.
        if (OrderStatus.DELIVERED.equals(order.getStatus())
                && "COD".equals(order.getPaymentMethod())) {
            order.setPaymentStatus("PAID");
        }

        // Anchor the 10-day return window the moment the order first becomes
        // DELIVERED. Only set once - re-saving the same status (or any later
        // status) must not push the window back.
        if (OrderStatus.DELIVERED.equals(order.getStatus()) && order.getDeliveredAt() == null) {
            order.setDeliveredAt(Instant.now());
        }

        return ResponseEntity.ok(mapper.toDto(orderRepository.save(order)));
    }

    /** Admin approves/rejects/completes a customer's return request. */
    @PutMapping("/orders/{id}/return-status")
    public ResponseEntity<OrderDto> updateReturnStatus(
            @PathVariable Long id,
            @RequestParam String status) {

        if (!ReturnStatus.isValid(status)) {
            throw new BadRequestException(
                    "Unknown return status \"" + status + "\". Allowed: " + String.join(", ", ReturnStatus.ALL));
        }

        Optional<Order> existing = orderRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Order order = existing.get();
        if (order.getReturnStatus() == null) {
            throw new BadRequestException("No return has been requested for this order.");
        }

        order.setReturnStatus(status.toUpperCase(Locale.ROOT));
        return ResponseEntity.ok(mapper.toDto(orderRepository.save(order)));
    }


    /* -------------------------------------------------------
       USERS
       ------------------------------------------------------- */

    @GetMapping("/users")
    public List<AppUserDto> allUsers() {
        return mapper.toUserDtos(appUserRepository.findAll());
    }

    @PutMapping("/users/{id}/role")
    public ResponseEntity<AppUserDto> setAdminRole(
            @PathVariable Long id,
            @RequestParam boolean admin) {

        Optional<AppUser> existing = appUserRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        AppUser user = existing.get();
        user.setAdmin(admin);
        return ResponseEntity.ok(mapper.toDto(appUserRepository.save(user)));
    }


    /* -------------------------------------------------------
       CUSTOMIZABLE PRODUCTS
       ------------------------------------------------------- */

    @GetMapping("/customize")
    public List<CustomizableProduct>
            listCustomizable() {

        return customizableProductRepository
                .findAll();
    }


    @PostMapping("/customize")
    public CustomizableProduct createCustomizable(
            @RequestBody
            CustomizableProductRequest req) {

        CustomizableProduct c =
                new CustomizableProduct();

        applyCustomizable(c, req);

        return customizableProductRepository
                .save(c);
    }


    @PutMapping("/customize/{id}")
    public CustomizableProduct updateCustomizable(
            @PathVariable Long id,
            @RequestBody
            CustomizableProductRequest req) {

        CustomizableProduct c =
                customizableProductRepository
                        .findById(id)
                        .orElseThrow();

        applyCustomizable(c, req);

        return customizableProductRepository
                .save(c);
    }


    @DeleteMapping("/customize/{id}")
    public void deleteCustomizable(
            @PathVariable Long id) {

        customizableProductRepository
                .deleteById(id);
    }


    private void applyCustomizable(
            CustomizableProduct c,
            CustomizableProductRequest req) {

        c.setName(req.name);

        c.setSlug(req.slug);

        c.setBasePrice(req.basePrice);

        c.setImageUrl(req.imageUrl);

        c.setCategoryId(req.categoryId);

        c.setMinQuantity(
                req.minQuantity != null
                        ? req.minQuantity
                        : 1
        );

        c.setMaxQuantity(
                req.maxQuantity != null
                        ? req.maxQuantity
                        : 100
        );

        c.setStock(
                req.stock != null
                        ? req.stock
                        : 0
        );

        c.setActive(req.active);

        c.setEnabledOptions(
                req.enabledOptions
        );

        c.setAvailableColors(
                req.availableColors
        );

        c.setAvailableSizes(
                req.availableSizes
        );
    }
}
