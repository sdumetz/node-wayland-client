# Wayland client library

low-level wayland client implementation in pure modern (nodejs 16+) javascript.

No dependencies, no high level abstractions.

It should be able to manage any wayland protocol extension out there (see [the popular ones](https://wayland.app/protocols/)). However it might require a lot of glue code to do anything useful.

## Installation

```sh
npm install wayland-client
```

If you wish to parse XML protocol files, you will need to install the `xml-js` package or provide your own parser.

Protocol files can also be provided pre-compiled as JSON files. See `convert.js` for an example.

## Usage

### Bind a global
```js
import open_display from "wayland-client";
const wl_display = await open_display();
await display.load("protocol/wlr_output_management_unstable_v1.xml");
let wlr_output = await display.bind("zwlr_output_manager_v1");
```

 > See the `examples` folder.

### compile a protocol file

```sh
npx convert-xml protocol/xdg_shell.xml
```
Will create a `protocol/xdg_shell.json` file that can be loaded faster and without the `xml-js` dependency.

## API

**Note on types**

This module has ts declaration files. However since it uses mostly a generic **Interface** class, it isn't really useful to discover wayland usage.

### class Display()

#### async load(interface_name: string)

Load a wayland protocol specification.

Either use a path to a **XML** file, or a pre-parsed **JSON** file.

Use pre-compiled JSON files if speed is really important : parsing is ~10x faster than with raw XML.

#### async bind(interface_name: string)

Binds a global interface. It's the starting point of any interaction with the wayland server.

### class Interface()

#### inspect()

Outputs a string describing all events and requests provided by this interface.


## Troubleshooting

### no socket path provided and XDG_RUNTIME_DIR not set

Wayland requires `process.env["XDG_RUNTIME_DIR"]` to be set to a valid path.

Generally, it's `/run/user/$(id -u)/`.

### [ERR_MODULE_NOT_FOUND]: Cannot find package 'xml-js'

xml-js is required to import protocol extensions

### Protocol errors

protocol errors happen asynchronously so it's sometimes hard to know where they come from.

They are always fatal and `Display` should no longer be used after a protocol error. It's not necessary to close or cleanup anything after such an error.


# Ressources

 - [wayland-book](https://wayland-book.com/introduction.html): Wayland Wire protocol manual book
 - [wayland.xml](https://gitlab.freedesktop.org/wayland/wayland/blob/master/protocol/wayland.xml) wayland protocol definition file
 - [wayland-client](https://gitlab.freedesktop.org/wayland/wayland/-/blob/main/src/wayland-client.c) wayland C client library implementation

# Contributing

Contributions are welcomed.

If you found something that definitely won't work, pelase submit an issue.

Higher-level features should generally be implemented in a separate user-facing package, but I'm open for suggestion if you think some helpers might get used across a wide range of interfaces.
