#!/bin/bash
#
# Test script for GitHub webhook endpoints
# Simulates PR events to test the reconciliation flow
#
# Usage: ./scripts/test-github-webhook.sh [base_url]
# Default base_url: http://localhost:3002

set -e

BASE_URL="${1:-http://localhost:3002}"
WEBHOOK_ENDPOINT="${BASE_URL}/api/github/webhook"

# Generate HMAC signature for webhook verification
# Usage: generate_signature <payload> <secret>
generate_signature() {
  local payload="$1"
  local secret="$2"
  local hash=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$secret" | awk '{print $NF}')
  echo "sha256=$hash"
}

# Send webhook request
# Usage: send_webhook <event_type> <payload> <signature>
send_webhook() {
  local event_type="$1"
  local payload="$2"
  local signature="$3"

  HTTP_CODE=$(curl -s -o /tmp/webhook_response.txt -w "%{http_code}" -X POST "$WEBHOOK_ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "X-GitHub-Event: $event_type" \
    -H "X-Hub-Signature-256: $signature" \
    -d "$payload")

  BODY=$(cat /tmp/webhook_response.txt)

  echo "Response: $HTTP_CODE"
  echo "Body: $BODY"
  echo ""
}

# Default secret - should match GITHUB_WEBHOOK_SECRET env var
WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-test-webhook-secret}"

echo "=============================================="
echo "GitHub Webhook Test Suite"
echo "=============================================="
echo "Target: $WEBHOOK_ENDPOINT"
echo "Secret: ${WEBHOOK_SECRET:0:10}..."
echo ""

# -----------------------------------------------------------------------------
# Test 1: PR Opened (targeting staging branch)
# -----------------------------------------------------------------------------
echo "Test 1: PR Opened (to staging)"
echo "----------------------------------------------"

PR_OPENED_PAYLOAD=$(cat <<'EOF'
{
  "action": "opened",
  "number": 9999,
  "pull_request": {
    "number": 9999,
    "title": "fix: resolve authentication timeout issue (ENG-1234)",
    "body": "## Summary\nThis PR fixes the authentication timeout issue reported in ENG-1234.\n\n## Changes\n- Extended token TTL\n- Added retry logic\n\n## Test Plan\n- Verified locally\n- Added unit tests",
    "html_url": "https://github.com/yourorg/yourrepo/pull/9999",
    "state": "open",
    "merged": false,
    "merged_at": null,
    "head": {
      "ref": "fix/eng-1234-auth-timeout",
      "sha": "abc123def456"
    },
    "base": {
      "ref": "staging"
    },
    "user": {
      "login": "test-developer"
    }
  },
  "repository": {
    "full_name": "yourorg/yourrepo",
    "owner": {
      "login": "yourorg"
    },
    "name": "yourrepo"
  }
}
EOF
)

SIGNATURE=$(generate_signature "$PR_OPENED_PAYLOAD" "$WEBHOOK_SECRET")
send_webhook "pull_request" "$PR_OPENED_PAYLOAD" "$SIGNATURE"

# -----------------------------------------------------------------------------
# Test 2: PR Merged (to staging)
# -----------------------------------------------------------------------------
echo "Test 2: PR Merged (to staging)"
echo "----------------------------------------------"

PR_MERGED_STAGING_PAYLOAD=$(cat <<'EOF'
{
  "action": "closed",
  "number": 9999,
  "pull_request": {
    "number": 9999,
    "title": "fix: resolve authentication timeout issue (ENG-1234)",
    "body": "## Summary\nThis PR fixes the authentication timeout issue reported in ENG-1234.",
    "html_url": "https://github.com/yourorg/yourrepo/pull/9999",
    "state": "closed",
    "merged": true,
    "merged_at": "2025-01-15T10:30:00Z",
    "head": {
      "ref": "fix/eng-1234-auth-timeout",
      "sha": "abc123def456"
    },
    "base": {
      "ref": "staging"
    },
    "user": {
      "login": "test-developer"
    }
  },
  "repository": {
    "full_name": "yourorg/yourrepo",
    "owner": {
      "login": "yourorg"
    },
    "name": "yourrepo"
  }
}
EOF
)

SIGNATURE=$(generate_signature "$PR_MERGED_STAGING_PAYLOAD" "$WEBHOOK_SECRET")
send_webhook "pull_request" "$PR_MERGED_STAGING_PAYLOAD" "$SIGNATURE"

# -----------------------------------------------------------------------------
# Test 3: Release PR Merged (staging -> main)
# -----------------------------------------------------------------------------
echo "Test 3: Release PR Merged (staging -> main)"
echo "----------------------------------------------"

RELEASE_PR_PAYLOAD=$(cat <<'EOF'
{
  "action": "closed",
  "number": 10000,
  "pull_request": {
    "number": 10000,
    "title": "Release: Deploy staging to production",
    "body": "## Release Notes\n\nThis release includes:\n- ENG-1234: Auth timeout fix\n- ENG-1235: Performance improvements\n- ENG-1236: Bug fixes",
    "html_url": "https://github.com/yourorg/yourrepo/pull/10000",
    "state": "closed",
    "merged": true,
    "merged_at": "2025-01-16T14:00:00Z",
    "head": {
      "ref": "staging",
      "sha": "staging123"
    },
    "base": {
      "ref": "main"
    },
    "user": {
      "login": "release-manager"
    }
  },
  "repository": {
    "full_name": "yourorg/yourrepo",
    "owner": {
      "login": "yourorg"
    },
    "name": "yourrepo"
  }
}
EOF
)

SIGNATURE=$(generate_signature "$RELEASE_PR_PAYLOAD" "$WEBHOOK_SECRET")
send_webhook "pull_request" "$RELEASE_PR_PAYLOAD" "$SIGNATURE"

# -----------------------------------------------------------------------------
# Test 4: PR Closed (not merged)
# -----------------------------------------------------------------------------
echo "Test 4: PR Closed (not merged)"
echo "----------------------------------------------"

PR_CLOSED_PAYLOAD=$(cat <<'EOF'
{
  "action": "closed",
  "number": 9998,
  "pull_request": {
    "number": 9998,
    "title": "feat: abandoned feature",
    "body": "This feature was abandoned",
    "html_url": "https://github.com/yourorg/yourrepo/pull/9998",
    "state": "closed",
    "merged": false,
    "merged_at": null,
    "head": {
      "ref": "feat/abandoned",
      "sha": "abandoned123"
    },
    "base": {
      "ref": "staging"
    },
    "user": {
      "login": "test-developer"
    }
  },
  "repository": {
    "full_name": "yourorg/yourrepo",
    "owner": {
      "login": "yourorg"
    },
    "name": "yourrepo"
  }
}
EOF
)

SIGNATURE=$(generate_signature "$PR_CLOSED_PAYLOAD" "$WEBHOOK_SECRET")
send_webhook "pull_request" "$PR_CLOSED_PAYLOAD" "$SIGNATURE"

# -----------------------------------------------------------------------------
# Test 5: PR Edited
# -----------------------------------------------------------------------------
echo "Test 5: PR Edited"
echo "----------------------------------------------"

PR_EDITED_PAYLOAD=$(cat <<'EOF'
{
  "action": "edited",
  "number": 9999,
  "pull_request": {
    "number": 9999,
    "title": "fix: resolve authentication timeout issue (ENG-1234) - Updated",
    "body": "## Summary\nUpdated description with more details.\n\nFixes ENG-1234",
    "html_url": "https://github.com/yourorg/yourrepo/pull/9999",
    "state": "open",
    "merged": false,
    "merged_at": null,
    "head": {
      "ref": "fix/eng-1234-auth-timeout",
      "sha": "abc123def456"
    },
    "base": {
      "ref": "staging"
    },
    "user": {
      "login": "test-developer"
    }
  },
  "repository": {
    "full_name": "yourorg/yourrepo",
    "owner": {
      "login": "yourorg"
    },
    "name": "yourrepo"
  }
}
EOF
)

SIGNATURE=$(generate_signature "$PR_EDITED_PAYLOAD" "$WEBHOOK_SECRET")
send_webhook "pull_request" "$PR_EDITED_PAYLOAD" "$SIGNATURE"

# -----------------------------------------------------------------------------
# Test 6: Non-PR event (should be ignored)
# -----------------------------------------------------------------------------
echo "Test 6: Non-PR event (push - should be ignored)"
echo "----------------------------------------------"

PUSH_PAYLOAD=$(cat <<'EOF'
{
  "ref": "refs/heads/main",
  "before": "abc123",
  "after": "def456",
  "repository": {
    "full_name": "yourorg/yourrepo"
  }
}
EOF
)

SIGNATURE=$(generate_signature "$PUSH_PAYLOAD" "$WEBHOOK_SECRET")
send_webhook "push" "$PUSH_PAYLOAD" "$SIGNATURE"

# -----------------------------------------------------------------------------
# Test 7: Invalid signature
# -----------------------------------------------------------------------------
echo "Test 7: Invalid signature (should fail with 401)"
echo "----------------------------------------------"

HTTP_CODE=$(curl -s -o /tmp/webhook_response.txt -w "%{http_code}" -X POST "$WEBHOOK_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-Hub-Signature-256: sha256=invalid_signature" \
  -d "$PR_OPENED_PAYLOAD")

BODY=$(cat /tmp/webhook_response.txt)

echo "Response: $HTTP_CODE (expected: 401)"
echo "Body: $BODY"
echo ""

# -----------------------------------------------------------------------------
# Test 8: PR Reopened
# -----------------------------------------------------------------------------
echo "Test 8: PR Reopened"
echo "----------------------------------------------"

PR_REOPENED_PAYLOAD=$(cat <<'EOF'
{
  "action": "reopened",
  "number": 9999,
  "pull_request": {
    "number": 9999,
    "title": "fix: resolve authentication timeout issue (ENG-1234)",
    "body": "Reopening this PR after addressing review comments",
    "html_url": "https://github.com/yourorg/yourrepo/pull/9999",
    "state": "open",
    "merged": false,
    "merged_at": null,
    "head": {
      "ref": "fix/eng-1234-auth-timeout",
      "sha": "newcommit789"
    },
    "base": {
      "ref": "staging"
    },
    "user": {
      "login": "test-developer"
    }
  },
  "repository": {
    "full_name": "yourorg/yourrepo",
    "owner": {
      "login": "yourorg"
    },
    "name": "yourrepo"
  }
}
EOF
)

SIGNATURE=$(generate_signature "$PR_REOPENED_PAYLOAD" "$WEBHOOK_SECRET")
send_webhook "pull_request" "$PR_REOPENED_PAYLOAD" "$SIGNATURE"

# -----------------------------------------------------------------------------
# Cleanup
# -----------------------------------------------------------------------------
rm -f /tmp/webhook_response.txt

echo "=============================================="
echo "Test Suite Complete"
echo "=============================================="
