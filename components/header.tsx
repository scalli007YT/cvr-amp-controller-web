"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronDown, Menu, Pencil, Plus, Trash2 } from "lucide-react";
import { useProjectStore, type Project } from "@/stores/ProjectStore";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { EditProjectDialog } from "@/components/edit-project-dialog";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { ModeToggle } from "@/components/color-mode-toggle";

interface HeaderProps {
  projects?: Project[];
  loading?: boolean;
}

const NAV_LINKS = [
  { label: "Monitor", href: "/monitor" },
];

export function Header({ projects = [], loading = false }: HeaderProps) {
  const { selectedProject, selectProjectById } = useProjectStore();
  const pathname = usePathname();
  const router = useRouter();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);

  return (
    <>
      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
      />
      <EditProjectDialog
        project={editProject}
        open={editProject !== null}
        onOpenChange={(open) => {
          if (!open) setEditProject(null);
        }}
      />
      <DeleteProjectDialog
        project={deleteProject}
        open={deleteProject !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteProject(null);
        }}
      />
      <header className="border-b">
        <div className="px-3 py-2 grid grid-cols-3 items-center gap-2">
          {/* Left — logo + hamburger */}
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <Link href="/monitor">Monitor</Link>
                </DropdownMenuItem>
                <Separator />
                <DropdownMenuItem asChild>
                  <Link href="/scanner">Device Scanner</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href="/monitor" className="flex items-center gap-2 min-w-0">
              <Image
                src="/logo.ico"
                alt="CK Logo"
                width={28}
                height={28}
                className="shrink-0"
              />
              <span className="text-base font-semibold truncate hidden sm:block">
                AMP Controller
              </span>
            </Link>
          </div>

          {/* Center — nav toggle group */}
          <div className="flex justify-center">
            <ToggleGroup
              type="single"
              variant="outline"
              value={pathname}
              onValueChange={(v) => {
                if (v) router.push(v);
              }}
            >
              {NAV_LINKS.map(({ label, href }) => (
                <ToggleGroupItem
                  key={href}
                  value={href}
                  aria-label={`Go to ${label}`}
                  className="px-4"
                >
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Right — theme toggle + project selector */}
          <div className="flex justify-end items-center gap-2">
            <ModeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-36 min-w-0 justify-between font-normal"
                  disabled={loading}
                >
                  <span className="truncate">
                    {loading
                      ? "Loading..."
                      : (selectedProject?.name ?? "Select Project")}
                  </span>
                  <ChevronDown className="ml-1 size-4 shrink-0 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    onSelect={() => selectProjectById(project.id)}
                    className="flex items-center justify-between gap-1 pr-1"
                  >
                    <span
                      className={`truncate flex-1 ${selectedProject?.id === project.id ? "font-medium" : ""}`}
                    >
                      {project.name}
                    </span>
                    <span className="flex items-center gap-0.5 shrink-0">
                      <button
                        className="rounded p-0.5 hover:bg-accent hover:text-accent-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setEditProject(project);
                        }}
                        aria-label={`Edit ${project.name}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDeleteProject(project);
                        }}
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </DropdownMenuItem>
                ))}
                {projects.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onSelect={() => setNewProjectOpen(true)}
                  className="text-muted-foreground"
                >
                  <Plus className="mr-1 size-4" />
                  New Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </>
  );
}
