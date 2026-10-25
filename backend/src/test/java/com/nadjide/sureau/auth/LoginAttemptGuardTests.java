package com.nadjide.sureau.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LoginAttemptGuardTests {
    private final MutableClock clock = new MutableClock();
    private final LoginAttemptGuard guard =
            new LoginAttemptGuard(clock, 5, 30, Duration.ofSeconds(30), Duration.ofMinutes(15));

    @Test
    void locksAnAccountAfterFiveFailuresThenDoublesTheWaitUpToFifteenMinutes() {
        for (int i = 0; i < 4; i++) guard.failed("admin", "10.0.0.1");
        assertThat(guard.retryAfter("admin", "10.0.0.2")).isZero();

        guard.failed("admin", "10.0.0.1");
        assertThat(guard.retryAfter("admin", "10.0.0.2")).isEqualTo(Duration.ofSeconds(30));

        clock.advance(Duration.ofSeconds(30));
        assertThat(guard.retryAfter("admin", "10.0.0.2")).isZero();
        guard.failed("admin", "10.0.0.3");
        assertThat(guard.retryAfter("admin", null)).isEqualTo(Duration.ofMinutes(1));

        for (int i = 0; i < 10; i++) {
            clock.advance(guard.retryAfter("admin", null));
            guard.failed("admin", "10.0.0.3");
        }
        assertThat(guard.retryAfter("admin", null)).isEqualTo(Duration.ofMinutes(15));
    }

    @Test
    void treatsUsernamesAsTheLoginDoes() {
        for (int i = 0; i < 5; i++) guard.failed(i % 2 == 0 ? " Admin" : "ADMIN ", null);
        assertThat(guard.retryAfter("admin", null)).isPositive();
        assertThat(guard.retryAfter("editor", null)).isZero();
    }

    @Test
    void aSuccessfulLoginClearsItsAccountButNotTheClient() {
        for (int i = 0; i < 4; i++) guard.failed("admin", "10.0.0.1");
        guard.succeeded("Admin");
        for (int i = 0; i < 4; i++) guard.failed("admin", "10.0.0.1");
        assertThat(guard.retryAfter("admin", null)).isZero();

        for (int i = 0; i < 22; i++) guard.failed("visitor-" + i, "10.0.0.1");
        assertThat(guard.retryAfter("someone-else", "10.0.0.1")).isEqualTo(Duration.ofSeconds(30));
        assertThat(guard.retryAfter("someone-else", "10.0.0.9")).isZero();
    }

    @Test
    void forgetsOldFailures() {
        for (int i = 0; i < 4; i++) guard.failed("admin", null);
        clock.advance(Duration.ofMinutes(31));
        guard.failed("admin", null);
        assertThat(guard.retryAfter("admin", null)).isZero();
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-25T10:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
