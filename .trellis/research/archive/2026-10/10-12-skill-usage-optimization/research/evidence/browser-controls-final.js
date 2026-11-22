await page.goto('http://127.0.0.1:24202/usage',{waitUntil:'domcontentloaded'});
await page.locator('[data-testid="recent-feed"]').waitFor({state:'visible',timeout:15000});
const errors=[];
const onError=e=>errors.push(e.message);
const onConsole=m=>{if(m.type()==='error')errors.push(m.text());};
page.on('pageerror',onError);page.on('console',onConsole);
const original=await page.evaluate(async()=>{
  const {useUsageStore}=await import('/src/stores/usageStore.ts');
  window.__usageControlsStore=useUsageStore;window.__usageControlsOriginal=useUsageStore.getState();
  const recent=useUsageStore.getState().recent; const call=recent[0];
  useUsageStore.setState({recent:[call,{...call}]});
  return {call,originalCount:recent.length};
});
const result={errors};
try {
  await expect(page.locator('[data-testid="recent-feed"] li')).toHaveCount(2);
  await page.evaluate(call=>window.__usageControlsStore.setState({recent:[{...call,skill:'new-observation',timestampMs:call.timestampMs+1},call,{...call}]}),original.call);
  await expect(page.locator('[data-testid="recent-feed"] li')).toHaveCount(3);
  result.duplicateRows=await page.locator('[data-testid="recent-feed"] li').count();
  const origin=page.locator('[data-testid="recent-feed"] li').nth(1).getByRole('button').first();
  await origin.evaluate(node=>window.__recentOrigin=node);
  await origin.click();
  await page.getByRole('button',{name:'Close usage detail',exact:true}).click();
  await expect(origin).toBeFocused();
  result.recentFocus=await page.evaluate(()=>({sameNode:window.__recentOrigin===document.activeElement,connected:window.__recentOrigin.isConnected}));
  await page.locator('summary').filter({hasText:'Provider health'}).click();
  const rankAll=page.getByRole('group',{name:'Top skills',exact:true}).getByRole('button',{name:'All',exact:true});
  result.pressedBefore=await rankAll.evaluate(node=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color}));
  await rankAll.hover();
  result.pressedHover=await rankAll.evaluate(node=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color}));
  await page.evaluate(async()=>{const {applyFontScale}=await import('/src/lib/displayFont.ts');applyFontScale(.875);});
  result.actions=await page.evaluate(()=>[...document.querySelectorAll('main main button,main header button')].filter(node=>!node.closest('[data-testid="heatmap-grid"]')).map(node=>({label:node.getAttribute('aria-label')||node.textContent.trim(),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,visible:node.getBoundingClientRect().height>0})).filter(node=>node.visible));
  result.disclosure=await page.locator('summary').filter({hasText:'Provider health'}).evaluate(node=>({height:node.getBoundingClientRect().height}));
} finally {
  await page.evaluate(async()=>{window.__usageControlsStore.setState(window.__usageControlsOriginal);delete window.__usageControlsStore;delete window.__usageControlsOriginal;delete window.__recentOrigin;const {applyFontScale}=await import('/src/lib/displayFont.ts');applyFontScale(1);});
  page.off('pageerror',onError);page.off('console',onConsole);
}
return result;
