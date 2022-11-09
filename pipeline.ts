import type { Connection } from "./connection.ts";
import { CommandExecutor } from "./executor.ts";
import {
  okReply,
  RawOrError,
  RedisReply,
  RedisValue,
  sendCommands,
} from "./protocol/mod.ts";
import { create, Redis } from "./redis.ts";
import {
  Deferred,
  deferred,
} from "./vendor/https/deno.land/std/async/deferred.ts";

export interface RedisPipeline extends Redis {
  flush(): Promise<RawOrError[]>;
}

export function createRedisPipeline(
  connection: Connection,
  tx = false,
): RedisPipeline {
  const executor = new PipelineExecutor(connection, tx);
  function flush(): Promise<RawOrError[]> {
    return executor.flush();
  }
  const client = create(executor);
  return Object.assign(client, { flush });
}

export class PipelineExecutor implements CommandExecutor {
  private commands: Array<[
    command: string,
    ...args: Array<RedisValue>,
  ]> = [];
  private queue: {
    commands: Array<[command: string, ...args: Array<RedisValue>]>;
    d: Deferred<RawOrError[]>;
  }[] = [];

  constructor(
    readonly connection: Connection,
    private tx: boolean,
  ) {
  }

  sendCommand(
    args: [command: string, ...args: Array<RedisValue>],
  ): Promise<RedisReply> {
    this.commands.push(args);
    return Promise.resolve(okReply);
  }

  exec(
    command: string,
    ...args: RedisValue[]
  ): Promise<RedisReply> {
    return this.sendCommand([command, ...args]);
  }

  close(): void {
    return this.connection.close();
  }

  flush(): Promise<RawOrError[]> {
    if (this.tx) {
      this.commands.unshift(["MULTI"]);
      this.commands.push(["EXEC"]);
    }
    const d = deferred<RawOrError[]>();
    this.queue.push({ commands: [...this.commands], d });
    if (this.queue.length === 1) {
      this.dequeue();
    }
    this.commands = [];
    return d;
  }

  private dequeue(): void {
    const [e] = this.queue;
    if (!e) return;
    sendCommands(this.connection.writer, this.connection.reader, e.commands)
      .then(e.d.resolve)
      .catch(e.d.reject)
      .finally(() => {
        this.queue.shift();
        this.dequeue();
      });
  }
}
