import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { withLinkTargets } from "@/lib/cv/extract";

describe("withLinkTargets", () => {
  it("adds the address behind a linked word", () => {
    expect(withLinkTargets("Phone | LinkedIn", ["mailto:a@b.com", "https://www.linkedin.com/in/ravi/"])).toBe("Phone | LinkedIn\nLinks: https://www.linkedin.com/in/ravi/");
  });
  it("does not repeat an address already written in the text", () => {
    expect(withLinkTargets("linkedin.com/in/ravi", ["https://www.linkedin.com/in/ravi/"])).toBe("linkedin.com/in/ravi");
  });
});
