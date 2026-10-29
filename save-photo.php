<?php
/**
 * save-photo.php — Simpan foto ke server & kembalikan URL publik
 * Digunakan oleh fitur Share WhatsApp untuk mendapatkan link yang bisa dibagikan.
 */

ob_start();
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
ini_set('display_errors', '0');
@ini_set('memory_limit', '128M');
@set_time_limit(30);

header('Content-Type: application/json; charset=UTF-8');

function jsonOut($success, $message, array $extra = []) {
    if (ob_get_length()) ob_clean();
    echo json_encode(array_merge(['success' => (bool)$success, 'message' => (string)$message], $extra),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonOut(false, 'Method not allowed.');
}

$rawInput = file_get_contents('php://input');
if (empty($rawInput)) {
    jsonOut(false, 'Tidak ada data yang diterima.');
}

$body = json_decode($rawInput, true);
if (!is_array($body) || empty($body['image'])) {
    jsonOut(false, 'Format data tidak valid.');
}

$dataUrl  = $body['image'];
$commaPos = strpos($dataUrl, ',');
if ($commaPos === false) {
    jsonOut(false, 'Format Data URL tidak valid.');
}

$base64Data  = substr($dataUrl, $commaPos + 1);
$imageBytes  = base64_decode($base64Data);
if ($imageBytes === false || strlen($imageBytes) === 0) {
    jsonOut(false, 'Gagal memproses data gambar.');
}

/* Pastikan folder uploads ada */
$uploadDir = __DIR__ . '/uploads/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
    file_put_contents($uploadDir . '.htaccess', "Options -Indexes\n");
}

/* Hapus file lama (> 24 jam) agar tidak penuh */
foreach (glob($uploadDir . 'booth_*.png') as $file) {
    if (time() - filemtime($file) > 86400) {
        @unlink($file);
    }
}

$filename  = 'booth_' . bin2hex(random_bytes(8)) . '_' . date('YmdHis') . '.png';
$filepath  = $uploadDir . $filename;

if (file_put_contents($filepath, $imageBytes) === false) {
    jsonOut(false, 'Gagal menyimpan file ke server.');
}

/* Bangun URL publik */
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$basePath   = rtrim(dirname($scriptName), '/\\');
if ($basePath === '/' || $basePath === '.') $basePath = '';

$publicUrl = $basePath . '/uploads/' . $filename;

jsonOut(true, 'Foto berhasil disimpan.', ['url' => $publicUrl, 'filename' => $filename]);
