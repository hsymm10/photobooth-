<?php
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$basePath = rtrim(dirname($scriptName), '/');
if ($basePath === '/' || $basePath === '.') {
    $base = '';
} else {
    $base = $basePath;
}
$assetPrefix = $base ? $base . '/' : '';
?>
<!doctype html>
<html lang="id">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Photobooth Booth</title>
    <link rel="shortcut icon" href="<?= $assetPrefix ?>assets/images/icons/favicon.png" type="image/x-icon" />
    <link rel="stylesheet" href="<?= $assetPrefix ?>assets/css/app.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>

<body>
    <section id="booth-page" class="view active">
        <button class="back-btn" onclick="window.location.href='<?= $base ?>/'">← Kembali</button>

        <div class="booth-shell">
            <div class="capture-stage">
                <aside class="studio-sidebar">
                    <div class="studio-panel">
                        <div class="email-input-wrap">
                            <label for="user-email-input">EMAIL ANDA</label>
                            <input
                                type="email"
                                id="user-email-input"
                                placeholder="nama@email.com"
                                autocomplete="email"
                            />
                            <button id="send-email-btn" class="btn-secondary send-email-btn" type="button">Kirim ke Email</button>
                        </div>
                    </div>

                    <div class="studio-panel">
                        <div class="timer-switcher">
                            <button class="time-chip active" type="button" data-seconds="3">3s</button>
                            <button class="time-chip" type="button" data-seconds="5">5s</button>
                            <button class="time-chip" type="button" data-seconds="10">10s</button>
                        </div>
                    </div>

                    <div class="studio-panel">
                        <div class="layout-selector">
                            <label>Grid</label>
                            <div class="chip-group">
                                <button class="chip-option active" type="button" data-value="4">4 Foto</button>
                                <button class="chip-option" type="button" data-value="8">8 Foto</button>
                            </div>
                        </div>
                    </div>

                    <div class="studio-panel">
                        <div class="filter-selector">
                            <label>Filter</label>
                            <div class="filter-grid">
                                <button class="filter-option active" type="button" data-value="none">Normal</button>
                                <button class="filter-option" type="button" data-value="grayscale(100%)">Mono</button>
                                <button class="filter-option" type="button" data-value="sepia(100%)">Sepia</button>
                                <button class="filter-option" type="button" data-value="contrast(150%)">High</button>
                                <button class="filter-option" type="button" data-value="saturate(200%)">Bright</button>
                            </div>
                        </div>
                    </div>

                    <div class="studio-panel">
                        <div class="frame-selector">
                            <label>Frame Photobooth</label>
                            <button class="btn-secondary frame-trigger-btn" type="button" onclick="openFramePicker()" style="width: 100%; font-size: 0.95rem; padding: 12px 14px;">
                                🖼️ Pilih Frame (21 Pilihan)
                            </button>
                        </div>
                    </div>
                </aside>

                <div class="camera-column">
                    <div class="preview-panel">
                        <video id="webcam" autoplay playsinline></video>
                        <canvas id="preview-canvas" aria-hidden="true"></canvas>
                        <div id="countdown-overlay"></div>
                        <div id="flash-overlay" class="flash-overlay"></div>
                        <button id="flip-camera-btn" class="flip-camera-btn" type="button" title="Balik Kamera" onclick="flipCamera()">🔄</button>
                    </div>
                    <button id="start-btn" class="btn-primary capture-btn" onclick="startCaptureProcess()">📸 Ambil Foto</button>
                </div>

                <aside class="result-column">
                    <div class="result-card">
                        <span class="result-label">Hasil foto</span>
                        <div class="result-frame">
                            <div id="result-strip" class="result-strip"></div>
                            <div class="result-image-wrap">
                                <img id="final-result-image" src="" alt="Hasil foto booth" />
                                <div id="slot-overlay-container" class="slot-overlay-container"></div>
                            </div>
                        </div>
                        <div class="result-actions">
                            <button id="next-to-frame-btn" class="btn-secondary" type="button">Pilih Frame</button>
                            <button id="save-photo-btn" class="btn-primary" type="button">Simpan Foto</button>
                            <button id="reset-session-btn" class="btn-danger" type="button">Ulang Foto</button>
                        </div>
                        <div class="result-actions result-actions-bottom">
                            <button id="print-photo-btn" class="btn-action-print" type="button">
                                <svg class="btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                    <rect x="6" y="14" width="12" height="8"></rect>
                                </svg>
                                <span>Cetak</span>
                            </button>
                            <button id="share-wa-btn" class="btn-action-wa" type="button">
                                <svg class="btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984 0 1.76.459 3.474 1.333 4.988l-1.417 5.176 5.298-1.389c1.458.796 3.106 1.215 4.773 1.216h.004c5.505 0 9.988-4.478 9.989-9.985 0-2.668-1.039-5.176-2.926-7.062a9.923 9.923 0 0 0-7.064-2.928zm.004 1.664c4.587 0 8.324 3.737 8.325 8.32 0 2.224-.866 4.314-2.439 5.887a8.27 8.27 0 0 1-5.885 2.438h-.003c-1.488 0-2.946-.395-4.223-1.144l-.303-.18-3.136.822.836-3.056-.197-.314c-.823-1.31-1.258-2.833-1.258-4.39 0-4.583 3.738-8.32 8.324-8.32zm-3.6 4.354c-.2-.444-.41-.453-.6-.462l-.511-.009c-.178 0-.466.067-.71.333-.244.267-.933.912-.933 2.223 0 1.31.955 2.578 1.088 2.756.133.178 1.88 2.87 4.555 4.025 2.227.962 2.68.77 3.168.725.489-.044 1.577-.644 1.8-.1.267.222.533.222.755.089.222.044.222-.267.222-.533 0-.178 0-.444-.067-.622-.067-.178-.244-.267-.511-.4-.267-.133-1.577-.778-1.821-.867-.244-.089-.422-.133-.6.133-.178.267-.689.867-.844 1.044-.156.178-.311.2-.578.067-.267-.133-1.13-.416-2.152-1.328-.795-.71-1.332-1.587-1.488-1.854-.156-.267-.016-.411.117-.544.12-.12.267-.311.4-.467.133-.156.178-.267.267-.444.089-.178.044-.333-.022-.467-.067-.133-.585-1.433-.812-1.956z"/>
                                </svg>
                                <span>WhatsApp</span>
                            </button>
                        </div>
                        <p id="result-hint" class="result-hint">Klik salah satu hasil untuk ambil ulang foto yang mau diperbaiki.</p>
                    </div>
                </aside>
            </div>
        </div>
    </section>

    <div id="frame-picker-modal" class="modal">
        <div class="modal-content frame-picker-content">
            <span class="close-btn" onclick="closeFramePicker()">&times;</span>
            <h3>Pilih Frame</h3>
            <div id="frame-picker-grid" class="frame-grid"></div>
        </div>
    </div>

    <div id="retake-modal" class="modal">
        <div class="modal-content retake-modal-content">
            <span class="close-btn" onclick="closeRetakeModal()">&times;</span>
            <h3 style="margin-bottom: 12px; font-size: 1.35rem; text-transform: uppercase;">Ganti Foto?</h3>
            <p id="retake-modal-text" style="font-size: 0.95rem; color: #333; margin-bottom: 22px; line-height: 1.4;">
                Anda akan mengambil ulang Foto ke-1. Foto lainnya tetap dipertahankan.
            </p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="confirm-retake-btn" class="btn-primary" type="button" style="padding: 10px 24px;">Setuju</button>
                <button class="btn-secondary" type="button" onclick="closeRetakeModal()" style="padding: 10px 24px;">Batal</button>
            </div>
        </div>
    </div>

    <div id="wa-modal" class="modal">
        <div class="modal-content wa-modal-content">
            <span class="close-btn" onclick="closeWaModal()">&times;</span>
            <div class="wa-modal-header">
                <div class="wa-icon-badge">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#25D366">
                        <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984 0 1.76.459 3.474 1.333 4.988l-1.417 5.176 5.298-1.389c1.458.796 3.106 1.215 4.773 1.216h.004c5.505 0 9.988-4.478 9.989-9.985 0-2.668-1.039-5.176-2.926-7.062a9.923 9.923 0 0 0-7.064-2.928zm.004 1.664c4.587 0 8.324 3.737 8.325 8.32 0 2.224-.866 4.314-2.439 5.887a8.27 8.27 0 0 1-5.885 2.438h-.003c-1.488 0-2.946-.395-4.223-1.144l-.303-.18-3.136.822.836-3.056-.197-.314c-.823-1.31-1.258-2.833-1.258-4.39 0-4.583 3.738-8.32 8.324-8.32zm-3.6 4.354c-.2-.444-.41-.453-.6-.462l-.511-.009c-.178 0-.466.067-.71.333-.244.267-.933.912-.933 2.223 0 1.31.955 2.578 1.088 2.756.133.178 1.88 2.87 4.555 4.025 2.227.962 2.68.77 3.168.725.489-.044 1.577-.644 1.8-.1.267.222.533.222.755.089.222.044.222-.267.222-.533 0-.178 0-.444-.067-.622-.067-.178-.244-.267-.511-.4-.267-.133-1.577-.778-1.821-.867-.244-.089-.422-.133-.6.133-.178.267-.689.867-.844 1.044-.156.178-.311.2-.578.067-.267-.133-1.13-.416-2.152-1.328-.795-.71-1.332-1.587-1.488-1.854-.156-.267-.016-.411.117-.544.12-.12.267-.311.4-.467.133-.156.178-.267.267-.444.089-.178.044-.333-.022-.467-.067-.133-.585-1.433-.812-1.956z"/>
                    </svg>
                </div>
                <h3 class="wa-modal-title">Kirim Foto ke WhatsApp</h3>
            </div>
            <p class="wa-modal-desc">
                Masukkan nomor WhatsApp Anda untuk menerima link foto photobooth.
            </p>
            <div class="wa-input-group">
                <label for="wa-phone-input" class="wa-input-label">NOMOR WHATSAPP</label>
                <input
                    type="tel"
                    id="wa-phone-input"
                    placeholder="08xxxxxxxxxx"
                    autocomplete="tel"
                    maxlength="16"
                    class="wa-phone-input"
                />
                <span id="wa-phone-error" class="wa-error-msg"></span>
            </div>
            <div class="wa-modal-actions">
                <button id="send-wa-submit-btn" class="btn-primary btn-wa-submit" type="button">Kirim ke WhatsApp</button>
                <button class="btn-secondary btn-wa-cancel" type="button" onclick="closeWaModal()">Batal</button>
            </div>
        </div>
    </div>

    <canvas id="hidden-canvas" style="display: none"></canvas>
    <script>window.APP_BASE_PATH = "<?= $base ?>";</script>
    <script src="<?= $assetPrefix ?>assets/js/app.js?v=<?= time() ?>"></script>
</body>

</html>
