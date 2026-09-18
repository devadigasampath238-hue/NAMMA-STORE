package com.nammastore;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/*
 * ===========================================================
 * Storage.java  (STAGE 1 - NEW FILE)
 * ===========================================================
 *
 * ONE place that knows how files are stored and how a stored
 * value becomes a URL the browser can load.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before Stage 1 the upload endpoint lived inside
 * Products.java and returned "/uploads/<file>". The frontend
 * then prefixed it with http://localhost:8080 and saved that
 * ABSOLUTE url into PostgreSQL. That is why images broke the
 * moment anything about the host changed, and why image URLs
 * had to be patched by hand in pgAdmin.
 *
 * NEW CONVENTION
 * --------------
 *  - The DATABASE always stores a RELATIVE path:
 *        /uploads/products/<uuid>.jpg
 *        /uploads/categories/<uuid>.png
 *        /uploads/avatars/<uuid>.png
 *  - The API always returns an ABSOLUTE url, built at
 *    response time by StorageService.toPublicUrl().
 *  - Legacy rows that already contain "http://..." are passed
 *    through untouched, so NO data migration is required and
 *    no existing image breaks.
 *
 * BACKENDS
 * --------
 *  - If storage.bucket + storage.access.key are configured,
 *    files go to the S3-compatible bucket (Cloudflare R2).
 *  - Otherwise files go to the local ./uploads folder, which
 *    NammaStoreApplication already serves at /uploads/**.
 *
 * No secrets are hard-coded: everything comes from
 * application.properties / environment variables.
 * ===========================================================
 */
@Service
class StorageService {

    @Value("${storage.endpoint:}")
    private String storageEndpoint;

    @Value("${storage.bucket:}")
    private String storageBucket;

    @Value("${storage.access.key:}")
    private String storageAccessKey;

    @Value("${storage.secret.key:}")
    private String storageSecretKey;

    /** Optional CDN / r2.dev domain used to build public URLs for remote files. */
    @Value("${storage.public.base-url:}")
    private String storagePublicBaseUrl;

    /** Local folder used when no bucket is configured. */
    @Value("${storage.local.dir:uploads}")
    private String localDir;

    /** Public origin of THIS backend, used to build absolute URLs for local files. */
    @Value("${app.public.base-url:http://localhost:8080}")
    private String appPublicBaseUrl;

    private static final List<String> ALLOWED_CONTENT_TYPES = List.of(
            "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"
    );

    private static final long MAX_BYTES = 10L * 1024 * 1024; // 10 MB

    /* ------------------------------------------------------------------
       CAPABILITIES
       ------------------------------------------------------------------ */

    boolean isRemoteConfigured() {
        return notBlank(storageBucket)
                && notBlank(storageAccessKey)
                && notBlank(storageSecretKey)
                && notBlank(storageEndpoint);
    }

    String describeBackend() {
        return isRemoteConfigured() ? "s3" : "local";
    }

    /* ------------------------------------------------------------------
       STORE
       ------------------------------------------------------------------ */

    /**
     * Validates and stores an uploaded image.
     *
     * @param folder logical folder, e.g. "products", "categories", "avatars", "designs"
     * @return the RELATIVE path to persist in the database, e.g. /uploads/products/ab12.jpg
     */
    String storeImage(MultipartFile file, String folder) {
        validateImage(file);

        String safeFolder = sanitizeFolder(folder);
        String filename = UUID.randomUUID() + extensionOf(file);
        String relativePath = "/uploads/" + safeFolder + "/" + filename;

        try {
            if (isRemoteConfigured()) {
                String key = safeFolder + "/" + filename;
                s3Client().putObject(
                        PutObjectRequest.builder()
                                .bucket(storageBucket)
                                .key(key)
                                .contentType(file.getContentType())
                                .build(),
                        RequestBody.fromBytes(file.getBytes())
                );
            } else {
                Path dir = Path.of(localDir, safeFolder);
                Files.createDirectories(dir);
                Files.write(dir.resolve(filename), file.getBytes());
            }
        } catch (IOException e) {
            throw new BadRequestException("Could not save the image: " + e.getMessage());
        } catch (RuntimeException e) {
            throw new BadRequestException("Upload failed: " + e.getMessage());
        }

        return relativePath;
    }

    /* ------------------------------------------------------------------
       DELETE
       ------------------------------------------------------------------ */

    /**
     * Best-effort delete of a previously stored file. Never throws: an
     * orphaned file must not block a product/category update.
     *
     * @param storedValue whatever is in the database (relative path or legacy absolute url)
     */
    void deleteQuietly(String storedValue) {
        if (!notBlank(storedValue)) return;

        String relative = toRelativePath(storedValue);
        if (relative == null) return; // external URL we do not own

        String key = relative.substring("/uploads/".length());

        try {
            if (isRemoteConfigured()) {
                s3Client().deleteObject(
                        DeleteObjectRequest.builder()
                                .bucket(storageBucket)
                                .key(key)
                                .build()
                );
            } else {
                Files.deleteIfExists(Path.of(localDir).resolve(key));
            }
        } catch (Exception ignored) {
            // Intentionally swallowed - see javadoc.
        }
    }

    /* ------------------------------------------------------------------
       URL BUILDING  (the piece that removes the pgAdmin workflow)
       ------------------------------------------------------------------ */

    /**
     * Turns a stored value into something the browser can load.
     *
     *  "/uploads/products/x.jpg"  -> "http://localhost:8080/uploads/products/x.jpg"
     *  "http://old/uploads/x.jpg" -> unchanged  (legacy rows keep working)
     *  null / blank               -> null       (frontend shows its fallback)
     */
    String toPublicUrl(String storedValue) {
        if (!notBlank(storedValue)) return null;

        String value = storedValue.trim();

        // Already absolute (legacy data, or an externally hosted image).
        if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("//")) {
            return value;
        }

        String path = value.startsWith("/") ? value : "/" + value;

        if (isRemoteConfigured() && path.startsWith("/uploads/")) {
            String key = path.substring("/uploads/".length());
            String base = notBlank(storagePublicBaseUrl)
                    ? trimTrailingSlash(storagePublicBaseUrl)
                    : trimTrailingSlash(storageEndpoint) + "/" + storageBucket;
            return base + "/" + key;
        }

        return trimTrailingSlash(appPublicBaseUrl) + path;
    }

    List<String> toPublicUrls(List<String> storedValues) {
        List<String> out = new ArrayList<>();
        if (storedValues == null) return out;
        for (String v : storedValues) {
            String url = toPublicUrl(v);
            if (url != null) out.add(url);
        }
        return out;
    }

    /**
     * Inverse of toPublicUrl: accepts either a relative path or an absolute
     * URL that points at our own storage, and returns the canonical relative
     * path. Returns null for URLs we do not own.
     *
     * This is what lets the admin UI send back the same absolute URL it was
     * given ("delete THIS image") without the backend getting confused.
     */
    String toRelativePath(String value) {
        if (!notBlank(value)) return null;
        String v = value.trim();

        int idx = v.indexOf("/uploads/");
        if (idx >= 0) {
            return v.substring(idx);
        }

        // Remote layout: <public-base>/<folder>/<file>
        if (isRemoteConfigured()) {
            String base = notBlank(storagePublicBaseUrl)
                    ? trimTrailingSlash(storagePublicBaseUrl)
                    : trimTrailingSlash(storageEndpoint) + "/" + storageBucket;
            if (v.startsWith(base)) {
                String key = v.substring(base.length());
                if (!key.startsWith("/")) key = "/" + key;
                return "/uploads" + key;
            }
        }

        return null;
    }

    /**
     * True when two values refer to the same stored image, regardless of
     * whether they are relative paths or absolute URLs.
     */
    boolean sameImage(String a, String b) {
        if (a == null || b == null) return false;
        if (a.equals(b)) return true;
        String ra = toRelativePath(a);
        String rb = toRelativePath(b);
        return ra != null && ra.equals(rb);
    }

    /* ------------------------------------------------------------------
       INTERNALS
       ------------------------------------------------------------------ */

    private S3Client s3Client() {
        return S3Client.builder()
                .endpointOverride(URI.create(storageEndpoint))
                .region(Region.US_EAST_1)
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(true)
                        .build())
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(storageAccessKey, storageSecretKey)))
                .build();
    }

    private void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("No file was provided.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BadRequestException("Image is larger than 10MB.");
        }
        String contentType = file.getContentType() == null
                ? ""
                : file.getContentType().toLowerCase(Locale.ROOT);
        if (!ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new BadRequestException(
                    "Unsupported image type. Please upload PNG, JPG, JPEG, WEBP or GIF.");
        }
    }

    private String extensionOf(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        int dot = original.lastIndexOf('.');
        if (dot < 0) return ".jpg";
        String ext = original.substring(dot).toLowerCase(Locale.ROOT);
        return ext.matches("\\.[a-z0-9]{2,5}") ? ext : ".jpg";
    }

    private String sanitizeFolder(String folder) {
        if (!notBlank(folder)) return "misc";
        String cleaned = folder.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9-]", "");
        return cleaned.isBlank() ? "misc" : cleaned;
    }

    private static String trimTrailingSlash(String value) {
        if (value == null) return "";
        return value.replaceAll("/+$", "");
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}


/* ===========================================================
   UPLOAD CONTROLLER
   -----------------------------------------------------------
   Generic uploads used by the customer-facing customization
   flow and by any admin screen that wants a raw URL.

   NOTE: product and category images have their own dedicated
   endpoints in Products.java which ALSO attach the image to
   the row - that is the flow that replaces pgAdmin.
   =========================================================== */

@RestController
@RequestMapping("/api")
class UploadController {

    @Autowired
    private StorageService storageService;

    /**
     * Kept at its original path so the existing frontend uploadFile()
     * helper keeps working unchanged.
     *
     * Response:
     *   { "url": "<absolute url>", "path": "<relative path>", "storage": "local|s3" }
     */
    @PostMapping("/upload")
    public ResponseEntity<Map<String, String>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", required = false, defaultValue = "misc") String folder) {

        String relative = storageService.storeImage(file, folder);

        Map<String, String> body = new LinkedHashMap<>();
        body.put("url", storageService.toPublicUrl(relative));
        body.put("path", relative);
        body.put("storage", storageService.describeBackend());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }
}
