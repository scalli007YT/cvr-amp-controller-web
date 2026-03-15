"use client";

import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n } from "@/components/layout/i18n-provider";

interface EditProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProjectDialog({ project, open, onOpenChange }: EditProjectDialogProps) {
  const { renameProject } = useProjectStore();
  const dict = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Sync fields whenever the dialog opens for a (new) project
  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setDescription(project.description ?? "");
    }
  }, [open, project]);

  const handleSave = async () => {
    if (!project || !name.trim()) return;

    setIsSaving(true);
    try {
      await renameProject(project.id, name.trim(), description.trim());
      toast.success(dict.dialogs.editProject.toastUpdated);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        `${dict.dialogs.editProject.toastUpdateFailed}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim() && !isSaving) {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dict.dialogs.editProject.title}</DialogTitle>
          <DialogDescription>{dict.dialogs.editProject.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-project-name">{dict.dialogs.editProject.nameLabel}</Label>
            <Input
              id="edit-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              disabled={isSaving}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-project-description">{dict.dialogs.editProject.descriptionLabel}</Label>
            <Input
              id="edit-project-description"
              placeholder={dict.dialogs.editProject.descriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSaving}>
              {dict.dialogs.common.cancel}
            </Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? dict.dialogs.editProject.saving : dict.dialogs.editProject.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
