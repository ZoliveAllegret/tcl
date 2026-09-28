export function readZipEntries(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      break;
    }
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    if ((flags & 8) !== 0 || method !== 8) {
      throw new Error("Le fichier d'horaires TCL a un format inattendu.");
    }
    entries.set(name, bytes.subarray(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }

  return entries;
}

function inflateStream(data: Uint8Array): ReadableStream<Uint8Array> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
}

export async function inflateText(data: Uint8Array): Promise<string> {
  return new TextDecoder().decode(await new Response(inflateStream(data)).arrayBuffer());
}

export async function forEachDataLine(data: Uint8Array, onLine: (line: string) => void): Promise<void> {
  const stream = inflateStream(data);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const consume = (flush: boolean) => {
    pending += flush ? decoder.decode() : "";
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      let line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }
      if (line) {
        onLine(line);
      }
      newline = pending.indexOf("\n");
    }
  };

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      consume(true);
      if (pending) {
        onLine(pending.endsWith("\r") ? pending.slice(0, -1) : pending);
      }
      return;
    }
    pending += decoder.decode(chunk.value, { stream: true });
    consume(false);
  }
}
