#!/usr/bin/env bash
set -euo pipefail

TOKEN_URL='https://rolexcoderz.in/api/get-token'
CONTENT_URL='https://rolexcoderz.in/api/get-live-classes'
UA='Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
REFERER='https://rolexcoderz.in/live-classes'

log() {
    echo "[`date '+%Y-%m-%d %H:%M:%S'`] $*"
}

write_error_json() {
    local TYPE="$1"
    local MSG="$2"
    log "❌ Error for $TYPE: $MSG"
    echo "{\"status\":false,\"error\":\"$MSG\"}" >&2
}

fetch_type() {
    local TYPE="$1"
    log "=== Fetching $TYPE ==="

    # Fetch token
    log "Fetching token..."
    local resp ts sig
    resp=$(curl -s "$TOKEN_URL" -H "User-Agent: $UA" -H "Referer: $REFERER" --compressed)
    log "Raw token response: $resp"
    ts=$(echo "$resp" | grep -oP '"timestamp":\K[0-9]+')
    sig=$(echo "$resp" | grep -oP '"signature":"\K[a-f0-9]+')

    if [[ -z "$ts" || -z "$sig" ]]; then
        write_error_json "$TYPE" "Token fetch failed or parsing failed"
        return 1
    fi
    log "Using timestamp=$ts and signature=$sig"

    # Fetch content
    log "Fetching content..."
    local content b64
    content=$(curl -s "$CONTENT_URL" -H 'Content-Type: application/json' \
      -H "x-timestamp: $ts" -H "x-signature: $sig" \
      -H "User-Agent: $UA" -H "Referer: $REFERER" \
      --data-raw "{\"type\":\"$TYPE\"}" --compressed)
    log "Raw content response: ${content:0:200}..." # only first 200 chars

    b64=$(echo "$content" | grep -oP '"data":"\K[^"]+')

    if [[ -z "$b64" ]]; then
        local api_error
        api_error=$(echo "$content" | grep -oP '"error":"\K[^"]+' || echo "Unknown API error")
        write_error_json "$TYPE" "No data field found. API error: $api_error"
        return 1
    fi
    log "Base64 data extracted successfully (length=${#b64})"

    # Decode and modify
    log "Decoding Base64..."
    local decoded
    if ! decoded=$(echo "$b64" | base64 --decode); then
        write_error_json "$TYPE" "Failed to decode Base64"
        return 1
    fi
    log "Decoding successful"

    log "Modifying content..."
    decoded=$(echo "$decoded" | sed -e 's|https://www.rolexcoderz.xyz/Player/?url=||gI' \
                                    -e 's/rolex coderz/smartrz/gI' \
                                    -e 's/rolexcoderz\.xyz/smartrz/gI' \
                                    -e 's/rolexcoderz/smartrz/gI')
    log "Modification done for $TYPE"

    echo "$decoded"
}

log "=== Starting combined API fetch ==="

live=$(fetch_type "live") || log "Failed to fetch live"
up=$(fetch_type "up") || log "Failed to fetch up"
completed=$(fetch_type "completed") || log "Failed to fetch completed"

log "=== Fetch completed ==="
echo "{\"live\":$live,\"up\":$up,\"completed\":$completed}"
