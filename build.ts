// Build script for production
import { mkdir, rm, cp } from 'fs/promises';
import { existsSync } from 'fs';

const DIST = './dist';

async function build() {
  console.log('Building for production...\n');

  // Clean dist folder
  if (existsSync(DIST)) {
    await rm(DIST, { recursive: true });
  }
  await mkdir(DIST);
  await mkdir(`${DIST}/styles`);

  // Bundle JS modules
  console.log('Bundling JavaScript...');
  const result = await Bun.build({
    entrypoints: ['./app.js'],
    outdir: DIST,
    minify: true,
    target: 'browser',
    format: 'esm',
  });

  if (!result.success) {
    console.error('Build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  // Copy and transform HTML (update script src)
  console.log('Processing HTML...');
  const html = await Bun.file('./index.html').text();
  const transformedHtml = html
    .replace('type="module" src="app.js"', 'type="module" src="app.js"');
  await Bun.write(`${DIST}/index.html`, transformedHtml);

  // Copy CSS files
  console.log('Copying stylesheets...');
  await cp('./styles', `${DIST}/styles`, { recursive: true });

  // Copy any other static assets if they exist
  const staticFiles = ['favicon.ico', 'robots.txt'];
  for (const file of staticFiles) {
    if (existsSync(`./${file}`)) {
      await cp(`./${file}`, `${DIST}/${file}`);
    }
  }

  console.log('\n✓ Build complete! Output in ./dist');

  // Show bundle sizes
  const bundleFile = Bun.file(`${DIST}/app.js`);
  const bundleSize = bundleFile.size;
  console.log(`  app.js: ${(bundleSize / 1024).toFixed(1)} KB`);
}

build().catch(console.error);
