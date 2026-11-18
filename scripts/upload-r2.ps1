param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    [Parameter(Mandatory=$true)]
    [string]$ObjectKey,
    [string]$ContentType = "application/octet-stream"
)
$ErrorActionPreference = "Stop"

$endpoint = $env:S3_ENDPOINT
if (!$endpoint) { $endpoint = "https://e333ffa5c685aa4bd5c9c5bb059e0bab.r2.cloudflarestorage.com" }
$bucket = $env:S3_BUCKET
if (!$bucket) { $bucket = "metaarc" }
$accessKey = $env:S3_ACCESS_KEY_ID
if (!$accessKey) { $accessKey = "381df2273b545b4fdbd3fbb09d9d8739" }
$secretKey = $env:S3_SECRET_ACCESS_KEY
if (!$secretKey) { $secretKey = "5851b19a6b45fc1f326ab6799d19ea5ea60a7fbf0de990b55d84a97ba97745c8" }
$region = $env:S3_REGION
if (!$region) { $region = "auto" }

$uriObj = [Uri]$endpoint
$hostName = $uriObj.Host

function HmacSha256([byte[]]$key, [string]$msg) {
    $hmac = [System.Security.Cryptography.HMACSHA256]::new($key)
    return $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($msg))
}

function HexString([byte[]]$bytes) {
    return [System.BitConverter]::ToString($bytes).Replace("-", "").ToLower()
}

Write-Host "Reading $FilePath..."
$fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$payloadHash = HexString($sha256.ComputeHash($fileBytes))

$now = [DateTime]::UtcNow
$amzDate = $now.ToString("yyyyMMddTHHmmssZ")
$dateStamp = $now.ToString("yyyyMMdd")

$cleanKey = $ObjectKey.TrimStart('/')
$urlPath = "/$bucket/$cleanKey"
$fullUrl = "$endpoint$urlPath"

$canonicalHeaders = "content-type:$ContentType`nhost:$hostName`nx-amz-content-sha256:$payloadHash`nx-amz-date:$amzDate`n"
$signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date"
$canonicalRequest = "PUT`n$urlPath`n`n$canonicalHeaders`n$signedHeaders`n$payloadHash"

$canonicalRequestHash = HexString($sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($canonicalRequest)))
$algorithm = "AWS4-HMAC-SHA256"
$credentialScope = "$dateStamp/$region/s3/aws4_request"
$stringToSign = "$algorithm`n$amzDate`n$credentialScope`n$canonicalRequestHash"

$kSecret = [System.Text.Encoding]::UTF8.GetBytes("AWS4$secretKey")
$kDate = HmacSha256 $kSecret $dateStamp
$kRegion = HmacSha256 $kDate $region
$kService = HmacSha256 $kRegion "s3"
$kSigning = HmacSha256 $kService "aws4_request"

$signature = HexString(HmacSha256 $kSigning $stringToSign)
$authHeader = "$algorithm Credential=$accessKey/$credentialScope, SignedHeaders=$signedHeaders, Signature=$signature"

$headers = @{
    "Host" = $hostName
    "Content-Type" = $ContentType
    "x-amz-date" = $amzDate
    "x-amz-content-sha256" = $payloadHash
    "Authorization" = $authHeader
}

Write-Host "Uploading $($fileBytes.Length) bytes to $fullUrl..."
$response = Invoke-WebRequest -Uri $fullUrl -Method Put -Body $fileBytes -Headers $headers -TimeoutSec 300
Write-Host "Upload completed with status code: $($response.StatusCode)"
