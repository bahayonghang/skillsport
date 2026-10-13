await page.goto("http://127.0.0.1:24202/usage",{waitUntil:"domcontentloaded"}); await page.locator("[data-testid=heatmap-grid]").waitFor({state:"visible",timeout:15000});
const errors=[]; const onError=e=>errors.push(e.message); page.on("pageerror",onError); const onConsole=m=>{if(m.type()==="error")errors.push(m.text());}; page.on("console",onConsole);
const cases = [
  {width:1360,height:900,language:'en',theme:'mocha',scale:1}, {width:1380,height:900,language:'en',theme:'mocha',scale:1}, {width:1400,height:900,language:'en',theme:'mocha',scale:1},
  {width:1920,height:1080,language:'en',theme:'mocha',scale:1},
  {width:1440,height:900,language:'en',theme:'mocha',scale:1},
  {width:1280,height:720,language:'en',theme:'mocha',scale:1},
  {width:1279,height:720,language:'en',theme:'mocha',scale:1},
  {width:1024,height:768,language:'en',theme:'mocha',scale:1},
  {width:900,height:600,language:'en',theme:'mocha',scale:1},
  {width:900,height:800,language:'en',theme:'mocha',scale:1},
  {width:1200,height:600,language:'en',theme:'mocha',scale:1},
  {width:1280,height:720,language:'en',theme:'mocha',scale:1.125},
  {width:900,height:600,language:'en',theme:'mocha',scale:1.125},
  {width:900,height:600,language:'en',theme:'mocha',scale:0.875},
  {width:1440,height:900,language:'zh',theme:'mocha',scale:1.125},
  {width:900,height:600,language:'zh',theme:'mocha',scale:1.125},
  {width:1024,height:768,language:'zh',theme:'latte',scale:1},
  {width:900,height:600,language:'zh',theme:'latte',scale:1.125},
];
const original = await page.evaluate(async () => {
  const [{default:i18n},{useThemeStore},{getAppliedFontScale}] = await Promise.all([import('/src/i18n/index.ts'),import('/src/stores/themeStore.ts'),import('/src/lib/displayFont.ts')]);
  return {language:i18n.language,theme:useThemeStore.getState().flavor,scale:getAppliedFontScale()};
});
const results = [];
try {
  for (const item of cases) {
    await page.setViewportSize({width:item.width,height:item.height});
    await page.evaluate(async item => {
      const [{default:i18n},{useThemeStore},{applyFontScale}] = await Promise.all([import('/src/i18n/index.ts'),import('/src/stores/themeStore.ts'),import('/src/lib/displayFont.ts')]);
      useThemeStore.getState().setFlavor(item.theme);
      applyFontScale(item.scale);
      await i18n.changeLanguage(item.language);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, item);
    results.push(await page.evaluate(item => {
      const rect = element => {
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
      };
      const region = document.querySelector('[data-testid="skill-usage-scroll-region"]');
      const header = region.parentElement.querySelector('header');
      const title = header.querySelector('h1');
      const ranking = region.querySelector('section:has([data-testid^="usage-row-"])');
      const grid = document.querySelector('[data-testid="heatmap-grid"]');
      const plot = document.querySelector('[data-testid="heatmap-plot"]');
      const legend = document.querySelector('[data-testid="heatmap-legend"]');
      const heatmap = grid.closest('section');
      const months = [...document.querySelectorAll('[data-testid="heatmap-months"] span')].map(element => ({label:element.textContent,...rect(element),clipped:element.scrollWidth>element.clientWidth+1}));
      const controls = [...header.querySelectorAll('button')].map(element => ({label:element.getAttribute('aria-label')||element.textContent,...rect(element),disabled:element.disabled}));
      return {...item,header:rect(header),title:rect(title),ranking:rect(ranking),topOverhead:ranking.getBoundingClientRect().top-title.getBoundingClientRect().top,heatmap:rect(heatmap),plot:rect(plot),grid:rect(grid),cell:rect(grid.querySelector('button')),legend:rect(legend),plotFraction:plot.getBoundingClientRect().width/(heatmap.getBoundingClientRect().width-26),legendRightDelta:legend.getBoundingClientRect().right-grid.getBoundingClientRect().right,months,controls,pageWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,regionWidth:region.clientWidth,regionScrollWidth:region.scrollWidth,rankingViewport:rect(ranking.querySelector("[data-testid=usage-ranking-viewport]")),rankingClientWidth:ranking.querySelector("[data-testid=usage-ranking-viewport]").clientWidth,rankingScrollWidth:ranking.querySelector("[data-testid=usage-ranking-viewport]").scrollWidth,cells:grid.querySelectorAll('button').length};
    },item));
  }
} finally {
  await page.evaluate(async original => {
    const [{default:i18n},{useThemeStore},{applyFontScale}] = await Promise.all([import('/src/i18n/index.ts'),import('/src/stores/themeStore.ts'),import('/src/lib/displayFont.ts')]);
    useThemeStore.getState().setFlavor(original.theme);
    applyFontScale(original.scale);
    await i18n.changeLanguage(original.language);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  },original);
  await page.setViewportSize({width:1440,height:900});
}
globalThis.usageVisualMatrix = results;
page.off("pageerror",onError); page.off("console",onConsole); return {results,errors};
