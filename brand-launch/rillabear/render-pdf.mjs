import pw from '/home/user/UNHO/node_modules/playwright-core/index.js';
const { chromium } = pw;
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const DIR = '/home/user/UNHO/brand-launch/rillabear';
const OUT = path.join(DIR, 'pdf');
fs.mkdirSync(OUT, { recursive: true });

const pages = [
  ['index.html', '릴라베어_런칭패키지_목차'],
  ['01-brand-guide.html', '릴라베어_01_브랜드가이드'],
  ['02-launch-plan.html', '릴라베어_02_전체기획안'],
  ['03-package-design.html', '릴라베어_03_패키지디자인'],
  ['04-detail-page.html', '릴라베어_04_상세페이지'],
  ['05-landing.html', '릴라베어_05_랜딩홈페이지'],
  ['06-investment-proposal.html', '릴라베어_06_공동투자제안서'],
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
const ctx = await browser.newContext({ viewport: { width: 1180, height: 1400 }, deviceScaleFactor: 2 });

for (const [file, out] of pages) {
  const page = await ctx.newPage();
  const url = pathToFileURL(path.join(DIR, file)).href;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    // let blocked remote images error out (onerror → .broken fallback) and layout settle
    await page.waitForTimeout(2500);
    // unstick fixed/sticky chrome so nothing floats/overlaps in the single tall page
    await page.addStyleTag({ content: `.site-head,.doc-nav,.cta-bar{position:static !important}` });
    const height = await page.evaluate(() => Math.ceil(document.body.scrollHeight));
    await page.pdf({
      path: path.join(OUT, out + '.pdf'),
      width: '1180px',
      height: height + 'px',
      printBackground: true,
      pageRanges: '1',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    console.log('OK', out, `${height}px`);
  } catch (e) {
    console.log('FAIL', file, e.message);
  }
  await page.close();
}
await browser.close();
console.log('DONE');
