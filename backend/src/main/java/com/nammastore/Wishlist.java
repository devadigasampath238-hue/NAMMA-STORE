package com.nammastore;

import jakarta.persistence.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/*
 * ===========================================================
 * Wishlist.java  (STAGE 2 - NEW FILE)
 * ===========================================================
 *
 * The wishlist was referenced all over the frontend (the navbar
 * even had a disabled "coming soon" heart) but never existed on
 * the backend. This adds the whole vertical slice.
 *
 * Duplicates are prevented in TWO places on purpose:
 *   1. a DB-level unique constraint on (user_id, product_id),
 *      which is the only thing that actually holds under a
 *      double-click or two tabs racing each other
 *   2. a friendly check in the service so the normal path
 *      returns 200 instead of a constraint-violation 409
 *
 * Endpoints (all under /api/wishlist):
 *   POST   /                                 add
 *   DELETE /{userId}/{productId}             remove
 *   GET    /{userId}                         full list (ProductDto)
 *   GET    /{userId}/count                   badge count
 *   GET    /{userId}/contains/{productId}    is it wishlisted?
 *   POST   /toggle                           add or remove in one call
 * ===========================================================
 */

@Entity
@Table(
        name = "wishlist_items",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_wishlist_user_product",
                columnNames = {"user_id", "product_id"}
        )
)
class WishlistItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}


interface WishlistRepository extends JpaRepository<WishlistItem, Long> {

    List<WishlistItem> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<WishlistItem> findByUserIdAndProductId(Long userId, Long productId);

    boolean existsByUserIdAndProductId(Long userId, Long productId);

    long countByUserId(Long userId);

    void deleteByUserIdAndProductId(Long userId, Long productId);

    void deleteByProductId(Long productId);
}


class WishlistRequest {
    public Long userId;
    public Long productId;
}


/**
 * Wishlist business rules live here rather than in the controller, so
 * the "remove this product everywhere" cleanup can be reused when a
 * product is deleted from the admin dashboard.
 */
@Service
class WishlistService {

    @Autowired private WishlistRepository wishlistRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private AppUserRepository appUserRepository;
    @Autowired private DtoMapper mapper;

    void requireUser(Long userId) {
        if (userId == null) {
            throw new BadRequestException("Please sign in to use your wishlist.");
        }
        if (!appUserRepository.existsById(userId)) {
            throw new BadRequestException("We could not find your account. Please sign in again.");
        }
    }

    Product requireProduct(Long productId) {
        if (productId == null) {
            throw new BadRequestException("productId is required.");
        }
        return productRepository.findById(productId)
                .orElseThrow(() -> new BadRequestException("That product no longer exists."));
    }

    /** Idempotent: adding something twice is a no-op, not an error. */
    @Transactional
    boolean add(Long userId, Long productId) {
        requireUser(userId);
        requireProduct(productId);

        if (wishlistRepository.existsByUserIdAndProductId(userId, productId)) {
            return false; // already there
        }

        WishlistItem item = new WishlistItem();
        item.setUserId(userId);
        item.setProductId(productId);

        try {
            wishlistRepository.save(item);
        } catch (org.springframework.dao.DataIntegrityViolationException race) {
            // Two tabs hit the unique constraint at the same time. The
            // desired end state (it IS wishlisted) is already true.
            return false;
        }
        return true;
    }

    @Transactional
    boolean remove(Long userId, Long productId) {
        requireUser(userId);
        Optional<WishlistItem> existing = wishlistRepository.findByUserIdAndProductId(userId, productId);
        if (existing.isEmpty()) return false;
        wishlistRepository.delete(existing.get());
        return true;
    }

    @Transactional
    boolean toggle(Long userId, Long productId) {
        requireUser(userId);
        requireProduct(productId);
        if (wishlistRepository.existsByUserIdAndProductId(userId, productId)) {
            wishlistRepository.deleteByUserIdAndProductId(userId, productId);
            return false; // now NOT wishlisted
        }
        return add(userId, productId);
    }

    /**
     * Returns the wishlisted products themselves, newest first. Rows whose
     * product has since been deleted are skipped AND cleaned up, so the
     * count badge can never drift away from what the page shows.
     */
    @Transactional
    List<ProductDto> list(Long userId) {
        requireUser(userId);

        List<ProductDto> out = new ArrayList<>();
        List<WishlistItem> stale = new ArrayList<>();

        for (WishlistItem item : wishlistRepository.findByUserIdOrderByCreatedAtDesc(userId)) {
            Optional<Product> product = productRepository.findById(item.getProductId());
            if (product.isPresent()) {
                out.add(mapper.toDto(product.get()));
            } else {
                stale.add(item);
            }
        }

        if (!stale.isEmpty()) {
            wishlistRepository.deleteAll(stale);
        }
        return out;
    }

    long count(Long userId) {
        if (userId == null) return 0;
        return wishlistRepository.countByUserId(userId);
    }

    boolean contains(Long userId, Long productId) {
        if (userId == null || productId == null) return false;
        return wishlistRepository.existsByUserIdAndProductId(userId, productId);
    }

    /** Called when a product is deleted so no orphan wishlist rows remain. */
    @Transactional
    void purgeProduct(Long productId) {
        wishlistRepository.deleteByProductId(productId);
    }
}


@RestController
@RequestMapping("/api/wishlist")
class WishlistController {

    @Autowired private WishlistService wishlistService;
    @Autowired private CurrentUserService currentUser;

    @PostMapping
    public ResponseEntity<Map<String, Object>> add(@RequestBody WishlistRequest req, @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, req.userId);
        boolean added = wishlistService.add(req.userId, req.productId);
        return ResponseEntity.status(added ? HttpStatus.CREATED : HttpStatus.OK)
                .body(status(req.userId, req.productId, true, added
                        ? "Added to your wishlist."
                        : "This is already in your wishlist."));
    }

    @PostMapping("/toggle")
    public ResponseEntity<Map<String, Object>> toggle(@RequestBody WishlistRequest req, @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, req.userId);
        boolean nowWishlisted = wishlistService.toggle(req.userId, req.productId);
        return ResponseEntity.ok(status(req.userId, req.productId, nowWishlisted,
                nowWishlisted ? "Added to your wishlist." : "Removed from your wishlist."));
    }

    @DeleteMapping("/{userId}/{productId}")
    public ResponseEntity<Map<String, Object>> remove(
            @PathVariable Long userId,
            @PathVariable Long productId,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        currentUser.requireSelf(auth, userId);
        wishlistService.remove(userId, productId);
        return ResponseEntity.ok(status(userId, productId, false, "Removed from your wishlist."));
    }

    @GetMapping("/{userId}")
    public List<ProductDto> list(@PathVariable Long userId, @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        return wishlistService.list(userId);
    }

    @GetMapping("/{userId}/count")
    public Map<String, Object> count(@PathVariable Long userId, @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Map<String, Object> body = new HashMap<>();
        body.put("count", wishlistService.count(userId));
        return body;
    }

    @GetMapping("/{userId}/contains/{productId}")
    public Map<String, Object> contains(
            @PathVariable Long userId,
            @PathVariable Long productId,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        currentUser.requireSelf(auth, userId);
        Map<String, Object> body = new HashMap<>();
        body.put("wishlisted", wishlistService.contains(userId, productId));
        return body;
    }

    private Map<String, Object> status(Long userId, Long productId, boolean wishlisted, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("productId", productId);
        body.put("wishlisted", wishlisted);
        body.put("count", wishlistService.count(userId));
        body.put("message", message);
        return body;
    }
}
