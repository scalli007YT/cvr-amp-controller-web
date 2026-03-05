import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

interface Project {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  assigned_amps: Array<{
    id: string;
    mac: string;
  }>;
}

export async function GET() {
  try {
    const projectsDir = path.join(process.cwd(), "storage", "projects");

    // Read all files in the projects directory
    const files = await fs.readdir(projectsDir);

    // Filter for JSON files and read them
    const projects: Project[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(projectsDir, file);
        const content = await fs.readFile(filePath, "utf-8");
        const project = JSON.parse(content) as Project;
        projects.push(project);
      }
    }

    // Sort by updatedAt descending
    projects.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load projects",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Project;

    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "Project ID is required" },
        { status: 400 },
      );
    }

    const projectsDir = path.join(process.cwd(), "storage", "projects");
    const filePath = path.join(projectsDir, `${body.id}.json`);

    // Update the updatedAt timestamp
    const updatedProject: Project = {
      ...body,
      updatedAt: new Date().toISOString(),
    };

    // Write the updated project to file
    await fs.writeFile(filePath, JSON.stringify(updatedProject, null, 2));

    return NextResponse.json({
      success: true,
      project: updatedProject,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to save project",
      },
      { status: 500 },
    );
  }
}
