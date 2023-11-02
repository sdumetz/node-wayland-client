'use strict';
import path from "path";
import {once} from "events";
import {connect} from "net";

import Display from "./lib/display.js";

export default async function open_display(sPath = process.env["XDG_RUNTIME_DIR"]?path.join(process.env["XDG_RUNTIME_DIR"], process.env["WAYLAND_DISPLAY"] ?? "wayland-0"):"" ){
  if(!sPath) throw new Error("no socket path provided and XDG_RUNTIME_DIR not set");
  
  const s = connect(sPath);
  await once(s, "connect");
  const display = new Display(s);
  await display.init();
  return display;
}