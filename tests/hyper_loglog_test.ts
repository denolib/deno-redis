import { assertEquals } from "../vendor/https/deno.land/std/testing/asserts.ts";
import { newClient, nextPort, startRedis, stopRedis } from "./test_util.ts";

Deno.test("hyperloglog", async (t) => {
  const port = nextPort();
  const server = await startRedis({ port });
  const client = await newClient({ hostname: "127.0.0.1", port });

  function cleanup(): void {
    stopRedis(server);
    client.close();
  }

  await t.step("pdfadd", async () => {
    assertEquals(await client.pfadd("hll", "a", "b", "c", "d"), 1);
  });

  await t.step("pdfcount", async () => {
    await client.pfadd("hll", "a", "b", "c", "d");
    assertEquals(await client.pfcount("hll"), 4);
  });

  await t.step("pfmerge", async () => {
    await client.pfadd("hll", "a", "b", "c", "d");
    await client.pfadd("hll2", "1", "2", "3", "4");
    assertEquals(await client.pfmerge("hll", "hll2"), "OK");
  });

  cleanup();
});
