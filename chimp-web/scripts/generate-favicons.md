# Favicon Generation Guide

To properly support all browsers and devices, you need to generate multiple favicon sizes from your chimp mascot image.

## Required Files

You need to create these files and place them in `src/assets/`:

| File | Size | Purpose |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Browser tab (standard) |
| `favicon-32x32.png` | 32x32 | Browser tab (retina) |
| `apple-touch-icon.png` | 180x180 | iOS home screen |
| `og-image.png` | 1200x630 | Social media previews |

## Option 1: Use RealFaviconGenerator (Recommended)

1. Go to https://realfavicongenerator.net/
2. Upload your `src/assets/chimpFace.png` or `chimp.png`
3. Customize settings (use theme color `#054D8A`)
4. Download the generated package
5. Extract and copy the PNG files to `src/assets/`
6. The `favicon.ico` should go to `src/favicon.ico`

## Option 2: Use ImageMagick (Command Line)

```bash
cd src/assets

# Generate from chimpFace.png (already 192x192)
convert chimpFace.png -resize 180x180 apple-touch-icon.png
convert chimpFace.png -resize 32x32 favicon-32x32.png
convert chimpFace.png -resize 16x16 favicon-16x16.png

# Generate ICO file (multi-size)
convert chimpFace.png -resize 16x16 favicon-16.png
convert chimpFace.png -resize 32x32 favicon-32.png
convert chimpFace.png -resize 48x48 favicon-48.png
convert favicon-16.png favicon-32.png favicon-48.png ../favicon.ico
rm favicon-16.png favicon-32.png favicon-48.png
```

## Option 3: Use macOS Preview

1. Open `chimpFace.png` in Preview
2. Go to Tools > Adjust Size
3. Set to 180x180 for apple-touch-icon
4. Export as `apple-touch-icon.png`
5. Repeat for 32x32 and 16x16

## OG Image (Open Graph)

For the Open Graph image (social media preview):

1. Open `scripts/generate-og-image.html` in Chrome
2. Use DevTools to capture the node screenshot at 1200x630
3. Save as `src/assets/og-image.png`

Or use a design tool like Figma/Canva to create a 1200x630 image with:
- Your chimp mascot
- "Compliance Chimp" branding
- Tagline: "Compliance made simple for small teams"
- Background color: #054D8A

## After Generating

Make sure these files exist:
- `src/assets/favicon-16x16.png`
- `src/assets/favicon-32x32.png`
- `src/assets/apple-touch-icon.png`
- `src/assets/og-image.png`
- `src/favicon.ico` (already exists, but you may want to update it)

Then rebuild and deploy your app.
