#!/usr/bin/env node
'use strict';
import fs from "fs/promises";
import path from "path";

import {xml2js} from "xml-js";
import { parseInterface } from "./dist/parse.js";
import makeTypes from "./dist/makeTypes.js";

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
 * @param {string} dirpath 
 * @return {Promise<void>}
 */
async function walk(dirpath){
  for await (const file of await fs.opendir(dirpath)){
    if(file.isDirectory()){
      await walk(path.join(dirpath, file.name));
    }else if(file.name.endsWith(".xml")) {
      await convert(path.join(dirpath, file.name));
    }
  }
}

/**
 * 
 * @param {string} filepath 
 * @return {Promise<void>}
 */
async function convert(filepath){
  try{
    const xml = await fs.readFile(filepath, {encoding: "utf-8"});
    /**@type {import("xml-js").ElementCompact} */
    let {protocol:{interface: interfaces}} = xml2js(xml, {compact: true});
    if(!Array.isArray(interfaces)){
      interfaces = interfaces?[interfaces]:[];
    }
    try{
      const jsInterfaces = interfaces.map(parseInterface);
      const json = JSON.stringify(jsInterfaces, null, 2);
      await fs.writeFile(filepath.replace(".xml", ".json"), json);
      await fs.writeFile(filepath.replace(".xml", ".d.ts"), makeTypes(jsInterfaces, internal));
    }catch(e){
      console.error(e);
      console.warn("Source file : ", interfaces);
      process.exit(1);
    }
   
  }catch(e){
    if(e.code == "EISDIR"){
      walk(filepath);
    }else{
      throw e;
    }
  }

}

/**
 * Convert a file (or every xml file in a directory) to a pre-parsed json array of interfaces
 */


await convert(src);