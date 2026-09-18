package com.nammastore;

import jakarta.persistence.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;


/*
 * ===========================================================
 * Products.java
 * ===========================================================
 *
 * Categories, products, images, variants, stock, search and
 * admin CRUD.
 *
 * STAGE 1 CHANGES
 * ---------------
 *  - Every endpoint now returns ProductDto / CategoryDto
 *    instead of the raw JPA entity (see Dtos.java).
 *  - File upload moved out to Storage.java.
 *  - NEW image management endpoints so product and category
 *    images are uploaded, reordered, re-primaried and deleted
 *    from the admin UI. No more pgAdmin.
 *  - thumbnailUrl and images[] are kept in sync on every write:
 *    images[0] IS the primary image.
 *  - Images are stored as RELATIVE paths and returned as
 *    ABSOLUTE urls.
 * ===========================================================
 */


/* ===========================================================
   CATEGORY ENTITY
   =========================================================== */

@Entity
@Table(name = "categories")
class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank
    private String name;

    /* Required by the existing PostgreSQL schema. */
    @Column(nullable = false, unique = true)
    private String slug;

    private String description;

    /** Relative path such as /uploads/categories/<uuid>.jpg (legacy rows may be absolute). */
    private String imageUrl;

    private boolean active = true;


    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}


/* ===========================================================
   PRODUCT ENTITY
   =========================================================== */

@Entity
@Table(name = "products")
class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank
    private String name;

    @Column(length = 4000)
    private String description;

    @NotNull
    private BigDecimal price;

    private BigDecimal salePrice;

    private String sku;

    private String brand;

    /**
     * Mug, T-Shirt, Hoodie, Cap, Poster, Photo Frame, Keychain, Other...
     * Distinct from Category.
     */
    @Column(name = "product_type")
    private String productType;

    /** Primary image. Always mirrors images[0]. */
    private String thumbnailUrl;

    /** Optional hero/background image. */
    private String backgroundImageUrl;

    private Integer stockQuantity = 0;

    private boolean featured = false;

    private boolean active = true;

    private boolean customizable = false;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id")
    private Category category;

    /** Ordered gallery. Position 0 is the primary image. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "product_images",
            joinColumns = @JoinColumn(name = "product_id")
    )
    @OrderColumn(name = "image_order")
    @Column(name = "image_url")
    private List<String> images = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "product_variants",
            joinColumns = @JoinColumn(name = "product_id")
    )
    @Column(name = "variant_label")
    private List<String> variants = new ArrayList<>();

    private Instant createdAt = Instant.now();


    /** IN_STOCK | LOW_STOCK | OUT_OF_STOCK */
    public String stockStatus() {
        if (stockQuantity == null || stockQuantity <= 0) return "OUT_OF_STOCK";
        if (stockQuantity <= 5) return "LOW_STOCK";
        return "IN_STOCK";
    }


    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }

    public BigDecimal getSalePrice() { return salePrice; }
    public void setSalePrice(BigDecimal salePrice) { this.salePrice = salePrice; }

    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }

    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }

    public String getProductType() { return productType; }
    public void setProductType(String productType) { this.productType = productType; }

    public String getThumbnailUrl() { return thumbnailUrl; }
    public void setThumbnailUrl(String thumbnailUrl) { this.thumbnailUrl = thumbnailUrl; }

    public String getBackgroundImageUrl() { return backgroundImageUrl; }
    public void setBackgroundImageUrl(String backgroundImageUrl) { this.backgroundImageUrl = backgroundImageUrl; }

    public Integer getStockQuantity() { return stockQuantity; }
    public void setStockQuantity(Integer stockQuantity) { this.stockQuantity = stockQuantity; }

    public boolean isFeatured() { return featured; }
    public void setFeatured(boolean featured) { this.featured = featured; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public boolean isCustomizable() { return customizable; }
    public void setCustomizable(boolean customizable) { this.customizable = customizable; }

    public Category getCategory() { return category; }
    public void setCategory(Category category) { this.category = category; }

    public List<String> getImages() { return images; }
    public void setImages(List<String> images) {
        this.images.clear();
        if (images != null) this.images.addAll(images);
    }

    public List<String> getVariants() { return variants; }
    public void setVariants(List<String> variants) {
        this.variants.clear();
        if (variants != null) this.variants.addAll(variants);
    }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}


/* ===========================================================
   REPOSITORIES
   =========================================================== */

interface CategoryRepository extends JpaRepository<Category, Long> {

    Optional<Category> findBySlug(String slug);

    List<Category> findByActiveTrueOrderByNameAsc();
}


interface ProductRepository extends JpaRepository<Product, Long> {

    List<Product> findByCategoryIdAndActiveTrue(Long categoryId);

    List<Product> findByActiveTrue();

    List<Product> findByActiveTrueAndFeaturedTrue();

    List<Product> findByNameContainingIgnoreCaseAndActiveTrue(String name);

    long countByCategoryIdAndActiveTrue(Long categoryId);

    @Query("select p from Product p left join p.category c "
            + "where p.active = true and ("
            + " lower(p.name) like lower(concat('%', :term, '%'))"
            + " or lower(coalesce(p.description, '')) like lower(concat('%', :term, '%'))"
            + " or lower(coalesce(p.brand, '')) like lower(concat('%', :term, '%'))"
            + " or lower(coalesce(p.productType, '')) like lower(concat('%', :term, '%'))"
            + " or lower(coalesce(c.name, '')) like lower(concat('%', :term, '%'))"
            + ")")
    List<Product> search(@Param("term") String term);
}


/* ===========================================================
   REQUEST DTOs
   =========================================================== */

class ProductRequest {

    @NotBlank(message = "Product name is required")
    public String name;

    public String description;

    @NotNull(message = "Price is required")
    public BigDecimal price;

    public BigDecimal salePrice;

    public String sku;

    public String brand;

    @NotBlank(message = "Product type is required")
    public String productType;

    public String thumbnailUrl;

    public String backgroundImageUrl;

    public Integer stockQuantity;

    public boolean featured;

    public boolean active = true;

    public boolean customizable;

    @NotNull(message = "Category is required")
    public Long categoryId;

    /** Full gallery, in display order. Position 0 becomes the primary image. */
    public List<String> images;

    public List<String> variants;
}


class CategoryRequest {

    @NotBlank(message = "Category name is required")
    public String name;

    /** Optional - generated from the name when omitted. */
    public String slug;

    public String description;

    public String imageUrl;

    public boolean active = true;
}


/* ===========================================================
   PUBLIC CATALOG CONTROLLER
   =========================================================== */

@RestController
@RequestMapping("/api")
class PublicCatalogController {

    @Autowired private ProductRepository productRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private DtoMapper mapper;


    /* ---------------- categories ---------------- */

    @GetMapping("/categories")
    public List<CategoryDto> categories(
            @RequestParam(required = false, defaultValue = "false") boolean withCounts) {

        List<Category> all = new ArrayList<>(categoryRepository.findAll());
        all.sort(Comparator.comparing(
                (Category c) -> c.getName() == null ? "" : c.getName().toLowerCase(Locale.ROOT)));

        List<CategoryDto> out = new ArrayList<>();
        for (Category c : all) {
            out.add(withCounts
                    ? mapper.toDto(c, productRepository.countByCategoryIdAndActiveTrue(c.getId()))
                    : mapper.toDto(c));
        }
        return out;
    }

    @GetMapping("/categories/{id}")
    public ResponseEntity<CategoryDto> category(@PathVariable Long id) {
        return categoryRepository.findById(id)
                .map(c -> ResponseEntity.ok(
                        mapper.toDto(c, productRepository.countByCategoryIdAndActiveTrue(c.getId()))))
                .orElse(ResponseEntity.notFound().build());
    }


    /* ---------------- products ---------------- */

    @GetMapping("/products")
    public List<ProductDto> products(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) Boolean featured) {

        List<Product> result;

        if (search != null && !search.isBlank()) {
            result = new ArrayList<>(productRepository.search(search.trim()));
        } else if (categoryId != null) {
            result = new ArrayList<>(productRepository.findByCategoryIdAndActiveTrue(categoryId));
        } else if (Boolean.TRUE.equals(featured)) {
            result = new ArrayList<>(productRepository.findByActiveTrueAndFeaturedTrue());
        } else {
            result = new ArrayList<>(productRepository.findByActiveTrue());
        }

        if (categoryId != null && search != null && !search.isBlank()) {
            result.removeIf(p -> p.getCategory() == null
                    || !categoryId.equals(p.getCategory().getId()));
        }

        sortProducts(result, sort);
        return mapper.toProductDtos(result);
    }

    @GetMapping("/products/{id}")
    public ResponseEntity<ProductDto> product(@PathVariable Long id) {
        return productRepository.findById(id)
                .map(p -> ResponseEntity.ok(mapper.toDto(p)))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/products/category/{categoryId}")
    public List<ProductDto> productsByCategory(@PathVariable Long categoryId) {
        return mapper.toProductDtos(productRepository.findByCategoryIdAndActiveTrue(categoryId));
    }

    /** Products in the same category, excluding the product itself. */
    @GetMapping("/products/{id}/related")
    public List<ProductDto> relatedProducts(
            @PathVariable Long id,
            @RequestParam(required = false, defaultValue = "8") int limit) {

        Optional<Product> productOpt = productRepository.findById(id);
        if (productOpt.isEmpty() || productOpt.get().getCategory() == null) {
            return new ArrayList<>();
        }

        List<Product> siblings = new ArrayList<>(
                productRepository.findByCategoryIdAndActiveTrue(productOpt.get().getCategory().getId()));
        siblings.removeIf(p -> id.equals(p.getId()));

        int safeLimit = Math.max(1, Math.min(limit, 20));
        if (siblings.size() > safeLimit) {
            siblings = new ArrayList<>(siblings.subList(0, safeLimit));
        }
        return mapper.toProductDtos(siblings);
    }

    static void sortProducts(List<Product> result, String sort) {
        if (sort == null) return;

        Comparator<Product> byPrice =
                Comparator.comparing((Product p) -> DtoMapper.effectivePrice(p));
        Comparator<Product> byName =
                Comparator.comparing((Product p) -> p.getName() == null
                        ? "" : p.getName().toLowerCase(Locale.ROOT));
        Comparator<Product> byNewest =
                Comparator.comparing((Product p) -> p.getCreatedAt() == null
                        ? Instant.EPOCH : p.getCreatedAt());

        switch (sort) {
            case "price_asc" -> result.sort(byPrice);
            case "price_desc" -> result.sort(byPrice.reversed());
            case "name_asc" -> result.sort(byName);
            case "newest" -> result.sort(byNewest.reversed());
            default -> { /* keep repository order */ }
        }
    }
}


/* ===========================================================
   ADMIN CATALOG CONTROLLER
   =========================================================== */

@RestController
@RequestMapping("/api/admin")
class AdminCatalogController {

    @Autowired private ProductRepository productRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private StorageService storage;
    @Autowired private DtoMapper mapper;
    @Autowired private WishlistService wishlistService;


    /* =======================================================
       CATEGORIES
       ======================================================= */

    @GetMapping("/categories")
    public List<CategoryDto> listCategories() {
        List<CategoryDto> out = new ArrayList<>();
        for (Category c : categoryRepository.findAll()) {
            out.add(mapper.toDto(c, productRepository.countByCategoryIdAndActiveTrue(c.getId())));
        }
        return out;
    }

    @PostMapping("/categories")
    public ResponseEntity<CategoryDto> createCategory(@Valid @RequestBody CategoryRequest req) {
        Category c = new Category();
        c.setName(req.name);
        c.setSlug(createSlug(req.slug != null && !req.slug.isBlank() ? req.slug : req.name, null));
        c.setDescription(req.description);
        c.setImageUrl(normalizeStoredImage(req.imageUrl));
        c.setActive(req.active);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(mapper.toDto(categoryRepository.save(c)));
    }

    @PutMapping("/categories/{id}")
    public ResponseEntity<CategoryDto> updateCategory(
            @PathVariable Long id,
            @Valid @RequestBody CategoryRequest req) {

        Optional<Category> existing = categoryRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Category c = existing.get();
        c.setName(req.name);
        c.setSlug(createSlug(req.slug != null && !req.slug.isBlank() ? req.slug : req.name, id));
        c.setDescription(req.description);

        String nextImage = normalizeStoredImage(req.imageUrl);
        // Replacing the image? Clean up the file we are dropping.
        if (c.getImageUrl() != null && !storage.sameImage(c.getImageUrl(), nextImage)) {
            storage.deleteQuietly(c.getImageUrl());
        }
        c.setImageUrl(nextImage);
        c.setActive(req.active);

        return ResponseEntity.ok(mapper.toDto(categoryRepository.save(c)));
    }

    @DeleteMapping("/categories/{id}")
    public ResponseEntity<Void> deleteCategory(@PathVariable Long id) {
        Optional<Category> existing = categoryRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        long inUse = productRepository.countByCategoryIdAndActiveTrue(id);
        if (inUse > 0) {
            throw new BadRequestException(
                    "This category still has " + inUse + " active product(s). "
                            + "Move or deactivate them first, or deactivate the category instead.");
        }

        storage.deleteQuietly(existing.get().getImageUrl());
        categoryRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /* ---- category image upload / delete (replaces pgAdmin) ---- */

    @PostMapping("/categories/{id}/image")
    public ResponseEntity<CategoryDto> uploadCategoryImage(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {

        Optional<Category> existing = categoryRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Category c = existing.get();
        String stored = storage.storeImage(file, "categories");
        storage.deleteQuietly(c.getImageUrl());
        c.setImageUrl(stored);

        return ResponseEntity.ok(mapper.toDto(categoryRepository.save(c)));
    }

    @DeleteMapping("/categories/{id}/image")
    public ResponseEntity<CategoryDto> deleteCategoryImage(@PathVariable Long id) {
        Optional<Category> existing = categoryRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Category c = existing.get();
        storage.deleteQuietly(c.getImageUrl());
        c.setImageUrl(null);

        return ResponseEntity.ok(mapper.toDto(categoryRepository.save(c)));
    }


    /* =======================================================
       PRODUCTS
       ======================================================= */

    @GetMapping("/products")
    public List<ProductDto> listProducts() {
        List<Product> all = new ArrayList<>(productRepository.findAll());
        Comparator<Product> byId =
                Comparator.comparing((Product p) -> p.getId() == null ? 0L : p.getId());
        all.sort(byId.reversed());
        return mapper.toProductDtos(all);
    }

    @PostMapping("/products")
    public ResponseEntity<ProductDto> createProduct(@Valid @RequestBody ProductRequest req) {
        Category category = requireCategory(req.categoryId);
        Product p = new Product();
        applyRequest(p, req, category);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(mapper.toDto(productRepository.save(p)));
    }

    @PutMapping("/products/{id}")
    public ResponseEntity<ProductDto> updateProduct(
            @PathVariable Long id,
            @Valid @RequestBody ProductRequest req) {

        Optional<Product> existing = productRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Category category = requireCategory(req.categoryId);
        Product p = existing.get();

        List<String> before = new ArrayList<>(p.getImages());
        applyRequest(p, req, category);
        Product saved = productRepository.save(p);

        // Delete files the admin removed from the gallery.
        for (String old : before) {
            boolean stillUsed = false;
            for (String current : saved.getImages()) {
                if (storage.sameImage(current, old)) { stillUsed = true; break; }
            }
            if (!stillUsed) storage.deleteQuietly(old);
        }

        return ResponseEntity.ok(mapper.toDto(saved));
    }

    @DeleteMapping("/products/{id}")
    public ResponseEntity<Void> deleteProduct(@PathVariable Long id) {
        Optional<Product> existing = productRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        List<String> images = new ArrayList<>(existing.get().getImages());
        String background = existing.get().getBackgroundImageUrl();

        // Drop wishlist rows first, otherwise they'd point at a product that
        // no longer exists and the navbar count would drift.
        wishlistService.purgeProduct(id);
        productRepository.deleteById(id);

        for (String image : images) {
            storage.deleteQuietly(image);
        }
        storage.deleteQuietly(background);

        return ResponseEntity.noContent().build();
    }

    @PutMapping("/products/{id}/stock")
    public ResponseEntity<ProductDto> setStock(
            @PathVariable Long id,
            @RequestParam Integer quantity) {

        Optional<Product> existing = productRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        if (quantity == null || quantity < 0) {
            throw new BadRequestException("Stock quantity cannot be negative.");
        }

        Product p = existing.get();
        p.setStockQuantity(quantity);
        return ResponseEntity.ok(mapper.toDto(productRepository.save(p)));
    }

    @PutMapping("/products/{id}/active")
    public ResponseEntity<ProductDto> setActive(
            @PathVariable Long id,
            @RequestParam boolean active) {

        Optional<Product> existing = productRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Product p = existing.get();
        p.setActive(active);
        return ResponseEntity.ok(mapper.toDto(productRepository.save(p)));
    }


    /* =======================================================
       PRODUCT IMAGE MANAGEMENT  (replaces pgAdmin)
       ======================================================= */

    /** Upload one or more images and append them to the gallery. */
    @PostMapping("/products/{id}/images")
    public ResponseEntity<ProductDto> uploadProductImages(
            @PathVariable Long id,
            @RequestParam("files") List<MultipartFile> files) {

        Optional<Product> existing = productRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        if (files == null || files.isEmpty()) {
            throw new BadRequestException("No images were provided.");
        }

        Product p = existing.get();
        List<String> gallery = new ArrayList<>(p.getImages());
        for (MultipartFile file : files) {
            gallery.add(storage.storeImage(file, "products"));
        }
        syncGallery(p, gallery);

        return ResponseEntity.ok(mapper.toDto(productRepository.save(p)));
    }

    /** Remove one image from the gallery (accepts the relative path or the absolute url). */
    @DeleteMapping("/products/{id}/images")
    public ResponseEntity<ProductDto> deleteProductImage(
            @PathVariable Long id,
            @RequestParam("url") String url) {

        Optional<Product> existing = productRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Product p = existing.get();
        List<String> gallery = new ArrayList<>(p.getImages());
        String match = findMatch(gallery, url);
        if (match == null) {
            throw new BadRequestException("That image is not part of this product.");
        }

        gallery.remove(match);
        syncGallery(p, gallery);
        Product saved = productRepository.save(p);
        storage.deleteQuietly(match);

        return ResponseEntity.ok(mapper.toDto(saved));
    }

    /** Promote an existing gallery image to position 0 (the primary image). */
    @PutMapping("/products/{id}/images/primary")
    public ResponseEntity<ProductDto> setPrimaryImage(
            @PathVariable Long id,
            @RequestParam("url") String url) {

        Optional<Product> existing = productRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Product p = existing.get();
        List<String> gallery = new ArrayList<>(p.getImages());
        String match = findMatch(gallery, url);
        if (match == null) {
            throw new BadRequestException("That image is not part of this product.");
        }

        gallery.remove(match);
        gallery.add(0, match);
        syncGallery(p, gallery);

        return ResponseEntity.ok(mapper.toDto(productRepository.save(p)));
    }

    /** Replace the whole gallery order in one call (drag-and-drop reordering). */
    @PutMapping("/products/{id}/images/reorder")
    public ResponseEntity<ProductDto> reorderImages(
            @PathVariable Long id,
            @RequestBody List<String> urls) {

        Optional<Product> existing = productRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Product p = existing.get();
        List<String> current = new ArrayList<>(p.getImages());
        List<String> reordered = new ArrayList<>();

        if (urls != null) {
            for (String url : urls) {
                String match = findMatch(current, url);
                if (match != null && !reordered.contains(match)) {
                    reordered.add(match);
                }
            }
        }
        // Anything the client forgot stays at the end rather than being lost.
        for (String value : current) {
            if (!reordered.contains(value)) reordered.add(value);
        }

        syncGallery(p, reordered);
        return ResponseEntity.ok(mapper.toDto(productRepository.save(p)));
    }

    /** Optional rich hero image, separate from the gallery. */
    @PostMapping("/products/{id}/background")
    public ResponseEntity<ProductDto> uploadBackground(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {

        Optional<Product> existing = productRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Product p = existing.get();
        String stored = storage.storeImage(file, "products");
        storage.deleteQuietly(p.getBackgroundImageUrl());
        p.setBackgroundImageUrl(stored);

        return ResponseEntity.ok(mapper.toDto(productRepository.save(p)));
    }


    /* =======================================================
       HELPERS
       ======================================================= */

    private String findMatch(List<String> candidates, String url) {
        for (String value : candidates) {
            if (storage.sameImage(value, url)) return value;
        }
        return null;
    }

    private Category requireCategory(Long categoryId) {
        if (categoryId == null) {
            throw new BadRequestException("Please pick a category for this product.");
        }
        return categoryRepository.findById(categoryId)
                .orElseThrow(() -> new BadRequestException(
                        "Selected category does not exist. Please refresh the page and pick a category again."));
    }

    private void applyRequest(Product p, ProductRequest req, Category category) {
        p.setName(req.name);
        p.setDescription(req.description);
        p.setPrice(req.price);

        // A sale price that is >= price (or <= 0) is meaningless - drop it so
        // the storefront never renders a fake "discount".
        if (req.salePrice != null
                && req.price != null
                && req.salePrice.compareTo(BigDecimal.ZERO) > 0
                && req.salePrice.compareTo(req.price) < 0) {
            p.setSalePrice(req.salePrice);
        } else {
            p.setSalePrice(null);
        }

        p.setSku(req.sku);
        p.setBrand(req.brand);
        p.setProductType(req.productType);
        p.setBackgroundImageUrl(normalizeStoredImage(req.backgroundImageUrl));
        p.setStockQuantity(req.stockQuantity != null && req.stockQuantity >= 0 ? req.stockQuantity : 0);
        p.setFeatured(req.featured);
        p.setActive(req.active);
        p.setCustomizable(req.customizable);
        p.setCategory(category);

        if (req.variants != null) {
            p.setVariants(req.variants);
        }

        // Gallery: request images first, then the explicit thumbnail as a
        // fallback so older clients that only send thumbnailUrl still work.
        List<String> gallery = new ArrayList<>();
        if (req.images != null) {
            for (String image : req.images) {
                String normalized = normalizeStoredImage(image);
                if (normalized != null) gallery.add(normalized);
            }
        }
        String thumb = normalizeStoredImage(req.thumbnailUrl);
        if (thumb != null && findMatch(gallery, thumb) == null) {
            gallery.add(0, thumb);
        }
        syncGallery(p, gallery);
    }

    /**
     * Single source of truth for product imagery: de-duplicates, writes the
     * ordered gallery, and mirrors position 0 into thumbnailUrl so old
     * consumers of thumbnailUrl keep working.
     */
    private void syncGallery(Product p, List<String> gallery) {
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String value : gallery) {
            String normalized = normalizeStoredImage(value);
            if (normalized == null) continue;
            boolean duplicate = false;
            for (String kept : unique) {
                if (storage.sameImage(kept, normalized)) { duplicate = true; break; }
            }
            if (!duplicate) unique.add(normalized);
        }
        List<String> ordered = new ArrayList<>(unique);
        p.setImages(ordered);
        p.setThumbnailUrl(ordered.isEmpty() ? null : ordered.get(0));
    }

    /**
     * Accepts a relative path, one of our absolute URLs, or an external URL,
     * and returns the canonical value to persist. Our own URLs collapse back
     * to "/uploads/..." so the database never stores a hostname again.
     */
    private String normalizeStoredImage(String value) {
        if (value == null || value.isBlank()) return null;
        String relative = storage.toRelativePath(value);
        return relative != null ? relative : value.trim();
    }

    /** Unique, URL-safe slug. Ignores the row being updated when checking uniqueness. */
    private String createSlug(String value, Long ignoreId) {
        String slug = value == null ? "" : value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-|-$", "");

        if (slug.isBlank()) {
            slug = "category-" + UUID.randomUUID().toString().substring(0, 8);
        }

        String base = slug;
        int counter = 2;
        while (true) {
            Optional<Category> clash = categoryRepository.findBySlug(slug);
            if (clash.isEmpty() || (ignoreId != null && ignoreId.equals(clash.get().getId()))) {
                return slug;
            }
            slug = base + "-" + counter++;
        }
    }
}
