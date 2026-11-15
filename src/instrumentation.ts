/** Runs once when the server starts: tells the database the current SIGNUP_MODE straight away. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { syncSignupMode } = await import("./lib/signup-mode");
    await syncSignupMode();
  } catch (err) {
    console.error("SIGNUP_MODE sync at startup failed:", err instanceof Error ? err.message : err);
  }
}
