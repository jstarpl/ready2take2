import { EventEmitter } from "node:events";

type SendPayload = string | Record<string, unknown>;

export class MockVmixConnection extends EventEmitter {
  host: string;
  port: number;
  private isConnected = false;
  readonly sendCalls: SendPayload[] = [];

  constructor(host: string, options: { port?: number } = {}) {
    super();
    this.host = host;
    this.port = options.port ?? 8099;
    mockVmixState.instances.push(this);
  }

  connected() {
    return this.isConnected;
  }

  connect(host: string, port: number) {
    this.host = host;
    this.port = port;
    if (mockVmixState.autoConnectOnConnectCall) {
      this.simulateConnect();
    }
  }

  simulateConnect() {
    this.isConnected = true;
    this.emit("connect");
  }

  shutdown() {
    this.isConnected = false;
  }

  send(payload: SendPayload) {
    this.sendCalls.push(payload);
    return Promise.resolve();
  }
}

export const mockVmixState = {
  instances: [] as MockVmixConnection[],
  autoConnectOnConnectCall: true,
  reset() {
    this.instances.length = 0;
    this.autoConnectOnConnectCall = true;
  },
};
