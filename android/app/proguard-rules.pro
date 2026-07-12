# ProGuard / R8 rules for MileTrack release builds.

# Capacitor plugins are looked up reflectively by name at runtime — keep their
# classes and @CapacitorPlugin annotations, otherwise the JS bridge breaks.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}

# Community background-geolocation plugin — reflected by Capacitor.
-keep class com.equimaps.capacitor_background_geolocation.** { *; }

# AndroidX + Kotlin metadata that R8 might otherwise strip aggressively.
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-dontwarn kotlinx.**

# Preserve line numbers so crash reports are still readable, but rename the
# original source file so class names in stack traces are obfuscated.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# WebView JavaScript interfaces — none currently defined, but keep the hook
# in place for any future @JavascriptInterface classes.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
