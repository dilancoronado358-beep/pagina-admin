const fs = require('fs');
let html = fs.readFileSync('c:\\Users\\usuario\\Desktop\\TURNERO\\index.html', 'utf8');

const styleRegex = /<style>([\s\S]*?)<\/style>/;
const scriptRegex = /<script>([\s\S]*?)<\/script>/g; // We need the last one

const styleMatch = html.match(styleRegex);
if (styleMatch) {
  fs.writeFileSync('c:\\Users\\usuario\\Desktop\\TURNERO\\style.css', styleMatch[1].trim());
  html = html.replace(styleRegex, '<link rel="stylesheet" href="style.css?v=1">');
}

let match;
let lastScript = null;
while ((match = scriptRegex.exec(html)) !== null) {
  lastScript = match;
}

if (lastScript) {
  fs.writeFileSync('c:\\Users\\usuario\\Desktop\\TURNERO\\app.js', lastScript[1].trim());
  html = html.substring(0, lastScript.index) + '<script src="app.js?v=1"></script>' + html.substring(lastScript.index + lastScript[0].length);
}

fs.writeFileSync('c:\\Users\\usuario\\Desktop\\TURNERO\\index.html', html);
