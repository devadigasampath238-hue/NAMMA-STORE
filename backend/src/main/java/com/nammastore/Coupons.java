package com.nammastore;

import jakarta.persistence.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/*
 * ===========================================================
 * Coupons.java  (STAGE 2 - NEW FILE)
 * ===========================================================
 *
 * The Coupon entity already existed but only supported a bare
 * percentage plus a cap. This completes it:
 *
 *   discountType   PERCENT | FIXED
 *   discountValue  the percent, or the flat rupee amount
 *   minOrderValue  minimum cart subtotal to qualify
 *   maxDiscount    cap (percent coupons only)
 *   expiryDate     inclusive last valid day
 *   usageLimit     total redemptions allowed (null = unlimited)
 *   usedCount      redemptions so far
 *   active         manual on/off switch
 *
 * BACKWARDS COMPATIBILITY
 * -----------------------
 * The legacy `discountPercent` / `maxDiscountAmount` columns are
 * kept and stay in sync, so rows created before Stage 2 keep
 * working and nothing has to be hand-edited in pgAdmin.
 *
 * SECURITY
 * --------
 * CouponService.evaluate() is the ONLY place a discount is ever
 * computed. The checkout pricing engine calls it server-side.
 * The frontend's /validate call is a PREVIEW ONLY - whatever it
 * displays is recomputed from scratch before the order is saved.
 * ===========================================================
 */

@Entity
@Table(name = "coupons")
class Coupon {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String code;

    private String description;

    /** PERCENT | FIXED */
    @Column(name = "discount_type")
    private String discountType = CouponType.PERCENT;

    /** Percent (0-100) when PERCENT, rupee amount when FIXED. */
    @Column(name = "discount_value")
    private BigDecimal discountValue = BigDecimal.ZERO;

    /** Legacy column, kept in sync with discountValue for PERCENT coupons. */
    private BigDecimal discountPercent;

    /** Legacy column, kept in sync with maxDiscount. */
    private BigDecimal maxDiscountAmount;

    @Column(name = "min_order_value")
    private BigDecimal minOrderValue = BigDecimal.ZERO;

    /** Cap on a percentage discount. Null = uncapped. */
    @Column(name = "max_discount")
    private BigDecimal maxDiscount;

    /** Inclusive last valid day. Null = never expires. */
    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    /** Null = unlimited. */
    @Column(name = "usage_limit")
    private Integer usageLimit;

    @Column(name = "used_count")
    private Integer usedCount = 0;

    private boolean active = true;

    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) {
        this.code = code == null ? null : code.trim().toUpperCase(Locale.ROOT);
    }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getDiscountType() { return discountType; }
    public void setDiscountType(String discountType) { this.discountType = discountType; }

    public BigDecimal getDiscountValue() { return discountValue; }
    public void setDiscountValue(BigDecimal discountValue) { this.discountValue = discountValue; }

    public BigDecimal getDiscountPercent() { return discountPercent; }
    public void setDiscountPercent(BigDecimal discountPercent) { this.discountPercent = discountPercent; }

    public BigDecimal getMaxDiscountAmount() { return maxDiscountAmount; }
    public void setMaxDiscountAmount(BigDecimal maxDiscountAmount) { this.maxDiscountAmount = maxDiscountAmount; }

    public BigDecimal getMinOrderValue() { return minOrderValue; }
    public void setMinOrderValue(BigDecimal minOrderValue) { this.minOrderValue = minOrderValue; }

    public BigDecimal getMaxDiscount() { return maxDiscount; }
    public void setMaxDiscount(BigDecimal maxDiscount) { this.maxDiscount = maxDiscount; }

    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }

    public Integer getUsageLimit() { return usageLimit; }
    public void setUsageLimit(Integer usageLimit) { this.usageLimit = usageLimit; }

    public Integer getUsedCount() { return usedCount; }
    public void setUsedCount(Integer usedCount) { this.usedCount = usedCount; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    /**
     * Reconciles the new fields with the legacy columns. Called before every
     * save so old and new readers always agree.
     */
    void normalize() {
        if (discountType == null || !CouponType.isValid(discountType)) {
            discountType = CouponType.PERCENT;
        }
        discountType = discountType.toUpperCase(Locale.ROOT);

        if (discountValue == null) {
            // Row created by the pre-Stage-2 admin page: adopt the legacy value.
            discountValue = discountPercent == null ? BigDecimal.ZERO : discountPercent;
        }
        if (discountValue.compareTo(BigDecimal.ZERO) < 0) {
            discountValue = BigDecimal.ZERO;
        }
        if (CouponType.PERCENT.equals(discountType)
                && discountValue.compareTo(BigDecimal.valueOf(100)) > 0) {
            discountValue = BigDecimal.valueOf(100);
        }

        if (maxDiscount == null && maxDiscountAmount != null) {
            maxDiscount = maxDiscountAmount;
        }
        if (minOrderValue == null) minOrderValue = BigDecimal.ZERO;
        if (usedCount == null) usedCount = 0;

        // keep legacy columns aligned
        discountPercent = CouponType.PERCENT.equals(discountType) ? discountValue : BigDecimal.ZERO;
        maxDiscountAmount = maxDiscount;
    }
}


final class CouponType {
    static final String PERCENT = "PERCENT";
    static final String FIXED = "FIXED";
    static final List<String> ALL = List.of(PERCENT, FIXED);

    static boolean isValid(String value) {
        return value != null && ALL.contains(value.trim().toUpperCase(Locale.ROOT));
    }

    private CouponType() { }
}


interface CouponRepository extends JpaRepository<Coupon, Long> {
    Optional<Coupon> findByCodeIgnoreCase(String code);
    Optional<Coupon> findByCodeAndActiveTrue(String code);
    List<Coupon> findAllByOrderByIdDesc();
}


/* ===========================================================
   DTO + REQUEST
   =========================================================== */

class CouponDto {
    public Long id;
    public String code;
    public String description;
    public String discountType;
    public BigDecimal discountValue;
    public BigDecimal minOrderValue;
    public BigDecimal maxDiscount;
    public String expiryDate;      // ISO yyyy-MM-dd, or null
    public Integer usageLimit;
    public Integer usedCount;
    public boolean active;
    /** Computed: false once expired or fully used, even if active is true. */
    public boolean usable;
    public String statusLabel;     // ACTIVE | INACTIVE | EXPIRED | EXHAUSTED
    /** e.g. "20% off up to ₹150" - ready to render. */
    public String summary;
}

class CouponRequest {
    public String code;
    public String description;
    public String discountType;
    public BigDecimal discountValue;
    public BigDecimal minOrderValue;
    public BigDecimal maxDiscount;
    public String expiryDate;      // ISO yyyy-MM-dd, or null/blank
    public Integer usageLimit;
    public Boolean active;
}

/** Result of evaluating a coupon against a cart subtotal. */
class CouponEvaluation {
    public boolean valid;
    public BigDecimal discount = BigDecimal.ZERO;
    public String code;
    public String message;
    public CouponDto coupon;
}


/* ===========================================================
   SERVICE - the single source of truth for discounts
   =========================================================== */

@Service
class CouponService {

    @Autowired private CouponRepository couponRepository;

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    /**
     * Evaluates a coupon code against a cart subtotal.
     *
     * Never throws for a bad code - it returns a result carrying a
     * customer-readable reason, because "this coupon is expired" is a
     * normal outcome, not an exception.
     */
    CouponEvaluation evaluate(String rawCode, BigDecimal subtotal) {
        CouponEvaluation result = new CouponEvaluation();
        result.discount = money(BigDecimal.ZERO);

        if (rawCode == null || rawCode.isBlank()) {
            return result; // nothing applied, no message
        }

        String code = rawCode.trim().toUpperCase(Locale.ROOT);
        result.code = code;

        Optional<Coupon> found = couponRepository.findByCodeIgnoreCase(code);
        if (found.isEmpty()) {
            result.message = "That coupon code is not valid.";
            return result;
        }

        Coupon coupon = found.get();
        coupon.normalize();
        result.coupon = toDto(coupon);

        if (!coupon.isActive()) {
            result.message = "This coupon is no longer active.";
            return result;
        }
        if (isExpired(coupon)) {
            result.message = "This coupon expired on " + coupon.getExpiryDate() + ".";
            return result;
        }
        if (isExhausted(coupon)) {
            result.message = "This coupon has reached its usage limit.";
            return result;
        }

        BigDecimal base = subtotal == null ? BigDecimal.ZERO : subtotal;
        BigDecimal minimum = coupon.getMinOrderValue() == null ? BigDecimal.ZERO : coupon.getMinOrderValue();

        if (base.compareTo(minimum) < 0) {
            BigDecimal shortfall = minimum.subtract(base);
            result.message = "Add items worth " + rupees(shortfall)
                    + " more to use this coupon (minimum order " + rupees(minimum) + ").";
            return result;
        }

        BigDecimal discount;
        if (CouponType.FIXED.equals(coupon.getDiscountType())) {
            discount = coupon.getDiscountValue();
        } else {
            // Scale explicitly: an unscaled divide() throws for non-terminating
            // decimals (a 33% coupon used to crash checkout outright).
            discount = base.multiply(coupon.getDiscountValue())
                    .divide(HUNDRED, 2, RoundingMode.HALF_UP);

            if (coupon.getMaxDiscount() != null
                    && discount.compareTo(coupon.getMaxDiscount()) > 0) {
                discount = coupon.getMaxDiscount();
            }
        }

        // A discount can never exceed the cart itself.
        if (discount.compareTo(base) > 0) discount = base;
        if (discount.compareTo(BigDecimal.ZERO) < 0) discount = BigDecimal.ZERO;

        discount = money(discount);

        if (discount.compareTo(BigDecimal.ZERO) <= 0) {
            result.message = "This coupon does not reduce your current total.";
            return result;
        }

        result.valid = true;
        result.discount = discount;
        result.message = "Coupon applied. You saved " + rupees(discount) + ".";
        return result;
    }

    /** Called once, inside the checkout transaction, after the order is accepted. */
    void recordRedemption(String code) {
        if (code == null || code.isBlank()) return;
        couponRepository.findByCodeIgnoreCase(code.trim()).ifPresent(coupon -> {
            coupon.normalize();
            coupon.setUsedCount((coupon.getUsedCount() == null ? 0 : coupon.getUsedCount()) + 1);
            couponRepository.save(coupon);
        });
    }

    /* ---------------- admin CRUD helpers ---------------- */

    List<CouponDto> listAll() {
        List<CouponDto> out = new ArrayList<>();
        for (Coupon c : couponRepository.findAllByOrderByIdDesc()) {
            c.normalize();
            out.add(toDto(c));
        }
        return out;
    }

    CouponDto create(CouponRequest req) {
        String code = requireCode(req.code);
        couponRepository.findByCodeIgnoreCase(code).ifPresent(existing -> {
            throw new BadRequestException("A coupon with the code " + code + " already exists.");
        });

        Coupon coupon = new Coupon();
        apply(coupon, req);
        coupon.setUsedCount(0);
        coupon.normalize();
        return toDto(couponRepository.save(coupon));
    }

    CouponDto update(Long id, CouponRequest req) {
        Coupon coupon = couponRepository.findById(id)
                .orElseThrow(() -> new BadRequestException("That coupon no longer exists."));

        String code = requireCode(req.code);
        couponRepository.findByCodeIgnoreCase(code).ifPresent(clash -> {
            if (!clash.getId().equals(id)) {
                throw new BadRequestException("Another coupon already uses the code " + code + ".");
            }
        });

        apply(coupon, req);
        coupon.normalize();
        return toDto(couponRepository.save(coupon));
    }

    void delete(Long id) {
        if (!couponRepository.existsById(id)) {
            throw new BadRequestException("That coupon no longer exists.");
        }
        couponRepository.deleteById(id);
    }

    CouponDto setActive(Long id, boolean active) {
        Coupon coupon = couponRepository.findById(id)
                .orElseThrow(() -> new BadRequestException("That coupon no longer exists."));
        coupon.setActive(active);
        coupon.normalize();
        return toDto(couponRepository.save(coupon));
    }

    /* ---------------- internals ---------------- */

    private void apply(Coupon coupon, CouponRequest req) {
        coupon.setCode(requireCode(req.code));
        coupon.setDescription(req.description);

        String type = CouponType.isValid(req.discountType)
                ? req.discountType.trim().toUpperCase(Locale.ROOT)
                : CouponType.PERCENT;
        coupon.setDiscountType(type);

        if (req.discountValue == null || req.discountValue.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BadRequestException("Discount value must be greater than zero.");
        }
        if (CouponType.PERCENT.equals(type) && req.discountValue.compareTo(HUNDRED) > 0) {
            throw new BadRequestException("A percentage discount cannot be more than 100%.");
        }
        coupon.setDiscountValue(req.discountValue);

        coupon.setMinOrderValue(req.minOrderValue == null ? BigDecimal.ZERO : req.minOrderValue);
        coupon.setMaxDiscount(CouponType.PERCENT.equals(type) ? req.maxDiscount : null);
        coupon.setUsageLimit(req.usageLimit != null && req.usageLimit > 0 ? req.usageLimit : null);
        coupon.setActive(req.active == null || req.active);

        if (req.expiryDate != null && !req.expiryDate.isBlank()) {
            try {
                coupon.setExpiryDate(LocalDate.parse(req.expiryDate.trim()));
            } catch (Exception e) {
                throw new BadRequestException("Expiry date must be in YYYY-MM-DD format.");
            }
        } else {
            coupon.setExpiryDate(null);
        }
    }

    private String requireCode(String code) {
        if (code == null || code.isBlank()) {
            throw new BadRequestException("Coupon code is required.");
        }
        String cleaned = code.trim().toUpperCase(Locale.ROOT);
        if (!cleaned.matches("[A-Z0-9_-]{3,32}")) {
            throw new BadRequestException(
                    "Coupon code must be 3-32 characters, using letters, numbers, - or _ only.");
        }
        return cleaned;
    }

    private static boolean isExpired(Coupon coupon) {
        if (coupon.getExpiryDate() == null) return false;
        return LocalDate.now(ZoneId.systemDefault()).isAfter(coupon.getExpiryDate());
    }

    private static boolean isExhausted(Coupon coupon) {
        if (coupon.getUsageLimit() == null) return false;
        int used = coupon.getUsedCount() == null ? 0 : coupon.getUsedCount();
        return used >= coupon.getUsageLimit();
    }

    CouponDto toDto(Coupon c) {
        CouponDto dto = new CouponDto();
        dto.id = c.getId();
        dto.code = c.getCode();
        dto.description = c.getDescription();
        dto.discountType = c.getDiscountType();
        dto.discountValue = c.getDiscountValue();
        dto.minOrderValue = c.getMinOrderValue();
        dto.maxDiscount = c.getMaxDiscount();
        dto.expiryDate = c.getExpiryDate() == null ? null : c.getExpiryDate().toString();
        dto.usageLimit = c.getUsageLimit();
        dto.usedCount = c.getUsedCount();
        dto.active = c.isActive();

        if (!c.isActive()) {
            dto.statusLabel = "INACTIVE";
        } else if (isExpired(c)) {
            dto.statusLabel = "EXPIRED";
        } else if (isExhausted(c)) {
            dto.statusLabel = "EXHAUSTED";
        } else {
            dto.statusLabel = "ACTIVE";
        }
        dto.usable = "ACTIVE".equals(dto.statusLabel);
        dto.summary = summarize(c);
        return dto;
    }

    private static String summarize(Coupon c) {
        StringBuilder sb = new StringBuilder();
        if (CouponType.FIXED.equals(c.getDiscountType())) {
            sb.append(rupees(c.getDiscountValue())).append(" off");
        } else {
            sb.append(stripZeros(c.getDiscountValue())).append("% off");
            if (c.getMaxDiscount() != null) {
                sb.append(" up to ").append(rupees(c.getMaxDiscount()));
            }
        }
        if (c.getMinOrderValue() != null && c.getMinOrderValue().compareTo(BigDecimal.ZERO) > 0) {
            sb.append(" on orders above ").append(rupees(c.getMinOrderValue()));
        }
        return sb.toString();
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static String rupees(BigDecimal value) {
        return "Rs." + stripZeros(value);
    }

    private static String stripZeros(BigDecimal value) {
        if (value == null) return "0";
        return value.stripTrailingZeros().toPlainString();
    }
}


/* ===========================================================
   PUBLIC PREVIEW ENDPOINT
   -----------------------------------------------------------
   Lets the checkout page show "Coupon applied, you saved Rs.X"
   before the order exists. PREVIEW ONLY - the real discount is
   recomputed inside POST /api/checkout.
   =========================================================== */

@RestController
@RequestMapping("/api/coupons")
class PublicCouponController {

    @Autowired private CouponService couponService;
    @Autowired private CartItemRepository cartItemRepository;
    @Autowired private OrdersController ordersController;

    /**
     * Validates a code against the signed-in user's live cart subtotal,
     * so the preview cannot be gamed by a client-supplied total.
     */
    @GetMapping("/validate")
    public CouponEvaluation validate(
            @RequestParam String code,
            @RequestParam Long userId) {

        PricingResult pricing = ordersController.priceCart(
                cartItemRepository.findByUserId(userId), null);

        return couponService.evaluate(code, pricing.subtotal);
    }
}


/* ===========================================================
   ADMIN COUPON CRUD
   -----------------------------------------------------------
   Everything the admin dashboard needs - no SQL required.
   =========================================================== */

@RestController
@RequestMapping("/api/admin/coupons")
class AdminCouponController {

    @Autowired private CouponService couponService;

    @GetMapping
    public List<CouponDto> list() {
        return couponService.listAll();
    }

    @GetMapping("/types")
    public List<String> types() {
        return CouponType.ALL;
    }

    @PostMapping
    public ResponseEntity<CouponDto> create(@RequestBody CouponRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(couponService.create(req));
    }

    @PutMapping("/{id}")
    public CouponDto update(@PathVariable Long id, @RequestBody CouponRequest req) {
        return couponService.update(id, req);
    }

    @PutMapping("/{id}/active")
    public CouponDto setActive(@PathVariable Long id, @RequestParam boolean active) {
        return couponService.setActive(id, active);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        couponService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
