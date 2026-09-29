// OCR(Tesseract.js) 워커/코어/언어 데이터를 node_modules에서 public/tesseract 로 복사한다.
// 목적: 배포된 사이트가 외부 CDN(jsdelivr 등)에 의존하지 않고 완전히 독립적으로
// 동작하도록 하기 위함 (명세 2절: 특정 AI 플랫폼/외부 서비스에 종속되지 않는 독립 배포).
// npm install 이후 자동 실행된다 (package.json의 postinstall).
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const outDir = resolve(__dirname, "../public/tesseract");
const langOutDir = resolve(outDir, "lang-data");

function resolvePkgDir(pkg) {
  try {
    return dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    return null;
  }
}

function copy(src, destDir, destName) {
  if (!existsSync(src)) {
    console.warn(`[copy-ocr-assets] 건너뜀 (파일 없음): ${src}`);
    return false;
  }
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, resolve(destDir, destName ?? src.split("/").pop()));
  return true;
}

const tesseractDir = resolvePkgDir("tesseract.js");
const coreDir = resolvePkgDir("tesseract.js-core");
const korDir = resolvePkgDir("@tesseract.js-data/kor");
const engDir = resolvePkgDir("@tesseract.js-data/eng");

let ok = true;

if (tesseractDir) {
  ok = copy(resolve(tesseractDir, "dist/worker.min.js"), outDir) && ok;
} else {
  console.warn("[copy-ocr-assets] tesseract.js 패키지를 찾을 수 없습니다.");
  ok = false;
}

if (coreDir) {
  for (const f of [
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-lstm.wasm",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm",
  ]) {
    ok = copy(resolve(coreDir, f), outDir) && ok;
  }
} else {
  console.warn("[copy-ocr-assets] tesseract.js-core 패키지를 찾을 수 없습니다.");
  ok = false;
}

if (korDir) {
  ok = copy(resolve(korDir, "4.0.0/kor.traineddata.gz"), langOutDir) && ok;
} else {
  console.warn("[copy-ocr-assets] @tesseract.js-data/kor 패키지를 찾을 수 없습니다.");
  ok = false;
}

if (engDir) {
  ok = copy(resolve(engDir, "4.0.0/eng.traineddata.gz"), langOutDir) && ok;
} else {
  console.warn("[copy-ocr-assets] @tesseract.js-data/eng 패키지를 찾을 수 없습니다.");
  ok = false;
}

if (!ok) {
  console.warn(
    "[copy-ocr-assets] 일부 OCR 자산 복사에 실패했습니다. 브라우저 OCR이 동작하지 않을 수 있습니다. " +
      "npm install이 정상적으로 끝났는지 확인하세요."
  );
  process.exitCode = 0; // 빌드 자체는 막지 않는다 (프런트 나머지 기능은 계속 동작해야 함)
} else {
  console.log("[copy-ocr-assets] OCR 자산을 public/tesseract 에 복사했습니다.");
}
