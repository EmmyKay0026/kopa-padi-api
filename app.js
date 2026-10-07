import("./dist/src/main.js").catch((error) => {
  console.error("API bootstrap failed:", error);
  process.exitCode = 1;
});
