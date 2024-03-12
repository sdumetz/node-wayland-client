#!/usr/bin/env node
'use strict';
import fs from "fs/promises";
import path from "path";

import {xml2js} from "xml-js";
import { parseInterface } from "./lib/parse.js";

const [src] = process.argv.slice(-1);


async function convert(filepath){
  try{
    const xml = await fs.readFile(filepath, {encoding: "utf-8"});
    /**@type {import("xml-js").ElementCompact} */
    const {protocol:{interface: interfaces}} = xml2js(xml, {compact: true});
    const json = JSON.stringify(interfaces.map(parseInterface), null, 2);
    await fs.writeFile(filepath.replace(".xml", ".json"), json);
  }catch(e){
    if(e.code ="EISDIR"){
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