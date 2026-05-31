import { describe, expect, it } from "vitest";
import { GenerationQueue } from "../queue.js";

describe("GenerationQueue", () => {
  it("runs generation work serially", async () => {
    const queue = new GenerationQueue();
    const order: string[] = [];
    const first = queue.run("first", async () => {
      order.push("first-start");
      await delay(10);
      order.push("first-end");
      return "first";
    });
    const second = queue.run("second", async () => {
      order.push("second-start");
      return "second";
    });

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
    expect(queue.status().recent.length).toBe(2);
  });
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
