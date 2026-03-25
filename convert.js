#!/usr/bin/env node
'use strict';
import fs from "fs/promises";
import path from "path";
import { parseArgs } from "util";

import {xml2js} from "xml-js";
import { parseInterface } from "./dist/parse.js";
import makeTypes from "./dist/makeTypes.js";

const {positionals, values: opts} = parseArgs({
  allowPositionals: true,
  options: {
    types: {
      type:"boolean",
      default: false,
    },
    help: {
      type: "boolean",
      short: "h",
      default: false,
    }
  }
});

const usage = `npx convert-xml [--types] ...paths
paths can be any number of XML files or directories containing a collection of XML files

Options:
  --types    : Output ".d.ts" types declaration alongside the JSON definitions
  --help, -h : print this help string
`;

if(opts.help){
  console.log(usage);
  process.exit(0);
} else if(!positionals.length){
  console.log(usage);
  console.error("Error: No path provided");
  process.exit(1);
}
/**
 * Convert a file (or every xml file in a directory) to a pre-parsed json array of interfaces
 */

for(let src of positionals){
  await convert(src);
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
      await fs.writeFile(filepath.replace(".xml", ".d.ts"), makeTypes(jsInterfaces, opts.types));
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
