#!/bin/bash
# ===========================================
#  Deploy Lead Scraper to Cloud Storage
#  Zips the tool and uploads to the same path
#  the download button in the Chimp app uses.
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUCKET="teamlog-2d74c.appspot.com"
STORAGE_PATH="public/lead-scraper-v3.zip"
ZIP_FILE="/tmp/lead-scraper-deploy.zip"

echo ""
echo "========================================"
echo "  Deploying Lead Scraper"
echo "========================================"
echo ""

# Clean up old zip
rm -f "$ZIP_FILE"

# Create zip from lead-scraper directory (rename to lead_scraper for consistency)
cd "$SCRIPT_DIR"
cd ..
zip -r "$ZIP_FILE" lead-scraper/ \
  -x "lead-scraper/data/*" \
  -x "lead-scraper/__pycache__/*" \
  -x "lead-scraper/venv/*" \
  -x "lead-scraper/*.pyc" \
  -x "lead-scraper/deploy.sh" \
  -x "lead-scraper/.DS_Store"

echo ""
echo "Created zip: $ZIP_FILE"
echo "Size: $(du -h "$ZIP_FILE" | cut -f1)"
echo ""

# Upload to Cloud Storage
echo "Uploading to gs://$BUCKET/$STORAGE_PATH ..."
gsutil cp "$ZIP_FILE" "gs://$BUCKET/$STORAGE_PATH"
gsutil acl ch -u AllUsers:R "gs://$BUCKET/$STORAGE_PATH"

echo ""
echo "Done! The download button now serves the updated scraper."
echo "URL: https://storage.googleapis.com/$BUCKET/$STORAGE_PATH"
echo ""

# Cleanup
rm -f "$ZIP_FILE"
