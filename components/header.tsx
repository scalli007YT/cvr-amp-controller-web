"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Menu } from "lucide-react";
import { useProjectStore, type Project } from "@/lib/store";

interface HeaderProps {
  projects?: Project[];
  loading?: boolean;
}

export function Header({ projects = [], loading = false }: HeaderProps) {
  const { selectedProject, selectProjectById } = useProjectStore();
  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <Link href="/">Home</Link>
              </DropdownMenuItem>
              <Separator />
              <DropdownMenuItem asChild>
                <Link href="/scanner">Device Scanner</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>New Project</DropdownMenuItem>
              <DropdownMenuItem>Open Project</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link href="/" className=" flex items-center gap-2">
            <Image src="/logo.svg" alt="CK Logo" width={32} height={32} />
            <span className="text-lg font-semibold">AMP Controller</span>
          </Link>
        </div>

        <Select
          value={selectedProject?.id || ""}
          onValueChange={selectProjectById}
          disabled={loading || projects.length === 0}
        >
          <SelectTrigger className="w-40">
            <SelectValue
              placeholder={loading ? "Loading..." : "Select Project"}
            />
          </SelectTrigger>
          <SelectContent align="end">
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
