![Build Status](https://github.com/github/docs/actions/workflows/build.yml/badge.svg?branch=main&event=push)

# Wayland client library

low-level wayland client implementation in modern (nodejs 16+) javascript.

No runtime dependencies, no high level abstractions either.

It should be able to manage any wayland protocol extension out there (see [the popular ones](https://wayland.app/protocols/)) through interface definitions parsing.

It lacks support for any kind of shared-memory features, mainly because they rely on file descriptor borrowing to share buffers between the client and the backend. It is relatively easy to perform fd borrowing through a [native addon](https://github.com/sdumetz/node-wayland-shm) but cleanly integrating this (the receiving end in particular) would require reimplementing most of the **net.Socket** class. A feature request exists for this ([#53391](https://github.com/nodejs/node/issues/53391)) but it's unclear whether it will be implemented one day.

Examples of a good use case might be [zwp_idle_inhibit_manager](https://wayland.app/protocols/idle-inhibit-unstable-v1), [zwlr_output_manager](https://wayland.app/protocols/wlr-output-management-unstable-v1) or managing virtual inputs, like [zwlr_virtual_pointer](https://wayland.app/protocols/wlr-virtual-pointer-unstable-v1). Some other interfaces that do not require shared memory or file descriptor borrowing should also work fine.

## Installation

```sh
npm install wayland-client
```

If you wish to parse XML protocol files at runtime, you will need to install the `xml-js` package or provide your own parser.

Protocol files can also be provided pre-compiled as JSON files. See `convert.js` for an example. This has the added benefit of generating static typings definitions for this protocol.

## Usage

### Bind a global

```js
import open_display from "wayland-client";
const wl_display = await open_display();
await display.load("protocol/wlr_output_management_unstable_v1.xml");
let wlr_output = await display.bind("zwlr_output_manager_v1");
```

 > See the `examples` folder.

### Use the interface

What happens next depends on the protocol used. The best thing is to make use of the generated types definitions. [wayland protocols documentation](https://wayland.app/protocols/) is also a good resource to get started.

One major use case is to listen to some events until the server is done sending data. To do this, the base Wl_interface class offers an aggregation primitive:

```js
  await display.load(path.join(thisDir, "protocol", "wlr_output_management_unstable_v1.xml"));
  let wlr_output = await display.bind("zwlr_output_manager_v1");
  const end_aggregate = wlr_output.aggregate();
  const [serial] = await once(wlr_output, "done");
  let {head: heads} = end_aggregate();
```

It's a bit cumbersome to use but way better than manually wiring every events recursively.

### compile a protocol file

```sh
npx convert-xml protocol/xdg_shell.xml
```
Will create a `protocol/xdg_shell.json` file that can be loaded faster and without the `xml-js` dependency and a `protocol/xdg_shell.d.ts` file that will provide types documentation for the `xdg_shell` interface. Interface names are capitalized in types declaration ( `xdg_shell -> Xdg_shell`).



## API

**Note on types**

This module has ts declaration files. The base **Wl_interface** class has a generic signature of low-level common features.  To have robust static typings, it is best to pre-parse protocol files : This will export a `json` file that cand be loaded with lower overhead and a `d.ts` file that holds types declarations for this protocol.

`Wl_display.bind(...)` can then be caracterized with the interface name as a generic parameter.

```ts
  let wlr_output = await display.bind<Zwlr_output_manager_v1>("zwlr_output_manager_v1");
```

This interface inherits from the base `Wl_interface` class and will have all the methods and events defined from the protocol file, with proper arguments types.

It is of course possible to use the generic `Wl_interface` primitive without the benefits of typed pre-registered events and methods.

### class Wl_display()

#### async load(interface_name: string)

Load a wayland protocol specification.

Either use a path to a **XML** file, or a pre-parsed **JSON** file.

Use pre-compiled JSON files if speed is really important : parsing is ~10x faster than with raw XML.

#### async bind(interface_name: string)

Binds a global interface. It's the starting point of any interaction with the wayland server.

### listGlobals()

List all registered globals on this server. Note that this method is synchronous but one would need to wait for at least one `sync` event to have happened. Initializing through `await wl_display.init()` or `await open_display()` already waits for such an event.

See [examples/list_globals.js](https://github.com/sdumetz/node-wayland-client/tree/main/examples/list_globals.js).

### class Wl_interface()

#### inspect() :string

Outputs a string describing all events and requests provided by this interface.


#### aggregate() :()=>AggregateResult

Returns a function to be called once the aggregation should finish.

This function returns an object that contains all event data received since `aggregate()` was called. Unfortunately this is very much generic and intended for low-level use. Knowing an interface implementation will almost always allow for a better result type to be inferred.


#### async drain(until :Promise<any> = this.display.sync()):Promise<AggregateResult>

Wrapper around `Wl_interface.aggregate()` that waits for a promise to resolve before returning the result.

By default it will listen to `Wl_display.sync()` but the event to wait for is generally specified per-interface in the protocol documentation.

## Troubleshooting

### no socket path provided and XDG_RUNTIME_DIR not set

Wayland requires `process.env["XDG_RUNTIME_DIR"]` to be set to a valid path.

Generally, it's `/run/user/$(id -u)/`.

### [ERR_MODULE_NOT_FOUND]: Cannot find package 'xml-js'

xml-js is required to import protocol extensions from XML files.

### Protocol errors

protocol errors happen asynchronously so it's sometimes hard to know where they come from.

They are always fatal and `Wl_display` should no longer be used after a protocol error. It's not necessary to close or cleanup anything after such an error.


# Ressources

 - [wayland-book](https://wayland-book.com/introduction.html): Wayland Wire protocol manual book
 - [wayland.xml](https://gitlab.freedesktop.org/wayland/wayland/blob/master/protocol/wayland.xml) wayland protocol definition file
 - [wayland-client](https://gitlab.freedesktop.org/wayland/wayland/-/blob/main/src/wayland-client.c) wayland C client library implementation

# Contributing

Contributions are welcomed.

If you found something that definitely won't work, pelase submit an issue.

Higher-level features should generally be implemented in a separate user-facing package, but I'm open for suggestion if you think some helpers might get used across a wide range of interfaces.

a POC for supporting shared memory and FD borrowing through a native addon would be welcomed.
