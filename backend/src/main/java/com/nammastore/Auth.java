package com.nammastore;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * ===========================================================
 * Auth.java
 * -----------------------------------------------------------
 * Firebase authentication, users, profiles, addresses,
 * and login/user-related APIs.
 *
 * FIXED: FirebaseAuthService now performs real Firebase Admin
 * SDK token verification. It used to be a stub that trusted the
 * uid sent by the frontend, which meant knowing an admin's
 * Firebase UID was enough to get full admin access.
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS to point at the
 * service account JSON. See backend/.env.example.
 * ===========================================================
 */

@Entity
@Table(name = "app_users")
class AppUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String firebaseUid;

    private String email;
    private String displayName;
    private String phone;

    /** Relative path such as /uploads/avatars/<uuid>.jpg, or null. */
    private String photoUrl;

    private boolean admin = false;
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFirebaseUid() { return firebaseUid; }
    public void setFirebaseUid(String firebaseUid) { this.firebaseUid = firebaseUid; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getPhotoUrl() { return photoUrl; }
    public void setPhotoUrl(String photoUrl) { this.photoUrl = photoUrl; }
    public boolean isAdmin() { return admin; }
    public void setAdmin(boolean admin) { this.admin = admin; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

@Entity
@Table(name = "addresses")
class Address {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id")
    private AppUser user;

    private String fullName;
    private String phone;
    private String houseBuilding;
    private String street;
    private String area;
    private String city;
    private String state;
    private String pincode;
    private String landmark;
    private boolean isDefault = false;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public AppUser getUser() { return user; }
    public void setUser(AppUser user) { this.user = user; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getHouseBuilding() { return houseBuilding; }
    public void setHouseBuilding(String houseBuilding) { this.houseBuilding = houseBuilding; }
    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }
    public String getArea() { return area; }
    public void setArea(String area) { this.area = area; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }
    public String getLandmark() { return landmark; }
    public void setLandmark(String landmark) { this.landmark = landmark; }
    public boolean isDefault() { return isDefault; }
    public void setDefault(boolean aDefault) { isDefault = aDefault; }
}

interface AppUserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByFirebaseUid(String firebaseUid);
}

interface AddressRepository extends JpaRepository<Address, Long> {
    List<Address> findByUserId(Long userId);
}

/**
 * Verifies Firebase ID tokens using the Firebase Admin SDK.
 *
 * SECURITY (fixed): this used to be a stub that returned the Authorization
 * header verbatim, which meant anyone who knew an admin's Firebase UID could
 * send `Authorization: Bearer <uid>` and get full admin access. It now calls
 * FirebaseAuth.verifyIdToken() for real.
 *
 * Setup:
 *   1. Firebase console -> Project settings -> Service accounts -> Generate key.
 *   2. export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/serviceAccount.json
 *   3. Restart the backend. Startup logs will say "Firebase Admin initialised".
 *
 * If credentials are absent the app still starts, but every protected call is
 * rejected unless app.auth.allow-insecure-uid-fallback=true is set explicitly
 * (local development only - it restores the old, unsafe behaviour and logs a
 * warning on every request).
 */
@Component
class FirebaseAuthService {

    private static final Logger log = LoggerFactory.getLogger(FirebaseAuthService.class);

    @Value("${app.auth.allow-insecure-uid-fallback:false}")
    private boolean allowInsecureFallback;

    private volatile boolean firebaseReady = false;

    @PostConstruct
    void init() {
        try {
            if (FirebaseApp.getApps().isEmpty()) {
                FirebaseApp.initializeApp(FirebaseOptions.builder()
                        .setCredentials(GoogleCredentials.getApplicationDefault())
                        .build());
            }
            firebaseReady = true;
            log.info("Firebase Admin initialised - ID tokens will be verified.");
        } catch (Exception e) {
            firebaseReady = false;
            log.warn("Firebase Admin NOT initialised ({}). Set GOOGLE_APPLICATION_CREDENTIALS "
                    + "to your service account JSON.", e.getMessage());
            if (allowInsecureFallback) {
                log.error("app.auth.allow-insecure-uid-fallback=true - the API will TRUST "
                        + "whatever UID the client sends. NEVER enable this outside localhost.");
            }
        }
    }

    /** @return the verified Firebase UID, or null when the token is missing/invalid. */
    public String verifyTokenAndGetUid(String idToken) {
        if (idToken == null || idToken.isBlank()) return null;

        if (firebaseReady) {
            try {
                return FirebaseAuth.getInstance().verifyIdToken(idToken).getUid();
            } catch (Exception e) {
                log.debug("Rejected token: {}", e.getMessage());
                return null;
            }
        }

        if (allowInsecureFallback) {
            log.warn("INSECURE FALLBACK: trusting client-supplied UID without verification.");
            return idToken;
        }
        return null;
    }
}

/**
 * ===========================================================
 * WHO IS THIS REQUEST FROM, AND MAY THEY TOUCH THIS ROW?
 * -----------------------------------------------------------
 * Fixes a set of IDOR holes. Before this, customer-scoped
 * endpoints identified the caller purely by a path parameter:
 *
 *     GET  /api/orders/42          -> anyone's order history
 *     GET  /api/users/42/addresses -> anyone's home address
 *     PUT  /api/orders/99/cancel   -> cancel a stranger's order
 *
 * No token was required and no ownership was checked, so
 * changing a number in the URL was enough to read or modify
 * another customer's data.
 *
 * Every customer-scoped endpoint now resolves the caller from
 * a VERIFIED Firebase ID token and compares that to the row
 * being touched. The path parameter is still accepted so the
 * existing frontend routes keep working, but it is no longer
 * trusted as identity.
 * ===========================================================
 */
@Component
class CurrentUserService {

    @Autowired private FirebaseAuthService firebaseAuthService;
    @Autowired private AppUserRepository appUserRepository;

    /** @return the signed-in user, or null when there is no valid token. */
    AppUser resolve(String authHeader) {
        if (authHeader == null || authHeader.isBlank()) return null;
        String uid = firebaseAuthService.verifyTokenAndGetUid(
                authHeader.replace("Bearer ", "").trim());
        if (uid == null) return null;
        return appUserRepository.findByFirebaseUid(uid).orElse(null);
    }

    /** The caller must be signed in. */
    AppUser require(String authHeader) {
        AppUser user = resolve(authHeader);
        if (user == null) {
            throw new UnauthorizedException("Please sign in to continue.");
        }
        return user;
    }

    /**
     * The caller must be signed in AND be the user whose data is being
     * accessed. Admins are allowed through so the admin panel keeps working.
     */
    AppUser requireSelf(String authHeader, Long userId) {
        AppUser user = require(authHeader);
        if (user.isAdmin()) return user;
        if (userId == null || !userId.equals(user.getId())) {
            // Deliberately the same wording as a missing row: telling a
            // prober "this exists but is not yours" is itself a leak.
            throw new ForbiddenException("You do not have access to this resource.");
        }
        return user;
    }

    /** Ownership check for a row that hangs off a user. */
    void requireOwns(AppUser caller, AppUser owner) {
        if (caller.isAdmin()) return;
        if (owner == null || !owner.getId().equals(caller.getId())) {
            throw new ForbiddenException("You do not have access to this resource.");
        }
    }
}

class UserSyncRequest {
    public String firebaseUid;
    public String email;
    public String displayName;
    public String phone;
}

class ProfileUpdateRequest {
    public String displayName;
    public String phone;
    public String email;
}

class AddressRequest {
    public String fullName;
    public String phone;
    public String houseBuilding;
    public String street;
    public String area;
    public String city;
    public String state;
    public String pincode;
    public String landmark;
    public boolean isDefault;
}

@RestController
@RequestMapping("/api")
class AuthController {

    @Autowired private AppUserRepository appUserRepository;
    @Autowired private AddressRepository addressRepository;
    @Autowired private StorageService storageService;
    @Autowired private DtoMapper mapper;
    @Autowired private FirebaseAuthService firebaseAuthService;
    @Autowired private CurrentUserService currentUser;

    // Called by the frontend right after Firebase sign-in to create/update
    // our own local user record.
    @PostMapping("/auth/sync")
    public AppUserDto sync(@RequestBody UserSyncRequest req,
                           @RequestHeader(value = "Authorization", required = false) String auth) {
        /*
         * The UID comes from the VERIFIED token, never from the body.
         *
         * Before this, the body's firebaseUid was used directly, so posting
         * someone else's UID let you create or overwrite their AppUser row -
         * including its email - and then act as them everywhere else, because
         * the rest of the app keys off that row.
         *
         * req.firebaseUid is now ignored for identity. It is still accepted so
         * the existing frontend call sites do not have to change shape.
         */
        String uid = firebaseAuthService.verifyTokenAndGetUid(
                auth == null ? null : auth.replace("Bearer ", "").trim());
        if (uid == null) {
            throw new UnauthorizedException("Sign in before syncing your profile.");
        }

        AppUser user = appUserRepository.findByFirebaseUid(uid)
                .orElseGet(AppUser::new);
        user.setFirebaseUid(uid);
        user.setEmail(req.email);

        // Do not blank out a profile the customer has already edited just
        // because Firebase has nothing for these fields.
        if (req.displayName != null && !req.displayName.isBlank()) {
            user.setDisplayName(req.displayName);
        }
        if (req.phone != null && !req.phone.isBlank()) {
            user.setPhone(req.phone);
        }
        return mapper.toDto(appUserRepository.save(user));
    }

    @GetMapping("/auth/me")
    public ResponseEntity<AppUserDto> me(@RequestHeader("Authorization") String authHeader) {
        String uid = firebaseAuthService.verifyTokenAndGetUid(strip(authHeader));
        if (uid == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return appUserRepository.findByFirebaseUid(uid)
                .map(u -> ResponseEntity.ok(mapper.toDto(u)))
                .orElse(ResponseEntity.notFound().build());
    }

    /* ---------------- profile ---------------- */

    @GetMapping("/users/{userId}")
    public ResponseEntity<AppUserDto> getUser(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        return appUserRepository.findById(userId)
                .map(u -> ResponseEntity.ok(mapper.toDto(u)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/users/{userId}")
    public ResponseEntity<AppUserDto> updateProfile(
            @PathVariable Long userId,
            @RequestBody ProfileUpdateRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        currentUser.requireSelf(auth, userId);
        Optional<AppUser> existing = appUserRepository.findById(userId);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        AppUser user = existing.get();
        if (req.displayName != null) user.setDisplayName(req.displayName.trim());
        if (req.phone != null) user.setPhone(req.phone.trim());
        // Email is owned by Firebase; changing it here would desync the two.
        return ResponseEntity.ok(mapper.toDto(appUserRepository.save(user)));
    }

    @PostMapping("/users/{userId}/photo")
    public ResponseEntity<AppUserDto> uploadProfilePhoto(
            @PathVariable Long userId,
            @RequestParam("file") MultipartFile file,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        currentUser.requireSelf(auth, userId);
        Optional<AppUser> existing = appUserRepository.findById(userId);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        AppUser user = existing.get();
        String stored = storageService.storeImage(file, "avatars");
        storageService.deleteQuietly(user.getPhotoUrl());
        user.setPhotoUrl(stored);

        return ResponseEntity.ok(mapper.toDto(appUserRepository.save(user)));
    }

    @DeleteMapping("/users/{userId}/photo")
    public ResponseEntity<AppUserDto> deleteProfilePhoto(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<AppUser> existing = appUserRepository.findById(userId);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        AppUser user = existing.get();
        storageService.deleteQuietly(user.getPhotoUrl());
        user.setPhotoUrl(null);
        return ResponseEntity.ok(mapper.toDto(appUserRepository.save(user)));
    }

    @GetMapping("/users/{userId}/addresses")
    public List<Address> addresses(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        return addressRepository.findByUserId(userId);
    }

    @PostMapping("/users/{userId}/addresses")
    public ResponseEntity<Address> addAddress(
            @PathVariable Long userId,
            @RequestBody AddressRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<AppUser> user = appUserRepository.findById(userId);
        if (user.isEmpty()) return ResponseEntity.notFound().build();
        boolean makeDefault = req.isDefault || addressRepository.findByUserId(userId).isEmpty();
        if (makeDefault) unsetExistingDefaults(userId);
        Address a = new Address();
        a.setUser(user.get());
        applyAddress(a, req);
        a.setDefault(makeDefault);
        return ResponseEntity.status(HttpStatus.CREATED).body(addressRepository.save(a));
    }

    @PutMapping("/users/{userId}/addresses/{addressId}")
    public ResponseEntity<Address> updateAddress(@PathVariable Long userId, @PathVariable Long addressId,
                                                  @RequestBody AddressRequest req,
                                                  @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<Address> existing = addressRepository.findById(addressId);
        if (existing.isEmpty() || !existing.get().getUser().getId().equals(userId)) {
            return ResponseEntity.notFound().build();
        }
        Address a = existing.get();
        applyAddress(a, req);
        if (req.isDefault && !a.isDefault()) {
            unsetExistingDefaults(userId);
            a.setDefault(true);
        }
        return ResponseEntity.ok(addressRepository.save(a));
    }

    @DeleteMapping("/users/{userId}/addresses/{addressId}")
    public ResponseEntity<Void> deleteAddress(@PathVariable Long userId, @PathVariable Long addressId,
                                              @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<Address> existing = addressRepository.findById(addressId);
        if (existing.isEmpty() || !existing.get().getUser().getId().equals(userId)) {
            return ResponseEntity.notFound().build();
        }
        boolean wasDefault = existing.get().isDefault();
        addressRepository.deleteById(addressId);
        if (wasDefault) {
            addressRepository.findByUserId(userId).stream().findFirst()
                    .ifPresent(next -> { next.setDefault(true); addressRepository.save(next); });
        }
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/users/{userId}/addresses/{addressId}/default")
    public ResponseEntity<Address> setDefaultAddress(@PathVariable Long userId, @PathVariable Long addressId,
                                                     @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<Address> existing = addressRepository.findById(addressId);
        if (existing.isEmpty() || !existing.get().getUser().getId().equals(userId)) {
            return ResponseEntity.notFound().build();
        }
        unsetExistingDefaults(userId);
        Address a = existing.get();
        a.setDefault(true);
        return ResponseEntity.ok(addressRepository.save(a));
    }

    private void unsetExistingDefaults(Long userId) {
        List<Address> existing = addressRepository.findByUserId(userId);
        for (Address addr : existing) {
            if (addr.isDefault()) {
                addr.setDefault(false);
                addressRepository.save(addr);
            }
        }
    }

    private void applyAddress(Address a, AddressRequest req) {
        a.setFullName(req.fullName);
        a.setPhone(req.phone);
        a.setHouseBuilding(req.houseBuilding);
        a.setStreet(req.street);
        a.setArea(req.area);
        a.setCity(req.city);
        a.setState(req.state);
        a.setPincode(req.pincode);
        a.setLandmark(req.landmark);
    }

    private String strip(String header) {
        if (header == null) return null;
        return header.replace("Bearer ", "").trim();
    }
}
