import open_display from "../dist/index.js";


open_display().then(async (display)=>{
  display.on("warning", console.warn);
  display.on("error", console.error.bind(console, "display ERROR: "));

  console.log("Known globals:\n\t", [...display.listGlobals()].join("\n\t"));
  display.close();
})
.catch((e)=>{
  console.error("fatal error:", e);
  process.exit(1);
})