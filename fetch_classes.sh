#!/usr/bin/env bash
set -euo pipefail

# --- Configuration ---
TOKEN_URL='https://rolexcoderz.in/api/get-token'
CONTENT_URL='https://rolexcoderz.in/api/get-live-classes'

# Default headers
UA='Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
REFERER='https://rolexcoderz.in/live-classes'

# --- Function to write a standard error JSON file ---
# Arguments:
#   $1: The output file path
#   $2: The error message string
#   $3: The error code string
write_error_json() {
    local file="$1"
    local error_msg="$2"
    local error_code="$3"
    # Using printf to safely create the JSON string
    printf '{"status":false, "error":"%s", "errorCode":"%s"}\n' "$error_msg" "$error_code" > "$file"
    echo "Error: ${error_msg}. Created error file at ${file}"
}


# --- Function to Fetch and Decode Content ---
# Fetches content, decodes it, and then modifies the resulting JSON.
# Arguments:
#   $1: The type of content to fetch (e.g., "live", "up", "completed")
fetch_and_decode_content() {
    local TYPE="$1"
    local PAYLOAD="{\"type\":\"$TYPE\"}"
    local OUTPUT_FILE="output_${TYPE}.json"

    echo "--- Starting fetch for type: ${TYPE} ---"

    # 1) Fetch token
    local resp
    # CONSOLIDATED: Curl command now on a single line to avoid line continuation errors.
    resp=$(curl -s "$TOKEN_URL" -H "User-Agent: $UA" -H "Referer: $REFERER" --compressed)

    # 2) Extract timestamp & signature using grep -oP (Perl-style regex)
    # Using '|| true' to prevent 'set -e' from exiting if grep finds no match.
    local ts
    ts=$(echo "$resp" | grep -oP '"timestamp":\K[0-9]+' || true)
    local sig
    sig=$(echo "$resp" | grep -oP '"signature":"\K[a-f0-9]+' || true)

    if [[ -z "$ts" || -z "$sig" ]]; then
        write_error_json "$OUTPUT_FILE" "Failed to get a valid token or parsing failed. Raw response was: ${resp}" "TOKEN_FETCH_FAILED"
        echo "--- Finished fetch for type: ${TYPE} with an error ---"
        return
    fi

    echo "Using timestamp=$ts and signature=$sig"

    # 3) Call the content endpoint and save the raw JSON response to a temp file
    local TEMP_FILE
    TEMP_FILE=$(mktemp)
    
    # CONSOLIDATED: Content curl command now on a single line. (This is the area we cleaned up)
    curl -s "$CONTENT_URL" -H 'Content-Type: application/json' -H "x-timestamp: $ts" -H "x-signature: $sig" -H "User-Agent: $UA" -H "Referer: $REFERER" --data-raw "$PAYLOAD" --compressed -o "$TEMP_FILE"

    echo "Saved raw API response to temporary file: ${TEMP_FILE}"

    # 4) Extract Base64 'data' field using grep -oP.
    # We look for "data":" followed by non-quote characters.
    local b64data
    b64data=$(grep -oP '"data":"\K[^"]+' "$TEMP_FILE" || true)

    if [[ -z "$b64data" ]]; then
        # If extraction failed, try to pull out any explicit API error message
        local api_error_msg
        # Fallback to a default error message if grep fails to find "error"
        api_error_msg=$(grep -oP '"error":"\K[^"]+' "$TEMP_FILE" || echo "API response missing expected Base64 data field.")
        local api_error_code
        # Fallback to a default error code if grep fails to find "errorCode"
        api_error_code=$(grep -oP '"errorCode":"\K[^"]+' "$TEMP_FILE" || echo "INVALID_RESPONSE_DATA")

        write_error_json "$OUTPUT_FILE" "Failed to extract Base64 data. API message: ${api_error_msg}" "${api_error_code}"
        echo "Raw response was:"
        cat "$TEMP_FILE"
        rm "$TEMP_FILE"
        echo "--- Finished fetch for type: ${TYPE} with an error ---"
        return
    fi
    
    # 5) Decode the Base64 data and check for errors. Output to the final file.
    if ! echo "$b64data" | base64 --decode > "$OUTPUT_FILE"; then
        write_error_json "$OUTPUT_FILE" "The 'data' field contained invalid Base64 content." "BASE64_DECODE_FAILED"
        rm "$TEMP_FILE"
        echo "--- Finished fetch for type: ${TYPE} with an error ---"
        return
    fi
    
    # --- MODIFICATION BLOCK ---
    # If decoding was successful, post-process the resulting JSON file.
    echo "Decoding successful. Now modifying content..."

    # 1. Remove the URL prefix from all link values (now case-insensitive).
    sed -i 's|https://www.rolexcoderz.xyz/Player/?url=||gI' "$OUTPUT_FILE"

    # 2. Replace all variations of 'rolexcoderz' with 'smartrz' (case-insensitive).
    # Order is important: we match the most specific patterns first.
    sed -i 's/rolex coderz/smartrz/gI' "$OUTPUT_FILE"
    sed -i 's/rolexcoderz\.xyz/smartrz/gI' "$OUTPUT_FILE"
    sed -i 's/rolexcoderz/smartrz/gI' "$OUTPUT_FILE"

    echo "Successfully decoded and modified content saved to ${OUTPUT_FILE}"

    # Clean up
    rm "$TEMP_FILE"
    echo "--- Finished fetch for type: ${TYPE} ---"
}

# --- Main Execution ---
echo "Starting combined API data fetch..."

# Call the function for each required content type
fetch_and_decode_content "live"
echo ""
fetch_and_decode_content "up"
echo ""
fetch_and_decode_content "completed"

echo ""
echo "All done! Files created:"
echo "- output_live.json"
echo "- output_up.json"
echo "- output_completed.json"
