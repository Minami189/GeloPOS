const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'dist', 'index.html');

if (fs.existsSync(indexPath)) {
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Replace absolute paths with relative ones
  // For example: /_expo/ -> ./_expo/
  // /favicon.ico -> ./favicon.ico
  // /manifest.json -> ./manifest.json
  // /icon.png -> ./icon.png
  
  content = content.replace(/src="\//g, 'src="./');
  content = content.replace(/href="\//g, 'href="./');
  
  fs.writeFileSync(indexPath, content, 'utf8');
  console.log('[Post-Build] Converted absolute paths to relative in dist/index.html');
} else {
  console.error('[Post-Build] dist/index.html NOT FOUND. Run npm run build:web first.');
}
