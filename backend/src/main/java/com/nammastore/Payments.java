package com.nammastore;

import jakarta.persistence.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.razorpay.RazorpayClient;
import org.json.JSONObject;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * ===========================================================
 * Payments.java
 * -----------------------------------------------------------
 * Razorpay order creation, signature verification, payment
 * records, and webhook handling.
 *
 * Set these environment variables to go live:
 *   RAZORPAY_KEY_ID
 *   RAZORPAY_KEY_SECRET
 *   RAZORPAY_WEBHOOK_SECRET
 * Until they're set, createOrder() below falls back to a local
 * stub id so the rest of the app still works end-to-end in dev.
 *
 * Flow:
 *  1. Frontend calls POST /api/payments/create-order with the
 *     orderId (our Order.id) -> we call Razorpay Orders API and
 *     return a razorpayOrderId + amount + key to the frontend.
 *  2. Frontend opens the real Razorpay checkout modal with that
 *     razorpayOrderId (see checkout/page.tsx).
 *  3. On success, frontend calls POST /api/payments/verify with
 *     razorpay_order_id, razorpay_payment_id, razorpay_signature.
 *  4. We verify the signature with HMAC-SHA256 using the key
 *     secret. If valid, we mark the Order as PAID.
 *  5. Razorpay also calls POST /api/payments/webhook directly
 *     (configure this URL in the Razorpay dashboard) as a more
 *     reliable source of truth than step 3 alone - verified the
 *     same way, using RAZORPAY_WEBHOOK_SECRET.
 * ===========================================================
 */

@Entity
@Table(name = "payments")
class Payment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long orderId;
    private String razorpayOrderId;
    private String razorpayPaymentId;
    private String razorpaySignature;
    private BigDecimal amount;
    private String status = "CREATED"; // CREATED, VERIFIED, FAILED
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrderId() { return orderId; }
    public void setOrderId(Long orderId) { this.orderId = orderId; }
    public String getRazorpayOrderId() { return razorpayOrderId; }
    public void setRazorpayOrderId(String razorpayOrderId) { this.razorpayOrderId = razorpayOrderId; }
    public String getRazorpayPaymentId() { return razorpayPaymentId; }
    public void setRazorpayPaymentId(String razorpayPaymentId) { this.razorpayPaymentId = razorpayPaymentId; }
    public String getRazorpaySignature() { return razorpaySignature; }
    public void setRazorpaySignature(String razorpaySignature) { this.razorpaySignature = razorpaySignature; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
}

interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByRazorpayOrderId(String razorpayOrderId);
}

class CreatePaymentOrderRequest {
    public Long orderId;
}

class VerifyPaymentRequest {
    public String razorpayOrderId;
    public String razorpayPaymentId;
    public String razorpaySignature;
}

@RestController
@RequestMapping("/api/payments")
class PaymentsController {

    @Value("${razorpay.key.id:RAZORPAY_KEY_ID_NOT_SET}")
    private String keyId;

    @Value("${razorpay.key.secret:RAZORPAY_KEY_SECRET_NOT_SET}")
    private String keySecret;

    @Value("${razorpay.webhook.secret:}")
    private String webhookSecret;

    @Autowired private PaymentRepository paymentRepository;
    @Autowired private OrderRepository orderRepository;

    @PostMapping("/create-order")
    public ResponseEntity<Map<String, Object>> createOrder(@RequestBody CreatePaymentOrderRequest req) {
        Optional<Order> orderOpt = orderRepository.findById(req.orderId);
        if (orderOpt.isEmpty()) return ResponseEntity.badRequest().build();
        Order order = orderOpt.get();

        boolean razorpayConfigured = keyId != null && !keyId.isBlank() && !keyId.equals("RAZORPAY_KEY_ID_NOT_SET")
                && keySecret != null && !keySecret.isBlank() && !keySecret.equals("RAZORPAY_KEY_SECRET_NOT_SET");

        String razorpayOrderId;
        if (razorpayConfigured) {
            try {
                RazorpayClient client = new RazorpayClient(keyId, keySecret);
                JSONObject orderRequest = new JSONObject();
                // Razorpay wants the amount in the smallest currency unit (paise for INR).
                orderRequest.put("amount", order.getTotalAmount().multiply(BigDecimal.valueOf(100)).intValue());
                orderRequest.put("currency", "INR");
                orderRequest.put("receipt", "order_rcpt_" + order.getId());
                com.razorpay.Order rzOrder = client.orders.create(orderRequest);
                razorpayOrderId = rzOrder.get("id");
            } catch (Exception e) {
                return ResponseEntity.status(502)
                        .body(Map.of("error", "Could not create Razorpay order: " + e.getMessage()));
            }
        } else {
            // Dev fallback so checkout still works end-to-end without real keys.
            // The frontend detects this ("order_stub_" prefix) and simulates
            // a successful payment instead of opening the real Razorpay modal.
            razorpayOrderId = "order_stub_" + order.getId() + "_" + System.currentTimeMillis();
        }

        Payment payment = new Payment();
        payment.setOrderId(order.getId());
        payment.setRazorpayOrderId(razorpayOrderId);
        payment.setAmount(order.getTotalAmount());
        paymentRepository.save(payment);

        Map<String, Object> response = new HashMap<>();
        response.put("razorpayOrderId", razorpayOrderId);
        response.put("amount", order.getTotalAmount());
        response.put("keyId", keyId);
        response.put("live", razorpayConfigured);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/verify")
    public ResponseEntity<Map<String, Object>> verify(@RequestBody VerifyPaymentRequest req) {
        Optional<Payment> paymentOpt = paymentRepository.findByRazorpayOrderId(req.razorpayOrderId);
        if (paymentOpt.isEmpty()) return ResponseEntity.badRequest().build();
        Payment payment = paymentOpt.get();

        // Dev fallback: create-order issued a "order_stub_" id because Razorpay
        // keys aren't configured, so there's no real signature to check -
        // the frontend simulated a successful payment for local testing.
        boolean isStubbedOrder = payment.getRazorpayOrderId() != null
                && payment.getRazorpayOrderId().startsWith("order_stub_");
        boolean valid = isStubbedOrder || verifySignature(req.razorpayOrderId, req.razorpayPaymentId, req.razorpaySignature);

        payment.setRazorpayPaymentId(req.razorpayPaymentId);
        payment.setRazorpaySignature(req.razorpaySignature);
        payment.setStatus(valid ? "VERIFIED" : "FAILED");
        paymentRepository.save(payment);

        if (valid) {
            orderRepository.findById(payment.getOrderId()).ifPresent(order -> {
                order.setStatus(OrderStatus.CONFIRMED);
                order.setPaymentStatus("PAID");
                orderRepository.save(order);
            });
        }

        Map<String, Object> response = new HashMap<>();
        response.put("verified", valid);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/webhook")
    public ResponseEntity<String> webhook(@RequestBody String rawBody,
                                           @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            // Not configured yet - accept but do nothing, so Razorpay's test
            // pings don't fail loudly before you've set RAZORPAY_WEBHOOK_SECRET.
            return ResponseEntity.ok("received (webhook secret not configured)");
        }
        if (!verifyWebhookSignature(rawBody, signature)) {
            return ResponseEntity.status(400).body("invalid signature");
        }

        try {
            JSONObject event = new JSONObject(rawBody);
            String eventType = event.optString("event", "");
            JSONObject paymentEntity = event.optJSONObject("payload") != null
                    ? event.getJSONObject("payload").optJSONObject("payment") != null
                        ? event.getJSONObject("payload").getJSONObject("payment").optJSONObject("entity")
                        : null
                    : null;
            String razorpayOrderId = paymentEntity != null ? paymentEntity.optString("order_id", null) : null;

            if (razorpayOrderId != null) {
                paymentRepository.findByRazorpayOrderId(razorpayOrderId).ifPresent(payment -> {
                    if ("payment.captured".equals(eventType)) {
                        payment.setStatus("VERIFIED");
                        paymentRepository.save(payment);
                        orderRepository.findById(payment.getOrderId()).ifPresent(order -> {
                            order.setStatus(OrderStatus.CONFIRMED);
                order.setPaymentStatus("PAID");
                            orderRepository.save(order);
                        });
                    } else if ("payment.failed".equals(eventType)) {
                        payment.setStatus("FAILED");
                        paymentRepository.save(payment);
                    }
                });
            }
        } catch (Exception e) {
            // Malformed payload - log and still 200 so Razorpay doesn't retry forever.
            return ResponseEntity.ok("received (could not parse: " + e.getMessage() + ")");
        }

        return ResponseEntity.ok("received");
    }

    private boolean verifyWebhookSignature(String rawBody, String signature) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(), "HmacSHA256"));
            byte[] hash = mac.doFinal(rawBody.getBytes());
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02x", b));
            return MessageDigest.isEqual(hex.toString().getBytes(), signature == null ? new byte[0] : signature.getBytes());
        } catch (Exception e) {
            return false;
        }
    }

    private boolean verifySignature(String razorpayOrderId, String razorpayPaymentId, String signature) {
        try {
            String payload = razorpayOrderId + "|" + razorpayPaymentId;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(keySecret.getBytes(), "HmacSHA256"));
            byte[] hash = mac.doFinal(payload.getBytes());
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02x", b));
            return MessageDigest.isEqual(hex.toString().getBytes(), signature == null ? new byte[0] : signature.getBytes());
        } catch (Exception e) {
            return false;
        }
    }
}
