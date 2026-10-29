import type { Server } from "node:net";

// Node/undici do not expose this list through a public API. Keep test listeners
// off WHATWG Fetch's bad ports: https://fetch.spec.whatwg.org/#port-blocking
const badPorts = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);

/** Retry only blocked port allocations; startup/close failures propagate unchanged. */
export async function startFetchServer<T extends { server: Server; close(): Promise<void> }>(
  start: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const running = await start();
    const address = running.server.address();
    if (address && typeof address !== "string" && !badPorts.has(address.port)) return running;
    await running.close();
    if (!address || typeof address === "string") throw new Error("Test server has no TCP address.");
  }
  throw new Error("Test server received a fetch-blocked port on all 10 attempts.");
}

/** Listen on an OS-assigned loopback port that fetch can use. */
export async function listenForFetch(server: Server): Promise<void> {
  await startFetchServer(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    return {
      server,
      close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
    };
  });
}
