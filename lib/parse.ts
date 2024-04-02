'use strict';

import { ElementCompact } from "xml-js";
import { ArgumentDefinition, EnumDefinition, EnumReduction, EnumValue, EventDefinition, InterfaceDefinition, RequestDefinition } from "./definitions.js";
import { InterfaceElement } from "./elements.js";




/**
 * transform xml-js output to properly formatted interface objects
 */


/**
 * Ensure we get an array out of an attribute that might be undefined or an object
 * @returns 
 */
export function to_a<A, B>(o:A[], fn : (i:A)=>B) :B[]{
  return o? (Array.isArray(o)? o.map(i=>fn(i)): [fn(o)]) : [];
}

function has(key :string, o :ElementCompact) :o is ElementCompact & {_attributes:{[k :typeof key]:string}}{
  return o._attributes && key in o._attributes || false;
}



export function parseRequest(request:ElementCompact) :RequestDefinition{
  if(!has("name", request)){
    throw new Error("Request has no name");
  }
  const {_attributes:{name}, description, arg} = request;
  return {
    name,
    description: description?._text,
    summary: description?._attributes?.summary,
    args: to_a(arg, parseArg),
  };
}


export function parseEvent(event :ElementCompact) :EventDefinition{
  if(!has("name",event)){
    throw new Error("event has no name");
  }
  const {_attributes:{name}, description, arg} = event;
  return {
    name,
    description: description?._text,
    summary: description?._attributes?.summary,
    args: to_a(arg, parseArg),
  };
}

/**
 * 
 */
export function parseEnums(enums :ElementCompact | ElementCompact[]){
  let out :Record<string, EnumDefinition> = {};
  if(!enums) return out;

  for (let en of (Array.isArray(enums)?enums: [enums])){
    if(!has("name",en)){
      throw new Error("Enum has no name");
    }
    let {_attributes:{name}, entry} = en;
    out[name] = to_a(entry, (e:ElementCompact) :EnumValue=>{
      if(!has("name", e)){
        throw new Error("Enum member has no name");
      }
      if(!has("value", e)){
        throw new Error("Enum member has no value");
      }

      const {_attributes:{name, value, summary}} = e;
      return ({name, value:parseInt(value), summary})
    });
  }
  return out;
}

export function parseArg(el :ElementCompact) :ArgumentDefinition{
  if(!has("name",el)){
    throw new Error("Argument has no name");
  }
  return el._attributes as any;
}

/**
 * 
 */
export function parseInterface(itf :InterfaceElement) :InterfaceDefinition{
  const {_attributes:{name, version: versionString}, description, request, event, enum:enums} = itf;
  const version = typeof versionString === "number"? versionString : parseInt(versionString);
  if(Number.isNaN(version)) throw new Error(`Invalid version ${versionString} for interface ${name}`);
  return {
    name,
    version,
    description: description?._text,
    summary: description?._attributes?.summary,
    requests: to_a(request, parseRequest),
    events: to_a(event, parseEvent),
    enums: parseEnums(enums),
  };
}