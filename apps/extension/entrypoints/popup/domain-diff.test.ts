import { describe, expect, it } from "vitest";
import { highlightDomain } from "./domain-diff";

describe("highlightDomain", () => {
  it("highlights a single swapped character", () => {
    expect(highlightDomain("paypa1.com", "paypal.com")).toEqual({
      prefix: "paypa",
      tricky: "1",
      suffix: ".com",
    });
  });

  it("highlights a swapped-in pair of characters", () => {
    expect(highlightDomain("rnicrosoft.com", "microsoft.com")).toEqual({
      prefix: "",
      tricky: "rn",
      suffix: "icrosoft.com",
    });
  });

  it("highlights nothing for an exact match", () => {
    expect(highlightDomain("paypal.com", "paypal.com")).toEqual({
      prefix: "paypal.com",
      tricky: "",
      suffix: "",
    });
  });
});
