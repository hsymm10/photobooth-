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
    <title>Photobooth Gallery</title>
    <link rel="shortcut icon" href="<?= $assetPrefix ?>assets/images/icons/favicon.png" type="image/x-icon" />
    <link rel="stylesheet" href="<?= $assetPrefix ?>assets/css/app.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>

<body>
    <section id="gallery-page" class="view active">
        <button class="back-btn" onclick="window.location.href='<?= $base ?>/'">← Kembali</button>
        <h2>Galeri Foto</h2>

        <div class="gallery-actions">
            <button class="btn-primary" onclick="downloadSelectedQR()">Generate QR Code</button>
            <button class="btn-primary" onclick="downloadSelectedImages()">Unduh Terpilih</button>
            <button class="btn-secondary" onclick="selectAll(true)">Pilih Semua</button>
            <button class="btn-secondary" onclick="selectAll(false)">Batal Pilih</button>
            <button class="btn-danger" onclick="deleteSelectedPhotos()">Hapus Terpilih</button>
        </div>

        <div id="gallery-grid" class="gallery-grid"></div>
    </section>

    <div id="qr-modal" class="modal">
        <div class="modal-content">
            <span class="close-btn" onclick="closeModal()">&times;</span>
            <h3>Scan QR Code</h3>
            <div id="qrcode"></div>
            <p>Scan untuk mengunduh gambar hasil akhir</p>
        </div>
    </div>

    <script>window.APP_BASE_PATH = "<?= $base ?>";</script>
    <script src="<?= $assetPrefix ?>assets/js/app.js?v=<?= time() ?>"></script>
</body>

</html>