package com.nammastore;

import jakarta.persistence.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * ===========================================================
 * Serviceability.java  (NEW)
 * -----------------------------------------------------------
 * Where Namma Store delivers, how long it takes and what it
 * costs, configured by the admin instead of hard-coded.
 *
 * NOTHING about Karnataka is baked in. The tables start EMPTY
 * and the admin adds states and pincodes at
 * /admin/serviceability. With no configuration at all the API
 * reports "not configured" rather than silently claiming to
 * deliver everywhere - see UNCONFIGURED_MESSAGE below.
 *
 * Lookup order for a pincode:
 *   1. An exact pincode row            -> most specific wins
 *   2. A pincode range on a state      -> e.g. 560000-560110
 *   3. Nothing matched                 -> not serviceable
 * A disabled state disables all of its pincodes, so a whole
 * region can be switched off with one toggle.
 *
 * Endpoints
 *   GET /api/serviceability?pincode=560001     public
 *   GET /api/admin/serviceability/states       admin CRUD
 *   GET /api/admin/serviceability/pincodes
 *   ... plus POST/PUT/DELETE for both
 * ===========================================================
 */

@Entity
@Table(name = "delivery_states")
class DeliveryState {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    /** Default charge for pincodes in this state that do not set their own. */
    private BigDecimal deliveryCharge;

    private Integer estimatedMinDays = 2;
    private Integer estimatedMaxDays = 5;

    /** Optional inclusive pincode range covering the whole state. */
    private String pincodeRangeStart;
    private String pincodeRangeEnd;

    private boolean active = true;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public BigDecimal getDeliveryCharge() { return deliveryCharge; }
    public void setDeliveryCharge(BigDecimal deliveryCharge) { this.deliveryCharge = deliveryCharge; }
    public Integer getEstimatedMinDays() { return estimatedMinDays; }
    public void setEstimatedMinDays(Integer estimatedMinDays) { this.estimatedMinDays = estimatedMinDays; }
    public Integer getEstimatedMaxDays() { return estimatedMaxDays; }
    public void setEstimatedMaxDays(Integer estimatedMaxDays) { this.estimatedMaxDays = estimatedMaxDays; }
    public String getPincodeRangeStart() { return pincodeRangeStart; }
    public void setPincodeRangeStart(String v) { this.pincodeRangeStart = v; }
    public String getPincodeRangeEnd() { return pincodeRangeEnd; }
    public void setPincodeRangeEnd(String v) { this.pincodeRangeEnd = v; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}

@Entity
@Table(name = "delivery_pincodes")
class DeliveryPincode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 10)
    private String pincode;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "state_id")
    private DeliveryState state;

    private String city;

    /** Overrides the state charge when set. */
    private BigDecimal deliveryCharge;

    private Integer estimatedMinDays;
    private Integer estimatedMaxDays;

    private boolean active = true;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }
    public DeliveryState getState() { return state; }
    public void setState(DeliveryState state) { this.state = state; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public BigDecimal getDeliveryCharge() { return deliveryCharge; }
    public void setDeliveryCharge(BigDecimal deliveryCharge) { this.deliveryCharge = deliveryCharge; }
    public Integer getEstimatedMinDays() { return estimatedMinDays; }
    public void setEstimatedMinDays(Integer v) { this.estimatedMinDays = v; }
    public Integer getEstimatedMaxDays() { return estimatedMaxDays; }
    public void setEstimatedMaxDays(Integer v) { this.estimatedMaxDays = v; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}

interface DeliveryStateRepository extends JpaRepository<DeliveryState, Long> {
    Optional<DeliveryState> findByNameIgnoreCase(String name);
}

interface DeliveryPincodeRepository extends JpaRepository<DeliveryPincode, Long> {
    Optional<DeliveryPincode> findByPincode(String pincode);
}

/** Exactly the shape the pincode widget renders. */
class ServiceabilityDto {
    public boolean serviceable;
    public String pincode;
    public String state;
    public String city;
    public BigDecimal deliveryCharge;
    public Integer estimatedMinDays;
    public Integer estimatedMaxDays;
    public String message;
    /** True when no states are configured yet, so the UI can stay quiet. */
    public boolean configured = true;
}

class DeliveryStateRequest {
    public String name;
    public BigDecimal deliveryCharge;
    public Integer estimatedMinDays;
    public Integer estimatedMaxDays;
    public String pincodeRangeStart;
    public String pincodeRangeEnd;
    public Boolean active;
}

class DeliveryPincodeRequest {
    public String pincode;
    public Long stateId;
    public String city;
    public BigDecimal deliveryCharge;
    public Integer estimatedMinDays;
    public Integer estimatedMaxDays;
    public Boolean active;
}

@Service
class ServiceabilityService {

    @Autowired private DeliveryStateRepository stateRepository;
    @Autowired private DeliveryPincodeRepository pincodeRepository;

    @Value("${app.delivery.charge:49}")
    private BigDecimal defaultDeliveryCharge;

    @Value("${app.delivery.unserviceable-message:We'll reach your area soon. Delivery here isn't available just yet.}")
    private String unserviceableMessage;

    private static final String UNCONFIGURED_MESSAGE =
            "Delivery areas haven't been set up yet. Please contact us to confirm availability.";

    /** Six-digit Indian pincode, no leading zero. */
    static boolean looksLikePincode(String pincode) {
        return pincode != null && pincode.trim().matches("[1-9][0-9]{5}");
    }

    ServiceabilityDto check(String rawPincode) {
        ServiceabilityDto dto = new ServiceabilityDto();
        String pincode = rawPincode == null ? "" : rawPincode.trim();
        dto.pincode = pincode;

        if (!looksLikePincode(pincode)) {
            dto.serviceable = false;
            dto.message = "Enter a valid 6-digit pincode.";
            return dto;
        }

        // Nothing configured at all: say so honestly instead of guessing.
        if (stateRepository.count() == 0) {
            dto.serviceable = false;
            dto.configured = false;
            dto.message = UNCONFIGURED_MESSAGE;
            return dto;
        }

        // 1. Exact pincode row.
        Optional<DeliveryPincode> exact = pincodeRepository.findByPincode(pincode);
        if (exact.isPresent()) {
            DeliveryPincode p = exact.get();
            DeliveryState state = p.getState();
            // A disabled state switches off every pincode under it.
            boolean live = p.isActive() && (state == null || state.isActive());
            if (live) {
                dto.serviceable = true;
                dto.state = state == null ? null : state.getName();
                dto.city = p.getCity();
                dto.deliveryCharge = firstNonNull(
                        p.getDeliveryCharge(),
                        state == null ? null : state.getDeliveryCharge(),
                        defaultDeliveryCharge);
                dto.estimatedMinDays = firstNonNull(p.getEstimatedMinDays(),
                        state == null ? null : state.getEstimatedMinDays(), 2);
                dto.estimatedMaxDays = firstNonNull(p.getEstimatedMaxDays(),
                        state == null ? null : state.getEstimatedMaxDays(), 5);
                dto.message = "Delivery available";
                return dto;
            }
            dto.serviceable = false;
            dto.message = unserviceableMessage;
            return dto;
        }

        // 2. A state-level pincode range.
        for (DeliveryState state : stateRepository.findAll()) {
            if (!state.isActive()) continue;
            if (!inRange(pincode, state.getPincodeRangeStart(), state.getPincodeRangeEnd())) continue;

            dto.serviceable = true;
            dto.state = state.getName();
            dto.deliveryCharge = firstNonNull(state.getDeliveryCharge(), defaultDeliveryCharge);
            dto.estimatedMinDays = firstNonNull(state.getEstimatedMinDays(), 2);
            dto.estimatedMaxDays = firstNonNull(state.getEstimatedMaxDays(), 5);
            dto.message = "Delivery available";
            return dto;
        }

        // 3. No match.
        dto.serviceable = false;
        dto.message = unserviceableMessage;
        return dto;
    }

    private static boolean inRange(String pincode, String start, String end) {
        if (start == null || end == null || start.isBlank() || end.isBlank()) return false;
        try {
            int value = Integer.parseInt(pincode);
            int lo = Integer.parseInt(start.trim());
            int hi = Integer.parseInt(end.trim());
            if (lo > hi) { int t = lo; lo = hi; hi = t; }
            return value >= lo && value <= hi;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    @SafeVarargs
    private static <T> T firstNonNull(T... values) {
        for (T v : values) if (v != null) return v;
        return null;
    }
}


/* ===========================================================
   PUBLIC LOOKUP
   =========================================================== */

@RestController
@RequestMapping("/api")
class ServiceabilityController {

    @Autowired private ServiceabilityService serviceabilityService;

    /** Used by the pincode widget on the product page, cart and checkout. */
    @GetMapping("/serviceability")
    public ServiceabilityDto check(@RequestParam String pincode) {
        return serviceabilityService.check(pincode);
    }
}


/* ===========================================================
   ADMIN CRUD  -  gated by AdminAuthFilter
   =========================================================== */

@RestController
@RequestMapping("/api/admin/serviceability")
class AdminServiceabilityController {

    @Autowired private DeliveryStateRepository stateRepository;
    @Autowired private DeliveryPincodeRepository pincodeRepository;

    /* ---- states ---- */

    @GetMapping("/states")
    public List<DeliveryState> states() {
        List<DeliveryState> all = new ArrayList<>(stateRepository.findAll());
        all.sort((a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        return all;
    }

    @PostMapping("/states")
    public ResponseEntity<DeliveryState> createState(@RequestBody DeliveryStateRequest req) {
        if (req.name == null || req.name.isBlank()) {
            throw new BadRequestException("The state needs a name.");
        }
        stateRepository.findByNameIgnoreCase(req.name.trim()).ifPresent(existing -> {
            throw new BadRequestException(req.name.trim() + " is already configured.");
        });
        DeliveryState state = new DeliveryState();
        applyState(state, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(stateRepository.save(state));
    }

    @PutMapping("/states/{id}")
    public ResponseEntity<DeliveryState> updateState(@PathVariable Long id,
                                                     @RequestBody DeliveryStateRequest req) {
        Optional<DeliveryState> existing = stateRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        DeliveryState state = existing.get();
        applyState(state, req);
        return ResponseEntity.ok(stateRepository.save(state));
    }

    @DeleteMapping("/states/{id}")
    public ResponseEntity<Void> deleteState(@PathVariable Long id) {
        if (!stateRepository.existsById(id)) return ResponseEntity.notFound().build();
        // Detach pincodes first so deleting a state cannot orphan rows or
        // trip the foreign key.
        for (DeliveryPincode p : pincodeRepository.findAll()) {
            if (p.getState() != null && id.equals(p.getState().getId())) {
                p.setState(null);
                p.setActive(false);
                pincodeRepository.save(p);
            }
        }
        stateRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /* ---- pincodes ---- */

    @GetMapping("/pincodes")
    public List<DeliveryPincode> pincodes(@RequestParam(required = false) String search) {
        List<DeliveryPincode> all = new ArrayList<>(pincodeRepository.findAll());
        if (search != null && !search.isBlank()) {
            String needle = search.trim().toLowerCase(Locale.ROOT);
            all.removeIf(p -> {
                String city = p.getCity() == null ? "" : p.getCity().toLowerCase(Locale.ROOT);
                String state = p.getState() == null ? "" : p.getState().getName().toLowerCase(Locale.ROOT);
                return !p.getPincode().contains(needle)
                        && !city.contains(needle)
                        && !state.contains(needle);
            });
        }
        all.sort((a, b) -> a.getPincode().compareTo(b.getPincode()));
        return all;
    }

    @PostMapping("/pincodes")
    public ResponseEntity<DeliveryPincode> createPincode(@RequestBody DeliveryPincodeRequest req) {
        if (!ServiceabilityService.looksLikePincode(req.pincode)) {
            throw new BadRequestException("Enter a valid 6-digit pincode.");
        }
        String pincode = req.pincode.trim();
        pincodeRepository.findByPincode(pincode).ifPresent(existing -> {
            throw new BadRequestException(pincode + " is already in the list.");
        });
        DeliveryPincode p = new DeliveryPincode();
        p.setPincode(pincode);
        applyPincode(p, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(pincodeRepository.save(p));
    }

    @PutMapping("/pincodes/{id}")
    public ResponseEntity<DeliveryPincode> updatePincode(@PathVariable Long id,
                                                         @RequestBody DeliveryPincodeRequest req) {
        Optional<DeliveryPincode> existing = pincodeRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        DeliveryPincode p = existing.get();
        if (req.pincode != null && !req.pincode.isBlank()) {
            if (!ServiceabilityService.looksLikePincode(req.pincode)) {
                throw new BadRequestException("Enter a valid 6-digit pincode.");
            }
            p.setPincode(req.pincode.trim());
        }
        applyPincode(p, req);
        return ResponseEntity.ok(pincodeRepository.save(p));
    }

    @DeleteMapping("/pincodes/{id}")
    public ResponseEntity<Void> deletePincode(@PathVariable Long id) {
        if (!pincodeRepository.existsById(id)) return ResponseEntity.notFound().build();
        pincodeRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /* ---- helpers ---- */

    private void applyState(DeliveryState state, DeliveryStateRequest req) {
        if (req.name != null && !req.name.isBlank()) state.setName(req.name.trim());
        if (req.deliveryCharge != null) state.setDeliveryCharge(req.deliveryCharge);
        if (req.estimatedMinDays != null) state.setEstimatedMinDays(req.estimatedMinDays);
        if (req.estimatedMaxDays != null) state.setEstimatedMaxDays(req.estimatedMaxDays);
        if (req.pincodeRangeStart != null) state.setPincodeRangeStart(blankToNull(req.pincodeRangeStart));
        if (req.pincodeRangeEnd != null) state.setPincodeRangeEnd(blankToNull(req.pincodeRangeEnd));
        if (req.active != null) state.setActive(req.active);

        if (state.getEstimatedMinDays() != null && state.getEstimatedMaxDays() != null
                && state.getEstimatedMinDays() > state.getEstimatedMaxDays()) {
            throw new BadRequestException("Minimum delivery days cannot be more than the maximum.");
        }
    }

    private void applyPincode(DeliveryPincode p, DeliveryPincodeRequest req) {
        if (req.stateId != null) {
            p.setState(stateRepository.findById(req.stateId).orElseThrow(
                    () -> new BadRequestException("That state does not exist.")));
        }
        if (req.city != null) p.setCity(blankToNull(req.city));
        if (req.deliveryCharge != null) p.setDeliveryCharge(req.deliveryCharge);
        if (req.estimatedMinDays != null) p.setEstimatedMinDays(req.estimatedMinDays);
        if (req.estimatedMaxDays != null) p.setEstimatedMaxDays(req.estimatedMaxDays);
        if (req.active != null) p.setActive(req.active);
    }

    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }
}
