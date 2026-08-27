export interface ProcessedFile {
  fileName: string;
  mimeType: string;
  textContent?: string;
  base64Data?: string;
}

export class FileProcessorManager {
  static async processFile(file: File): Promise<ProcessedFile> {
    const mimeType = file.type;
    const fileName = file.name;

    // 1. Text Files (txt, csv, json, md)
    if (mimeType.startsWith("text/") || mimeType === "application/json") {
      const textContent = await this.readTextFile(file);
      return { fileName, mimeType, textContent };
    }

    // 2. Images & PDFs (Pass as Base64 for Vision/Doc API)
    const base64Data = await this.fileToBase64(file);
    return { fileName, mimeType, base64Data };
  }

  private static async readTextFile(file: File): Promise<string> {
    try {
      return await file.text();
    } catch {
      throw new Error("Failed to read text file.");
    }
  }

  private static fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const base64 = result.split(",")[1]; // Remove data url prefix
        resolve(base64);
      };
      reader.onerror = () =>
        reject(new Error("Failed to convert file to Base64."));
      reader.readAsDataURL(file);
    });
  }
}
