<?php
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$basePath = rtrim(dirname($scriptName), '/\\');
if ($basePath === '/' || $basePath === '.') {
    $basePath = '';
}

$requestUri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';

if ($basePath !== '' && strpos($requestUri, $basePath) === 0) {
    $requestUri = substr($requestUri, strlen($basePath));
}

if ($requestUri === '') {
    $requestUri = '/';
}

$route = rtrim($requestUri, '/');
if ($route === '') {
    $route = '/';
}

if (preg_match('/\/send-mail(\.php)?$/i', $route)) {
    require __DIR__ . '/send-mail.php';
    exit;
}

if (preg_match('/\/save-photo(\.php)?$/i', $route)) {
    require __DIR__ . '/save-photo.php';
    exit;
}

switch ($route) {
    case '/':
        require __DIR__ . '/views/home.php';
        break;

    case '/gallery':
        require __DIR__ . '/views/gallery.php';
        break;

    case '/booth':
        require __DIR__ . '/views/booth.php';
        break;

    default:
        http_response_code(404);
        require __DIR__ . '/views/404.php';
        break;
}
