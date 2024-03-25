'use strict';
import path from "path";
import {once} from "events";
import {connect} from "net";

import Display from "./display.js";

export * from "./definitions.js";
export {default as Wl_interface} from "./interface.js";
export {default as Display} from "./display.js";

export default async function open_display(sPath :string = process.env["XDG_RUNTIME_DIR"]?path.join(process.env["XDG_RUNTIME_DIR"], process.env["WAYLAND_DISPLAY"] ?? "wayland-0"):"" ):Promise<Display>{
  if(!sPath) throw new Error("no socket path provided and XDG_RUNTIME_DIR not set");
  
  const s = connect(sPath);
  await once(s, "connect");
  const display = new Display(s);
  await display.init();
  return display;
}