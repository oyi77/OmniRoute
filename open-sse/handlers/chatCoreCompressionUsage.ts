/**
 * Attach compression usage receipt to the analytics pipeline.
 *
 * Tracks token usage after compression. The function chains async writes
 * so multiple calls don't race against each other.
 *
 * This is a best-effort analytics hook — it must never affect responses.
 */

import { attachCompressionUsageReceipt } from "@/lib/db/compressionAnalytics";

type AttachCompressionUsageReceiptInput = {
  skillRequestId: string;
  pendingWrite: Promise<void> | null;
};

export function attachCompressionUsageReceiptAfterAnalytics(
  input: AttachCompressionUsageReceiptInput,
  usage: Record<string, unknown>,
  source: "provider" | "estimated" | "stream"
): void {
  const pendingWrite = input.pendingWrite;
  void (async () => {
    try {
      if (pendingWrite) await pendingWrite;
      attachCompressionUsageReceipt(input.skillRequestId, usage, source);
    } catch {
      // Compression analytics are best-effort and must never affect responses.
    }
  })();
}
