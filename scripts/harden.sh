#!/usr/bin/env bash
# ============================================================================
# WINDY PRO MOBILE — HARDENING SCRIPT
# Run this from the windy-pro-mobile repo root on any machine.
# Usage: bash harden-windy-pro-mobile.sh [--fix]
#   --fix  Auto-fix what can be fixed (formatting, deps, etc.)
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

FIX=false
[[ "${1:-}" == "--fix" ]] && FIX=true

PASS=0
WARN=0
FAIL=0
FIXES=0

pass()  { PASS=$((PASS+1)); echo -e "  ${GREEN}✅ PASS${NC} — $1"; }
warn()  { WARN=$((WARN+1)); echo -e "  ${YELLOW}⚠️  WARN${NC} — $1"; }
fail()  { FAIL=$((FAIL+1)); echo -e "  ${RED}❌ FAIL${NC} — $1"; }
fixed() { FIXES=$((FIXES+1)); echo -e "  ${BLUE}🔧 FIXED${NC} — $1"; }
section() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   WINDY PRO MOBILE — HARDENING AUDIT       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo "  Repo: $(pwd)"
echo "  Date: $(date '+%Y-%m-%d %H:%M %Z')"
echo "  Mode: $( $FIX && echo 'FIX (auto-repair)' || echo 'AUDIT (read-only)' )"

# ── 1. GIT HEALTH ──────────────────────────────────────────────────────────
section "1. GIT HEALTH"

if git rev-parse --is-inside-work-tree &>/dev/null; then
  pass "Inside a git repo"
else
  fail "Not a git repo!"
  exit 1
fi

BRANCH=$(git branch --show-current)
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  pass "On branch: $BRANCH"
else
  warn "On branch '$BRANCH' — expected main/master"
fi

if git remote get-url origin &>/dev/null; then
  REMOTE=$(git remote get-url origin)
  pass "Remote origin: $REMOTE"
else
  fail "No remote origin configured"
fi

DIRTY=$(git status --porcelain | wc -l)
if [[ "$DIRTY" -eq 0 ]]; then
  pass "Working tree clean"
else
  warn "$DIRTY uncommitted change(s)"
  git status --porcelain | head -10
fi

LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null || echo "unknown")
if [[ "$LOCAL" == "$REMOTE_HEAD" ]]; then
  pass "In sync with remote"
elif [[ "$REMOTE_HEAD" == "unknown" ]]; then
  warn "Can't determine remote HEAD — run 'git fetch' first"
else
  fail "Out of sync with remote! Local: ${LOCAL:0:7}, Remote: ${REMOTE_HEAD:0:7}"
  if $FIX; then
    git pull origin "$BRANCH" && fixed "Pulled latest from origin"
  fi
fi

# ── 2. DEPENDENCY HEALTH ──────────────────────────────────────────────────
section "2. DEPENDENCY HEALTH"

if [[ -f package-lock.json ]]; then
  pass "package-lock.json exists"
else
  fail "No package-lock.json — builds won't be reproducible"
fi

if [[ -d node_modules ]]; then
  pass "node_modules present"
else
  warn "node_modules missing — run 'npm install'"
  if $FIX; then
    npm install && fixed "Installed dependencies"
  fi
fi

# Check for known vulnerability scan
if command -v npm &>/dev/null; then
  AUDIT_OUT=$(npm audit --json 2>/dev/null || true)
  CRITICAL=$(echo "$AUDIT_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('metadata',{}).get('vulnerabilities',{}).get('critical',0))" 2>/dev/null || echo "?")
  HIGH=$(echo "$AUDIT_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('metadata',{}).get('vulnerabilities',{}).get('high',0))" 2>/dev/null || echo "?")
  if [[ "$CRITICAL" == "0" && "$HIGH" == "0" ]]; then
    pass "No critical/high npm vulnerabilities"
  elif [[ "$CRITICAL" == "?" ]]; then
    warn "Could not parse npm audit output"
  else
    fail "npm audit: $CRITICAL critical, $HIGH high vulnerabilities"
    if $FIX; then
      npm audit fix --force 2>/dev/null && fixed "Ran npm audit fix --force" || warn "npm audit fix failed — manual review needed"
    fi
  fi
fi

# Expo-specific checks
if [[ -f app.json ]] || [[ -f app.config.js ]] || [[ -f app.config.ts ]]; then
  pass "Expo app config found"
else
  warn "No app.json / app.config — Expo may not build correctly"
fi

# ── 3. SECRETS & SECURITY ────────────────────────────────────────────────
section "3. SECRETS & SECURITY"

if [[ -f .gitignore ]]; then
  pass ".gitignore exists"
  for pattern in ".env" "node_modules" "*.pem" "*.key" "*.keystore" "*.jks" "google-services.json" "GoogleService-Info.plist"; do
    if grep -q "$pattern" .gitignore 2>/dev/null; then
      pass ".gitignore covers: $pattern"
    else
      warn ".gitignore missing pattern: $pattern"
      if $FIX; then
        echo "$pattern" >> .gitignore && fixed "Added '$pattern' to .gitignore"
      fi
    fi
  done
else
  fail "No .gitignore!"
fi

# Check for leaked secrets
echo "  Scanning for potential secrets in tracked files..."
SECRET_HITS=$(git grep -lE '(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36}|password\s*[:=]\s*["\x27][^"\x27]{8,})' -- '*.js' '*.ts' '*.tsx' '*.json' '*.py' 2>/dev/null | grep -v node_modules | grep -v package-lock || true)
if [[ -z "$SECRET_HITS" ]]; then
  pass "No obvious secrets found in tracked files"
else
  fail "Potential secrets found in:"
  echo "$SECRET_HITS" | head -10
fi

# Check for .env files committed
ENV_FILES=$(git ls-files | grep -E '^\.env' || true)
if [[ -z "$ENV_FILES" ]]; then
  pass "No .env files tracked in git"
else
  fail "Tracked .env files (should be gitignored): $ENV_FILES"
fi

# Android signing checks
if git ls-files | grep -qE '\.(keystore|jks)$'; then
  fail "Signing keystore tracked in git — REMOVE IT (use env vars or CI secrets)"
else
  pass "No signing keystores tracked in git"
fi

# ── 4. BUILD HEALTH ─────────────────────────────────────────────────────
section "4. BUILD HEALTH"

if [[ -f package.json ]]; then
  for script in "start" "test" "lint"; do
    if python3 -c "import json; d=json.load(open('package.json')); assert '$script' in d.get('scripts',{})" 2>/dev/null; then
      pass "Script defined: $script"
    else
      warn "Missing script: $script"
    fi
  done

  # EAS build profiles
  for script in "build:dev" "build:preview" "build:prod"; do
    if python3 -c "import json; d=json.load(open('package.json')); assert '$script' in d.get('scripts',{})" 2>/dev/null; then
      pass "EAS script defined: $script"
    else
      warn "Missing EAS script: $script"
    fi
  done
fi

# Check EAS config
if [[ -f eas.json ]]; then
  pass "eas.json exists (EAS Build config)"
else
  warn "No eas.json — EAS Build won't know your build profiles"
fi

# ── 5. ANDROID HEALTH ──────────────────────────────────────────────────
section "5. ANDROID"

if [[ -d android ]]; then
  pass "android/ directory exists"

  # Check gradle wrapper
  if [[ -f android/gradle/wrapper/gradle-wrapper.jar ]]; then
    pass "Gradle wrapper present"
  else
    warn "Gradle wrapper missing — Android build may fail"
  fi

  # Check AndroidManifest
  if [[ -f android/app/src/main/AndroidManifest.xml ]]; then
    pass "AndroidManifest.xml exists"
    
    # Check for debug flags in manifest
    if grep -q 'android:debuggable="true"' android/app/src/main/AndroidManifest.xml 2>/dev/null; then
      fail "android:debuggable=true in manifest — remove for production!"
    else
      pass "No debug flag in manifest"
    fi

    # Check for cleartext traffic
    if grep -q 'android:usesCleartextTraffic="true"' android/app/src/main/AndroidManifest.xml 2>/dev/null; then
      warn "usesCleartextTraffic=true — OK for dev, remove for prod"
    else
      pass "Cleartext traffic not enabled"
    fi
  else
    fail "AndroidManifest.xml missing!"
  fi

  # Check for local.properties (should be gitignored)
  if git ls-files | grep -q 'android/local.properties'; then
    fail "android/local.properties is tracked — should be gitignored"
  else
    pass "local.properties not tracked"
  fi
else
  warn "No android/ directory — run 'npx expo prebuild' to generate"
fi

# ── 6. iOS HEALTH ──────────────────────────────────────────────────────
section "6. iOS"

if [[ -d ios ]]; then
  pass "ios/ directory exists"

  # Check for Podfile
  if [[ -f ios/Podfile ]]; then
    pass "Podfile exists"
  else
    warn "No Podfile — CocoaPods dependencies won't resolve"
  fi

  # Check Pods not committed (they shouldn't be usually)
  if git ls-files | grep -q '^ios/Pods/'; then
    warn "ios/Pods/ is tracked in git — consider gitignoring for smaller repo"
  else
    pass "ios/Pods/ not tracked (good)"
  fi
else
  warn "No ios/ directory — run 'npx expo prebuild' to generate"
fi

# ── 7. TEST HEALTH ──────────────────────────────────────────────────────
section "7. TESTS"

TEST_COUNT=$(find src -path '*__tests__*' -name '*.test.*' 2>/dev/null | wc -l)
if [[ "$TEST_COUNT" -gt 0 ]]; then
  pass "$TEST_COUNT test file(s) found"
else
  fail "No test files found in src/"
fi

# Run tests if jest available
if command -v npx &>/dev/null && [[ -f node_modules/.bin/jest ]]; then
  echo "  Running jest..."
  if npx jest --passWithNoTests --forceExit --silent 2>/dev/null; then
    pass "All tests passing"
  else
    fail "Some tests failed — check output above"
  fi
else
  warn "jest not available locally — can't run tests"
fi

# ── 8. TYPESCRIPT ────────────────────────────────────────────────────────
section "8. TYPESCRIPT"

if [[ -f tsconfig.json ]]; then
  pass "tsconfig.json exists"
  
  # Check strict mode
  if grep -q '"strict"' tsconfig.json 2>/dev/null; then
    pass "TypeScript strict mode configured"
  else
    warn "No 'strict' in tsconfig — consider enabling for better type safety"
  fi
else
  warn "No tsconfig.json — not using TypeScript?"
fi

# ── 9. DOCUMENTATION ────────────────────────────────────────────────────
section "9. DOCUMENTATION"

for doc in README.md LICENSE CHANGELOG.md; do
  if [[ -f "$doc" ]]; then
    pass "$doc exists"
  else
    warn "Missing: $doc"
  fi
done

# ── 10. CI/CD ───────────────────────────────────────────────────────────
section "10. CI/CD"

if [[ -d .github/workflows ]]; then
  WF_COUNT=$(ls .github/workflows/*.yml 2>/dev/null | wc -l)
  pass "$WF_COUNT GitHub Actions workflow(s) found"
else
  warn "No .github/workflows/ — no CI/CD configured"
fi

# ── 11. CROSS-REPO SYNC CHECK ──────────────────────────────────────────
section "11. FLEET SYNC"

CURRENT_COMMIT=$(git rev-parse --short HEAD)
echo "  Current commit: $CURRENT_COMMIT"
echo "  Checking GitHub latest..."
if command -v gh &>/dev/null; then
  GH_LATEST=$(gh api repos/sneakyfree/windy-pro-mobile/commits?per_page=1 --jq '.[0].sha' 2>/dev/null | head -c 7 || echo "?")
  if [[ "$GH_LATEST" == "?" ]]; then
    warn "Can't reach GitHub to verify sync"
  elif [[ "$CURRENT_COMMIT" == "$GH_LATEST" ]]; then
    pass "In sync with GitHub ($CURRENT_COMMIT)"
  else
    fail "OUT OF SYNC — Local: $CURRENT_COMMIT, GitHub: $GH_LATEST"
    echo "  Run: git pull origin main"
  fi
else
  warn "gh CLI not available — can't check GitHub sync"
fi

# ── SUMMARY ─────────────────────────────────────────────────────────────
section "SUMMARY"
echo ""
echo -e "  ${GREEN}✅ Passed: $PASS${NC}"
echo -e "  ${YELLOW}⚠️  Warnings: $WARN${NC}"
echo -e "  ${RED}❌ Failed: $FAIL${NC}"
if $FIX; then
  echo -e "  ${BLUE}🔧 Fixed: $FIXES${NC}"
fi
echo ""

if [[ "$FAIL" -eq 0 ]]; then
  echo -e "  ${GREEN}🎉 REPO IS HEALTHY${NC}"
  exit 0
elif [[ "$FAIL" -le 3 ]]; then
  echo -e "  ${YELLOW}⚠️  REPO NEEDS MINOR ATTENTION${NC}"
  exit 1
else
  echo -e "  ${RED}🚨 REPO NEEDS SERIOUS HARDENING${NC}"
  exit 2
fi
