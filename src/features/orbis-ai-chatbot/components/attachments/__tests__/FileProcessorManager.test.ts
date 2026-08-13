import { describe, it, expect } from "vitest";
import { FileProcessorManager } from "../FileProcessorManager";

describe("FileProcessorManager", () => {
  it("processes text files and extracts textContent", async () => {
    const file = new File(["Hello ORBIS Brain!"], "test.txt", {
      type: "text/plain",
    });
    const result = await FileProcessorManager.processFile(file);

    expect(result.fileName).toBe("test.txt");
    expect(result.mimeType).toBe("text/plain");
    expect(result.textContent).toBe("Hello ORBIS Brain!");
    expect(result.base64Data).toBeUndefined();
  });

  it("processes image files and extracts base64Data", async () => {
    const file = new File(["fake-image-content"], "image.png", {
      type: "image/png",
    });
    const result = await FileProcessorManager.processFile(file);

    expect(result.fileName).toBe("image.png");
    expect(result.mimeType).toBe("image/png");
    expect(result.textContent).toBeUndefined();
    expect(result.base64Data).toBeDefined();
  });
});
