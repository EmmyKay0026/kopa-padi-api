// This boundary must also handle missing/invalid compiled modules safely.
import("./dist/src/main.js").catch(() => {
  console.error(JSON.stringify({ level: "error", event_type: "api_startup_failed", error_category: "startup_error" }));
  process.exitCode = 1;
});
