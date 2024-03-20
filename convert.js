#!/usr/bin/env node
'use strict';
import fs from "fs/promises";
import path from "path";

import {xml2js} from "xml-js";
import { parseInterface } from "./dist/lib/parse.js";
import makeTypes from "./dist/lib/makeTypes.js";

let [src] = process.argv.slice(-1);
let internal = false;
if(src == "internal"){
  src = "protocol";
  internal = true;
}

if(!src){
  console.error("No path provided");
  process.exit(1);
}

/**
 * 
 * @param {string} filepath 
 */
async function convert(filepath){
  try{
    const xml = await fs.readFile(filepath, {encoding: "utf-8"});
    /**@type {import("xml-js").ElementCompact} */
    const {protocol:{interface: interfaces}} = xml2js(xml, {compact: true});
    const jsInterfaces = interfaces.map(parseInterface);
    const json = JSON.stringify(jsInterfaces, null, 2);
    await fs.writeFile(filepath.replace(".xml", ".json"), json);
    await fs.writeFile(filepath.replace(".xml", ".d.ts"), makeTypes(jsInterfaces, internal));
  }catch(e){
    if(e.code == "EISDIR"){
      for await (const file of await fs.opendir(filepath)){
        if(!file.name.endsWith(".xml")) continue;
        await convert(path.join(filepath, file.name));
      }
    }else{
      throw e;
    }
  }

}
/**
 * Convert a file (or every xml file in a directory) to a pre-parsed json array of interfaces
 */


await convert(src);