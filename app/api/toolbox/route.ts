import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

interface ToolboxState {
  nodes: unknown[];
  edges: unknown[];
  updatedAt: string;
}

function getToolboxFilePath(): string {
  const base = process.env.APP_USER_DATA ?? process.cwd();
  return path.join(base, "storage", "global-store", "toolbox", "toolbox.json");
}

async function readToolboxFile(): Promise<ToolboxState> {
  const filePath = getToolboxFilePath();
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as ToolboxState;
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
    };
  } catch (error) {
    const isNotFound =
      typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
    if (isNotFound) {
      return { nodes: [], edges: [], updatedAt: new Date().toISOString() };
    }
    throw error;
  }
}

async function writeToolboxFile(state: ToolboxState): Promise<void> {
  const filePath = getToolboxFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function GET() {
  try {
    const state = await readToolboxFile();
    return NextResponse.json({ success: true, data: state });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to read toolbox" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { nodes?: unknown[]; edges?: unknown[] };
    const state: ToolboxState = {
      nodes: Array.isArray(body.nodes) ? body.nodes : [],
      edges: Array.isArray(body.edges) ? body.edges : [],
      updatedAt: new Date().toISOString()
    };
    await writeToolboxFile(state);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to write toolbox" },
      { status: 500 }
    );
  }
}
