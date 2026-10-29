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
    <title>Photobooth Neubrutalism</title>
    <link rel="shortcut icon" href="<?= $assetPrefix ?>assets/images/icons/favicon.png" type="image/x-icon" />
    <link rel="stylesheet" href="<?= $assetPrefix ?>assets/css/app.css" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>

<body>
    <section id="landing-page" class="view active">
        <div class="hero-scene">
            <div class="floating-card card-left">
                <img src="<?= $assetPrefix ?>assets/images/icons/frames/1.png" alt="Frame sample" />
            </div>
            <div class="floating-card card-right">
                <img src="<?= $assetPrefix ?>assets/images/icons/frames/2.png" alt="Frame sample" />
            </div>
            <div class="floating-card card-bottom-left">
                <img src="<?= $assetPrefix ?>assets/images/icons/frames/3.png" alt="Frame sample" />
            </div>

            <div class="hero-card">
                <img class="brand-icon" src="<?= $assetPrefix ?>assets/images/icons/no-bg-icon.png" alt="Photobooth icon" />
                <h1>
                    Editor Foto AI<br />
                    <span>Gratis untuk</span><br />
                    <span class="line-break">Setiap Ide</span>
                </h1>
                <p>Abadikan momen serumu secara instant dengan frame yang terlihat langsung di kamera.</p>

                <div class="hero-actions">
                    <a class="btn-primary" href="<?= $base ?>/booth">Mulai Foto</a>
                    <a class="btn-secondary" href="<?= $base ?>/gallery">Lihat Galeri</a>
                </div>
            </div>
        </div>
    </section>
</body>

</html>