import { describe, expect, it } from "vitest";
import { GenerationScheduler } from "../scheduler.js";

describe("GenerationScheduler", () => {
  it("serializes work for the same model key", async () => {
    const scheduler = new GenerationScheduler();
    const order: string[] = [];
    const first = scheduler.run("llamacpp:model-a", async () => {
      order.push("first:start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first:end");
      return "first";
    });
    const second = scheduler.run("llamacpp:model-a", async () => {
      order.push("second");
      return "second";
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("allows different model keys to run concurrently", async () => {
    const scheduler = new GenerationScheduler();
    const first = scheduler.run("a", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "a";
    });
    const second = scheduler.run("b", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "b";
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(scheduler.status().runningItems?.length).toBe(2);
    await Promise.all([first, second]);
  });
});
