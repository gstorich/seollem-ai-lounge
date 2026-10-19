const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

(() => {
  // 1. robots.txt 존재 및 내용 검증
  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /Allow:\s*\//i);
  assert.match(robots, /Disallow:\s*\/admin/i);
  assert.match(robots, /Sitemap:\s*https:\/\/azitchat\.com\/sitemap\.xml/i);

  // 2. sitemap.xml 존재 및 내용 검증
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /<urlset/);
  assert.match(sitemap, /<loc>https:\/\/azitchat\.com\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/azitchat\.com\/about\.html<\/loc>/);

  // 3. index.html SEO 태그 검증
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(indexHtml, /<title>아지트챗 \(AzitChat\) - 1:1 실시간 AI 채팅 & 설렘 라운지<\/title>/);
  assert.match(indexHtml, /<meta name="description"/);
  assert.match(indexHtml, /<meta name="keywords"/);
  assert.match(indexHtml, /<meta name="robots" content="index, follow/);
  assert.match(indexHtml, /<meta property="og:title"/);
  assert.match(indexHtml, /<meta property="og:description"/);
  assert.match(indexHtml, /<meta property="og:image"/);
  assert.match(indexHtml, /<meta name="twitter:card"/);
  assert.match(indexHtml, /application\/ld\+json/);
  assert.match(indexHtml, /schema\.org/);
  assert.match(indexHtml, /WebSite/);
  assert.match(indexHtml, /WebApplication/);
  assert.match(indexHtml, /FAQPage/);

  // 4. nginx-azitchat.conf noindex 헤더 격리 검증 (전역 noindex 제거 및 admin에만 적용)
  const nginxConf = fs.readFileSync(path.join(root, 'ops/oci/nginx-azitchat.conf'), 'utf8');
  assert.match(nginxConf, /location ~\*\s*\^\/\(admin\|admin\\\.html\|api\/admin\)\s*\{[^}]*add_header X-Robots-Tag "noindex/);
  // 전역(location 밖)에 noindex가 없어야 함
  const lines = nginxConf.split('\n');
  let insideLocation = false;
  for (const line of lines) {
    if (line.includes('location ')) insideLocation = true;
    if (insideLocation && line.includes('}')) insideLocation = false;
    if (!insideLocation && line.includes('X-Robots-Tag')) {
      assert.fail('X-Robots-Tag should not be set outside location blocks');
    }
  }

  console.log('PASS: SEO configuration, robots.txt, sitemap.xml, Schema.org JSON-LD, and nginx search crawler headers');
})();
