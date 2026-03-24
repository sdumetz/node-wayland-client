'use strict';
/**
 * Special error class to mark wayland protocol errors
 * All such errors are fatal (non recoverable)
 */

export class WaylandProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaylandProtocolError";
  }
}
