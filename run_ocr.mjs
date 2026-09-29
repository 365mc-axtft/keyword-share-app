import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SCRATCH_DIR = "/tmp/claude-0/-home-claude/1f593628-5a63-55a5-837c-cce4ee37c10e/scratchpad";
const __dirname = SCRATCH_DIR;
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures.json")));
const WEB_BASE = "http://localhost:5173";
const API_BASE = "http://localhost:4000/api";
const IMAGE_DIR = path.join(__dirname, "real_captures");

// NOTE: file names must be ASCII. Playwright's setInputFiles silently fails to attach
// files whose path contains non-ASCII (Korean) characters against this Chromium build
// (confirmed via isolated repro: input.files.length stays 0, no exception thrown).
let jobs = [
  { investigationId: fixtures.inv1Id, tabAnalysisId: fixtures.inv1BlogTabId, tabType: "BLOG", file: path.join(IMAGE_DIR, "capture1_blog_face.png"), label: "img1_얼굴람스_블로그탭" },
  { investigationId: fixtures.inv1Id, tabAnalysisId: fixtures.inv1IntegratedTabId, tabType: "INTEGRATED", file: path.join(IMAGE_DIR, "capture2_integrated_face.png"), label: "img2_얼굴람스_통합탭" },
  { investigationId: fixtures.inv2Id, tabAnalysisId: fixtures.inv2IntegratedTabId, tabType: "INTEGRATED", file: path.join(IMAGE_DIR, "capture3_integrated_arm.png"), label: "img3_팔뚝람스_통합탭" },
  { investigationId: fixtures.inv2Id, tabAnalysisId: fixtures.inv2BlogTabId, tabType: "BLOG", file: path.join(IMAGE_DIR, "capture4_blog_arm.png"), label: "img4_팔뚝람스_블로그탭" },
];
if (process.env.DEBUG_ONE) jobs = jobs.slice(0, 1);
if (process.env.ONLY_LABEL) jobs = jobs.filter((j) => j.label === process.env.ONLY_LABEL);

const TAB_LABEL = { BLOG: "블로그탭", INTEGRATED: "통합검색탭" };

async function fetchTabResult(tabAnalysisId) {
  const res = await fetch(`${API_BASE}/tab-analyses/${tabAnalysisId}`, {
    headers: { Authorization: `Bearer ${fixtures.token}` },
  });
  if (!res.ok) throw new Error(`GET tab-analyses failed: ${res.status}`);
  return res.json();
}

async function run() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const results = {};

  for (const job of jobs) {
    console.log(`\n=== ${job.label} (investigation=${job.investigationId}, tab=${job.tabType}) ===`);
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log("  [console error]", msg.text());
    });
    page.on("pageerror", (err) => console.log("  [page error]", err.message));

    try {
      // Establish an origin first so localStorage can be set, then inject the auth token.
      await page.goto(`${WEB_BASE}/login`, { waitUntil: "domcontentloaded" });
      await page.evaluate((token) => localStorage.setItem("auth_token", token), fixtures.token);

      await page.goto(`${WEB_BASE}/investigations/${job.investigationId}`, { waitUntil: "domcontentloaded" });

      // Select the right tab (BOTH creates two tab buttons).
      //
      // BUG FIX (root cause of the img3/img4 cross-contamination found during the first
      // full-batch run): tabAnalyses[] arrives asynchronously (GET /investigations/:id),
      // and the investigation page defaults `activeTabId` to `tabAnalyses[0]?.id` the
      // instant that response lands — with no `.orderBy()` on the server query, which of
      // the two tabs ends up as index 0 is not guaranteed. The old code checked
      // `tabButton.count() > 0` immediately after `goto`, before React had necessarily
      // rendered the tab buttons at all, and silently skipped the click when the count
      // was 0. That let the script fall through to uploading into whatever tab happened
      // to be the (non-deterministic) default — which is exactly how capture3 ended up
      // attached to the BLOG tab_analysis instead of the INTEGRATED one.
      //
      // Fix: explicitly wait for the tab button to render, click it, then wait for the
      // DOM to actually reflect that tab as active (its "active" class) before touching
      // the file input — so we never race the initial data load.
      const tabButton = page.getByRole("button", { name: new RegExp(TAB_LABEL[job.tabType]) });
      await tabButton.first().waitFor({ state: "visible", timeout: 15000 });
      await tabButton.first().click();
      await page.waitForFunction(
        (label) => {
          const btns = Array.from(document.querySelectorAll("button"));
          const btn = btns.find((b) => b.textContent && b.textContent.includes(label));
          return Boolean(btn && btn.className.includes("border-blue-600"));
        },
        TAB_LABEL[job.tabType],
        { timeout: 10000 }
      );

      // Upload the real capture image.
      const fileInput = page.locator('input[type="file"]');
      const uploadRespPromise = page.waitForResponse(
        (r) => r.url().includes(`/tab-analyses/${job.tabAnalysisId}/images`) && r.request().method() === "POST",
        { timeout: 30000 }
      );
      await fileInput.setInputFiles(job.file);
      const uploadResp = await uploadRespPromise;
      console.log("  upload POST status:", uploadResp.status());
      if (!uploadResp.ok()) {
        console.log("  upload body:", await uploadResp.text());
      }

      // Wait for the OCR run button to actually be present (image row rendered).
      const runButton = page.getByRole("button", { name: /OCR 실행/ });
      await runButton.waitFor({ state: "visible", timeout: 15000 });
      console.log("  uploaded, starting OCR...");
      await runButton.click();

      // Wait for the OCR submission network call to complete (this is the real client-side
      // Tesseract.js pipeline running in the actual browser — can take a while on a tall image).
      const respPromise = page.waitForResponse(
        (r) => r.url().includes(`/tab-analyses/${job.tabAnalysisId}/ocr-results`) && r.request().method() === "POST",
        { timeout: 20 * 60 * 1000 }
      );
      const resp = await respPromise;
      console.log("  ocr-results POST status:", resp.status());

      // Give the UI a moment to re-render, then pull the authoritative result from the API.
      await page.waitForTimeout(1000);
      const data = await fetchTabResult(job.tabAnalysisId);
      results[job.label] = {
        tabType: job.tabType,
        postCount: data.posts.length,
        posts: data.posts
          .sort((a, b) => a.originalOrder - b.originalOrder)
          .map((p) => ({
            order: p.originalOrder,
            channel: p.exposedChannelName,
            title: p.titleText,
            channelTypeGuess: p.channelTypeGuess,
            groupId: p.groupId,
          })),
        modules: data.modules.map((m) => ({ localId: m.id, name: m.name, kind: m.kind, isPostBearing: m.isPostBearing })),
      };
      console.log(`  captured ${data.posts.length} posts, ${data.modules.length} modules`);
    } catch (err) {
      console.log("  ERROR:", err.message);
      results[job.label] = { error: err.message };
      try {
        await page.screenshot({ path: path.join(__dirname, `error_${job.label}.png`), fullPage: true });
      } catch {}
    } finally {
      await context.close();
    }
  }

  await browser.close();
  const outPath = path.join(__dirname, "ocr_results.json");
  let merged = results;
  if (fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
      merged = { ...existing, ...results };
    } catch {}
  }
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
  console.log("\nDone. Results written to ocr_results.json");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
