package com.nammastore;

import jakarta.persistence.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * ===========================================================
 * Banners.java  (NEW)
 * -----------------------------------------------------------
 * Admin-managed festival / seasonal hero banners.
 *
 * Nothing about Deepavali, Dasara, Ugadi or any other campaign
 * is hard-coded. A banner is just a row: image, copy, CTA, a
 * scheduling window and a sort order. New campaigns are created
 * from /admin/banners without touching this file.
 *
 * Image handling follows the same convention as products:
 * the DATABASE stores a relative path (/uploads/banners/x.jpg)
 * and the API returns an absolute URL built by StorageService.
 *
 * Endpoints
 *   GET    /api/banners/active        public, only live banners
 *   GET    /api/admin/banners         every banner, any state
 *   POST   /api/admin/banners
 *   PUT    /api/admin/banners/{id}
 *   DELETE /api/admin/banners/{id}
 *   PUT    /api/admin/banners/{id}/active
 *   POST   /api/admin/banners/{id}/image     (multipart, adds image)
 *   DELETE /api/admin/banners/{id}/image     (?url= removes one)
 *   PUT    /api/admin/banners/reorder
 *
 * Everything under /api/admin/** is already gated by
 * AdminAuthFilter in Admin.java, which now verifies a real
 * Firebase ID token and checks the ADMIN flag in the database.
 * ===========================================================
 */

@Entity
@Table(name = "banners")
class Banner {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;
    private String subtitle;

    /** Primary/hero image. Relative path such as /uploads/banners/<uuid>.jpg */
    @Column(length = 512)
    private String imageUrl;

    /** Optional narrower crop used on phones. Falls back to imageUrl. */
    @Column(length = 512)
    private String mobileImageUrl;

    /** Extra images for the same campaign (rotated inside one slide slot). */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "banner_images", joinColumns = @JoinColumn(name = "banner_id"))
    @Column(name = "image_url", length = 512)
    private List<String> images = new ArrayList<>();

    private String ctaText;

    @Column(length = 512)
    private String ctaUrl;

    /** Optional accent colour (hex) so a campaign can retint the hero. */
    private String accentColor;

    private Instant startDate;
    private Instant endDate;

    private Integer displayOrder = 0;

    private boolean active = true;

    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    /** True when the banner is switched on AND inside its scheduling window. */
    boolean isLiveAt(Instant now) {
        if (!active) return false;
        if (startDate != null && now.isBefore(startDate)) return false;
        if (endDate != null && now.isAfter(endDate)) return false;
        return true;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String subtitle) { this.subtitle = subtitle; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public String getMobileImageUrl() { return mobileImageUrl; }
    public void setMobileImageUrl(String mobileImageUrl) { this.mobileImageUrl = mobileImageUrl; }
    public List<String> getImages() { return images; }
    public void setImages(List<String> images) { this.images = images; }
    public String getCtaText() { return ctaText; }
    public void setCtaText(String ctaText) { this.ctaText = ctaText; }
    public String getCtaUrl() { return ctaUrl; }
    public void setCtaUrl(String ctaUrl) { this.ctaUrl = ctaUrl; }
    public String getAccentColor() { return accentColor; }
    public void setAccentColor(String accentColor) { this.accentColor = accentColor; }
    public Instant getStartDate() { return startDate; }
    public void setStartDate(Instant startDate) { this.startDate = startDate; }
    public Instant getEndDate() { return endDate; }
    public void setEndDate(Instant endDate) { this.endDate = endDate; }
    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}

interface BannerRepository extends JpaRepository<Banner, Long> {
}

/** What the API sends back. Image fields are absolute URLs by this point. */
class BannerDto {
    public Long id;
    public String title;
    public String subtitle;
    public String imageUrl;
    public String mobileImageUrl;
    public List<String> images = new ArrayList<>();
    public String ctaText;
    public String ctaUrl;
    public String accentColor;
    public String startDate;
    public String endDate;
    public Integer displayOrder;
    public boolean active;
    /** Convenience for the admin table: switched on AND inside its dates. */
    public boolean live;
}

/** What the admin UI sends in. Dates are ISO-8601 strings or null. */
class BannerRequest {
    public String title;
    public String subtitle;
    public String imageUrl;
    public String mobileImageUrl;
    public List<String> images;
    public String ctaText;
    public String ctaUrl;
    public String accentColor;
    public String startDate;
    public String endDate;
    public Integer displayOrder;
    public Boolean active;
}

class BannerReorderRequest {
    /** Banner ids in the order they should appear. */
    public List<Long> ids;
}

/**
 * Shared mapping + validation so the public and admin controllers
 * cannot drift apart.
 */
@org.springframework.stereotype.Service
class BannerService {

    @Autowired
    private StorageService storageService;

    BannerDto toDto(Banner b) {
        BannerDto dto = new BannerDto();
        dto.id = b.getId();
        dto.title = b.getTitle();
        dto.subtitle = b.getSubtitle();
        dto.imageUrl = storageService.toPublicUrl(b.getImageUrl());
        dto.mobileImageUrl = storageService.toPublicUrl(b.getMobileImageUrl());
        dto.images = storageService.toPublicUrls(b.getImages());
        dto.ctaText = b.getCtaText();
        dto.ctaUrl = b.getCtaUrl();
        dto.accentColor = b.getAccentColor();
        dto.startDate = b.getStartDate() == null ? null : b.getStartDate().toString();
        dto.endDate = b.getEndDate() == null ? null : b.getEndDate().toString();
        dto.displayOrder = b.getDisplayOrder();
        dto.active = b.isActive();
        dto.live = b.isLiveAt(Instant.now());
        return dto;
    }

    List<BannerDto> toDtos(List<Banner> banners) {
        List<BannerDto> out = new ArrayList<>();
        for (Banner b : banners) out.add(toDto(b));
        return out;
    }

    /** Applies a request onto an entity, normalising images to relative paths. */
    void apply(Banner b, BannerRequest req) {
        if (req.title != null) b.setTitle(req.title.trim());
        if (req.subtitle != null) b.setSubtitle(req.subtitle.trim());
        if (req.ctaText != null) b.setCtaText(req.ctaText.trim());
        if (req.ctaUrl != null) b.setCtaUrl(req.ctaUrl.trim());
        if (req.accentColor != null) b.setAccentColor(blankToNull(req.accentColor));
        if (req.displayOrder != null) b.setDisplayOrder(req.displayOrder);
        if (req.active != null) b.setActive(req.active);

        if (req.imageUrl != null) b.setImageUrl(normalise(req.imageUrl));
        if (req.mobileImageUrl != null) b.setMobileImageUrl(normalise(req.mobileImageUrl));

        if (req.images != null) {
            List<String> cleaned = new ArrayList<>();
            for (String img : req.images) {
                String v = normalise(img);
                if (v != null && !cleaned.contains(v)) cleaned.add(v);
            }
            b.getImages().clear();
            b.getImages().addAll(cleaned);
        }

        b.setStartDate(parseInstant(req.startDate, "startDate"));
        b.setEndDate(parseInstant(req.endDate, "endDate"));

        if (b.getStartDate() != null && b.getEndDate() != null
                && b.getEndDate().isBefore(b.getStartDate())) {
            throw new BadRequestException("The banner's end date must be after its start date.");
        }

        if (b.getTitle() == null || b.getTitle().isBlank()) {
            throw new BadRequestException("A banner needs a title.");
        }
        if (b.getImageUrl() == null || b.getImageUrl().isBlank()) {
            throw new BadRequestException("A banner needs an image. Upload one before saving.");
        }

        b.setUpdatedAt(Instant.now());
    }

    /**
     * Accepts either the absolute URL the admin UI was handed or a raw
     * relative path, and stores the relative form. External URLs (someone
     * pasting a CDN link) are kept as-is.
     */
    private String normalise(String value) {
        if (value == null || value.isBlank()) return null;
        String relative = storageService.toRelativePath(value);
        return relative != null ? relative : value.trim();
    }

    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }

    private static Instant parseInstant(String value, String field) {
        if (value == null || value.isBlank()) return null;
        try {
            // Accepts "2026-10-20T00:00:00Z" and the "2026-10-20T00:00"
            // that <input type="datetime-local"> produces.
            String v = value.trim();
            if (v.endsWith("Z") || v.contains("+")) return Instant.parse(v);
            if (v.length() == 16) v = v + ":00";
            return java.time.LocalDateTime.parse(v)
                    .atZone(java.time.ZoneId.systemDefault()).toInstant();
        } catch (Exception e) {
            throw new BadRequestException("Could not read " + field + ": expected a date and time.");
        }
    }

    static final Comparator<Banner> ORDERING =
            Comparator.comparing((Banner b) -> b.getDisplayOrder() == null ? 0 : b.getDisplayOrder())
                    .thenComparing((Banner b) -> b.getId() == null ? 0L : b.getId());
}


/* ===========================================================
   PUBLIC  -  what the storefront hero carousel reads
   =========================================================== */

@RestController
@RequestMapping("/api")
class BannerController {

    @Autowired private BannerRepository bannerRepository;
    @Autowired private BannerService bannerService;

    /**
     * Only banners that are switched on AND inside their scheduling window.
     * An empty list is a valid answer - the homepage falls back to its own
     * static hero rather than showing a broken carousel.
     */
    @GetMapping("/banners/active")
    public List<BannerDto> active() {
        Instant now = Instant.now();
        List<Banner> live = new ArrayList<>(bannerRepository.findAll());
        live.removeIf(b -> !b.isLiveAt(now));
        live.sort(BannerService.ORDERING);
        return bannerService.toDtos(live);
    }
}


/* ===========================================================
   ADMIN  -  full CRUD, gated by AdminAuthFilter
   =========================================================== */

@RestController
@RequestMapping("/api/admin")
class AdminBannerController {

    @Autowired private BannerRepository bannerRepository;
    @Autowired private BannerService bannerService;
    @Autowired private StorageService storageService;

    @GetMapping("/banners")
    public List<BannerDto> list() {
        List<Banner> all = new ArrayList<>(bannerRepository.findAll());
        all.sort(BannerService.ORDERING);
        return bannerService.toDtos(all);
    }

    @GetMapping("/banners/{id}")
    public ResponseEntity<BannerDto> get(@PathVariable Long id) {
        return bannerRepository.findById(id)
                .map(b -> ResponseEntity.ok(bannerService.toDto(b)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/banners")
    public ResponseEntity<BannerDto> create(@RequestBody BannerRequest req) {
        Banner b = new Banner();
        if (req.displayOrder == null) {
            // New banners go to the end of the carousel by default.
            int max = bannerRepository.findAll().stream()
                    .map(x -> x.getDisplayOrder() == null ? 0 : x.getDisplayOrder())
                    .max(Integer::compareTo).orElse(0);
            req.displayOrder = max + 1;
        }
        bannerService.apply(b, req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(bannerService.toDto(bannerRepository.save(b)));
    }

    @PutMapping("/banners/{id}")
    public ResponseEntity<BannerDto> update(@PathVariable Long id, @RequestBody BannerRequest req) {
        Optional<Banner> existing = bannerRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        Banner b = existing.get();
        bannerService.apply(b, req);
        return ResponseEntity.ok(bannerService.toDto(bannerRepository.save(b)));
    }

    @DeleteMapping("/banners/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        Optional<Banner> existing = bannerRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        Banner b = existing.get();
        // Remove the files too, so deleting a campaign does not leave orphans.
        storageService.deleteQuietly(b.getImageUrl());
        storageService.deleteQuietly(b.getMobileImageUrl());
        for (String img : b.getImages()) storageService.deleteQuietly(img);
        bannerRepository.delete(b);
        return ResponseEntity.noContent().build();
    }

    /** Quick on/off switch from the admin list, without a full edit. */
    @PutMapping("/banners/{id}/active")
    public ResponseEntity<BannerDto> setActive(@PathVariable Long id,
                                               @RequestParam boolean value) {
        Optional<Banner> existing = bannerRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        Banner b = existing.get();
        b.setActive(value);
        b.setUpdatedAt(Instant.now());
        return ResponseEntity.ok(bannerService.toDto(bannerRepository.save(b)));
    }

    /**
     * Uploads one image and attaches it. slot=primary|mobile|gallery.
     * Returns the updated banner so the admin UI can re-render immediately.
     */
    @PostMapping("/banners/{id}/image")
    public ResponseEntity<BannerDto> uploadImage(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "slot", defaultValue = "primary") String slot) {

        Optional<Banner> existing = bannerRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Banner b = existing.get();
        String stored = storageService.storeImage(file, "banners");

        switch (slot.toLowerCase()) {
            case "mobile" -> {
                storageService.deleteQuietly(b.getMobileImageUrl());
                b.setMobileImageUrl(stored);
            }
            case "gallery" -> b.getImages().add(stored);
            default -> {
                storageService.deleteQuietly(b.getImageUrl());
                b.setImageUrl(stored);
            }
        }
        b.setUpdatedAt(Instant.now());
        return ResponseEntity.ok(bannerService.toDto(bannerRepository.save(b)));
    }

    @DeleteMapping("/banners/{id}/image")
    public ResponseEntity<BannerDto> deleteImage(@PathVariable Long id,
                                                 @RequestParam("url") String url) {
        Optional<Banner> existing = bannerRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Banner b = existing.get();
        if (storageService.sameImage(b.getImageUrl(), url)) {
            storageService.deleteQuietly(b.getImageUrl());
            b.setImageUrl(null);
        } else if (storageService.sameImage(b.getMobileImageUrl(), url)) {
            storageService.deleteQuietly(b.getMobileImageUrl());
            b.setMobileImageUrl(null);
        } else {
            b.getImages().removeIf(img -> storageService.sameImage(img, url));
            storageService.deleteQuietly(url);
        }
        b.setUpdatedAt(Instant.now());
        return ResponseEntity.ok(bannerService.toDto(bannerRepository.save(b)));
    }

    /** Drag-to-reorder in the admin list. */
    @PutMapping("/banners/reorder")
    public ResponseEntity<Map<String, Object>> reorder(@RequestBody BannerReorderRequest req) {
        if (req.ids == null || req.ids.isEmpty()) {
            throw new BadRequestException("Send the banner ids in their new order.");
        }
        int order = 0;
        for (Long id : req.ids) {
            Optional<Banner> b = bannerRepository.findById(id);
            if (b.isPresent()) {
                b.get().setDisplayOrder(order++);
                bannerRepository.save(b.get());
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("updated", order);
        return ResponseEntity.ok(body);
    }
}
