'use strict';
/**
 * transform xml-js output to properly formatted interface objects
 */

/**
 * Ensure we get an array out of an attribute that might be undefined or an object
 * @returns 
 */
export function to_a(o, fn){
  return o? Array.isArray(o)? o.map(i=>fn(i)): [fn(o)] :[];
}

export function parseRequest(request){
  const {_attributes:{name}, description, arg} = request;
  return {
    name,
    description: description?._text,
    summary: description?._attributes?.summary,
    args: to_a(arg, parseArg),
  };
}


export function parseEvent(event){
  const {_attributes:{name}, description, arg} = event;
  return {
    name,
    description: description?._text,
    summary: description?._attributes?.summary,
    args: to_a(arg, parseArg),
  };
}


export function parseEnums(enums){
  let out = {};
  if(!enums) return out;
  for (let {_attributes:{name}, entry} of (Array.isArray(enums)?enums: [enums])){
    out[name] = to_a(entry, ({_attributes:{name, value, summary}})=>({name, value:parseInt(value), summary}));
  }
  return out;
}

export function parseArg({_attributes}){
  return _attributes;
}

export function parseInterface(itf){
  const {_attributes:{name, version: versionString}, description, request, event, enum:enums} = itf;
  const version = parseInt(versionString);
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