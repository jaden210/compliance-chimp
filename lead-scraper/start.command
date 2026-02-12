#!/bin/bash
# ===========================================
#  Lead Scraper - One-Click Start (macOS)
#  Double-click this file to launch.
# ===========================================

cd "$(dirname "$0")"
echo ""
echo "========================================"
echo "  Lead Scraper - Setting up..."
echo "========================================"
echo ""

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not installed."
    echo "Install it from https://www.python.org/downloads/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Create virtual environment if needed
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate
source venv/bin/activate

# Install dependencies if needed
if [ ! -f "venv/.deps_installed" ]; then
    echo "Installing dependencies (first time only)..."
    pip install -q -r requirements.txt
    playwright install chromium
    touch venv/.deps_installed
    echo ""
fi

echo "========================================"
echo "  Starting Lead Scraper UI..."
echo "  http://localhost:5500"
echo "========================================"
echo ""

python app.py
