import open_display from "./index.js";
import { Display } from "./lib/display.d.ts";


export default function open_display(socket_path ?:string):Promise<Display>;
