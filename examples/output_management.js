import { once } from "events";
import timers from "timers/promises";
import path from "path";
import { fileURLToPath } from 'url';

import open_display from "../index.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

open_display().then(async (display)=>{
  display.on("warning", console.warn);
  display.on("error", console.error.bind(console, "display ERROR: "));

  console.log("Display OPEN");
  //*
  await display.load(path.join(thisDir, "protocol", "wlr_output_management_unstable_v1.xml"));
  let wlr_output = await display.bind("zwlr_output_manager_v1");
  const end_aggregate = wlr_output.aggregate();
  const [serial] = await once(wlr_output, "done");
  let {head: heads} = end_aggregate();
  if(!Array.isArray(heads)) heads = (heads?[heads]: []);
  console.log("HEAD : ", serial, JSON.stringify(heads, null, 2));
  
  let conf = await wlr_output.create_configuration(serial);
  //console.log("CONFIGURATION: ", conf);
  const head_conf = await conf.enable_head(heads[0].id);
  const transforms = display.getEnum("wl_output.transform");
  //console.log("TRANSFORMS: ", transforms);
  await head_conf.set_transform(transforms.flipped);
  await conf.apply();
  let c = new AbortController();
  let result = await Promise.race([
    once(conf, "succeeded", c).then(()=>"succeeded"), 
    once(conf, "failed", c).then(()=>"failed"),
    once(conf, "cancelled", c).then(()=>"cancelled"),
  ]);
  c.abort();
  console.log('Apply result : ', result);
  await timers.setTimeout(10000);
})
.catch((e)=>{
  console.error("fatal error:", e);
  process.exit(1);
})