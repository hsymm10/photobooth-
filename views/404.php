<?php
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$basePath = rtrim(dirname($scriptName), '/\\');
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
    <title>404 - Not Found</title>
    <link rel="stylesheet" href="<?= $assetPrefix ?>assets/css/app.css" />
</head>

<body>
    <section class="view active" style="padding: 60px 20px; text-align: center;">
        <h1>404</h1>
        <p>Halaman tidak ditemukan.</p>
        <a class="btn-primary" href="<?= $base ?>/">Kembali ke Home</a>
    </section>
</body>

</html>