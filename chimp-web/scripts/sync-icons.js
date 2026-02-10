#!/usr/bin/env node

/**
 * sync-icons.js
 *
 * Scans all Angular template (.html) and component (.ts) files for Material
 * Symbol icon usage, then updates the Google Fonts `icon_names` parameter in
 * index.html so you never have to maintain that list by hand.
 *
 * Usage:
 *   node scripts/sync-icons.js          # update index.html
 *   node scripts/sync-icons.js --check  # CI mode — exit 1 if index.html is out of date
 *
 * Hooks into npm via "prestart" and "prebuild" in package.json.
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────

const SRC_DIR = path.join(__dirname, '..', 'src');
const INDEX_HTML = path.join(SRC_DIR, 'index.html');

// Icons that can't be detected statically (e.g. composed at runtime from
// server data). Add entries here if the script misses one.
const MANUAL_INCLUDES = [
  // 'some_rare_icon',
];

// Strings that match the icon-name pattern but are definitely not icons.
// Only add false positives that actually show up in the generated list.
const FALSE_POSITIVES = new Set([
  // Programming / data types
  'application', 'production', 'development', 'spreadsheet',
  'msword', 'default', 'required', 'enabled', 'disabled',
  'lowercase', 'undefined', 'boolean', 'string', 'number',
  // Common property/variable names that look like icon names
  'checked', 'created', 'dialog', 'picker', 'inspections',
  'team', 'training', 'analysis', 'warn', 'good', 'yes', 'no',
  'high', 'low', 'asc', 'desc', 'active', 'inactive',
  'pending', 'completed', 'cancelled', 'failed', 'success',
  'submitted', 'approved', 'rejected', 'expired', 'overdue',
]);

// A valid Material Symbols icon name: lowercase letters, digits, underscores.
const ICON_NAME_RE = /^[a-z][a-z0-9_]{1,35}$/;

// ─── File discovery ─────────────────────────────────────────────────────────

function walk(dir, extensions) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      results.push(...walk(full, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

// ─── Extraction helpers ─────────────────────────────────────────────────────

function isIconName(s) {
  return ICON_NAME_RE.test(s) && !FALSE_POSITIVES.has(s);
}

function addAll(set, values) {
  for (const v of values) if (isIconName(v)) set.add(v);
}

/** Extract icons from an Angular template (.html) */
function extractFromHtml(content) {
  const icons = new Set();

  // 1) Static text content: <mat-icon>icon_name</mat-icon>
  //    Excludes anything that starts with {{ (handled below).
  const staticRe = /<mat-icon[^>]*>\s*([a-z][a-z0-9_]+)\s*<\/mat-icon>/gi;
  let m;
  while ((m = staticRe.exec(content))) {
    const name = m[1].trim();
    // Skip if it looks like an interpolation expression leaked through
    if (!name.includes('{')) addAll(icons, [name]);
  }

  // 2) Dynamic interpolations inside <mat-icon>{{ expr }}</mat-icon>
  //    Pull every quoted string out of the expression.
  const dynamicRe = /<mat-icon[^>]*>\s*\{\{([\s\S]*?)\}\}\s*<\/mat-icon>/gi;
  while ((m = dynamicRe.exec(content))) {
    const expr = m[1];
    const strRe = /['"]([a-z][a-z0-9_]+)['"]/g;
    let sm;
    while ((sm = strRe.exec(expr))) addAll(icons, [sm[1]]);
  }

  // 3) fontIcon attribute: <mat-icon fontIcon="icon_name">
  const fontIconRe = /fontIcon\s*=\s*["']([a-z][a-z0-9_]+)["']/gi;
  while ((m = fontIconRe.exec(content))) addAll(icons, [m[1]]);

  // 4) [fontIcon]="'icon_name'" (property binding)
  const fontIconBindRe = /\[fontIcon\]\s*=\s*"'([a-z][a-z0-9_]+)'"/gi;
  while ((m = fontIconBindRe.exec(content))) addAll(icons, [m[1]]);

  return icons;
}

/** Extract icons from a TypeScript component/service (.ts) */
function extractFromTs(content) {
  const icons = new Set();
  let m;

  // 1) Object properties: icon: 'name'  /  icon: "name"
  const iconPropRe = /icon\s*:\s*['"]([a-z][a-z0-9_]+)['"]/gi;
  while ((m = iconPropRe.exec(content))) addAll(icons, [m[1]]);

  // 2) Icon map objects (CATEGORY_ICONS, etc.)
  //    Match: const ANYTHING_ICON(S) = { ... }  or  ANYTHING_icon(s) = { ... }
  const mapBlockRe = /(?:const|let|var|readonly)\s+\w*[Ii]con\w*\s*(?::\s*[^=]+)?\s*=\s*\{([^}]+)\}/gs;
  while ((m = mapBlockRe.exec(content))) {
    const block = m[1];
    // Extract all string values (right-hand side of key: value pairs)
    const valRe = /:\s*['"]([a-z][a-z0-9_]+)['"]/g;
    let vm;
    while ((vm = valRe.exec(block))) addAll(icons, [vm[1]]);
  }

  // 3) Return values from functions with "icon" in the name:
  //    getEventIcon(...)  { ... return 'description'; ... }
  //    We approximate this by finding function bodies that contain "icon" in the
  //    function signature and extracting return 'value' statements.
  //    Also catches simple return 'icon' statements in switch cases.
  const fnRe = /(?:get\w*Icon\w*|icon\w*)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{([\s\S]*?\n\s*\})/gi;
  while ((m = fnRe.exec(content))) {
    const body = m[1];
    const retRe = /return\s+['"]([a-z][a-z0-9_]+)['"]/g;
    let rm;
    while ((rm = retRe.exec(body))) addAll(icons, [rm[1]]);
  }

  // 4) Fallback icon arrays: ['checklist', 'task_alt', ...]
  //    Match arrays of 3+ quoted strings assigned to *icon* variables
  const arrRe = /[Ii]con\w*\s*=\s*\[([\s\S]*?)\]/g;
  while ((m = arrRe.exec(content))) {
    const arr = m[1];
    const strRe = /['"]([a-z][a-z0-9_]+)['"]/g;
    let sm;
    while ((sm = strRe.exec(arr))) addAll(icons, [sm[1]]);
  }

  // 5) Broader fallback: any 'icon_name' on a line referencing mat-icon / MatIcon
  const lines = content.split('\n');
  for (const line of lines) {
    if (/mat-icon|MatIcon|matIcon|fontIcon/i.test(line)) {
      const strRe = /['"]([a-z][a-z0-9_]+)['"]/g;
      while ((m = strRe.exec(line))) addAll(icons, [m[1]]);
    }
  }

  return icons;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function run() {
  const checkMode = process.argv.includes('--check');
  const icons = new Set(MANUAL_INCLUDES.filter(isIconName));

  // Scan HTML files
  const htmlFiles = walk(SRC_DIR, ['.html']);
  for (const file of htmlFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const icon of extractFromHtml(content)) icons.add(icon);
  }

  // Scan TS files
  const tsFiles = walk(SRC_DIR, ['.ts']);
  for (const file of tsFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const icon of extractFromTs(content)) icons.add(icon);
  }

  const sorted = [...icons].sort();

  // Read current index.html
  const html = fs.readFileSync(INDEX_HTML, 'utf-8');

  // Match the existing Google Fonts Material Symbols link
  const linkRe = /(href="https:\/\/fonts\.googleapis\.com\/css2\?family=Material\+Symbols\+Outlined&icon_names=)[^"]*(&display=block")/;
  const match = html.match(linkRe);
  if (!match) {
    console.error('ERROR: Could not find the Material Symbols Outlined <link> in index.html');
    process.exit(1);
  }

  const newList = sorted.join(',');
  const newHtml = html.replace(linkRe, `$1${newList}$2`);

  if (checkMode) {
    if (html !== newHtml) {
      console.error('Icon list in index.html is out of date. Run: npm run sync-icons');

      // Show diff
      const oldList = match[0].replace(match[1], '').replace(match[2], '');
      const oldIcons = new Set(oldList.split(',').map(s => s.trim()).filter(Boolean));
      const missing = sorted.filter(i => !oldIcons.has(i));
      const extra = [...oldIcons].filter(i => !icons.has(i));
      if (missing.length) console.error('  Missing:', missing.join(', '));
      if (extra.length) console.error('  Extra (unused):', extra.join(', '));
      process.exit(1);
    }
    console.log('Icon list is up to date.');
    return;
  }

  if (html === newHtml) {
    console.log(`✓ Icons are up to date (${sorted.length} icons)`);
    return;
  }

  // Show what changed
  const oldList = match[0].replace(match[1], '').replace(match[2], '');
  const oldIcons = new Set(oldList.split(',').map(s => s.trim()).filter(Boolean));
  const added = sorted.filter(i => !oldIcons.has(i));
  const removed = [...oldIcons].filter(i => !icons.has(i));

  fs.writeFileSync(INDEX_HTML, newHtml, 'utf-8');

  console.log(`✓ Updated icon list in index.html (${sorted.length} icons)`);
  if (added.length) console.log(`  Added:   ${added.join(', ')}`);
  if (removed.length) console.log(`  Removed: ${removed.join(', ')}`);
}

run();
