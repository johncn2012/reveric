#!/usr/bin/env python3
import sys
import os
import datetime
import hashlib
import hmac
import urllib.request
import urllib.error

def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def get_signature_key(key, date_stamp, region_name, service_name):
    k_date = sign(('AWS4' + key).encode('utf-8'), date_stamp)
    k_region = sign(k_date, region_name)
    k_service = sign(k_region, service_name)
    k_signing = sign(k_service, 'aws4_request')
    return k_signing

def upload_file_to_r2(file_path, object_key, content_type='application/octet-stream'):
    endpoint = os.environ.get('S3_ENDPOINT', 'https://e333ffa5c685aa4bd5c9c5bb059e0bab.r2.cloudflarestorage.com').rstrip('/')
    bucket = os.environ.get('S3_BUCKET', 'metaarc')
    access_key = os.environ.get('S3_ACCESS_KEY_ID', '381df2273b545b4fdbd3fbb09d9d8739')
    secret_key = os.environ.get('S3_SECRET_ACCESS_KEY', '5851b19a6b45fc1f326ab6799d19ea5ea60a7fbf0de990b55d84a97ba97745c8')
    region = os.environ.get('S3_REGION', 'auto')

    host = endpoint.replace('https://', '').replace('http://', '')
    url_path = f"/{bucket}/{object_key.lstrip('/')}"
    full_url = f"{endpoint}{url_path}"

    print(f"Reading {file_path}...")
    with open(file_path, 'rb') as f:
        payload = f.read()

    payload_hash = hashlib.sha256(payload).hexdigest()
    t = datetime.datetime.utcnow()
    amz_date = t.strftime('%Y%m%dT%H%M%SZ')
    date_stamp = t.strftime('%Y%m%d')

    canonical_uri = url_path
    canonical_querystring = ''
    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = 'content-type;host;x-amz-content-sha256;x-amz-date'

    canonical_request = (
        f"PUT\n"
        f"{canonical_uri}\n"
        f"{canonical_querystring}\n"
        f"{canonical_headers}\n"
        f"{signed_headers}\n"
        f"{payload_hash}"
    )

    algorithm = 'AWS4-HMAC-SHA256'
    credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
    string_to_sign = (
        f"{algorithm}\n"
        f"{amz_date}\n"
        f"{credential_scope}\n"
        f"{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"
    )

    signing_key = get_signature_key(secret_key, date_stamp, region, 's3')
    signature = hmac.new(signing_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()

    auth_header = (
        f"{algorithm} "
        f"Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )

    req = urllib.request.Request(full_url, data=payload, method='PUT')
    req.add_header('Host', host)
    req.add_header('Content-Type', content_type)
    req.add_header('x-amz-date', amz_date)
    req.add_header('x-amz-content-sha256', payload_hash)
    req.add_header('Authorization', auth_header)

    print(f"Uploading {len(payload)} bytes to {full_url}...")
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Upload success! HTTP {resp.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode('utf-8', errors='replace')}")
        return False
    except Exception as e:
        print(f"Upload failed: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: upload-r2.py <local_path> <object_key> [content_type]")
        sys.exit(1)
    file_path = sys.argv[1]
    object_key = sys.argv[2]
    content_type = sys.argv[3] if len(sys.argv) > 3 else 'application/octet-stream'
    success = upload_file_to_r2(file_path, object_key, content_type)
    sys.exit(0 if success else 1)
