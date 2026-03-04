"use client";

import { useProjectStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Page() {
  const { selectedProject } = useProjectStore();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {selectedProject
          ? `Project - ${selectedProject.name}`
          : "No Project Selected"}
      </h1>

      {selectedProject && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assigned Amps</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedProject.assigned_amps && selectedProject.assigned_amps.length > 0 ? (
              <ul className="space-y-2">
                {selectedProject.assigned_amps.map((amp) => (
                  <li key={amp.id} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{amp.mac}</span>
                    <Badge variant="secondary">{amp.id}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No amps assigned</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
