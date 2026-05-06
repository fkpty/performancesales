<?php
/**
 * Performance Sales Entry Point
 * ========================
 * Apache serves this file for all requests to /performance-sales/.
 * It validates hub session access, then serves the React SPA.
 */

// Load local env overrides before defining endpoints so config.php can
// override the default hub/api locations when needed.
$envFile = __DIR__ . '/config.php';
if (file_exists($envFile)) {
    require_once $envFile;
}

function contractosEnv(string $key, string $default): string
{
    $value = getenv($key);

    return is_string($value) && $value !== '' ? $value : $default;
}

function detectAppPublicBase(): string
{
    $isHttps = (
        (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    );
    $scheme = $isHttps ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'hub.collab.grouppbs.com';

    return $scheme . '://' . $host;
}

define('HUB_LOGIN_URL', contractosEnv('HUB_LOGIN_URL', 'https://hub.collab.grouppbs.com/login'));
define('APP_PUBLIC_BASE', contractosEnv('APP_PUBLIC_BASE', detectAppPublicBase()));
define('API_UPSTREAM_BASE', contractosEnv('API_UPSTREAM_BASE', 'http://127.0.0.1:3002'));
define('API_PROXY_SHARED_SECRET', contractosEnv('API_PROXY_SHARED_SECRET', 'replace_with_shared_proxy_secret'));
define('APP_TOKEN_COOKIE', contractosEnv('APP_TOKEN_COOKIE', 'performance_sales_token'));
define('API_UPSTREAM_FALLBACKS', contractosEnv('API_UPSTREAM_FALLBACKS', 'http://10.0.0.187:3002,http://127.0.0.1:3002'));

require_once __DIR__ . '/auth-bridge.php';

$requestUri  = $_SERVER['REQUEST_URI'] ?? '/performance-sales/';
$requestPath = parse_url($requestUri, PHP_URL_PATH) ?: '/performance-sales/';

if (shouldForceHttps()) {
    header('Location: ' . APP_PUBLIC_BASE . $requestUri, true, 302);
    exit;
}

if (strpos($requestPath, '/performance-sales/api') === 0) {
    // Diagnostic endpoint (PHP-handled, never proxied to Node)
    if ($requestPath === '/performance-sales/api/auth/debug' && isset($_GET['token']) && $_GET['token'] === 'ps-debug-2026') {
        header('Content-Type: text/plain; charset=UTF-8');
        echo "=== Performance Sales Auth Diagnostic ===\n\n";
        echo "Request path : $requestPath\n";
        echo "REMOTE_ADDR  : " . ($_SERVER['REMOTE_ADDR'] ?? '?') . "\n";
        echo "HTTPS        : " . ($_SERVER['HTTPS'] ?? 'off') . "\n";
        echo "Sec-Fetch    : " . ($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '?') . "\n";
        echo "Cookies      : " . (empty($_COOKIE) ? '[ninguna]' : implode(', ', array_keys($_COOKIE))) . "\n";
        $hubCookie = getenv('HUB_SESSION_COOKIE') ?: 'pbs_panama_hub_session';
        foreach ([$hubCookie, 'pbs_panama_hub_session', 'pbs-panama-hub-session', 'laravel_session'] as $cn) {
            if (!empty($_COOKIE[$cn])) {
                echo "Hub cookie '$cn': len=" . strlen($_COOKIE[$cn]) . "\n";
            }
        }
        echo "performance_sales_token: " . (empty($_COOKIE[APP_TOKEN_COOKIE]) ? 'NO' : 'YES len=' . strlen($_COOKIE[APP_TOKEN_COOKIE])) . "\n";
        $appKey = getenv('HUB_APP_KEY') ?: '';
        echo "HUB_APP_KEY configured: " . ($appKey ? 'YES' : 'NO') . "\n";
        $user = validateHubAccess();
        echo "validateHubAccess: " . ($user ? 'OK user_id=' . $user['user_id'] . ' name=' . $user['user_name'] : 'FAIL - null') . "\n";
        exit;
    }

    // Auth init endpoint – PHP-handled, bootstraps the session for the SPA.
    // The SPA calls this on startup to ensure a PHP session + app token
    // cookie exist before making any authenticated API calls.
    if ($requestPath === '/performance-sales/api/auth/whoami') {
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache');
        $user = validateHubAccess();
        if ($user) {
            echo json_encode([
                'ok' => true,
                'roles' => array_values($user['user_roles'] ?? []),
                'can_upload_reports' => !empty($user['can_upload_reports']),
                'user' => [
                    'id' => $user['user_id'] ?? null,
                    'name' => $user['user_name'] ?? '',
                    'email' => $user['user_email'] ?? '',
                    'roles' => array_values($user['user_roles'] ?? []),
                    'can_upload_reports' => !empty($user['can_upload_reports']),
                ],
            ]);
        } else {
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'No autorizado']);
        }
        exit;
    }

    $user = validateHubAccess();
    if ($user === null) {
        http_response_code(401);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['error' => 'No autorizado']);
        exit;
    }
    proxyApiRequest($requestUri, $user);
    exit;
}

$user = validateHubAccess();

// Debug mode: ?debug accessible only from the server itself
if ($user === null && isset($_GET['debug']) && in_array($_SERVER['REMOTE_ADDR'], ['127.0.0.1', '::1', '10.0.0.187'], true)) {
    header('Content-Type: text/plain; charset=UTF-8');
    echo "=== Performance Sales Auth Debug ===\n\n";
    echo "REMOTE_ADDR : " . $_SERVER['REMOTE_ADDR'] . "\n";
    echo "HTTPS       : " . ($_SERVER['HTTPS'] ?? 'off') . "\n";
    echo "Cookies     : " . implode(', ', array_keys($_COOKIE)) . "\n";
    $lsCookie = getenv('HUB_SESSION_COOKIE') ?: 'laravel_session';
    echo "laravel_session cookie present: " . (isset($_COOKIE[$lsCookie]) ? 'YES (len=' . strlen($_COOKIE[$lsCookie]) . ')' : 'NO') . "\n";
    echo "performance_sales_token cookie present: " . (isset($_COOKIE[APP_TOKEN_COOKIE]) ? 'YES' : 'NO') . "\n";
    echo "performance_sales_session (PHP): started=" . (session_status() !== PHP_SESSION_NONE ? 'YES' : 'NO') . "\n";
    exit;
}

// Attempt silent auth for embedded and direct launches, but never redirect the
// HTML shell away from /performance-sales. PBS Hub already controls access to
// the tool entry, and forcing a login redirect here breaks iframe embedding.
$isIframe = (($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '') === 'iframe');
if ($user === null) {
    $user = validateHubAccess();
}

// User is authenticated – serve the React SPA
$indexFile = __DIR__ . '/public/index.html';

if (!file_exists($indexFile)) {
    // SPA not built yet – show helpful message
    http_response_code(503);
    echo '<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Performance Sales – Setup Required</title>
<style>body{font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;margin:0;}
.card{background:#fff;border-radius:12px;padding:40px;max-width:480px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;}
h2{color:#1e293b;margin-bottom:8px;}p{color:#64748b;font-size:14px;line-height:1.6;}
code{background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:13px;}
</style></head><body>
<div class="card">
    <h2>🚀 Performance Sales</h2>
  <p>Authenticated as <strong>' . htmlspecialchars($user['user_name']) . '</strong>.</p>
  <p>The React frontend has not been built yet.</p>
  <p>Run:<br><code>cd frontend &amp;&amp; npm run build</code></p>
</div></body></html>';
    exit;
}

// Output the built SPA
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
// Security headers (no X-Frame-Options – allow same-origin iframe embedding)
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: frame-ancestors 'self' https://hub.collab.grouppbs.com https://10.0.0.187");

$html = file_get_contents($indexFile);
if ($html === false) {
    http_response_code(500);
    echo 'No se pudo leer el frontend compilado.';
    exit;
}

$bootstrapAuth = json_encode([
    'id' => $user['user_id'] ?? null,
    'name' => $user['user_name'] ?? '',
    'email' => $user['user_email'] ?? '',
    'roles' => array_values($user['user_roles'] ?? []),
    'can_upload_reports' => !empty($user['can_upload_reports']),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

$bootstrapScript = "<script>window.__PERFORMANCE_SALES_AUTH__={$bootstrapAuth};</script>";

if (strpos($html, '</head>') !== false) {
    echo str_replace('</head>', $bootstrapScript . '</head>', $html);
} else {
    echo $bootstrapScript . $html;
}

function proxyApiRequest(string $requestUri, array $user): void
{
    if (!function_exists('curl_init')) {
        http_response_code(500);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['error' => 'cURL no esta disponible en PHP.']);
        return;
    }

    $path = parse_url($requestUri, PHP_URL_PATH) ?: '/performance-sales/api';
    $query = parse_url($requestUri, PHP_URL_QUERY);
    $upstreamPath = preg_replace('#^/performance-sales/api#', '/api', $path, 1);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $rawBody = file_get_contents('php://input');

    $isMultipartUpload = !empty($_FILES);
    $forwardHeaders = [];
    foreach (getallheadersSafe() as $name => $value) {
        $lower = strtolower($name);
        if (in_array($lower, ['host', 'content-length', 'cookie'], true)) {
            continue;
        }

        // When PHP rebuilds multipart payloads with CURLFile, cURL must generate
        // its own Content-Type boundary. Forwarding the browser boundary here
        // causes multer/busboy to see a truncated form.
        if ($isMultipartUpload && $lower === 'content-type') {
            continue;
        }
        $forwardHeaders[] = $name . ': ' . $value;
    }

    $forwardHeaders[] = 'X-Performance-Sales-Proxy-Secret: ' . API_PROXY_SHARED_SECRET;
    $forwardHeaders[] = 'X-Performance-Sales-User-Id: ' . rawurlencode((string) ($user['user_id'] ?? ''));
    $forwardHeaders[] = 'X-Performance-Sales-User-Name: ' . rawurlencode((string) ($user['user_name'] ?? ''));
    $forwardHeaders[] = 'X-Performance-Sales-User-Email: ' . rawurlencode((string) ($user['user_email'] ?? ''));
    $forwardHeaders[] = 'X-Performance-Sales-User-Roles: ' . rawurlencode(json_encode(array_values($user['user_roles'] ?? [])));
    $forwardHeaders[] = 'X-Performance-Sales-Can-Upload: ' . (!empty($user['can_upload_reports']) ? '1' : '0');

    if (!empty($_COOKIE)) {
        $cookiePairs = [];
        foreach ($_COOKIE as $key => $value) {
            $cookiePairs[] = $key . '=' . $value;
        }
        $forwardHeaders[] = 'Cookie: ' . implode('; ', $cookiePairs);
    }

    $result = null;
    $errors = [];

    foreach (getApiUpstreamCandidates() as $upstreamBase) {
        $targetUrl = rtrim($upstreamBase, '/') . $upstreamPath . ($query ? ('?' . $query) : '');
        $attempt = forwardRequestToApi($targetUrl, $method, $rawBody, $isMultipartUpload, $forwardHeaders);

        if ($attempt['ok']) {
            $result = $attempt;
            break;
        }

        $errors[] = $attempt['error'];
    }

    if ($result === null) {
        http_response_code(502);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['error' => implode(' | ', $errors) ?: 'No se pudo conectar con la API backend.']);
        return;
    }

    $status = $result['status'];
    $rawHeaders = $result['headers'];
    $body = $result['body'];

    http_response_code($status);
    foreach (explode("\r\n", $rawHeaders) as $headerLine) {
        if (strpos($headerLine, ':') === false) {
            continue;
        }
        [$name, $value] = explode(':', $headerLine, 2);
        $name = trim($name);
        $value = trim($value);
        if ($name === '' || in_array(strtolower($name), ['transfer-encoding', 'content-encoding', 'connection'], true)) {
            continue;
        }
        header($name . ': ' . $value, false);
    }

    echo $body;
}

function getApiUpstreamCandidates(): array
{
    $candidates = array_merge(
        [API_UPSTREAM_BASE],
        array_map('trim', explode(',', API_UPSTREAM_FALLBACKS))
    );

    return array_values(array_unique(array_filter($candidates, static fn ($candidate): bool => $candidate !== '')));
}

function forwardRequestToApi(string $targetUrl, string $method, $rawBody, bool $isMultipartUpload, array $forwardHeaders): array
{
    $ch = curl_init($targetUrl);

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HEADER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_HTTPHEADER => $forwardHeaders,
    ]);

    if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        if ($isMultipartUpload) {
            $postFields = $_POST;
            foreach ($_FILES as $field => $file) {
                if (is_array($file['tmp_name'])) {
                    continue;
                }
                $postFields[$field] = new CURLFile(
                    $file['tmp_name'],
                    $file['type'] ?: 'application/octet-stream',
                    $file['name'] ?: basename($file['tmp_name'])
                );
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        } elseif ($rawBody !== false && $rawBody !== '') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
        }
    }

    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch) ?: ('No se pudo conectar con la API backend en ' . $targetUrl);
        curl_close($ch);

        return [
            'ok' => false,
            'error' => $error,
        ];
    }

    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE) ?: 502;
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE) ?: 0;
    $rawHeaders = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    curl_close($ch);

    return [
        'ok' => true,
        'status' => $status,
        'headers' => $rawHeaders,
        'body' => $body,
    ];
}

function getallheadersSafe(): array
{
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        return is_array($headers) ? $headers : [];
    }

    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (strpos($key, 'HTTP_') !== 0) {
            continue;
        }
        $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
        $headers[$name] = $value;
    }
    if (isset($_SERVER['CONTENT_TYPE'])) {
        $headers['Content-Type'] = $_SERVER['CONTENT_TYPE'];
    }
    if (isset($_SERVER['CONTENT_LENGTH'])) {
        $headers['Content-Length'] = $_SERVER['CONTENT_LENGTH'];
    }
    return $headers;
}

function shouldForceHttps(): bool
{
    $isHttps = (
        (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    );

    if ($isHttps) {
        return false;
    }

    $remote = $_SERVER['REMOTE_ADDR'] ?? '';
    return !in_array($remote, ['127.0.0.1', '::1', '10.0.0.187'], true);
}
