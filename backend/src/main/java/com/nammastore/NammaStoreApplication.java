package com.nammastore;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * ===========================================================
 * NammaStoreApplication.java
 * -----------------------------------------------------------
 * Spring Boot startup, global CORS config, health endpoint,
 * and static file serving for local (non-S3) uploads.
 * This is the ONLY place app-wide configuration lives.
 *
 * STAGE 1: the allowed origin and the upload folder are now
 * read from configuration instead of being hard-coded, and
 * /uploads/** serves nested folders (products, categories,
 * avatars, designs) as well as the legacy flat files.
 * ===========================================================
 */
@SpringBootApplication
public class NammaStoreApplication {

    public static void main(String[] args) {
        SpringApplication.run(NammaStoreApplication.class, args);
    }

    @Bean
    public WebMvcConfigurer webConfigurer(
            @Value("${app.cors.allowed-origin:http://localhost:3000}") String allowedOrigin,
            @Value("${storage.local.dir:uploads}") String localDir) {

        return new WebMvcConfigurer() {

            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOriginPatterns(allowedOrigin)
                        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                        .allowedHeaders("*")
                        .allowCredentials(true);
            }

            /*
             * Serves everything StorageService wrote to the local folder when
             * no S3/R2 bucket is configured, so image upload works out of the
             * box in development. Files live under /uploads/<folder>/<uuid>.ext
             * and legacy files sit directly in /uploads/.
             */
            @Override
            public void addResourceHandlers(ResourceHandlerRegistry registry) {
                /*
                 * ROOT CAUSE OF THE "No image" BUG.
                 *
                 * This used to be:
                 *     Path.of(localDir).toAbsolutePath().toUri().toString()
                 *
                 * Path.toUri() stats the filesystem and only appends a
                 * trailing "/" when the directory ALREADY EXISTS. On a fresh
                 * checkout ./uploads does not exist at startup, so the
                 * location came out as
                 *     file:/app/uploads          (no trailing slash)
                 * and Spring resolved /uploads/products/x.jpg against it as
                 *     file:/app/uploadsproducts/x.jpg   -> 404
                 *
                 * The upload succeeded, the database row was right and the
                 * URL the API returned was right - the file just could not be
                 * served, so every <img> fell back to the placeholder. The
                 * mapping is built once at startup, so it stayed broken for
                 * the life of the process even after the first upload created
                 * the folder.
                 *
                 * Fix: create the directory before mapping it, and guarantee
                 * the trailing slash instead of trusting toUri().
                 */
                Path uploadRoot = Path.of(localDir).toAbsolutePath().normalize();
                try {
                    Files.createDirectories(uploadRoot);
                } catch (IOException e) {
                    // Non-fatal: S3/R2 may be configured, in which case nothing
                    // is ever written here. Log rather than refuse to start.
                    LoggerFactory.getLogger(NammaStoreApplication.class)
                            .warn("Could not create upload directory {}: {}",
                                    uploadRoot, e.getMessage());
                }

                String location = uploadRoot.toUri().toString();
                if (!location.endsWith("/")) location = location + "/";

                LoggerFactory.getLogger(NammaStoreApplication.class)
                        .info("Serving /uploads/** from {}", location);

                registry.addResourceHandler("/uploads/**")
                        .addResourceLocations(location)
                        .setCachePeriod(3600);
            }
        };
    }
}

@RestController
@RequestMapping("/api")
class HealthController {

    private final StorageService storageService;

    HealthController(StorageService storageService) {
        this.storageService = storageService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("status", "UP");
        body.put("service", "Namma Store Backend");
        body.put("storage", storageService.describeBackend());
        return body;
    }
}
