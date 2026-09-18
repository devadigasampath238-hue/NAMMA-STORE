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

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
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
 * Firebase Admin SDK supports two credential sources:
 *
 * 1. Railway / production:
 *    FIREBASE_SERVICE_ACCOUNT_JSON environment variable.
 *
 * 2. Local development:
 *    GOOGLE_APPLICATION_CREDENTIALS pointing to the
 *    Firebase service-account JSON file.
 *
 * SECURITY:
 * Firebase ID tokens are verified using Firebase Admin SDK.
 * The client-supplied Firebase UID is never trusted for identity.
 * ===========================================================
 */

@Entity
@Table(name = "app_users")
class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
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

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getFirebaseUid() {
        return firebaseUid;
    }

    public void setFirebaseUid(String firebaseUid) {
        this.firebaseUid = firebaseUid;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getPhotoUrl() {
        return photoUrl;
    }

    public void setPhotoUrl(String photoUrl) {
        this.photoUrl = photoUrl;
    }

    public boolean isAdmin() {
        return admin;
    }

    public void setAdmin(boolean admin) {
        this.admin = admin;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}


@Entity
@Table(name = "addresses")
class Address {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
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

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public AppUser getUser() {
        return user;
    }

    public void setUser(AppUser user) {
        this.user = user;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getHouseBuilding() {
        return houseBuilding;
    }

    public void setHouseBuilding(String houseBuilding) {
        this.houseBuilding = houseBuilding;
    }

    public String getStreet() {
        return street;
    }

    public void setStreet(String street) {
        this.street = street;
    }

    public String getArea() {
        return area;
    }

    public void setArea(String area) {
        this.area = area;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getPincode() {
        return pincode;
    }

    public void setPincode(String pincode) {
        this.pincode = pincode;
    }

    public String getLandmark() {
        return landmark;
    }

    public void setLandmark(String landmark) {
        this.landmark = landmark;
    }

    public boolean isDefault() {
        return isDefault;
    }

    public void setDefault(boolean aDefault) {
        isDefault = aDefault;
    }
}


interface AppUserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByFirebaseUid(String firebaseUid);
}


interface AddressRepository extends JpaRepository<Address, Long> {
    List<Address> findByUserId(Long userId);
}


/**
 * ===========================================================
 * Firebase Authentication Service
 * -----------------------------------------------------------
 * Verifies Firebase ID tokens using the Firebase Admin SDK.
 *
 * PRODUCTION:
 * FIREBASE_SERVICE_ACCOUNT_JSON is used.
 *
 * LOCAL DEVELOPMENT:
 * GOOGLE_APPLICATION_CREDENTIALS can still be used.
 *
 * SECURITY:
 * The insecure UID fallback remains disabled by default.
 * NEVER enable it in production.
 * ===========================================================
 */
@Component
class FirebaseAuthService {

    private static final Logger log =
            LoggerFactory.getLogger(FirebaseAuthService.class);

    @Value("${app.auth.allow-insecure-uid-fallback:false}")
    private boolean allowInsecureFallback;

    /**
     * Firebase Admin service-account JSON.
     *
     * Railway:
     * FIREBASE_SERVICE_ACCOUNT_JSON
     *
     * This variable must contain the complete service-account
     * JSON. It must NEVER be committed to GitHub.
     */
    @Value("${firebase.service-account-json:}")
    private String serviceAccountJson;

    private volatile boolean firebaseReady = false;


    @PostConstruct
    void init() {

        try {

            if (FirebaseApp.getApps().isEmpty()) {

                FirebaseOptions.Builder options =
                        FirebaseOptions.builder();

                /*
                 * =====================================================
                 * PRODUCTION / RAILWAY
                 * =====================================================
                 *
                 * If FIREBASE_SERVICE_ACCOUNT_JSON exists,
                 * load Firebase Admin credentials directly from
                 * the environment variable.
                 */
                if (serviceAccountJson != null
                        && !serviceAccountJson.isBlank()) {

                    GoogleCredentials credentials =
                            GoogleCredentials.fromStream(
                                    new ByteArrayInputStream(
                                            serviceAccountJson.getBytes(
                                                    StandardCharsets.UTF_8)));

                    options.setCredentials(credentials);

                    log.info(
                            "Firebase Admin credentials loaded from environment variable."
                    );

                } else {

                    /*
                     * =================================================
                     * LOCAL DEVELOPMENT
                     * =================================================
                     *
                     * Continue supporting:
                     *
                     * GOOGLE_APPLICATION_CREDENTIALS
                     *
                     * Example:
                     *
                     * $env:GOOGLE_APPLICATION_CREDENTIALS="$HOME\\Downloads\\serviceAccount.json"
                     * =================================================
                     */
                    options.setCredentials(
                            GoogleCredentials.getApplicationDefault()
                    );

                    log.info(
                            "Firebase Admin credentials loaded from Application Default Credentials."
                    );
                }

                FirebaseApp.initializeApp(options.build());
            }

            firebaseReady = true;

            log.info(
                    "Firebase Admin initialised - ID tokens will be verified."
            );

        } catch (Exception e) {

            firebaseReady = false;

            log.warn(
                    "Firebase Admin NOT initialised: {}",
                    e.getMessage()
            );

            /*
             * SECURITY:
             * The API remains protected when Firebase Admin
             * credentials are unavailable.
             */
            if (allowInsecureFallback) {

                log.error(
                        "app.auth.allow-insecure-uid-fallback=true - "
                                + "the API will TRUST whatever UID the client sends. "
                                + "NEVER enable this outside localhost."
                );
            }
        }
    }


    /**
     * Verify a Firebase ID token and return the verified Firebase UID.
     *
     * @param idToken Firebase ID token from the frontend
     * @return verified Firebase UID, or null if invalid/missing
     */
    public String verifyTokenAndGetUid(String idToken) {

        if (idToken == null || idToken.isBlank()) {
            return null;
        }

        /*
         * Firebase Admin is available.
         * Verify the token cryptographically.
         */
        if (firebaseReady) {

            try {

                return FirebaseAuth
                        .getInstance()
                        .verifyIdToken(idToken)
                        .getUid();

            } catch (Exception e) {

                log.debug(
                        "Rejected token: {}",
                        e.getMessage()
                );

                return null;
            }
        }

        /*
         * SECURITY FALLBACK
         *
         * This should ONLY ever be enabled for local development.
         */
        if (allowInsecureFallback) {

            log.warn(
                    "INSECURE FALLBACK: trusting client-supplied UID "
                            + "without verification."
            );

            return idToken;
        }

        return null;
    }
}


/**
 * ===========================================================
 * WHO IS THIS REQUEST FROM, AND MAY THEY TOUCH THIS ROW?
 * -----------------------------------------------------------
 * Fixes a set of IDOR holes.
 *
 * Every customer-scoped endpoint now resolves the caller from
 * a VERIFIED Firebase ID token and compares that to the row
 * being touched.
 *
 * Admins are allowed through where appropriate so the admin
 * panel continues to work.
 * ===========================================================
 */
@Component
class CurrentUserService {

    @Autowired
    private FirebaseAuthService firebaseAuthService;

    @Autowired
    private AppUserRepository appUserRepository;


    /**
     * @return the signed-in user, or null when there is no valid token.
     */
    AppUser resolve(String authHeader) {

        if (authHeader == null || authHeader.isBlank()) {
            return null;
        }

        String uid =
                firebaseAuthService.verifyTokenAndGetUid(
                        authHeader
                                .replace("Bearer ", "")
                                .trim()
                );

        if (uid == null) {
            return null;
        }

        return appUserRepository
                .findByFirebaseUid(uid)
                .orElse(null);
    }


    /**
     * The caller must be signed in.
     */
    AppUser require(String authHeader) {

        AppUser user = resolve(authHeader);

        if (user == null) {

            throw new UnauthorizedException(
                    "Please sign in to continue."
            );
        }

        return user;
    }


    /**
     * The caller must be signed in AND be the user whose data
     * is being accessed.
     *
     * Admins are allowed through so the admin panel keeps working.
     */
    AppUser requireSelf(
            String authHeader,
            Long userId) {

        AppUser user = require(authHeader);

        if (user.isAdmin()) {
            return user;
        }

        if (userId == null
                || !userId.equals(user.getId())) {

            /*
             * Deliberately the same wording as a missing row:
             * telling a prober "this exists but is not yours"
             * is itself a leak.
             */
            throw new ForbiddenException(
                    "You do not have access to this resource."
            );
        }

        return user;
    }


    /**
     * Ownership check for a row that belongs to a user.
     */
    void requireOwns(
            AppUser caller,
            AppUser owner) {

        if (caller.isAdmin()) {
            return;
        }

        if (owner == null
                || !owner.getId().equals(caller.getId())) {

            throw new ForbiddenException(
                    "You do not have access to this resource."
            );
        }
    }
}


/**
 * ===========================================================
 * REQUEST DTOs
 * ===========================================================
 */

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


/**
 * ===========================================================
 * AUTH / USER CONTROLLER
 * ===========================================================
 */
@RestController
@RequestMapping("/api")
class AuthController {

    @Autowired
    private AppUserRepository appUserRepository;

    @Autowired
    private AddressRepository addressRepository;

    @Autowired
    private StorageService storageService;

    @Autowired
    private DtoMapper mapper;

    @Autowired
    private FirebaseAuthService firebaseAuthService;

    @Autowired
    private CurrentUserService currentUser;


    // Called by the frontend right after Firebase sign-in
    // to create/update our own local user record.
    @PostMapping("/auth/sync")
    public AppUserDto sync(
            @RequestBody UserSyncRequest req,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        /*
         * =========================================================
         * IMPORTANT SECURITY RULE
         * =========================================================
         *
         * The UID comes from the VERIFIED Firebase token,
         * never from the request body.
         *
         * req.firebaseUid is intentionally ignored for identity.
         *
         * It is still accepted so existing frontend API calls
         * do not have to change their request structure.
         * =========================================================
         */

        String uid =
                firebaseAuthService.verifyTokenAndGetUid(
                        auth == null
                                ? null
                                : auth
                                .replace("Bearer ", "")
                                .trim()
                );

        if (uid == null) {

            throw new UnauthorizedException(
                    "Sign in before syncing your profile."
            );
        }


        AppUser user =
                appUserRepository
                        .findByFirebaseUid(uid)
                        .orElseGet(AppUser::new);


        user.setFirebaseUid(uid);

        user.setEmail(req.email);


        /*
         * Do not blank out a profile the customer has already edited
         * just because Firebase has nothing for these fields.
         */
        if (req.displayName != null
                && !req.displayName.isBlank()) {

            user.setDisplayName(req.displayName);
        }


        if (req.phone != null
                && !req.phone.isBlank()) {

            user.setPhone(req.phone);
        }


        return mapper.toDto(
                appUserRepository.save(user)
        );
    }


    /**
     * Return the currently authenticated user.
     */
    @GetMapping("/auth/me")
    public ResponseEntity<AppUserDto> me(
            @RequestHeader("Authorization")
            String authHeader) {

        String uid =
                firebaseAuthService.verifyTokenAndGetUid(
                        strip(authHeader)
                );

        if (uid == null) {

            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .build();
        }

        return appUserRepository
                .findByFirebaseUid(uid)
                .map(u ->
                        ResponseEntity.ok(
                                mapper.toDto(u)
                        )
                )
                .orElse(
                        ResponseEntity.notFound().build()
                );
    }


    /* =========================================================
       PROFILE
       ========================================================= */


    @GetMapping("/users/{userId}")
    public ResponseEntity<AppUserDto> getUser(
            @PathVariable Long userId,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        currentUser.requireSelf(
                auth,
                userId
        );

        return appUserRepository
                .findById(userId)
                .map(u ->
                        ResponseEntity.ok(
                                mapper.toDto(u)
                        )
                )
                .orElse(
                        ResponseEntity.notFound().build()
                );
    }


    @PutMapping("/users/{userId}")
    public ResponseEntity<AppUserDto> updateProfile(
            @PathVariable Long userId,
            @RequestBody ProfileUpdateRequest req,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        currentUser.requireSelf(
                auth,
                userId
        );

        Optional<AppUser> existing =
                appUserRepository.findById(userId);

        if (existing.isEmpty()) {

            return ResponseEntity
                    .notFound()
                    .build();
        }


        AppUser user = existing.get();


        if (req.displayName != null) {

            user.setDisplayName(
                    req.displayName.trim()
            );
        }


        if (req.phone != null) {

            user.setPhone(
                    req.phone.trim()
            );
        }


        /*
         * Email is owned by Firebase.
         * Changing it here would desync the two systems.
         */
        return ResponseEntity.ok(
                mapper.toDto(
                        appUserRepository.save(user)
                )
        );
    }


    @PostMapping("/users/{userId}/photo")
    public ResponseEntity<AppUserDto> uploadProfilePhoto(
            @PathVariable Long userId,
            @RequestParam("file")
            MultipartFile file,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        currentUser.requireSelf(
                auth,
                userId
        );

        Optional<AppUser> existing =
                appUserRepository.findById(userId);

        if (existing.isEmpty()) {

            return ResponseEntity
                    .notFound()
                    .build();
        }


        AppUser user = existing.get();


        String stored =
                storageService.storeImage(
                        file,
                        "avatars"
                );


        storageService.deleteQuietly(
                user.getPhotoUrl()
        );


        user.setPhotoUrl(stored);


        return ResponseEntity.ok(
                mapper.toDto(
                        appUserRepository.save(user)
                )
        );
    }


    @DeleteMapping("/users/{userId}/photo")
    public ResponseEntity<AppUserDto> deleteProfilePhoto(
            @PathVariable Long userId,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        currentUser.requireSelf(
                auth,
                userId
        );

        Optional<AppUser> existing =
                appUserRepository.findById(userId);

        if (existing.isEmpty()) {

            return ResponseEntity
                    .notFound()
                    .build();
        }


        AppUser user = existing.get();


        storageService.deleteQuietly(
                user.getPhotoUrl()
        );


        user.setPhotoUrl(null);


        return ResponseEntity.ok(
                mapper.toDto(
                        appUserRepository.save(user)
                )
        );
    }


    /* =========================================================
       ADDRESSES
       ========================================================= */


    @GetMapping("/users/{userId}/addresses")
    public List<Address> addresses(
            @PathVariable Long userId,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        currentUser.requireSelf(
                auth,
                userId
        );

        return addressRepository.findByUserId(
                userId
        );
    }


    @PostMapping("/users/{userId}/addresses")
    public ResponseEntity<Address> addAddress(
            @PathVariable Long userId,
            @RequestBody AddressRequest req,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        currentUser.requireSelf(
                auth,
                userId
        );


        Optional<AppUser> user =
                appUserRepository.findById(userId);

        if (user.isEmpty()) {

            return ResponseEntity
                    .notFound()
                    .build();
        }


        boolean makeDefault =
                req.isDefault
                        || addressRepository
                        .findByUserId(userId)
                        .isEmpty();


        if (makeDefault) {

            unsetExistingDefaults(
                    userId
            );
        }


        Address a = new Address();

        a.setUser(
                user.get()
        );


        applyAddress(
                a,
                req
        );


        a.setDefault(
                makeDefault
        );


        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(
                        addressRepository.save(a)
                );
    }


    @PutMapping(
            "/users/{userId}/addresses/{addressId}"
    )
    public ResponseEntity<Address> updateAddress(
            @PathVariable Long userId,
            @PathVariable Long addressId,
            @RequestBody AddressRequest req,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        currentUser.requireSelf(
                auth,
                userId
        );


        Optional<Address> existing =
                addressRepository.findById(
                        addressId
                );


        if (existing.isEmpty()
                || !existing
                .get()
                .getUser()
                .getId()
                .equals(userId)) {

            return ResponseEntity
                    .notFound()
                    .build();
        }


        Address a = existing.get();


        applyAddress(
                a,
                req
        );


        if (req.isDefault
                && !a.isDefault()) {

            unsetExistingDefaults(
                    userId
            );

            a.setDefault(true);
        }


        return ResponseEntity.ok(
                addressRepository.save(a)
        );
    }


    @DeleteMapping(
            "/users/{userId}/addresses/{addressId}"
    )
    public ResponseEntity<Void> deleteAddress(
            @PathVariable Long userId,
            @PathVariable Long addressId,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        currentUser.requireSelf(
                auth,
                userId
        );


        Optional<Address> existing =
                addressRepository.findById(
                        addressId
                );


        if (existing.isEmpty()
                || !existing
                .get()
                .getUser()
                .getId()
                .equals(userId)) {

            return ResponseEntity
                    .notFound()
                    .build();
        }


        boolean wasDefault =
                existing
                        .get()
                        .isDefault();


        addressRepository.deleteById(
                addressId
        );


        if (wasDefault) {

            addressRepository
                    .findByUserId(userId)
                    .stream()
                    .findFirst()
                    .ifPresent(next -> {

                        next.setDefault(true);

                        addressRepository.save(
                                next
                        );
                    });
        }


        return ResponseEntity
                .noContent()
                .build();
    }


    @PutMapping(
            "/users/{userId}/addresses/{addressId}/default"
    )
    public ResponseEntity<Address> setDefaultAddress(
            @PathVariable Long userId,
            @PathVariable Long addressId,
            @RequestHeader(
                    value = "Authorization",
                    required = false
            )
            String auth) {

        currentUser.requireSelf(
                auth,
                userId
        );


        Optional<Address> existing =
                addressRepository.findById(
                        addressId
                );


        if (existing.isEmpty()
                || !existing
                .get()
                .getUser()
                .getId()
                .equals(userId)) {

            return ResponseEntity
                    .notFound()
                    .build();
        }


        unsetExistingDefaults(
                userId
        );


        Address a =
                existing.get();


        a.setDefault(true);


        return ResponseEntity.ok(
                addressRepository.save(a)
        );
    }


    /* =========================================================
       PRIVATE HELPERS
       ========================================================= */


    private void unsetExistingDefaults(
            Long userId) {

        List<Address> existing =
                addressRepository.findByUserId(
                        userId
                );


        for (Address addr : existing) {

            if (addr.isDefault()) {

                addr.setDefault(false);

                addressRepository.save(
                        addr
                );
            }
        }
    }


    private void applyAddress(
            Address a,
            AddressRequest req) {

        a.setFullName(
                req.fullName
        );

        a.setPhone(
                req.phone
        );

        a.setHouseBuilding(
                req.houseBuilding
        );

        a.setStreet(
                req.street
        );

        a.setArea(
                req.area
        );

        a.setCity(
                req.city
        );

        a.setState(
                req.state
        );

        a.setPincode(
                req.pincode
        );

        a.setLandmark(
                req.landmark
        );
    }


    private String strip(
            String header) {

        if (header == null) {
            return null;
        }

        return header
                .replace("Bearer ", "")
                .trim();
    }
}