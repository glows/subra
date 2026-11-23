import { expect, open, test } from "nsh/test";

test("renders All Videos, Local Import, and navigates across all 4 settings pages", async () => {
  const app = await open("./App.tsx", {
    width: 1180,
    height: 760,
    colorScheme: "dark",
  });

  // 1. All Videos (default route)
  expect(app.texts()).toContain("All Videos");
  expect(app.texts()).toContain("+ Import");

  // 2. YouTube & X download pages
  await app.press("id:nav-youtube");
  expect(app.texts()).toContain("Fetch Info");
  expect(app.texts()).toContain("Preferred Quality");

  await app.press("id:nav-x");
  expect(app.texts()).toContain("Download Available Subtitles");

  // 3. Local Import
  await app.press("Local Import");
  expect(app.texts()).toContain("Import Videos into Subra Library");
  expect(app.texts()).toContain("Choose Video Files...");

  // 3. General Settings
  await app.press("General");
  expect(app.texts()).toContain("Current Library");
  expect(app.texts()).toContain("App Language");
  expect(app.texts()).toContain("yt-dlp");
  expect(app.texts()).toContain("FFmpeg");

  // 4. Speech Recognition
  await app.press("Speech Recognition");
  expect(app.texts()).toContain("Whisper");
  expect(app.texts()).toContain("Large v3 Turbo (Compressed)");

  // 5. AI Providers
  await app.press("AI Providers");
  expect(app.texts()).toContain("OpenAI Compatible");
  expect(app.texts()).toContain("Reasoning Effort");
  await app.press("OpenAI");
  expect(app.texts()).toContain("OpenAI Chat Completions API");

  // 6. Translation
  await app.press("Translation");
  expect(app.texts()).toContain("Default Target Language");
  expect(app.texts()).toContain("Smart Translation");
  expect(app.texts()).toContain("Restore Defaults");
});
