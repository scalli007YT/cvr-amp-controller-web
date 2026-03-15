"use client";

import { useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { useProjectStore } from "@/stores/ProjectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NewProjectDialog } from "@/components/dialogs/new-project-dialog";
import { useI18n } from "@/components/layout/i18n-provider";

export function NoProjectCard() {
  const dict = useI18n();
  const { projects, selectProjectById } = useProjectStore();
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const d = dict.monitor.noProjectCard;

  return (
    <>
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-5 px-8 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full">
              <FolderOpen className="h-6 w-6 text-muted-foreground" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base font-semibold">{d.title}</h2>
              <p className="text-sm text-muted-foreground">{d.description}</p>
            </div>

            {projects.length > 0 && (
              <div className="flex w-full flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">{d.selectExisting}</p>
                {projects.map((project) => (
                  <Button
                    key={project.id}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start truncate"
                    onClick={() => selectProjectById(project.id)}
                  >
                    {project.name}
                  </Button>
                ))}
              </div>
            )}

            <Button size="sm" className="w-full gap-2" onClick={() => setNewProjectOpen(true)}>
              <Plus className="h-4 w-4" />
              {d.createProject}
            </Button>
          </CardContent>
        </Card>
      </div>

      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </>
  );
}
