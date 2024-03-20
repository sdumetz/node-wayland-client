import { EnumDefinition, EventDefinition, InterfaceDefinition, RequestDefinition, isCallbackArgument, isInterfaceArgument } from "./definitions.js";



export default function makeTypes(interfaces:InterfaceDefinition[], internal = false){
  return ""
  + `import Interface from "${internal?"../lib/interface.js":"wayland-client"}";\n`
  + `import {
    wl_new_id,
    wl_uint,
    wl_int,
    wl_fixed,
    wl_string,
    wl_fd,
  } from "${internal?"../lib/definitions.js":"wayland-client"}";\n`
  + interfaces.map(genInterface).join("\n");
}

function indent(str :string, spaces :number) :string{
  return str.split("\n").map(l=> " ".repeat(spaces) + l).join("\n");
}

function comment(str :string){
  return str?str.split("\n").map(l=>l.replace(/^\s+/, " ")).join("\n * "):"";
}


function nameToClass(name :string){
  return name[0].toUpperCase() + name.slice(1);
}

export const genInterface = ({name, version, description, summary, requests, events, enums} :InterfaceDefinition)=>`
/**
 * ${comment(description)}
 * @summary ${summary}
 */
export interface ${nameToClass(name)} extends Interface{
  version: ${version};
  enums:{
    ${indent(Object.entries(enums??{}).map(([name, en])=>genEnum(name, en)).join(",\n"), 4)}
  }
  
  ${indent(events.map(genEvent).join("\n"), 2)}
  ${indent(requests.map(genRequest).join("\n"), 2)}
}
`;


const genEvent = ({name, description, summary, args} :EventDefinition)=>`
/**
 * ${comment(description)}
 * @summary ${summary}
 */
on(eventName: "${name}", listener: (${args.map(a=> `${a.name}: wl_${a.type}`).join(", ")})=>void): this;
`;



const genRequest = ({name, description, summary, args} :RequestDefinition)=>{
  const first_arg = args[0];
  let returnType = "void";
  if(first_arg && isCallbackArgument(first_arg)){
    args = args.slice(1);
    returnType = "void";
  }else if(first_arg && isInterfaceArgument(first_arg)){
    args = args.slice(1);
    returnType = nameToClass(first_arg.interface);
  }
  return `
/**
 * ${comment(description)}
 * @summary ${summary}
 * ${args.map(a=> `@param ${a.name} ${a.summary}`).join("\n * ")}
 */
${name} (${args.map(a=> `${a.name}: wl_${a.type}`).join(", ")}) :Promise<${returnType}>;

`};

const genEnum = (name :string, en :EnumDefinition) :string =>`
${name}: [
  ${en.map(({name, value, summary})=>`
  /**
   * @summary ${summary}
   */
  {
    name: "${name}",
    value: ${value},
    summary: "${summary}",
  },
`).join("\n")}
]
`;