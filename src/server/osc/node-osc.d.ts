declare module "node-osc" {
  import { EventEmitter } from "node:events";

  type OscArg = number | string | boolean | Buffer | null;
  type OscMessage = [string, ...OscArg[]];

  interface RInfo {
    address: string;
    family: string;
    port: number;
    size: number;
  }

  export class Server extends EventEmitter {
    constructor(port: number, host?: string, cb?: () => void);
    on(event: "message", listener: (msg: OscMessage, rinfo: RInfo) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "listening", listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    close(cb: (err?: Error) => void): void;
    close(): Promise<void>;
  }

  export class Client extends EventEmitter {
    constructor(host: string, port: number);
    host: string;
    port: number;
    send(address: string, ...args: OscArg[]): Promise<void>;
    close(): Promise<void>;
  }
}
