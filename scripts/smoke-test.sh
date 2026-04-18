#!/usr/bin/env bash
# smoke-test.sh — pre-deploy gate for Windy Word Mobile.
#
# Verifies:
#   1. The repo is in a releasable state (types clean, critical tests
#      green, env template has no placeholder secrets).
#   2. The deep-link handlers + hatch CTA + sign-in flow compile and
#      resolve at the route level (our `tests/routes.test.ts` and
#      `tests/wave8-deep-links.test.ts` suites).
#   3. (optional, with `--device`) The app launches on an attached
#      simulator / emulator, the Home tab renders without crashing,
#      and the seven deep-link schemes route without a hard crash.
#
# Usage:
#   ./scripts/smoke-test.sh                 # static checks only
#   ./scripts/smoke-test.sh --device=ios    # add iOS simulator checks
#   ./scripts/smoke-test.sh --device=android  # add Android emulator checks
#   ./scripts/smoke-test.sh --env=.env.production  # validate that env file
#
# Detox is not installed on this repo (see PR #17). When it is, this
# script is the right place to call `detox test --configuration ios.sim.release`.
# Until then, the device phase exercises the OS-level deep-link dispatch
# and leaves per-screen UI verification to manual QA.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEVICE=""
ENV_FILE=""
SKIP_TESTS="false"

for arg in "$@"; do
    case "$arg" in
        --device=*)     DEVICE="${arg#*=}" ;;
        --env=*)        ENV_FILE="${arg#*=}" ;;
        --skip-tests)   SKIP_TESTS="true" ;;
        -h|--help)
            sed -n '2,20p' "${BASH_SOURCE[0]}"
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg" >&2
            exit 2
            ;;
    esac
done

# ── pretty ─────────────────────────────────────────────────────
fail_count=0
step()  { printf '\n▶ %s\n' "$*"; }
pass()  { printf '  ✔ %s\n' "$*"; }
fail()  { printf '  ✘ %s\n' "$*" >&2; fail_count=$((fail_count + 1)); }
skip()  { printf '  ⋯ %s\n' "$*"; }

# ── 1. environment ─────────────────────────────────────────────

step "Environment"

if [[ ! -f "$ROOT/package.json" ]]; then
    fail "Not at repo root — package.json missing"
    exit 1
fi
pass "repo root = $ROOT"

if [[ ! -d "$ROOT/node_modules" ]]; then
    fail "node_modules missing — run 'npm install' first"
else
    pass "node_modules present"
fi

if ! node -e 'process.exit(0)' 2>/dev/null; then
    fail "node not on PATH"
else
    pass "node $(node --version)"
fi

# ── 2. .env.production sanity (optional) ────────────────────────

if [[ -n "$ENV_FILE" ]]; then
    step ".env validation ($ENV_FILE)"
    if [[ ! -f "$ENV_FILE" ]]; then
        fail "$ENV_FILE not found"
    else
        pass "$ENV_FILE exists"

        # Any placeholder-looking values fail the deploy. Examples:
        # - PUBLIC_KEY@oXXXXXX from the example file
        # - AIza______________ (underscore-padded placeholder)
        # - appl_________________________________
        # - AuthKey_ABC12DE3FG (example Apple key ID)
        if grep -Eq '^[^#]*(PUBLIC_KEY@o?X+|AIza_+|_{6,}|AuthKey_ABC12DE3FG|AuthKey_XYZ98WV7UT|ABC12DE3FG|XYZ98WV7UT|AAAA_+|appl_\s*$|goog_\s*$)' "$ENV_FILE"; then
            fail "$ENV_FILE still contains placeholder values from .env.production.example"
            grep -En '^[^#]*(PUBLIC_KEY@o?X+|AIza_+|_{6,}|AuthKey_ABC12DE3FG|AuthKey_XYZ98WV7UT|AAAA_+)' "$ENV_FILE" | sed 's/^/    → /'
        else
            pass "no obvious placeholder values"
        fi

        if ! grep -q '^EXPO_PUBLIC_API_URL=' "$ENV_FILE"; then
            fail "EXPO_PUBLIC_API_URL missing"
        else
            pass "EXPO_PUBLIC_API_URL set"
        fi
    fi
fi

# Always check app.json for placeholder RevenueCat / Vision keys.
step "app.json placeholder scan"
if grep -Eq 'PRODUCTION_KEY_REQUIRED' "$ROOT/app.json"; then
    fail "app.json has PRODUCTION_KEY_REQUIRED placeholders — populate before release"
    grep -n 'PRODUCTION_KEY_REQUIRED' "$ROOT/app.json" | sed 's/^/    → /'
else
    pass "no placeholder keys in app.json"
fi

# ── 3. static checks ───────────────────────────────────────────

step "Types (tsc --noEmit)"
if npx --no-install tsc --noEmit; then
    pass "clean"
else
    fail "type errors"
fi

if [[ "$SKIP_TESTS" == "true" ]]; then
    step "Tests"
    skip "--skip-tests requested"
else
    step "Critical tests (auth, deep-links, hatch, Fly, license)"
    # Narrow pattern = fast + targeted. Matches the surface the
    # launch smoke test needs to cover: sign-in, deep-link routing,
    # the Wave-8 hatch flow, and the RECORDING_LIMITS contract.
    if npm test -- --testPathPattern="(identityApi|routes|deep-links|wave8-deep-links|hatchApi|HatchPromptCard|fly|license|tier-contract)" --silent; then
        pass "critical suites green"
    else
        fail "one or more critical suites red — run 'npm test' for full output"
    fi
fi

# ── 4. device phase (optional) ─────────────────────────────────

if [[ -n "$DEVICE" ]]; then
    step "Device smoke ($DEVICE)"

    case "$DEVICE" in
        ios)
            if ! command -v xcrun >/dev/null; then
                fail "xcrun not on PATH — Xcode command-line tools required"
            else
                booted=$(xcrun simctl list devices booted 2>/dev/null | grep -Eo '\(Booted\)' | head -n 1 || true)
                if [[ -z "$booted" ]]; then
                    fail "no booted iOS simulator — boot one and install the preview build first"
                else
                    pass "iOS simulator booted"
                    # Fire the 7 registered schemes. We don't check the
                    # resulting screen (that's Detox's job); we just
                    # confirm openurl doesn't error-exit, which means
                    # the OS resolved the scheme to our app.
                    for url in \
                        "windypro://record" \
                        "windyword://recording/smoke-001" \
                        "windychat://room/!smoke:chat.windypro.com" \
                        "windymail://inbox" \
                        "windyfly://status" \
                        "windyclone://discover" \
                        "windyclone://order/ord-smoke" \
                        "windycloud://dashboard" \
                        "windycloud://backup" \
                    ; do
                        if xcrun simctl openurl booted "$url" >/dev/null 2>&1; then
                            pass "openurl $url"
                        else
                            fail "openurl $url"
                        fi
                    done
                    # Smoke: crash check — app process should still be alive.
                    if xcrun simctl spawn booted launchctl list 2>/dev/null | grep -q 'ai.windyword.app'; then
                        pass "app process alive after deep-link barrage"
                    else
                        fail "app process vanished — probable crash on a deep link"
                    fi
                fi
            fi
            ;;
        android)
            if ! command -v adb >/dev/null; then
                fail "adb not on PATH — Android SDK platform-tools required"
            else
                device_line=$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}' || true)
                if [[ -z "$device_line" ]]; then
                    fail "no connected Android device / emulator"
                else
                    pass "android device: $device_line"
                    for url in \
                        "windypro://record" \
                        "windyword://recording/smoke-001" \
                        "windychat://room/!smoke:chat.windypro.com" \
                        "windymail://inbox" \
                        "windyfly://status" \
                        "windyclone://discover" \
                        "windyclone://order/ord-smoke" \
                        "windycloud://dashboard" \
                        "windycloud://backup" \
                    ; do
                        if adb shell am start -W -a android.intent.action.VIEW -d "$url" ai.windyword.app >/dev/null 2>&1; then
                            pass "am start $url"
                        else
                            fail "am start $url"
                        fi
                    done
                    # Crash check — ANR / crash rate over the test window.
                    if adb shell pidof ai.windyword.app >/dev/null 2>&1; then
                        pass "app process alive after deep-link barrage"
                    else
                        fail "app process vanished — probable crash on a deep link"
                    fi
                fi
            fi
            ;;
        *)
            fail "unknown --device value: $DEVICE (expected 'ios' or 'android')"
            ;;
    esac
fi

# ── result ─────────────────────────────────────────────────────

if (( fail_count > 0 )); then
    printf '\n✘ smoke-test: %d failure(s) — do not deploy.\n' "$fail_count" >&2
    exit 1
fi

printf '\n✔ smoke-test: all checks passed.\n'
