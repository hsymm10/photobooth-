<?php
/**
 * send-mail.php — Endpoint untuk mengirim foto hasil photobooth via SMTP / PHP mail() (Async AJAX/Fetch)
 *
 * Mengirim email HTML Premium GSSI x H2SN dengan lampiran hasil photo render akhir.
 * Menggunakan SMTP (SSL 465 / STARTTLS 587) & Fallback mail() lokal.
 */

// 1. Output Buffering & Error Handling (Guarantees clean JSON output under all conditions)
ob_start();
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
ini_set('display_errors', '0');
@ini_set('memory_limit', '256M');
@set_time_limit(60);

header('Content-Type: application/json; charset=UTF-8');

function sendJsonResponse($success, $message, array $extra = array()) {
    if (ob_get_length()) {
        ob_clean();
    }
    http_response_code(200); // Always 200 OK to prevent LiteSpeed/cPanel 500 HTML error page substitution
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(array_merge(array(
        'success' => (bool)$success,
        'message' => (string)$message
    ), $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Global Shutdown Handler to capture fatal PHP crashes
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR))) {
        sendJsonResponse(false, 'Fatal Server Error: ' . $error['message'] . ' in ' . basename($error['file']) . ':' . $error['line']);
    }
});

// Custom Exception Handler
set_exception_handler(function ($e) {
    sendJsonResponse(false, 'Exception: ' . $e->getMessage());
});

// Custom Error Handler
set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    if ($severity === E_USER_ERROR || $severity === E_RECOVERABLE_ERROR) {
        sendJsonResponse(false, "PHP Error: {$message} in " . basename($file) . ":{$line}");
    }
    return true;
});

// --- SMTP CONFIG ---
if (!defined('SMTP_HOST')) define('SMTP_HOST',      'smtp.gmail.com');
if (!defined('SMTP_USER')) define('SMTP_USER',      'gssi.id.official@gmail.com');
if (!defined('SMTP_PASS')) define('SMTP_PASS',      'iuih glgm lfuf qpsp');
if (!defined('SMTP_FROM_NAME')) define('SMTP_FROM_NAME', 'GSSI Memory Booth');

if (defined('DISABLE_AUTO_EXEC')) {
    return;
}

// ---------------------------------------------------------------
// Hanya terima POST
// ---------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonResponse(false, 'Method not allowed. Gunakan POST request.');
}

// ---------------------------------------------------------------
// Baca body JSON
// ---------------------------------------------------------------
$rawInput = file_get_contents('php://input');
if (empty($rawInput) && !empty($_POST)) {
    $body = $_POST;
} else if (empty($rawInput)) {
    $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > 0) {
        sendJsonResponse(false, "Ukuran data foto ({$contentLength} bytes) melebihi batas server (post_max_size).");
    }
    sendJsonResponse(false, 'Tidak ada data request yang diterima server.');
} else {
    $body = json_decode($rawInput, true);
}
if (!is_array($body)) {
    sendJsonResponse(false, 'Format JSON request tidak valid.');
}

if (empty($body['image'])) {
    sendJsonResponse(false, 'Tidak ada data foto yang dikirim.');
}

// Data URL → raw binary PNG
$dataUrl = $body['image'];
$commaPos = strpos($dataUrl, ',');
if ($commaPos === false) {
    sendJsonResponse(false, 'Format Data URL gambar tidak valid.');
}

// Validate & get recipient email
$userEmail = trim($body['userEmail'] ?? '');
if (empty($userEmail) || !filter_var($userEmail, FILTER_VALIDATE_EMAIL)) {
    sendJsonResponse(false, 'Alamat email penerima tidak valid.');
}

$frameName = trim($body['frameName'] ?? 'Frame pilihan pengguna');

$base64Data = substr($dataUrl, $commaPos + 1);
$imageBytes = base64_decode($base64Data);
if ($imageBytes === false || strlen($imageBytes) === 0) {
    sendJsonResponse(false, 'Gagal memproses data biner gambar.');
}

// ---------------------------------------------------------------
// Kirim email
// ---------------------------------------------------------------
$result = sendPhotoMail($imageBytes, $userEmail, $frameName);

if ($result === true) {
    sendJsonResponse(true, 'Foto berhasil dikirim ke email.');
} else {
    sendJsonResponse(false, is_string($result) ? $result : 'Pengiriman email gagal. Silakan coba lagi.');
}

// ---------------------------------------------------------------
// SMTP mailer (raw socket, STARTTLS, AUTH LOGIN, attachment & inline logos)
// ---------------------------------------------------------------
function sendPhotoMail($imageBytes, $recipientEmail, $frameName = 'Frame pilihan pengguna')
{
    $host     = SMTP_HOST;
    $user     = SMTP_USER;
    $pass     = str_replace(' ', '', SMTP_PASS);
    $fromName = SMTP_FROM_NAME;
    $from     = SMTP_USER;
    $to       = $recipientEmail;

    $subject  = 'Hasil Photo Booth GSSI × H2SN';

    // File paths logo GSSI & H2SN
    $gssiPath = __DIR__ . '/assets/images/icons/gssi.jpg';
    $h2snPath = __DIR__ . '/assets/images/icons/logo_H2SN.jpg';

    $gssiBytes = file_exists($gssiPath) ? file_get_contents($gssiPath) : '';
    $h2snBytes = file_exists($h2snPath) ? file_get_contents($h2snPath) : '';

    $gssiB64 = chunk_split(base64_encode($gssiBytes));
    $h2snB64 = chunk_split(base64_encode($h2snBytes));

    // MIME boundaries
    $mixedBoundary   = '----=_Mixed_Part_' . md5(uniqid('mixed', true));
    $relatedBoundary = '----=_Related_Part_' . md5(uniqid('related', true));

    // Attachment photo base64
    $attachB64 = chunk_split(base64_encode($imageBytes));
    $fileName  = 'photobooth-gssi-' . date('Ymd-His') . '.png';

    // Build HTML Email Template
    $safeFrameName = htmlspecialchars($frameName);
    $htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hasil Photo Booth GSSI</title>
</head>
<body style="margin:0; padding:0; background-color:#F5F5F5; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing:antialiased;">

<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#F5F5F5; padding:30px 10px;">
  <tr>
    <td align="center">
      <!-- Main Card Container -->
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:720px; background-color:#FFFFFF; border-radius:16px; overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.08); border:1px solid #E5E7EB;">
        
        <!-- HEADER (MAROON #7A0012) -->
        <tr>
          <td style="background-color:#7A0012; padding:22px 20px; text-align:center;">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <!-- KIRI: LOGO GSSI + TEKS -->
                <td width="30%" align="left" valign="middle">
                  <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td valign="middle" style="padding-right:10px;">
                        <img src="cid:gssi_logo" alt="GSSI" width="44" height="44" style="display:block; border-radius:8px; border:0; object-fit:cover;" />
                      </td>
                      <td valign="middle" align="left">
                        <div style="color:#FFFFFF; font-size:18px; font-weight:800; line-height:1.1; letter-spacing:0.5px;">GSSI</div>
                        <div style="color:#FCE7F3; font-size:10px; font-weight:400; line-height:1.2; opacity:0.9; margin-top:2px;">Gerakan Siswa-Siswi<br/>Indonesia</div>
                      </td>
                    </tr>
                  </table>
                </td>

                <!-- TENGAH: IKON KAMERA + JUDUL + SUBJUDUL -->
                <td width="40%" align="center" valign="middle">
                  <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
                    <tr>
                      <td align="center" style="padding-bottom:4px;">
                        <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
                          <tr>
                            <td valign="middle" style="width:24px; border-bottom:1px solid rgba(255,255,255,0.45);"></td>
                            <td valign="middle" style="padding:0 8px;">
                              <!-- Camera Icon -->
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                <circle cx="12" cy="13" r="4"></circle>
                              </svg>
                            </td>
                            <td valign="middle" style="width:24px; border-bottom:1px solid rgba(255,255,255,0.45);"></td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="color:#FFFFFF; font-size:20px; font-weight:800; line-height:1.2; letter-spacing:0.3px;">
                        GSSI Memory Booth
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="color:#FCE7F3; font-size:11px; font-weight:400; line-height:1.3; opacity:0.9; margin-top:2px;">
                        Hasil Photo Booth Anda Sudah Siap!
                      </td>
                    </tr>
                  </table>
                </td>

                <!-- KANAN: LOGO H2SN + TEKS -->
                <td width="30%" align="right" valign="middle">
                  <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="right">
                    <tr>
                      <td valign="middle" style="padding-right:10px;">
                        <img src="cid:h2sn_logo" alt="H2SN" width="44" height="44" style="display:block; border-radius:8px; border:0; object-fit:cover;" />
                      </td>
                      <td valign="middle" align="left">
                        <div style="color:#FFFFFF; font-size:18px; font-weight:800; line-height:1.1; letter-spacing:0.5px;">H2SN</div>
                        <div style="color:#FCE7F3; font-size:10px; font-weight:400; line-height:1.2; opacity:0.9; margin-top:2px;">Digital Creator</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY EMAIL -->
        <tr>
          <td style="padding:32px 28px; background-color:#FFFFFF;">
            <!-- Sapaan -->
            <p style="margin:0 0 10px 0; font-size:15px; color:#1A1A1A; line-height:1.6;">
              Halo, <strong style="font-weight:700;">Terima kasih telah menggunakan GSSI Memory Booth.</strong>
            </p>
            <p style="margin:0 0 26px 0; font-size:15px; color:#4B5563; line-height:1.6;">
              Hasil foto Anda berhasil dibuat dan sudah kami lampirkan pada email ini.
            </p>

            <!-- Card Informasi -->
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#FAFAFA; border:1px solid #E5E7EB; border-radius:14px; padding:20px 24px; margin-bottom:24px;">
              <tr>
                <td>
                  <!-- Top Row: Icon Camera Pink + Title + Subtitle & Badge Hijau -->
                  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:16px;">
                    <tr>
                      <td align="left" valign="middle">
                        <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                          <tr>
                            <td valign="middle" style="padding-right:14px;">
                              <div style="width:42px; height:42px; background-color:#FDF2F8; border-radius:10px; text-align:center; line-height:42px; display:inline-block;">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F35BA5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                  <circle cx="12" cy="13" r="4"></circle>
                                </svg>
                              </div>
                            </td>
                            <td valign="middle">
                              <div style="font-size:16px; font-weight:700; color:#1A1A1A; line-height:1.2;">Photo Booth GSSI</div>
                              <div style="font-size:13px; color:#6B7280; margin-top:2px;">Hasil foto siap diunduh</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td align="right" valign="middle">
                        <!-- Badge Hijau -->
                        <div style="display:inline-block; background-color:#DCFCE7; color:#15803D; font-size:13px; font-weight:700; padding:6px 16px; border-radius:20px; border:1px solid #86EFAC;">
                          &#10004; Siap
                        </div>
                      </td>
                    </tr>
                  </table>

                  <!-- Garis Pemisah Tipis -->
                  <div style="border-top:1px solid #E5E7EB; margin:16px 0;"></div>

                  <!-- Detail Event (Dua Kolom) -->
                  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="left" valign="top" style="padding-bottom:12px; width:50%;">
                        <span style="font-size:12px; color:#6B7280; display:block;">Event</span>
                        <strong style="font-size:14px; color:#1A1A1A; font-weight:700; margin-top:2px; display:block;">Dies Natalis GSSI</strong>
                      </td>
                      <td align="right" valign="top" style="padding-bottom:12px; width:50%;">
                        <span style="font-size:12px; color:#6B7280; display:block;">Format</span>
                        <strong style="font-size:14px; color:#1A1A1A; font-weight:700; margin-top:2px; display:block;">PNG</strong>
                      </td>
                    </tr>
                    <tr>
                      <td align="left" valign="top" style="width:50%;">
                        <span style="font-size:12px; color:#6B7280; display:block;">Frame</span>
                        <strong style="font-size:14px; color:#1A1A1A; font-weight:700; margin-top:2px; display:block;">{$safeFrameName}</strong>
                      </td>
                      <td align="right" valign="top" style="width:50%;">
                        <span style="font-size:12px; color:#6B7280; display:block;">Status</span>
                        <strong style="font-size:14px; color:#1A1A1A; font-weight:700; margin-top:2px; display:block;">Sudah terlampir</strong>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>
            </table>

            <!-- Banner Informasi Maroon -->
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#7A0012; border-radius:12px; padding:16px 20px; text-align:center;">
              <tr>
                <td align="center" valign="middle">
                  <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center">
                    <tr>
                      <td valign="middle" style="padding-right:8px;">
                        <!-- Download icon -->
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                      </td>
                      <td valign="middle" style="color:#FFFFFF; font-size:14px; font-weight:600; line-height:1.4;">
                        Hasil foto Anda sudah tersedia sebagai lampiran email ini.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Footer Section -->
            <div style="border-top:1px solid #E5E7EB; margin-top:32px; padding-top:24px; text-align:center;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin-bottom:6px;">
                <tr>
                  <td valign="middle" style="width:36px; border-bottom:1px solid #D1D5DB;"></td>
                  <td valign="middle" style="padding:0 10px; color:#7A0012; font-size:14px; font-weight:700; letter-spacing:0.3px;">
                    GSSI Memory Booth
                  </td>
                  <td valign="middle" style="width:36px; border-bottom:1px solid #D1D5DB;"></td>
                </tr>
              </table>
              <div style="font-size:12px; color:#6B7280; font-weight:500; margin-bottom:10px;">Gerakan Siswa-Siswi Indonesia</div>
              <div style="font-size:12px; color:#9CA3AF; line-height:1.5;">
                Terima kasih telah menjadi bagian dari momen spesial Dies Natalis GSSI.
              </div>
            </div>

          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>
HTML;

    // Construct MIME multipart message
    $mime  = "--{$mixedBoundary}\r\n";
    $mime .= "Content-Type: multipart/related; boundary=\"{$relatedBoundary}\"\r\n\r\n";

    // HTML Part inside related
    $mime .= "--{$relatedBoundary}\r\n";
    $mime .= "Content-Type: text/html; charset=UTF-8\r\n";
    $mime .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $mime .= $htmlBody . "\r\n\r\n";

    // Logo GSSI CID Part
    if (!empty($gssiBytes)) {
        $mime .= "--{$relatedBoundary}\r\n";
        $mime .= "Content-Type: image/jpeg; name=\"gssi.jpg\"\r\n";
        $mime .= "Content-Transfer-Encoding: base64\r\n";
        $mime .= "Content-ID: <gssi_logo>\r\n";
        $mime .= "Content-Disposition: inline; filename=\"gssi.jpg\"\r\n\r\n";
        $mime .= $gssiB64 . "\r\n\r\n";
    }

    // Logo H2SN CID Part
    if (!empty($h2snBytes)) {
        $mime .= "--{$relatedBoundary}\r\n";
        $mime .= "Content-Type: image/jpeg; name=\"logo_H2SN.jpg\"\r\n";
        $mime .= "Content-Transfer-Encoding: base64\r\n";
        $mime .= "Content-ID: <h2sn_logo>\r\n";
        $mime .= "Content-Disposition: inline; filename=\"logo_H2SN.jpg\"\r\n\r\n";
        $mime .= $h2snB64 . "\r\n\r\n";
    }

    $mime .= "--{$relatedBoundary}--\r\n\r\n";

    // Attachment PNG Photo Part
    $mime .= "--{$mixedBoundary}\r\n";
    $mime .= "Content-Type: image/png; name=\"{$fileName}\"\r\n";
    $mime .= "Content-Disposition: attachment; filename=\"{$fileName}\"\r\n";
    $mime .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $mime .= $attachB64 . "\r\n\r\n";
    $mime .= "--{$mixedBoundary}--\r\n";

    // Build headers
    $dateStr   = date('r');
    $fromEncoded = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $msgHeaders  = "Date: {$dateStr}\r\n";
    $msgHeaders .= "From: {$fromEncoded} <{$from}>\r\n";
    $msgHeaders .= "To: <{$to}>\r\n";
    $msgHeaders .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $msgHeaders .= "MIME-Version: 1.0\r\n";
    $msgHeaders .= "Content-Type: multipart/mixed; boundary=\"{$mixedBoundary}\"\r\n";
    $msgHeaders .= "X-Mailer: GSSI-Photobooth/1.0\r\n";

    // 1. Coba SSL Port 465 (Rekomendasi untuk hosting & Gmail)
    $res465 = trySmtpSsl465($host, $user, $pass, $from, $to, $msgHeaders, $mime);
    if ($res465 === true) {
        return true;
    }

    // 2. Fallback: Coba STARTTLS Port 587
    $res587 = trySmtpStartTls587($host, $user, $pass, $from, $to, $msgHeaders, $mime);
    if ($res587 === true) {
        return true;
    }

    // 3. Fallback: Coba PHP mail() lokal server
    $resMail = tryPhpMail($fromName, $from, $to, $subject, $mixedBoundary, $mime);
    if ($resMail === true) {
        return true;
    }

    return "Pengiriman email gagal. (Port 465: {$res465} | Port 587: {$res587} | mail(): {$resMail})";
}

function tryPhpMail($fromName, $from, $to, $subject, $mixedBoundary, $mime)
{
    $fromEncoded = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $headers  = "From: {$fromEncoded} <{$from}>\r\n";
    $headers .= "Reply-To: {$from}\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: multipart/mixed; boundary=\"{$mixedBoundary}\"\r\n";
    $headers .= "X-Mailer: GSSI-Photobooth/1.0";

    $subjectEncoded = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    $ok = @mail($to, $subjectEncoded, $mime, $headers, "-f{$from}");
    if ($ok) {
        return true;
    }
    return "Fungsi mail() PHP tidak diizinkan server";
}

function trySmtpSsl465($host, $user, $pass, $from, $to, $msgHeaders, $mime)
{
    $errno  = 0;
    $errstr = '';
    $context = stream_context_create(array(
        'ssl' => array(
            'verify_peer'       => false,
            'verify_peer_name'  => false,
            'allow_self_signed' => true
        )
    ));
    $conn   = @stream_socket_client("ssl://{$host}:465", $errno, $errstr, 12, STREAM_CLIENT_CONNECT, $context);
    if (!$conn) {
        return "Gagal konek ssl://{$host}:465 - {$errstr} ({$errno})";
    }
    stream_set_timeout($conn, 12);

    $read = function () use ($conn) {
        $resp = '';
        while (true) {
            $line = fgets($conn, 512);
            if ($line === false) break;
            $resp .= $line;
            if (strlen($line) >= 4 && $line[3] === ' ') break;
        }
        return $resp;
    };

    $cmd = function ($c) use ($conn, $read) {
        fwrite($conn, $c . "\r\n");
        return $read();
    };

    try {
        $r = $read();
        if (substr(trim($r), 0, 3) !== '220') {
            fclose($conn);
            return "Banner SSL 465: $r";
        }

        $r = $cmd("EHLO " . gethostname());
        if (substr(trim($r), 0, 3) !== '250') {
            fclose($conn);
            return "EHLO 465: $r";
        }

        $r = $cmd("AUTH LOGIN");
        if (substr(trim($r), 0, 3) !== '334') {
            fclose($conn);
            return "AUTH LOGIN 465: $r";
        }

        $r = $cmd(base64_encode($user));
        if (substr(trim($r), 0, 3) !== '334') {
            fclose($conn);
            return "Username AUTH 465: $r";
        }

        $r = $cmd(base64_encode($pass));
        if (substr(trim($r), 0, 3) !== '235') {
            fclose($conn);
            return "Password AUTH 465: $r";
        }

        $r = $cmd("MAIL FROM:<{$from}>");
        if (substr(trim($r), 0, 3) !== '250') {
            fclose($conn);
            return "MAIL FROM 465: $r";
        }

        $r = $cmd("RCPT TO:<{$to}>");
        if (substr(trim($r), 0, 3) !== '250') {
            fclose($conn);
            return "RCPT TO 465: $r";
        }

        $r = $cmd("DATA");
        if (substr(trim($r), 0, 3) !== '354') {
            fclose($conn);
            return "DATA 465: $r";
        }

        fwrite($conn, $msgHeaders . "\r\n" . $mime . "\r\n.\r\n");
        $r = $read();
        if (substr(trim($r), 0, 3) !== '250') {
            fclose($conn);
            return "Data 465: $r";
        }

        $cmd("QUIT");
        fclose($conn);
        return true;
    } catch (\Exception $e) {
        if (is_resource($conn)) fclose($conn);
        return "Exception 465: " . $e->getMessage();
    }
}

function trySmtpStartTls587($host, $user, $pass, $from, $to, $msgHeaders, $mime)
{
    $errno  = 0;
    $errstr = '';
    $context = stream_context_create(array(
        'ssl' => array(
            'verify_peer'       => false,
            'verify_peer_name'  => false,
            'allow_self_signed' => true
        )
    ));
    $conn   = @stream_socket_client("tcp://{$host}:587", $errno, $errstr, 12, STREAM_CLIENT_CONNECT, $context);
    if (!$conn) {
        return "Gagal konek tcp://{$host}:587 - {$errstr} ({$errno})";
    }
    stream_set_timeout($conn, 12);

    $read = function () use ($conn) {
        $resp = '';
        while (true) {
            $line = fgets($conn, 512);
            if ($line === false) break;
            $resp .= $line;
            if (strlen($line) >= 4 && $line[3] === ' ') break;
        }
        return $resp;
    };

    $cmd = function ($c) use ($conn, $read) {
        fwrite($conn, $c . "\r\n");
        return $read();
    };

    try {
        $r = $read();
        if (substr(trim($r), 0, 3) !== '220') {
            fclose($conn);
            return "Banner 587: $r";
        }

        $r = $cmd("EHLO " . gethostname());
        if (substr(trim($r), 0, 3) !== '250') {
            fclose($conn);
            return "EHLO 587: $r";
        }

        $r = $cmd("STARTTLS");
        if (substr(trim($r), 0, 3) !== '220') {
            fclose($conn);
            return "STARTTLS 587: $r";
        }

        $crypto = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
        if (!@stream_socket_enable_crypto($conn, true, $crypto)) {
            $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
            if (!@stream_socket_enable_crypto($conn, true, $crypto)) {
                fclose($conn);
                return "TLS upgrade 587 gagal";
            }
        }

        $r = $cmd("EHLO " . gethostname());
        if (substr(trim($r), 0, 3) !== '250') {
            fclose($conn);
            return "EHLO setelah TLS 587: $r";
        }

        $r = $cmd("AUTH LOGIN");
        if (substr(trim($r), 0, 3) !== '334') {
            fclose($conn);
            return "AUTH LOGIN 587: $r";
        }

        $r = $cmd(base64_encode($user));
        if (substr(trim($r), 0, 3) !== '334') {
            fclose($conn);
            return "Username AUTH 587: $r";
        }

        $r = $cmd(base64_encode($pass));
        if (substr(trim($r), 0, 3) !== '235') {
            fclose($conn);
            return "Password AUTH 587: $r";
        }

        $r = $cmd("MAIL FROM:<{$from}>");
        if (substr(trim($r), 0, 3) !== '250') {
            fclose($conn);
            return "MAIL FROM 587: $r";
        }

        $r = $cmd("RCPT TO:<{$to}>");
        if (substr(trim($r), 0, 3) !== '250') {
            fclose($conn);
            return "RCPT TO 587: $r";
        }

        $r = $cmd("DATA");
        if (substr(trim($r), 0, 3) !== '354') {
            fclose($conn);
            return "DATA 587: $r";
        }

        fwrite($conn, $msgHeaders . "\r\n" . $mime . "\r\n.\r\n");
        $r = $read();
        if (substr(trim($r), 0, 3) !== '250') {
            fclose($conn);
            return "Data 587: $r";
        }

        $cmd("QUIT");
        fclose($conn);
        return true;
    } catch (\Exception $e) {
        if (is_resource($conn)) fclose($conn);
        return "Exception 587: " . $e->getMessage();
    }
}
