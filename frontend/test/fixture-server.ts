// Isolated test process only. Never imported by src/ or used as an API fallback.
// Images are deliberately synthetic integration fixtures, not fashion examples.
import { context, publish } from "../../backend/test/helpers.ts";

const fixture = await context();
fixture.config.publicOrigin = "http://localhost:5174";
await publish(fixture, [
  "men_classic",
  "men_modern_formal",
  "men_business_casual",
  "women_classic_tailored",
]);
await fixture.app.listen({ host: "127.0.0.1", port: 3101 });
console.log(
  "TEST FIXTURE ONLY: API 3101; temporary DB and synthetic images; origin localhost:5174",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await fixture.cleanup();
  process.exit(0);
}
process.on("SIGTERM", () => {
  void stop();
});
process.on("SIGINT", () => {
  void stop();
});
