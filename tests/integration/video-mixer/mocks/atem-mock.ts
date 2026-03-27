import { EventEmitter } from "node:events";

export enum MockAtemConnectionStatus {
  CLOSED = 0,
  CONNECTING = 1,
  CONNECTED = 2,
};

export class MockAtem extends EventEmitter {
  status: MockAtemConnectionStatus = MockAtemConnectionStatus.CLOSED;
  readonly connectCalls: Array<{ host: string; port: number }> = [];
  readonly disconnectCalls: number[] = [];
  readonly destroyCalls: number[] = [];
  readonly changePreviewInputCalls: Array<{ input: number; me: number }> = [];

  async connect(host: string, port: number) {
    this.connectCalls.push({ host, port });
    this.status = MockAtemConnectionStatus.CONNECTING;
    this.status = MockAtemConnectionStatus.CONNECTED;
  }

  async disconnect() {
    this.disconnectCalls.push(Date.now());
    this.status = MockAtemConnectionStatus.CLOSED;
  }

  async destroy() {
    this.destroyCalls.push(Date.now());
  }

  async changePreviewInput(input: number, me: number) {
    this.changePreviewInputCalls.push({ input, me });
  }
}

export const mockAtemState = {
  instances: [] as MockAtem[],
  reset() {
    this.instances.length = 0;
  },
  createInstance() {
    const instance = new MockAtem();
    this.instances.push(instance);
    return instance;
  },
};
