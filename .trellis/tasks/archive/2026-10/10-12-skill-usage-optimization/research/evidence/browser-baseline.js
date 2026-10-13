await page.goto('http://127.0.0.1:24200/usage', { waitUntil: 'domcontentloaded' });
await page.getByTestId('usage-row-review').waitFor({ state: 'visible' }).catch(async () => {
  await page.getByTestId('heatmap-grid').waitFor({ state: 'visible' });
});
const results = [];
for (const size of [{width:1920,height:1080},{width:1440,height:900},{width:1280,height:720},{width:1024,height:768},{width:900,height:600}]) {
  await page.setViewportSize(size);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  results.push(await page.evaluate(() => {
    const rect = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
    };
    const region = document.querySelector('[data-testid="skill-usage-scroll-region"]');
    const view = region.parentElement;
    const header = view.querySelector('header');
    const title = header.querySelector('h1');
    const section = region.querySelector('section:has([data-testid^="usage-row-"])');
    const grid = document.querySelector('[data-testid="heatmap-grid"]');
    const heatmap = grid.closest('section');
    return {viewport:{width:innerWidth,height:innerHeight},fontScale:getComputedStyle(document.documentElement).fontSize,header:rect(header),title:rect(title),ranking:rect(section),topOverhead:section.getBoundingClientRect().top-title.getBoundingClientRect().top,heatmap:rect(heatmap),grid:rect(grid),cell:rect(grid.querySelector('button')),pageWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,regionWidth:region.clientWidth,regionScrollWidth:region.scrollWidth,rows:document.querySelectorAll('[data-testid^="usage-row-"]').length,cells:grid.querySelectorAll('button').length};
  }));
}
globalThis.usageBaseline = results;
await page.setViewportSize({width:1440,height:900});
const screenshot = await page.screenshot({fullPage:false});
return {results,screenshot};
