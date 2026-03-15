"use client";

import { useState } from "react";
import { useProjectStore, type Project } from "@/stores/ProjectStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useI18n } from "@/components/layout/i18n-provider";

interface DeleteProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteProjectDialog({ project, open, onOpenChange }: DeleteProjectDialogProps) {
  const { deleteProject } = useProjectStore();
  const dict = useI18n();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!project) return;

    setIsDeleting(true);
    try {
      await deleteProject(project.id);
      toast.success(dict.dialogs.deleteProject.toastDeleted.replace("{name}", project.name));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        `${dict.dialogs.deleteProject.toastDeleteFailed}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dict.dialogs.deleteProject.title}</DialogTitle>
          <DialogDescription>
            {dict.dialogs.deleteProject.confirmPrefix}{" "}
            <span className="font-medium text-foreground">{project?.name}</span>?{" "}
            {dict.dialogs.deleteProject.confirmSuffix}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isDeleting}>
              {dict.dialogs.common.cancel}
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? dict.dialogs.deleteProject.deleting : dict.dialogs.deleteProject.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
