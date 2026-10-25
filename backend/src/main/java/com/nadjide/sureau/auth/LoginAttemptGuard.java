package com.nadjide.sureau.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Slows down password and setup-token guessing. Failures are counted per account and per client
 * address: past a threshold, the key is locked for 30 seconds, doubled after every further failure
 * up to 15 minutes. A successful login clears its account. The client threshold is higher because
 * several people may share an address (office NAT, reverse proxy without forwarded headers).
 *
 * <p>State is kept in memory: an instance runs a single application replica, and a restart only
 * forgets the counters.
 */
@Component
public class LoginAttemptGuard {
    private static final int MAX_TRACKED_KEYS = 10_000;
    private static final Duration FORGET_AFTER = Duration.ofMinutes(30);

    private final Clock clock;
    private final int accountThreshold;
    private final int clientThreshold;
    private final Duration firstLock;
    private final Duration maxLock;
    private final ConcurrentHashMap<String, Failures> failures = new ConcurrentHashMap<>();

    @Autowired
    public LoginAttemptGuard(@Value("${sureau.login.account-threshold:5}") int accountThreshold,
                             @Value("${sureau.login.client-threshold:30}") int clientThreshold) {
        this(Clock.systemUTC(), accountThreshold, clientThreshold, Duration.ofSeconds(30), Duration.ofMinutes(15));
    }

    LoginAttemptGuard(Clock clock, int accountThreshold, int clientThreshold, Duration firstLock, Duration maxLock) {
        this.clock = clock;
        this.accountThreshold = accountThreshold;
        this.clientThreshold = clientThreshold;
        this.firstLock = firstLock;
        this.maxLock = maxLock;
    }

    /** Time to wait before this account or client may try again; zero when an attempt is allowed. */
    public Duration retryAfter(String username, String client) {
        Instant now = clock.instant();
        Duration account = remaining(accountKey(username), now);
        Duration address = remaining(clientKey(client), now);
        return account.compareTo(address) >= 0 ? account : address;
    }

    public void failed(String username, String client) {
        Instant now = clock.instant();
        record(accountKey(username), accountThreshold, now);
        record(clientKey(client), clientThreshold, now);
    }

    public void succeeded(String username) {
        String key = accountKey(username);
        if (key != null) failures.remove(key);
    }

    /** Test support: forget every counter. */
    void clear() {
        failures.clear();
    }

    private Duration remaining(String key, Instant now) {
        Failures current = key == null ? null : failures.get(key);
        if (current == null || current.lockedUntil() == null || !current.lockedUntil().isAfter(now)) return Duration.ZERO;
        return Duration.between(now, current.lockedUntil());
    }

    private void record(String key, int threshold, Instant now) {
        if (key == null) return;
        if (failures.size() >= MAX_TRACKED_KEYS && !failures.containsKey(key)) {
            forgetIdleKeys(now);
            // Under a flood of distinct keys, existing locks keep working; new keys are not tracked.
            if (failures.size() >= MAX_TRACKED_KEYS) return;
        }
        failures.compute(key, (ignored, current) -> {
            int count = current == null || now.isAfter(current.lastFailure().plus(FORGET_AFTER)) ? 1 : current.count() + 1;
            Instant lockedUntil = count < threshold ? null : now.plus(lockDuration(count - threshold));
            return new Failures(count, now, lockedUntil);
        });
    }

    private Duration lockDuration(int failuresBeyondThreshold) {
        Duration lock = firstLock.multipliedBy(1L << Math.min(failuresBeyondThreshold, 20));
        return lock.compareTo(maxLock) > 0 ? maxLock : lock;
    }

    private void forgetIdleKeys(Instant now) {
        failures.entrySet().removeIf(entry -> {
            Failures value = entry.getValue();
            boolean locked = value.lockedUntil() != null && value.lockedUntil().isAfter(now);
            return !locked && now.isAfter(value.lastFailure().plus(FORGET_AFTER));
        });
    }

    private static String accountKey(String username) {
        String normalized = SetupRequest.normalizeUsername(username);
        return normalized == null || normalized.isEmpty() ? null : "account:" + normalized;
    }

    private static String clientKey(String client) {
        return client == null || client.isBlank() ? null : "client:" + client;
    }

    private record Failures(int count, Instant lastFailure, Instant lockedUntil) {
    }
}
