type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: Record<string, unknown>) => Promise<any>;
};

function fileExtension(filename: string) {
  const match = filename.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

export function mimeTypeForFilename(filename: string) {
  const extension = fileExtension(filename);
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (extension === ".csv") return "text/csv";
  return "application/octet-stream";
}

export async function requestFileSaveTarget(filename: string) {
  const pickerWindow = window as SaveFilePickerWindow;
  if (!window.isSecureContext || typeof pickerWindow.showSaveFilePicker !== "function") {
    return null;
  }

  const extension = fileExtension(filename) || ".bin";
  const mimeType = mimeTypeForFilename(filename);

  return pickerWindow.showSaveFilePicker({
    suggestedName: filename,
    excludeAcceptAllOption: false,
    types: [
      {
        description: "Report file",
        accept: {
          [mimeType]: [extension],
        },
      },
    ],
  });
}

export async function saveBlobToFile(blob: Blob, filename: string, fileHandle?: any) {
  if (!blob || blob.size === 0) {
    throw new Error("Generated file is empty.");
  }

  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 60_000);
}
