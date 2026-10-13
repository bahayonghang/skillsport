await page.goto('http://127.0.0.1:24202/usage',{waitUntil:'domcontentloaded'});
await page.locator('[data-testid="usage-ranking-viewport"]').waitFor({state:'visible',timeout:15000});
const result=await page.evaluate(async()=>{
  const {useUsageStore}=await import('/src/stores/usageStore.ts');
  const original=useUsageStore.getState();
  const region=document.querySelector('[data-testid="skill-usage-scroll-region"]');
  const summaries=[];
  const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
  try {
    for(const count of [100,1000,10000]) {
      const generationStart=performance.now();
      const skills=Array.from({length:count},(_,index)=>({...original.overview.topSkills[index%original.overview.topSkills.length],skill:`fixture-${String(index).padStart(5,'0')}`,count:count-index,resolvedSkillId:null}));
      const pageData={overview:{...original.overview,kpis:{...original.overview.kpis,uniqueSkills:count},topSkills:skills},recent:original.recent,providers:original.providers};
      const generationMs=performance.now()-generationStart;
      const samples={serialize:[],parse:[],sortName:[],commitAndLayout:[]};
      let payloadBytes;
      for(let iteration=0;iteration<25;iteration++) {
        const marker=`fixture-tick-${count}-${iteration}`;
        pageData.overview.topSkills[0]={...pageData.overview.topSkills[0],skill:marker};
        let started=performance.now();
        const json=JSON.stringify(pageData);
        const serialize=performance.now()-started;
        payloadBytes=new TextEncoder().encode(json).length;
        started=performance.now();
        const parsed=JSON.parse(json);
        const parse=performance.now()-started;
        started=performance.now();
        [...parsed.overview.topSkills].sort((a,b)=>a.skill.localeCompare(b.skill));
        const sortName=performance.now()-started;
        const commitAndLayout=await new Promise(resolve=>{
          const observer=new MutationObserver(()=>{
            const node=region.querySelector(`[data-testid="usage-row-${marker}"]`);
            if(!node)return;
            node.getBoundingClientRect();
            observer.disconnect();
            resolve(performance.now()-started);
          });
          observer.observe(region,{subtree:true,childList:true,characterData:true,attributes:true});
          started=performance.now();
          useUsageStore.setState({overview:parsed.overview});
        });
        if(iteration>=5)for(const [key,value] of Object.entries({serialize,parse,sortName,commitAndLayout}))samples[key].push(value);
      }
      const viewport=document.querySelector('[data-testid="usage-ranking-viewport"]');
      summaries.push({skills:count,generationMs,payloadBytes,rows:viewport.querySelectorAll('li').length,domNodes:region.querySelectorAll('*').length,viewportHeight:viewport.clientHeight,rawMs:samples,p50p95Ms:Object.fromEntries(Object.entries(samples).map(([key,values])=>[key,[percentile(values,.5),percentile(values,.95)]]))});
    }
  } finally {useUsageStore.setState(original);}
  return {mode:'Vite development fixture; Windows NSIS compilation running concurrently',visibility:document.visibilityState,warmups:5,measurements:20,paintMeasured:false,note:'MutationObserver + bounding rect measures commit/layout; background RAF timings are excluded. No production or before/after latency claim.',summaries};
});
return result;
