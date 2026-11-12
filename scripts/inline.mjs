// dist/index.html 하나에 JS·CSS를 넣는다 (claude.ai 등 샌드박스 호스팅용 단일 파일)
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const js = readFileSync('dist/assets/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync('dist/assets/index.css', 'utf8');
const out = html
  .replace(/<script type="module"[^>]*src="\.\/assets\/app\.js"[^>]*><\/script>/, '')
  .replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/index\.css"[^>]*>/, () => `<style>${css}</style>`)
  .replace('</body>', () => `<script type="module">${js}</script>\n  </body>`);
writeFileSync('dist/single.html', out);
console.log('dist/single.html', out.length, 'bytes');
