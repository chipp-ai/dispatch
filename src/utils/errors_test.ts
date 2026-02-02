/**
 * Unit Tests for Custom Error Classes
 */

import { assertEquals, assertInstanceOf } from "@std/assert";
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  InsufficientCreditsError,
} from "./errors.ts";

// ========================================
// AppError Tests
// ========================================

Deno.test("AppError - creates error with correct properties", () => {
  const error = new AppError("Test error", 500, "TEST_ERROR");

  assertEquals(error.message, "Test error");
  assertEquals(error.statusCode, 500);
  assertEquals(error.code, "TEST_ERROR");
  assertEquals(error.name, "AppError");
  assertInstanceOf(error, Error);
});

// ========================================
// NotFoundError Tests
// ========================================

Deno.test("NotFoundError - creates error with resource and ID", () => {
  const error = new NotFoundError("User", "123");

  assertEquals(error.message, "User with ID '123' not found");
  assertEquals(error.statusCode, 404);
  assertEquals(error.code, "NOT_FOUND");
  assertEquals(error.name, "NotFoundError");
});

Deno.test("NotFoundError - creates error with resource only", () => {
  const error = new NotFoundError("User");

  assertEquals(error.message, "User not found");
  assertEquals(error.statusCode, 404);
  assertEquals(error.code, "NOT_FOUND");
});

// ========================================
// UnauthorizedError Tests
// ========================================

Deno.test("UnauthorizedError - creates error with default message", () => {
  const error = new UnauthorizedError();

  assertEquals(error.message, "Authentication required");
  assertEquals(error.statusCode, 401);
  assertEquals(error.code, "UNAUTHORIZED");
  assertEquals(error.name, "UnauthorizedError");
});

Deno.test("UnauthorizedError - creates error with custom message", () => {
  const error = new UnauthorizedError("Invalid token");

  assertEquals(error.message, "Invalid token");
  assertEquals(error.statusCode, 401);
});

// ========================================
// ForbiddenError Tests
// ========================================

Deno.test("ForbiddenError - creates error with default message", () => {
  const error = new ForbiddenError();

  assertEquals(error.message, "Access denied");
  assertEquals(error.statusCode, 403);
  assertEquals(error.code, "FORBIDDEN");
  assertEquals(error.name, "ForbiddenError");
});

Deno.test("ForbiddenError - creates error with custom message", () => {
  const error = new ForbiddenError("You don't have permission");

  assertEquals(error.message, "You don't have permission");
  assertEquals(error.statusCode, 403);
});

// ========================================
// ValidationError Tests
// ========================================

Deno.test("ValidationError - creates error with message only", () => {
  const error = new ValidationError("Invalid input");

  assertEquals(error.message, "Invalid input");
  assertEquals(error.statusCode, 400);
  assertEquals(error.code, "VALIDATION_ERROR");
  assertEquals(error.name, "ValidationError");
  assertEquals(error.details, undefined);
});

Deno.test("ValidationError - creates error with details", () => {
  const details = {
    email: "Invalid email format",
    name: "Name is required",
  };
  const error = new ValidationError("Validation failed", details);

  assertEquals(error.message, "Validation failed");
  assertEquals(error.statusCode, 400);
  assertEquals(error.details, details);
  assertEquals(error.details?.email, "Invalid email format");
  assertEquals(error.details?.name, "Name is required");
});

// ========================================
// ConflictError Tests
// ========================================

Deno.test("ConflictError - creates error with message", () => {
  const error = new ConflictError("Resource already exists");

  assertEquals(error.message, "Resource already exists");
  assertEquals(error.statusCode, 409);
  assertEquals(error.code, "CONFLICT");
  assertEquals(error.name, "ConflictError");
});

// ========================================
// RateLimitError Tests
// ========================================

Deno.test("RateLimitError - creates error with default message", () => {
  const error = new RateLimitError();

  assertEquals(error.message, "Too many requests");
  assertEquals(error.statusCode, 429);
  assertEquals(error.code, "RATE_LIMITED");
  assertEquals(error.name, "RateLimitError");
  assertEquals(error.retryAfter, undefined);
});

Deno.test("RateLimitError - creates error with retryAfter", () => {
  const error = new RateLimitError("Rate limited", 60);

  assertEquals(error.message, "Rate limited");
  assertEquals(error.statusCode, 429);
  assertEquals(error.retryAfter, 60);
});

// ========================================
// ExternalServiceError Tests
// ========================================

Deno.test("ExternalServiceError - creates error with service name", () => {
  const error = new ExternalServiceError("Stripe", "Payment failed");

  assertEquals(error.message, "Stripe: Payment failed");
  assertEquals(error.statusCode, 502);
  assertEquals(error.code, "EXTERNAL_SERVICE_ERROR");
  assertEquals(error.name, "ExternalServiceError");
  assertEquals(error.service, "Stripe");
});

// ========================================
// InsufficientCreditsError Tests
// ========================================

Deno.test(
  "InsufficientCreditsError - creates error with credit amounts",
  () => {
    const error = new InsufficientCreditsError(100, 50);

    assertEquals(error.message, "Insufficient credits: need 100, have 50");
    assertEquals(error.statusCode, 402);
    assertEquals(error.code, "INSUFFICIENT_CREDITS");
    assertEquals(error.name, "InsufficientCreditsError");
    assertEquals(error.required, 100);
    assertEquals(error.available, 50);
  }
);

// ========================================
// Inheritance Tests
// ========================================

Deno.test("All errors extend AppError", () => {
  const errors = [
    new NotFoundError("Test"),
    new UnauthorizedError(),
    new ForbiddenError(),
    new ValidationError("Test"),
    new ConflictError("Test"),
    new RateLimitError(),
    new ExternalServiceError("Test", "Test"),
    new InsufficientCreditsError(100, 50),
  ];

  for (const error of errors) {
    assertInstanceOf(error, AppError);
    assertInstanceOf(error, Error);
  }
});
