"use client";

import { useState } from "react";
import { useProjectStore } from "@/stores/ProjectStore";
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

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const { createProject } = useProjectStore();
  const dict = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await createProject(name.trim(), description.trim());
      toast.success(dict.dialogs.newProject.toastCreated.replace("{name}", name.trim()));
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        `${dict.dialogs.newProject.toastCreateFailed}: ${error instanceof Error ? error.message : dict.dialogs.common.unknownError}`
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim() && !isCreating) {
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dict.dialogs.newProject.title}</DialogTitle>
          <DialogDescription>{dict.dialogs.newProject.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="project-name">{dict.dialogs.newProject.nameLabel}</Label>
            <Input
              id="project-name"
              placeholder={dict.dialogs.newProject.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              disabled={isCreating}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">{dict.dialogs.newProject.descriptionLabel}</Label>
            <Input
              id="project-description"
              placeholder={dict.dialogs.newProject.descriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isCreating}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isCreating}>
              {dict.dialogs.common.cancel}
            </Button>
          </DialogClose>
          <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
            {isCreating ? dict.dialogs.newProject.creating : dict.dialogs.newProject.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
