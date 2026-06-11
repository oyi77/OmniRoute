import { NextResponse } from "next/server";
import { listMarketplacePlugins } from "@/lib/plugins/marketplace";

export async function GET() {
  try {
    const plugins = await listMarketplacePlugins();
    return NextResponse.json({ plugins });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch marketplace plugins" }, { status: 500 });
  }
}
