await page.goto("http://127.0.0.1:24200/usage", {waitUntil:"domcontentloaded"}); return await tabbit.observe({frames:"none",maxChars:7000});
