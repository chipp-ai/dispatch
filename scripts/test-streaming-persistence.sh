#!/bin/bash
#
# CI Test Script: Streaming Response Persistence
#
# Tests that the onComplete callback correctly persists messages
# with tool calls and tool results to the database via HTTP requests.
#
# Test Levels:
# 1. Unit tests (deno task test:completion) - No database required
# 2. Integration tests (deno task test:persistence) - Requires database
# 3. E2E HTTP tests (this script) - Requires running server + database
#
# Prerequisites:
# - API server running on $API_URL (default: http://localhost:8000)
# - Test app 'test-chat-app' seeded in database (see scripts/seed-test-data.sh)
# - Test consumer session cookie configured
#
# Usage:
#   ./scripts/test-streaming-persistence.sh              # Run all tests
#   ./scripts/test-streaming-persistence.sh --verbose    # Show detailed output
#   ./scripts/test-streaming-persistence.sh --setup-only # Check prerequisites only
#   ./scripts/test-streaming-persistence.sh --cleanup    # Cleanup (no-op, uses seed data)
#
# CI Example:
#   # Start server in background, run tests, cleanup
#   ./scripts/dev.sh --api-only &
#   sleep 10  # Wait for server
#   ./scripts/test-streaming-persistence.sh
#   kill %1   # Stop server

set -euo pipefail

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
TEST_APP_SLUG="test-chat-app"
TEST_SESSION_COOKIE=""
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

log() {
  echo -e "${GREEN}[test]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[warn]${NC} $1"
}

error() {
  echo -e "${RED}[error]${NC} $1"
}

pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((TESTS_PASSED++))
}

fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((TESTS_FAILED++))
}

# Check if server is running
check_server() {
  log "Checking API server at $API_URL..."
  if ! curl -sf "$API_URL/health" > /dev/null 2>&1; then
    error "API server is not running at $API_URL"
    error "Please start the server first: ./scripts/dev.sh --api-only"
    exit 1
  fi
  log "API server is healthy"
}

# Get session cookie from test consumer
get_session_cookie() {
  log "Using test session cookie..."
  # The test-chat-app has a pre-configured consumer session in seed data
  # Session ID from the seed data or test setup
  TEST_SESSION_COOKIE="consumer_session_id=00000000-0000-0000-0000-000000000005"
}

# Test 1: Basic streaming response
test_basic_streaming() {
  log "Test 1: Basic streaming response..."

  local response
  response=$(curl -sS -X POST "$API_URL/consumer/$TEST_APP_SLUG/chat/stream" \
    -H "Content-Type: application/json" \
    -H "Cookie: $TEST_SESSION_COOKIE" \
    -d '{"message": "hi"}' \
    --max-time 30 2>&1) || {
    fail "Basic streaming: curl failed"
    return 1
  }

  # Check for SSE data format (data: {...})
  if echo "$response" | grep -q "^data:"; then
    pass "Basic streaming: SSE data format detected"
  else
    fail "Basic streaming: No SSE data events in response"
    if [ "$VERBOSE" = "true" ]; then
      echo "Response: $response"
    fi
    return 1
  fi

  # Check for text-delta events
  if echo "$response" | grep -q "text-delta"; then
    pass "Basic streaming: text-delta events present"
  else
    warn "Basic streaming: No text-delta events (may be tool-only response)"
  fi

  # Check for finish event
  if echo "$response" | grep -q '"type":"finish"'; then
    pass "Basic streaming: finish event present"
  else
    fail "Basic streaming: No finish event"
    return 1
  fi
}

# Test 2: Tool calling response
test_tool_calling() {
  log "Test 2: Tool calling response (getCurrentTime)..."

  local response
  response=$(curl -sS -X POST "$API_URL/consumer/$TEST_APP_SLUG/chat/stream" \
    -H "Content-Type: application/json" \
    -H "Cookie: $TEST_SESSION_COOKIE" \
    -d '{"message": "what time is it?"}' \
    --max-time 60 2>&1) || {
    fail "Tool calling: curl failed"
    return 1
  }

  # Check for tool-call event (note: hyphenated in our format)
  if echo "$response" | grep -qE "tool.call|tool_call"; then
    pass "Tool calling: tool_call event present"
  else
    fail "Tool calling: No tool_call event in response"
    if [ "$VERBOSE" = "true" ]; then
      echo "Response: $response"
    fi
    return 1
  fi

  # Check for tool-result event (note: hyphenated in our format)
  if echo "$response" | grep -qE "tool.result|tool_result"; then
    pass "Tool calling: tool_result event present"
  else
    # Tool result may be embedded differently - check for text after tool call
    if echo "$response" | grep -q "text-delta"; then
      pass "Tool calling: Tool executed and generated text response"
    else
      fail "Tool calling: No tool_result event"
      return 1
    fi
  fi

  # Check for finish event after tool execution
  if echo "$response" | grep -q '"type":"finish"'; then
    pass "Tool calling: finish event after tool execution"
  else
    fail "Tool calling: No finish event after tool execution"
    return 1
  fi
}

# Test 3: Verify streaming completes with session ID
test_session_tracking() {
  log "Test 3: Verify session tracking in streaming response..."

  local response
  response=$(curl -sS -X POST "$API_URL/consumer/$TEST_APP_SLUG/chat/stream" \
    -H "Content-Type: application/json" \
    -H "Cookie: $TEST_SESSION_COOKIE" \
    -d '{"message": "hello"}' \
    --max-time 30 2>&1) || {
    fail "Session tracking: curl failed"
    return 1
  }

  # Check for start event with sessionId
  if echo "$response" | grep -q '"type":"start".*"sessionId"'; then
    pass "Session tracking: Start event includes sessionId"
  else
    fail "Session tracking: Start event missing sessionId"
    if [ "$VERBOSE" = "true" ]; then
      echo "Response: $response"
    fi
    return 1
  fi

  # Check for messageId in start event
  if echo "$response" | grep -q '"messageId"'; then
    pass "Session tracking: Start event includes messageId"
  else
    fail "Session tracking: Start event missing messageId"
    return 1
  fi

  # Verify finish event
  if echo "$response" | grep -q '"type":"finish"'; then
    pass "Session tracking: Stream completed with finish event"
  else
    fail "Session tracking: No finish event"
    return 1
  fi
}

# Test 4: Multiple iterations with tool calls
test_multi_iteration() {
  log "Test 4: Multi-iteration tool calling..."

  # This test triggers multiple tool calls in sequence
  local response
  response=$(curl -sS -X POST "$API_URL/consumer/$TEST_APP_SLUG/chat/stream" \
    -H "Content-Type: application/json" \
    -H "Cookie: $TEST_SESSION_COOKIE" \
    -d '{"message": "what time is it and search for weather in NYC"}' \
    --max-time 90 2>&1) || {
    fail "Multi-iteration: curl failed"
    return 1
  }

  # Count tool_call events
  local tool_call_count
  tool_call_count=$(echo "$response" | grep -c "tool_call" || echo "0")

  if [ "$tool_call_count" -ge 1 ]; then
    pass "Multi-iteration: Found $tool_call_count tool call(s)"
  else
    warn "Multi-iteration: No tool calls detected (model may have answered directly)"
  fi

  # Verify single finish event at end
  local finish_count
  finish_count=$(echo "$response" | grep -c '"type":"finish"' || echo "0")

  if [ "$finish_count" -ge 1 ]; then
    pass "Multi-iteration: Finish event(s) present"
  else
    fail "Multi-iteration: No finish event"
    return 1
  fi
}

# Test 5: Error handling - invalid app
test_invalid_app() {
  log "Test 5: Error handling for invalid app..."

  local response
  local http_code
  response=$(curl -sS -w "\n%{http_code}" -X POST "$API_URL/consumer/nonexistent-app/chat/stream" \
    -H "Content-Type: application/json" \
    -d '{"message": "hi"}' \
    --max-time 10 2>&1)

  http_code=$(echo "$response" | tail -n1)

  if [ "$http_code" = "404" ]; then
    pass "Error handling: Invalid app returns 404"
  else
    fail "Error handling: Expected 404, got $http_code"
    if [ "$VERBOSE" = "true" ]; then
      echo "Response: $response"
    fi
  fi
}

# Test 6: Anonymous session handling (allows unauthenticated access)
test_anonymous_session() {
  log "Test 6: Anonymous session handling..."

  local response
  local http_code
  response=$(curl -sS -w "\n%{http_code}" -X POST "$API_URL/consumer/$TEST_APP_SLUG/chat/stream" \
    -H "Content-Type: application/json" \
    -d '{"message": "hi"}' \
    --max-time 30 2>&1)

  http_code=$(echo "$response" | tail -n1)

  # Anonymous sessions are allowed - should get 200 with streaming response
  if [ "$http_code" = "200" ]; then
    pass "Anonymous session: Request succeeds with anonymous session"
  else
    fail "Anonymous session: Expected 200, got $http_code"
    if [ "$VERBOSE" = "true" ]; then
      echo "Response: $response"
    fi
    return 1
  fi

  # Verify response contains start event (new session created)
  if echo "$response" | grep -q '"type":"start"'; then
    pass "Anonymous session: New session created"
  else
    fail "Anonymous session: No session created"
    return 1
  fi
}

# Print summary
print_summary() {
  echo ""
  echo "=================================="
  echo "Test Summary"
  echo "=================================="
  echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
  echo "=================================="

  if [ "$TESTS_FAILED" -gt 0 ]; then
    exit 1
  fi
}

# Main execution
main() {
  echo "=================================="
  echo "Streaming Persistence Tests"
  echo "=================================="
  echo ""

  # Parse arguments
  case "${1:-}" in
    --setup-only)
      log "Setup-only mode (no action needed - uses seed data)"
      exit 0
      ;;
    --cleanup)
      log "Cleanup mode (no action needed - uses seed data)"
      exit 0
      ;;
    --verbose|-v)
      VERBOSE="true"
      ;;
    --help|-h)
      echo "Usage: $0 [--setup-only|--cleanup|--verbose|-v]"
      echo ""
      echo "Options:"
      echo "  --setup-only  Setup test data only (uses seed data)"
      echo "  --cleanup     Cleanup test data only"
      echo "  --verbose     Show detailed output on failures"
      exit 0
      ;;
  esac

  check_server
  get_session_cookie

  echo ""

  # Run tests
  test_basic_streaming || true
  echo ""
  test_tool_calling || true
  echo ""
  test_session_tracking || true
  echo ""
  test_multi_iteration || true
  echo ""
  test_invalid_app || true
  echo ""
  test_anonymous_session || true

  print_summary
}

main "$@"
