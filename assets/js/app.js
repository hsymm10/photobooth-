/* =========================================================
   PHOTOBOOTH — app.js  (Final Fix — Akar Masalah Diperbaiki)
   ========================================================= */

/* ---------- IndexedDB ---------- */
let db;
const dbName = "PhotoboothDB";

const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open(dbName, 1);
  req.onupgradeneeded = (e) => {
    if (!e.target.result.objectStoreNames.contains("photos"))
      e.target.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
  };
  req.onsuccess = (e) => { db = e.target.result; resolve(db); };
  req.onerror   = () => reject(req.error);
});

/* ---------- DOM References ---------- */
const video             = document.getElementById("webcam");
const frameSelectEl     = document.getElementById("frame-select");
const startBtn          = document.getElementById("start-btn");
const finalResultImage  = document.getElementById("final-result-image");
const previewCanvas     = document.getElementById("preview-canvas");
let   previewCtx        = null;
let   _previewAnimId    = null;
let   _previewRunning   = false;  // guard against duplicate loops

/* ---------- Asset Base ---------- */
const _cssHref  = document.querySelector('link[rel="stylesheet"]')?.getAttribute("href") || "";
const assetBase = _cssHref.replace(/assets\/css\/app\.css.*$/, "");

/* ---------- Frame Options (21 frames) ---------- */
const frameOptions = Array.from({ length: 21 }, (_, i) =>
  `${assetBase}assets/images/icons/frames/${i + 1}.png`
);

/* ---------- Session State ---------- */
let selectedFrame        = frameOptions[0];
let selectedFilter       = "none";
let selectedLayout       = 4;
let selectedTimerSeconds = 3;
let pendingStripUrl      = null;  // strip without frame overlay
let finalizedPhotoUrl    = null;  // strip with frame overlay (ready to save)
let captureSessionImages = [];
let userEmail            = "";
let currentFacingMode    = "user"; // 'user' = kamera depan, 'environment' = belakang

/* ==========================================================
   FRAME LAYOUT CONSTANTS (Design spec matching PNG frame templates)
   Single Strip Canvas: 565 × 1600 px
   Dual Strip Canvas: 1130 × 1600 px (2 strips side-by-side)
   Each photo slot: 474 × 296 px
   ========================================================== */
const CANVAS_W = 565;
const CANVAS_H = 1600;
const PHOTO_W  = 474;
const PHOTO_H  = 296;

const PHOTO_SLOTS_4 = [
  { x: 45, y: 72   },
  { x: 45, y: 419  },
  { x: 45, y: 766  },
  { x: 45, y: 1113 },
];

/* 8-photo: two strips side-by-side → 1130 × 1600 */
const CANVAS_W_8    = CANVAS_W * 2;
const PHOTO_SLOTS_8 = [
  { x: 45,           y: 72   }, { x: 45,           y: 419  },
  { x: 45,           y: 766  }, { x: 45,           y: 1113 },
  { x: 45 + CANVAS_W, y: 72   }, { x: 45 + CANVAS_W, y: 419  },
  { x: 45 + CANVAS_W, y: 766  }, { x: 45 + CANVAS_W, y: 1113 },
];

/* ---------- UI Sync Helpers ---------- */

function updateGridSelection() {
  document.querySelectorAll(".chip-option").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.value) === selectedLayout));
}

function updateTimerSelection() {
  document.querySelectorAll(".time-chip").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.seconds) === selectedTimerSeconds));
}

function updateFilterSelection() {
  document.querySelectorAll(".filter-option").forEach((b) =>
    b.classList.toggle("active", b.dataset.value === selectedFilter));
}

function updateFrameThumbnailList() {
  if (!frameSelectEl) return;
  frameSelectEl.innerHTML = "";
  frameOptions.forEach((src, i) => {
    const btn = document.createElement("button");
    btn.type      = "button";
    btn.className = `frame-thumb ${src === selectedFrame ? "active" : ""}`;
    btn.innerHTML = `<img src="${src}" alt="Frame ${i + 1}" loading="lazy" />`;
    btn.addEventListener("click", () => { selectedFrame = src; updateFrameThumbnailList(); updateResultFrameBackground(); });
    frameSelectEl.appendChild(btn);
  });
}

function updateResultFrameBackground() {
  const rf = document.querySelector(".result-frame");
  if (!rf) return;
  rf.style.backgroundImage = "none";
  if (finalizedPhotoUrl && finalResultImage) {
    finalResultImage.src = finalizedPhotoUrl;
    finalResultImage.style.display = "block";
  } else if (selectedFrame && finalResultImage) {
    finalResultImage.src = selectedFrame;
    finalResultImage.style.display = "block";
  }
}

/* ==========================================================
   CAMERA — ROOT CAUSE FIX

   Problem: `loadedmetadata` fires before video starts playing;
   at that point `video.videoWidth` can be 0, setting the canvas
   to 0×0 → all draws are invisible.

   Fix: Listen to the `playing` event (fired AFTER the video is
   actively displaying frames, dimensions are guaranteed non-zero).
   Also: call `video.play()` explicitly — autoplay alone is not
   reliable in all browsers / permission states.

   No flip anywhere: drawImage copies raw camera frames as-is.
   ========================================================== */

async function ensureCamera(facingMode = currentFacingMode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error("Camera API not supported");
    return;
  }

  /* Stop existing stream if any */
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  _previewRunning = false;
  if (_previewAnimId) { cancelAnimationFrame(_previewAnimId); _previewAnimId = null; }

  try {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false
      });
    } catch (e) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }

    currentFacingMode = facingMode;
    video.srcObject   = stream;
    video.muted       = true;
    video.playsInline = true;

    /* Hide raw video element — canvas renders the unmirrored frame */
    video.style.opacity    = "0";
    video.style.visibility = "hidden";
    video.style.transform  = "none";
    video.style.webkitTransform = "none";

    /* `playing` is fired when the video first starts producing frames.
       At this point videoWidth / videoHeight are guaranteed > 0. */
    video.addEventListener("playing", _startCanvasPreview, { once: true });

    /* Explicit play() — needed when autoplay policy is restrictive */
    await video.play();

  } catch (err) {
    console.error("Camera error:", err);
    /* Show friendly message in preview area */
    if (previewCanvas) {
      const ctx = previewCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 0, previewCanvas.width || 640, previewCanvas.height || 480);
        ctx.fillStyle = "#fff";
        ctx.font = "18px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Kamera tidak tersedia. Periksa izin browser.", (previewCanvas.width || 640) / 2, (previewCanvas.height || 480) / 2);
      }
    }
  }
}

/* ==========================================================
   FLIP CAMERA
   ========================================================== */
async function flipCamera() {
  const btn = document.getElementById("flip-camera-btn");
  if (btn) {
    btn.classList.add("flipping");
    btn.disabled = true;
    setTimeout(() => { btn.classList.remove("flipping"); btn.disabled = false; }, 500);
  }
  const next = currentFacingMode === "user" ? "environment" : "user";
  await ensureCamera(next);
}

function _startCanvasPreview() {
  if (_previewRunning) return;  // prevent duplicate loops
  _previewRunning = true;

  /* Set canvas drawing-buffer to exact camera resolution */
  const w = video.videoWidth  || 640;
  const h = video.videoHeight || 480;
  previewCanvas.width  = w;
  previewCanvas.height = h;
  previewCtx = previewCanvas.getContext("2d");

  if (_previewAnimId) cancelAnimationFrame(_previewAnimId);

  const _draw = () => {
    /* Only draw when video has actual frame data (readyState ≥ 2) */
    if (video.readyState >= 2 && previewCtx) {
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

      previewCtx.save();
      /* Mirror only for front camera */
      if (currentFacingMode === "user") {
        previewCtx.translate(previewCanvas.width, 0);
        previewCtx.scale(-1, 1);
      }

      /* Apply filter on canvas */
      previewCtx.filter = (selectedFilter && selectedFilter !== "none")
        ? selectedFilter : "none";

      previewCtx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.filter = "none";
      previewCtx.restore();
    }
    _previewAnimId = requestAnimationFrame(_draw);
  };
  _draw();
}

/* ==========================================================
   FLASH + SHUTTER SOUND
   ========================================================== */
function triggerFlash() {
  const flash = document.getElementById("flash-overlay");
  if (!flash) return;
  flash.classList.remove("flash-active");
  void flash.offsetWidth; // reflow to restart animation
  flash.classList.add("flash-active");
  flash.addEventListener("animationend", () => flash.classList.remove("flash-active"), { once: true });
}

function triggerShutterSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    /* Mechanical shutter: two overlapping noise bursts */
    const bufLen = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.18));
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    /* Band-pass filter for that "click" character */
    const bpf = ctx.createBiquadFilter();
    bpf.type            = "bandpass";
    bpf.frequency.value = 3200;
    bpf.Q.value         = 0.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    source.connect(bpf);
    bpf.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + 0.12);
  } catch (e) {
    /* Silent fail — audio not critical */
  }
}

/* ==========================================================
   CAPTURE — SINGLE PHOTO
   Matches preview orientation 100% so right hand stays on right.
   ========================================================== */
function captureSinglePhoto(filter) {
  if (!video || video.readyState < 2 || !video.videoWidth) {
    console.warn("Video not ready for capture (readyState:", video?.readyState, ")");
    return null;
  }

  /* Trigger shutter sound + flash */
  triggerShutterSound();
  triggerFlash();

  const canvas  = document.createElement("canvas");
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx     = canvas.getContext("2d");

  ctx.save();
  /* Mirror only for front camera so captured image matches preview */
  if (currentFacingMode === "user") {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  if (filter && filter !== "none") ctx.filter = filter;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.filter = "none";
  ctx.restore();

  return canvas.toDataURL("image/png");
}

/* ---------- Countdown ---------- */
function countdown(seconds) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("countdown-overlay");
    let n = seconds;
    if (overlay) overlay.innerText = n;
    const t = setInterval(() => {
      n--;
      if (n > 0) { if (overlay) overlay.innerText = n; }
      else { clearInterval(t); if (overlay) overlay.innerText = ""; resolve(); }
    }, 1000);
  });
}

/* ---------- Capture Process ---------- */
async function startCaptureProcess(retakeIndex = null) {
  if (!startBtn) return;
  const filter = selectedFilter;
  startBtn.disabled  = true;
  startBtn.innerText = "Memproses...";

  if (retakeIndex !== null) {
    closeFramePicker();
    closeRetakeModal();
    await countdown(selectedTimerSeconds);
    const shot = captureSinglePhoto(filter);
    if (shot) captureSessionImages[retakeIndex] = shot;
    buildStripCanvas(captureSessionImages);
    resetCaptureButton();
    updateResultHint(`Foto ke-${retakeIndex + 1} berhasil diganti!`);
    setTimeout(() => {
      const hs = document.querySelector(`.slot-hotspot[data-index="${retakeIndex}"]`);
      if (hs) {
        hs.classList.add("retake-success");
        setTimeout(() => hs.classList.remove("retake-success"), 500);
      }
    }, 100);
    return;
  }

  /* Fresh session */
  captureSessionImages = [];
  pendingStripUrl      = null;
  finalizedPhotoUrl    = null;
  updateNextButtonState();
  updateSaveButtonState();
  closeFramePicker();
  clearResultView();

  const total = selectedLayout;
  for (let i = 0; i < total; i++) {
    await countdown(selectedTimerSeconds);
    const shot = captureSinglePhoto(filter);
    if (shot) captureSessionImages.push(shot);
    buildStripCanvas(captureSessionImages);
    updateResultHint(`Foto ${captureSessionImages.length} dari ${total} diambil.`);
  }
  resetCaptureButton();
}

/* ==========================================================
   BUILD STRIP CANVAS
   Places each photo at exact design coordinates.
   Uses cover-crop so photos fill slots without stretching.
   ========================================================== */
function buildStripCanvas(images) {
  const canvas = document.getElementById("hidden-canvas");
  if (!canvas) return;
  const ctx  = canvas.getContext("2d");
  const is8  = selectedLayout === 8;

  canvas.width  = is8 ? CANVAS_W_8 : CANVAS_W;
  canvas.height = CANVAS_H;

  /* White base — keeps areas outside photo slots opaque */
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const slots = is8 ? PHOTO_SLOTS_8 : PHOTO_SLOTS_4;
  const count = Math.min(images.length, slots.length);
  if (count === 0) { pendingStripUrl = canvas.toDataURL("image/png"); updateNextButtonState(); return; }

  let loaded = 0;
  images.slice(0, count).forEach((src, idx) => {
    const img  = new Image();
    img.onload = () => {
      drawImageCover(ctx, img, slots[idx].x, slots[idx].y, PHOTO_W, PHOTO_H);
      if (++loaded === count) {
        pendingStripUrl = canvas.toDataURL("image/png");
        updateNextButtonState();
        /* Automatically apply selected frame immediately without waiting */
        applyFrameAndFinalize(pendingStripUrl, selectedFrame, (framedUrl) => {
          if (framedUrl) {
            finalizedPhotoUrl = framedUrl;
            showCompositeResult(finalizedPhotoUrl);
            updateSaveButtonState();
            updateResultHint("Foto selesai dan berhasil masuk ke frame! Klik salah satu foto jika ingin mengganti.");
          }
        });
      }
    };
    img.onerror = () => {
      if (++loaded === count) {
        pendingStripUrl = canvas.toDataURL("image/png");
        updateNextButtonState();
        applyFrameAndFinalize(pendingStripUrl, selectedFrame, (framedUrl) => {
          if (framedUrl) {
            finalizedPhotoUrl = framedUrl;
            showCompositeResult(finalizedPhotoUrl);
            updateSaveButtonState();
          }
        });
      }
    };
    img.src = src;
  });
}

/* ==========================================================
   APPLY FRAME OVERLAY
   Draws the pending strip (photos in slots) then overlays the
   selected frame PNG on top. Transparent holes in the frame
   reveal the photos underneath → correct compositing.
   ========================================================== */
function applyFrameAndFinalize(stripDataUrl, frameSrc, onDone) {
  const canvas = document.getElementById("hidden-canvas");
  if (!canvas) { onDone(null); return; }
  const ctx = canvas.getContext("2d");
  const is8 = selectedLayout === 8;

  canvas.width  = is8 ? CANVAS_W_8 : CANVAS_W;
  canvas.height = CANVAS_H;

  const stripImg = new Image();
  stripImg.onload = () => {
    /* Step 1: draw photos (already placed at correct slots) */
    ctx.drawImage(stripImg, 0, 0, canvas.width, canvas.height);

    if (!frameSrc) return onDone(canvas.toDataURL("image/png"));

    /* Step 2: overlay frame PNG — transparent holes reveal photos */
    const frameImg = new Image();
    frameImg.crossOrigin = "anonymous";
    frameImg.onload = () => {
      if (is8) {
        ctx.drawImage(frameImg, 0,         0, CANVAS_W, CANVAS_H);
        ctx.drawImage(frameImg, CANVAS_W,  0, CANVAS_W, CANVAS_H);
      } else {
        ctx.drawImage(frameImg, 0, 0, CANVAS_W, CANVAS_H);
      }
      onDone(canvas.toDataURL("image/png"));
    };
    frameImg.onerror = () => onDone(canvas.toDataURL("image/png")); // save without frame
    frameImg.src = frameSrc;
  };
  stripImg.onerror = () => { console.error("Strip image load failed"); onDone(null); };
  stripImg.src = stripDataUrl;
}

/* ---------- drawImageCover (object-fit: cover crop) ---------- */
function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const sw = img.naturalWidth  || img.width;
  const sh = img.naturalHeight || img.height;
  if (!sw || !sh) return;

  const dr = dw / dh;
  const sr = sw / sh;
  let sx = 0, sy = 0, sw2 = sw, sh2 = sh;

  if (sr > dr) { sw2 = Math.round(sh * dr); sx = Math.round((sw - sw2) / 2); }
  else         { sh2 = Math.round(sw / dr); sy = Math.round((sh - sh2) / 2); }

  try { ctx.drawImage(img, sx, sy, sw2, sh2, dx, dy, dw, dh); }
  catch (e) { ctx.drawImage(img, dx, dy, dw, dh); }
}

/* ==========================================================
   RESULT PANEL & SLOT RETAKE OVERLAY
   ========================================================== */

let pendingRetakeIndex = null;

function renderSlotHotspots() {
  const container = document.getElementById("slot-overlay-container");
  const wrap      = document.querySelector(".result-image-wrap");
  if (!container) return;

  container.innerHTML = "";
  if (!captureSessionImages || captureSessionImages.length === 0) return;

  const is8 = selectedLayout === 8;
  if (wrap) {
    wrap.classList.toggle("layout-8", is8);
  }

  const slots4 = [
    { top: "4.5%",    left: "7.96%", width: "83.89%", height: "18.5%" },
    { top: "26.19%",  left: "7.96%", width: "83.89%", height: "18.5%" },
    { top: "47.88%",  left: "7.96%", width: "83.89%", height: "18.5%" },
    { top: "69.56%",  left: "7.96%", width: "83.89%", height: "18.5%" },
  ];

  const slots8 = [
    { top: "4.5%",    left: "3.98%", width: "41.95%", height: "18.5%" },
    { top: "26.19%",  left: "3.98%", width: "41.95%", height: "18.5%" },
    { top: "47.88%",  left: "3.98%", width: "41.95%", height: "18.5%" },
    { top: "69.56%",  left: "3.98%", width: "41.95%", height: "18.5%" },
    { top: "4.5%",    left: "54.0%", width: "41.95%", height: "18.5%" },
    { top: "26.19%",  left: "54.0%", width: "41.95%", height: "18.5%" },
    { top: "47.88%",  left: "54.0%", width: "41.95%", height: "18.5%" },
    { top: "69.56%",  left: "54.0%", width: "41.95%", height: "18.5%" },
  ];

  const slots = is8 ? slots8 : slots4;
  const total = Math.min(captureSessionImages.length, slots.length);

  for (let i = 0; i < total; i++) {
    const hs = document.createElement("div");
    hs.className = "slot-hotspot";
    hs.dataset.index = String(i);
    hs.style.top    = slots[i].top;
    hs.style.left   = slots[i].left;
    hs.style.width  = slots[i].width;
    hs.style.height = slots[i].height;

    hs.innerHTML = `<span class="slot-tooltip">📷 Ganti #${i + 1}</span>`;

    hs.addEventListener("click", (e) => {
      e.stopPropagation();
      openRetakeModal(i);
    });

    container.appendChild(hs);
  }
}

function openRetakeModal(index) {
  pendingRetakeIndex = index;
  const modal = document.getElementById("retake-modal");
  const txt   = document.getElementById("retake-modal-text");
  if (txt) {
    txt.textContent = `Ambil ulang Foto ke-${index + 1}? Foto lainnya tetap disimpan.`;
  }
  if (modal) modal.style.display = "flex";
}

function closeRetakeModal() {
  const modal = document.getElementById("retake-modal");
  if (modal) modal.style.display = "none";
}

/** Show final composite (strip + frame overlay). Hides thumbnails. */
function showCompositeResult(dataUrl) {
  if (!finalResultImage) return;
  const strip = document.getElementById("result-strip");
  if (strip) strip.innerHTML = "";  // clear thumbnails
  const rf = document.querySelector(".result-frame");
  if (rf) rf.style.backgroundImage = "none";
  finalResultImage.src           = dataUrl;
  finalResultImage.style.display = "block";
  renderSlotHotspots();
}

/** Show thumbnail grid. Hides composite. */
function renderThumbnails(images) {
  const strip              = document.getElementById("result-strip");
  const finalImgEl         = document.getElementById("final-result-image");
  const placeholder        = document.getElementById("result-placeholder");
  if (!strip) return;

  strip.innerHTML = "";
  if (finalImgEl)   finalImgEl.style.display = "none";
  if (placeholder)  placeholder.style.display = "none";

  strip.style.gridTemplateColumns =
    selectedLayout === 4 ? "repeat(1, 1fr)" : "repeat(2, 1fr)";

  updateResultFrameBackground();

  images.forEach((src, idx) => {
    const btn = document.createElement("button");
    btn.type      = "button";
    btn.className = "result-shot";
    btn.dataset.index = String(idx);
    btn.innerHTML = `<img src="${src}" alt="Foto ${idx + 1}" /><span class="result-shot-index">${idx + 1}</span>`;
    btn.addEventListener("click", () => startCaptureProcess(idx));
    /* Drag-to-reorder */
    btn.draggable = true;
    btn.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", String(idx)));
    btn.addEventListener("dragover",  (e) => e.preventDefault());
    btn.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData("text/plain"));
      const to   = Number(btn.dataset.index);
      if (from !== to) {
        const arr = [...captureSessionImages]; const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
        captureSessionImages = arr; buildStripCanvas(captureSessionImages);
      }
    });
    strip.appendChild(btn);
  });
}

/** Clear all result views (fresh state) */
function clearResultView() {
  const strip    = document.getElementById("result-strip");
  const finalImg = document.getElementById("final-result-image");
  const overlay  = document.getElementById("slot-overlay-container");
  if (strip)   strip.innerHTML = "";
  if (overlay) overlay.innerHTML = "";
  updateResultFrameBackground();
}

/* ---------- State helpers ---------- */

function updateNextButtonState() {
  const btn = document.getElementById("next-to-frame-btn");
  if (!btn) return;
  const ok = !!pendingStripUrl;
  btn.disabled = !ok; btn.style.opacity = ok ? "1" : "0.55"; btn.style.cursor = ok ? "pointer" : "not-allowed";
}

function updateSaveButtonState() {
  const btn = document.getElementById("save-photo-btn");
  if (!btn) return;
  const ok = !!(finalizedPhotoUrl || pendingStripUrl);
  btn.disabled = !ok; btn.style.opacity = ok ? "1" : "0.55"; btn.style.cursor = ok ? "pointer" : "not-allowed";

  /* Sync print & WA buttons */
  const printBtn = document.getElementById("print-photo-btn");
  const waBtn    = document.getElementById("share-wa-btn");
  if (printBtn) { printBtn.disabled = !ok; }
  if (waBtn)    { waBtn.disabled    = !ok; }
}

function updateResultHint(msg) {
  const h = document.getElementById("result-hint"); if (h) h.textContent = msg;
}

function resetCaptureButton() {
  if (!startBtn) return; startBtn.disabled = false; startBtn.innerText = "Ambil Foto";
}

function resetCurrentSession() {
  captureSessionImages = []; pendingStripUrl = null; finalizedPhotoUrl = null;
  updateNextButtonState(); updateSaveButtonState(); closeFramePicker(); clearResultView();
  updateResultHint("Siap! Ambil foto baru dari awal.");
}

function switchView(viewId) {
  const t = document.getElementById(viewId); if (!t) return;
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  t.classList.add("active");
  if (viewId === "gallery-page") loadGallery();
}

/* ==========================================================
   SAVE — IndexedDB + Browser Download + SMTP Email
   ========================================================== */

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

async function saveToStorage(base64Image) {
  const saveBtn = document.getElementById("save-photo-btn");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = "Menyimpan..."; }

  try {
    /* 1. Save to IndexedDB */
    const database = await dbReady;
    const tx = database.transaction("photos", "readwrite");
    tx.objectStore("photos").add({ image: base64Image, timestamp: new Date().toISOString() });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });

    /* 2. Trigger browser download */
    _triggerDownload(base64Image);

    showToast("✅ Foto berhasil disimpan ke galeri & diunduh!", "success");
  } catch (err) {
    console.error("Save failed:", err);
    showToast("❌ Gagal menyimpan foto. Silakan coba lagi.", "error");
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = "Simpan Foto"; }
  }
}

function _triggerDownload(dataUrl) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "photobooth-gssi-" + new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-") + ".png";
  document.body.appendChild(a); a.click(); a.remove();
}

/* Toast Notification Helper */
function showToast(message, type = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 400);
  }, 4000);
}

async function _sendEmailAsync(base64Image, recipientEmail, frameName = "Frame pilihan pengguna") {
  let endpoint = "/send-mail.php";
  if (assetBase) {
    endpoint = assetBase.endsWith("/") ? assetBase + "send-mail.php" : assetBase + "/send-mail.php";
  } else if (typeof window.APP_BASE_PATH !== "undefined" && window.APP_BASE_PATH) {
    endpoint = window.APP_BASE_PATH + "/send-mail.php";
  } else {
    endpoint = window.location.origin + window.location.pathname.replace(/\/booth\/?$/, "") + "/send-mail.php";
  }
  
  let res;
  try {
    res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ 
        image: base64Image, 
        userEmail: recipientEmail,
        frameName: frameName
      }),
    });
  } catch (netErr) {
    console.error("[Email] Network Fetch Error:", netErr);
    throw new Error("Gagal terhubung ke server. Periksa koneksi internet Anda.");
  }
  
  const rawText = await res.text();
  const trimmedText = rawText ? rawText.trim() : "";

  if (!trimmedText) {
    console.error("[Email] Respon server kosong (0 bytes). HTTP Status:", res.status);
    throw new Error(`Server tidak mengembalikan respon (HTTP ${res.status}).`);
  }

  let data = null;
  try {
    data = JSON.parse(trimmedText);
  } catch (parseErr) {
    console.error("[Email] JSON Parse Error. Server outputted non-JSON raw response:", rawText);
    const cleanMsg = trimmedText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const shortMsg = cleanMsg.length > 150 ? cleanMsg.substring(0, 150) + "..." : cleanMsg;
    throw new Error(shortMsg || `Respon server tidak valid (HTTP ${res.status})`);
  }

  if (!res.ok || data.success === false || data.ok === false) {
    const errorMsg = data.message || data.error || `Pengiriman gagal (HTTP ${res.status})`;
    throw new Error(errorMsg);
  }

  return data;
}

function compressImageForEmail(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:image")) return Promise.resolve(dataUrl);
  if (dataUrl.length < 600000) return Promise.resolve(dataUrl);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}


/* ==========================================================
   FRAME PICKER MODAL
   ========================================================== */

function openFramePicker() {
  const modal = document.getElementById("frame-picker-modal");
  if (!modal) return;

  const grid = document.getElementById("frame-picker-grid");
  grid.innerHTML = "";

  frameOptions.forEach((src, i) => {
    const btn     = document.createElement("button");
    btn.type      = "button";
    btn.className = `frame-thumb ${src === selectedFrame ? "active" : ""}`;
    btn.innerHTML = `<img src="${src}" alt="Frame ${i + 1}" loading="lazy" /><span class="frame-label">Frame ${i + 1}</span>`;
    btn.addEventListener("click", () => {
      selectedFrame = src;  /* preserve frame state */
      closeFramePicker();
      updateFrameThumbnailList();
      updateResultFrameBackground();

      if (!pendingStripUrl) {
        if (finalResultImage) {
          finalResultImage.src = selectedFrame;
          finalResultImage.style.display = "block";
        }
        updateResultHint(`Frame ${i + 1} dipilih. Tekan Ambil Foto untuk memulai.`);
        return;
      }

      updateResultHint("Menerapkan frame pilihan Anda...");
      applyFrameAndFinalize(pendingStripUrl, selectedFrame, (framedUrl) => {
        if (!framedUrl) { updateResultHint("Gagal menerapkan frame. Coba lagi."); return; }
        finalizedPhotoUrl = framedUrl;
        showCompositeResult(finalizedPhotoUrl);
        updateSaveButtonState();
        updateResultHint("Frame diterapkan! Tekan Simpan Foto atau Kirim ke Email.");
      });
    });
    grid.appendChild(btn);
  });

  modal.style.display = "flex";
}

function closeFramePicker() {
  const m = document.getElementById("frame-picker-modal"); if (m) m.style.display = "none";
}

/* ==========================================================
   GALLERY
   ========================================================== */

async function loadGallery() {
  try {
    const database  = await dbReady;
    const container = document.getElementById("gallery-grid");
    if (!container) return;
    container.innerHTML = "";

    const tx      = database.transaction("photos", "readonly");
    const store   = tx.objectStore("photos");
    const all     = store.getAll();
    all.onsuccess = () => {
      const photos = all.result.reverse(); // terbaru di atas
      if (!photos.length) {
        container.innerHTML = `
          <div class="gallery-empty">
            <div class="gallery-empty-icon">📷</div>
            <h3>Belum ada foto tersimpan</h3>
            <p>Pergi ke halaman Booth, ambil foto, lalu klik <strong>Simpan Foto</strong>.</p>
            <a href="${window.APP_BASE_PATH || ''}/booth" class="btn-primary" style="display:inline-block;margin-top:16px;padding:12px 28px;text-decoration:none;border-radius:50px;">📸 Buka Booth</a>
          </div>`;
        return;
      }
      photos.forEach(({ id, image, timestamp }) => {
        const card = document.createElement("div");
        card.className = "gallery-card";
        const dateStr = timestamp ? new Date(timestamp).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "";
        card.innerHTML = `
          <input type="checkbox" class="photo-select" data-id="${id}" value="${image}">
          <img src="${image}" alt="Foto galeri ${id}" loading="lazy" onclick="openPhotoPreview('${id}', this.src)" title="Klik untuk pratinjau" />
          <div class="gallery-card-info">
            <span class="gallery-card-date">${dateStr}</span>
            <button class="gallery-card-dl" title="Unduh foto ini" onclick="downloadSinglePhoto('${id}', '${image}')" data-img="${image}">⬇</button>
          </div>`;
        container.appendChild(card);
      });
    };
    all.onerror = () => console.error("Gallery read error:", all.error);
  } catch (e) { console.error("Gallery error:", e); }
}

function selectAll(status) {
  document.querySelectorAll(".photo-select").forEach((cb) => (cb.checked = status));
}

async function deleteSelectedPhotos() {
  const selected = Array.from(document.querySelectorAll(".photo-select:checked"));
  if (!selected.length) { showToast("⚠️ Pilih minimal satu foto untuk dihapus.", "error"); return; }
  if (!confirm(`Hapus ${selected.length} foto yang dipilih? Aksi ini tidak bisa dibatalkan.`)) return;
  const ids = selected.map((cb) => Number(cb.dataset.id));
  try {
    const database = await dbReady;
    const tx = database.transaction("photos", "readwrite");
    ids.forEach((id) => tx.objectStore("photos").delete(id));
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = () => j(tx.error); });
    showToast(`🗑️ ${ids.length} foto berhasil dihapus.`, "success");
    loadGallery();
  } catch (err) {
    console.error("Delete error:", err);
    showToast("❌ Gagal menghapus foto. Coba lagi.", "error");
  }
}

function downloadSelectedQR() {
  const selected = Array.from(document.querySelectorAll(".photo-select:checked")).map((cb) => cb.value);
  if (!selected.length) { showToast("⚠️ Pilih minimal satu foto terlebih dahulu.", "error"); return; }
  const qrc = document.getElementById("qrcode");
  if (!qrc) return;
  qrc.innerHTML = "";
  // Generate QR dari URL data pertama (QR tidak bisa encode image base64 penuh, pakai placeholder link)
  const text = selected.length === 1
    ? "Foto Photobooth — simpan dari galeri browser Anda"
    : `${selected.length} foto Photobooth — unduh dari browser Anda`;
  new QRCode(qrc, { text, width: 200, height: 200, colorDark: "#45479d", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
  document.getElementById("qr-modal").style.display = "flex";
}

function downloadSelectedImages() {
  const selected = Array.from(document.querySelectorAll(".photo-select:checked")).map((cb) => ({ id: cb.dataset.id, data: cb.value }));
  if (!selected.length) { showToast("⚠️ Pilih minimal satu foto terlebih dahulu.", "error"); return; }
  selected.forEach((item) => {
    const a = document.createElement("a");
    a.href = item.data;
    a.download = `photobooth-${item.id}-${Date.now()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  });
  showToast(`✅ ${selected.length} foto sedang diunduh.`, "success");
}

function downloadSinglePhoto(id, imgData) {
  const a = document.createElement("a");
  a.href = imgData;
  a.download = `photobooth-${id}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  showToast("✅ Foto berhasil diunduh!", "success");
}

function openPhotoPreview(id, src) {
  // Buat modal preview sederhana jika belum ada
  let modal = document.getElementById("photo-preview-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "photo-preview-modal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer;";
    modal.innerHTML = `<img id="photo-preview-img" style="max-width:90vw;max-height:90vh;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.6);" alt="Pratinjau foto" />`;
    modal.addEventListener("click", () => { modal.style.display = "none"; });
    document.body.appendChild(modal);
  }
  document.getElementById("photo-preview-img").src = src;
  modal.style.display = "flex";
}

function closeModal() {
  const m = document.getElementById("qr-modal"); if (m) m.style.display = "none";
}

/* ==========================================================
   PRINT LANGSUNG
   ========================================================== */
function printPhoto() {
  const imageUrl = finalizedPhotoUrl || pendingStripUrl;
  if (!imageUrl) { showToast("❌ Silakan ambil foto terlebih dahulu.", "error"); return; }

  const printWin = window.open("", "_blank", "width=800,height=1000");
  if (!printWin) { showToast("❌ Popup diblokir browser. Izinkan popup untuk fitur cetak.", "error"); return; }

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Cetak Foto Booth 4R</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #fff;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        .photo-wrap {
          width: 100%;
          max-width: 4in;
          height: auto;
        }
        img {
          width: 100%;
          height: auto;
          display: block;
        }
        @media print {
          @page {
            size: 4in 6in;
            margin: 0;
          }
          html, body {
            width: 4in;
            height: 6in;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }
          .photo-wrap {
            width: 4in;
            height: 6in;
            max-width: none;
          }
          img {
            width: 4in;
            height: 6in;
            object-fit: fill;
          }
        }
      </style>
    </head>
    <body>
      <div class="photo-wrap">
        <img src="${imageUrl}" alt="Foto Booth 4R" />
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); window.close(); }, 400);
        };
      <\/script>
    </body>
    </html>
  `);
  printWin.document.close();
  showToast("🖨️ Membuka jendela cetak 4R...", "success");
}

/* ==========================================================
   SHARE KE WHATSAPP MODAL & FLOW
   ========================================================== */
function openWaModal() {
  const imageUrl = finalizedPhotoUrl || pendingStripUrl;
  if (!imageUrl) {
    showToast("❌ Silakan ambil foto terlebih dahulu.", "error");
    return;
  }
  const modal = document.getElementById("wa-modal");
  const errorEl = document.getElementById("wa-phone-error");
  if (errorEl) { errorEl.style.display = "none"; errorEl.innerText = ""; }

  if (modal) {
    modal.classList.add("active");
    const input = document.getElementById("wa-phone-input");
    if (input) {
      setTimeout(() => input.focus(), 100);
    }
  }
}

function closeWaModal() {
  const modal = document.getElementById("wa-modal");
  if (modal) modal.classList.remove("active");
}
window.closeWaModal = closeWaModal;

/* Helper: Normalisasi & Validasi Nomor HP Indonesia */
function normalizeIndonesianPhone(raw) {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("08")) {
    digits = "628" + digits.slice(2);
  } else if (digits.startsWith("8")) {
    digits = "628" + digits.slice(1);
  } else if (digits.startsWith("0628")) {
    digits = "628" + digits.slice(4);
  }

  /* Validasi: Harus diawali 628 dan total 10-15 digit */
  if (/^628\d{7,12}$/.test(digits)) {
    return digits;
  }
  return null;
}

async function processSendWhatsApp() {
  const imageUrl = finalizedPhotoUrl || pendingStripUrl;
  if (!imageUrl) {
    showToast("❌ Silakan ambil foto terlebih dahulu.", "error");
    closeWaModal();
    return;
  }

  const inputEl  = document.getElementById("wa-phone-input");
  const errorEl  = document.getElementById("wa-phone-error");
  const submitBtn = document.getElementById("send-wa-submit-btn");

  const rawPhone   = inputEl ? inputEl.value.trim() : "";
  const cleanPhone = normalizeIndonesianPhone(rawPhone);

  if (!cleanPhone) {
    if (errorEl) {
      errorEl.innerText = "⚠️ Masukkan nomor WhatsApp yang valid (contoh: 08123456789).";
      errorEl.style.display = "block";
    }
    if (inputEl) inputEl.focus();
    return;
  }

  if (errorEl) errorEl.style.display = "none";

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-spinner"></span> Mengirim...';
  }

  try {
    /* 1. Upload foto ke server untuk dapat URL publik */
    const uploadedUrl = await uploadPhotoToServer(imageUrl);

    /* 2. Salin gambar ke clipboard jika didukung browser */
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const blob = await dataUrlToBlob(imageUrl);
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
    } catch (e) {
      /* Clipboard write is optional fallback */
    }

    /* 3. Bangun pesan tanpa menampilkan URL mentah di UI */
    let messageText = "Halo! Ini hasil foto Photobooth Anda 📸✨";
    if (uploadedUrl) {
      messageText += "\n\nLihat & unduh foto di link berikut:\n" + uploadedUrl;
    } else {
      messageText += "\n\nTerima kasih sudah berfoto di Photobooth!";
    }

    const waLink = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(messageText)}`;

    /* 4. Buka WhatsApp */
    window.open(waLink, "_blank", "noopener,noreferrer");

    closeWaModal();
    showToast(`✅ Membuka WhatsApp ke +${cleanPhone}... Foto berhasil disiapkan!`, "success");

  } catch (err) {
    console.error("WhatsApp Send Error:", err);
    showToast("❌ Gagal memproses pengiriman WhatsApp. Silakan coba lagi.", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Kirim ke WhatsApp";
    }
  }
}

/* Helper: DataURL → Blob */
function dataUrlToBlob(dataUrl) {
  return new Promise((resolve) => {
    const [header, b64] = dataUrl.split(",");
    const mime = (header.match(/:(.*?);/) || [])[1] || "image/png";
    const bin  = atob(b64);
    const arr  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    resolve(new Blob([arr], { type: mime }));
  });
}

/* Helper: Upload foto ke server untuk dapat URL publik */
async function uploadPhotoToServer(dataUrl) {
  try {
    let endpoint = "/save-photo.php";
    if (typeof window.APP_BASE_PATH !== "undefined" && window.APP_BASE_PATH) {
      endpoint = window.APP_BASE_PATH + "/save-photo.php";
    }
    const res  = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ image: dataUrl })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.url) return window.location.origin + "/" + data.url.replace(/^\//, "");
    return null;
  } catch {
    return null;
  }
}

/* ==========================================================
   EVENT LISTENERS
   ========================================================== */

/* Filter */
document.querySelectorAll(".filter-option").forEach((btn) => {
  btn.addEventListener("click", () => { selectedFilter = btn.dataset.value; updateFilterSelection(); });
});

/* Grid (layout) */
document.querySelectorAll(".chip-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = Number(btn.dataset.value);
    if (![4, 8].includes(v)) return;
    selectedLayout = v; updateGridSelection();
  });
});

/* Timer */
document.querySelectorAll(".time-chip").forEach((btn) => {
  btn.addEventListener("click", () => { selectedTimerSeconds = Number(btn.dataset.seconds); updateTimerSelection(); });
});

/* "Pilih Frame" (result panel) */
const nextToFrameBtn = document.getElementById("next-to-frame-btn");
if (nextToFrameBtn) {
  nextToFrameBtn.addEventListener("click", () => {
    openFramePicker();
  });
}

/* "Simpan Foto" */
const savePhotoBtn = document.getElementById("save-photo-btn");
if (savePhotoBtn) {
  savePhotoBtn.addEventListener("click", () => {
    const imageToSave = finalizedPhotoUrl || pendingStripUrl;
    if (!imageToSave) { alert("Silakan ambil foto terlebih dahulu."); return; }
    saveToStorage(imageToSave);
  });
}

/* "Kirim ke Email" */
const sendEmailBtn = document.getElementById("send-email-btn");
if (sendEmailBtn) {
  sendEmailBtn.addEventListener("click", async () => {
    const emailEl = document.getElementById("user-email-input");
    const email   = emailEl ? emailEl.value.trim() : userEmail;
    if (!email || !isValidEmail(email)) {
      if (emailEl) { emailEl.classList.add("input-error"); emailEl.focus(); }
      showToast("❌ Masukkan alamat email yang valid terlebih dahulu.", "error");
      return;
    }
    if (emailEl) emailEl.classList.remove("input-error");
    userEmail = email;

    const imageToSend = finalizedPhotoUrl || pendingStripUrl;
    if (!imageToSend) {
      showToast("❌ Silakan ambil foto terlebih dahulu.", "error");
      return;
    }

    // Determine frame name
    let currentFrameName = "Frame pilihan pengguna";
    if (selectedFrame) {
      const frameIndex = frameOptions.indexOf(selectedFrame);
      if (frameIndex !== -1) {
        currentFrameName = `Frame ${frameIndex + 1}`;
      }
    }

    sendEmailBtn.disabled = true;
    sendEmailBtn.innerHTML = '<span class="btn-spinner"></span> Mengirim...';
    try {
      const preparedImage = await compressImageForEmail(imageToSend);
      await _sendEmailAsync(preparedImage, userEmail, currentFrameName);
      showToast("✅ Foto berhasil dikirim ke email Anda.", "success");
    } catch (err) {
      console.error("Email error:", err);
      showToast("❌ " + (err.message || "Pengiriman gagal. Silakan coba lagi."), "error");
    } finally {
      sendEmailBtn.disabled = false;
      sendEmailBtn.innerHTML = "Kirim ke Email";
    }
  });
}


/* "Ulang Foto" */
const resetSessionBtn = document.getElementById("reset-session-btn");
if (resetSessionBtn) {
  resetSessionBtn.addEventListener("click", () => { resetCurrentSession(); updateResultHint("Siap! Ambil foto baru dari awal."); });
}

/* "Cetak Foto" */
const printPhotoBtn = document.getElementById("print-photo-btn");
if (printPhotoBtn) {
  printPhotoBtn.addEventListener("click", () => printPhoto());
}

/* "Share WhatsApp" */
const shareWaBtn = document.getElementById("share-wa-btn");
if (shareWaBtn) {
  shareWaBtn.addEventListener("click", () => openWaModal());
}

const sendWaSubmitBtn = document.getElementById("send-wa-submit-btn");
if (sendWaSubmitBtn) {
  sendWaSubmitBtn.addEventListener("click", () => processSendWhatsApp());
}

const waPhoneInput = document.getElementById("wa-phone-input");
if (waPhoneInput) {
  waPhoneInput.addEventListener("input", () => {
    const errorEl = document.getElementById("wa-phone-error");
    if (errorEl) errorEl.style.display = "none";
  });
  waPhoneInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      processSendWhatsApp();
    }
  });
}

/* Retake modal confirm button */
const confirmRetakeBtn = document.getElementById("confirm-retake-btn");
if (confirmRetakeBtn) {
  confirmRetakeBtn.addEventListener("click", () => {
    if (pendingRetakeIndex !== null) {
      const idx = pendingRetakeIndex;
      closeRetakeModal();
      startCaptureProcess(idx);
    }
  });
}

/* Email input — validate on input + Enter key */
const emailInputEl = document.getElementById("user-email-input");
if (emailInputEl) {
  emailInputEl.addEventListener("input", () => {
    userEmail = emailInputEl.value.trim();
    emailInputEl.classList.remove("input-error");
    emailInputEl.style.borderColor = isValidEmail(userEmail) ? "#22c55e" : "";
  });

  emailInputEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const email = emailInputEl.value.trim();
    if (isValidEmail(email)) {
      userEmail = email;
      emailInputEl.style.borderColor = "#22c55e";
      emailInputEl.blur();
    } else {
      emailInputEl.classList.add("input-error");
      emailInputEl.style.borderColor = "";
      emailInputEl.focus();
    }
  });
}

/* ==========================================================
   INIT
   ========================================================== */
const _isGalleryPage = !!document.getElementById("gallery-grid");
const _isBoothPage   = !!document.getElementById("webcam");

if (_isBoothPage) {
  updateNextButtonState();
  updateSaveButtonState();
  updateResultFrameBackground();
  updateFrameThumbnailList();
  updateGridSelection();
  updateTimerSelection();
  updateFilterSelection();
  ensureCamera();
}

if (_isGalleryPage) {
  loadGallery();
}
