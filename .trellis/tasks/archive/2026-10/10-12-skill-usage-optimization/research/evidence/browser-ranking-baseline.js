await page.setViewportSize({width:1440,height:900});
const results = await page.evaluate(async () => {
  const { useUsageStore } = await import('/src/stores/usageStore.ts');
  const original = useUsageStore.getState().overview;
  const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const results = [];
  try {
    for (const count of [100,1000,10000]) {
      const topSkills = Array.from({length:count}, (_, index) => ({...original.topSkills[index % original.topSkills.length],skill:`fixture-${String(index).padStart(5,'0')}`,count:count-index,resolvedSkillId:null}));
      const started = performance.now();
      useUsageStore.setState({overview:{...original,kpis:{...original.kpis,uniqueSkills:count},topSkills}});
      await frames();
      const region = document.querySelector('[data-testid="skill-usage-scroll-region"]');
      results.push({skills:count,updateToTwoFramesMs:performance.now()-started,rows:document.querySelectorAll('[data-testid^="usage-row-"]').length,domNodes:region.querySelectorAll('*').length,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth});
    }
  } finally {
    useUsageStore.setState({overview:original});
    await frames();
  }
  return results;
});
globalThis.usageRankingBaseline = results;
return results;
