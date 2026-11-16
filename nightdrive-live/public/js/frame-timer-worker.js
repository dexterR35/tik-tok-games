// Chromium can throttle rAF in an occluded embedded WebView even when its document
// remains visible. A dedicated clock wakes the renderer only if rAF stops arriving.
setInterval(()=>postMessage('tick'),1000/60);
