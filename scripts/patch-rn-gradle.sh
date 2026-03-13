#!/bin/bash
# ──────────────────────────────────────────────────────
# patch-rn-gradle.sh
# Run AFTER `npm install` / `yarn install` to patch
# @react-native/gradle-plugin for Gradle 8.7 + AGP 8.6.0 + Kotlin 1.9.25
# ──────────────────────────────────────────────────────
set -euo pipefail

RN_GP="node_modules/@react-native/gradle-plugin"
RN_CORE="node_modules/react-native"

# 1. Comment out foojay-resolver (requires network; not needed)
SETTINGS_KTS="$RN_GP/settings.gradle.kts"
if grep -q 'id("org.gradle.toolchains.foojay-resolver-convention")' "$SETTINGS_KTS" 2>/dev/null; then
  sed -i 's|id("org.gradle.toolchains.foojay-resolver-convention")|// id("org.gradle.toolchains.foojay-resolver-convention")|' "$SETTINGS_KTS"
  echo "✓ Commented out foojay-resolver in settings.gradle.kts"
fi

# 2. Remove jvmToolchain(17) from composite build scripts (conflicts with Gradle 7.x sourceCompatibility)
for f in \
  "$RN_GP/settings-plugin/build.gradle.kts" \
  "$RN_GP/shared/build.gradle.kts" \
  "$RN_GP/shared-testutil/build.gradle.kts" \
  "$RN_GP/react-native-gradle-plugin/build.gradle.kts"; do
  if [ -f "$f" ] && grep -q 'jvmToolchain(17)' "$f"; then
    sed -i '/jvmToolchain(17)/d' "$f"
    echo "✓ Removed jvmToolchain(17) from $(basename "$(dirname "$f")")/$(basename "$f")"
  fi
done

# 3. Patch ReactSettingsExtension.kt:
#    - Replace settings.layout.rootDirectory with settings.rootDir (Gradle 7.x compat)
#    - Replace FileCollection with Iterable<File> (avoids needing Gradle internal APIs)
RSE="$RN_GP/settings-plugin/src/main/kotlin/com/facebook/react/ReactSettingsExtension.kt"
if [ -f "$RSE" ]; then
  # Remove FileCollection import
  sed -i '/import org.gradle.api.file.FileCollection/d' "$RSE"

  # Replace settings.layout.rootDirectory.dir("../") with File(settings.rootDir.parentFile, ...)
  sed -i 's|settings\.layout\.rootDirectory\.dir("\.\./")\.file(|File(settings.rootDir.parentFile, |g' "$RSE"

  # Replace lockFiles: FileCollection with lockFiles: Iterable<File>
  sed -i 's|lockFiles: FileCollection|lockFiles: Iterable<File>|g' "$RSE"

  # Replace the default lockFiles value from settings.layout to listOf(File(...))
  if grep -q 'settings\.layout' "$RSE"; then
    echo "WARNING: residual settings.layout references found in $RSE — manual patch may be needed"
  fi

  echo "✓ Patched ReactSettingsExtension.kt for Gradle 7.x/8.x compat"
fi

# 4. Clear stale composite-build caches
for d in "$RN_GP/settings-plugin/build" "$RN_GP/shared/build" "$RN_GP/react-native-gradle-plugin/build"; do
  rm -rf "$d" 2>/dev/null && echo "✓ Cleared cache: $d"
done

echo ""
echo "All patches applied. Run: npx expo run:android"
