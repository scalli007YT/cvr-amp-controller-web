import { Card } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-foreground">CVR AMP Controller</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-semibold text-foreground">Hello</h2>
          </div>

          <Card className="p-6">
            {/* Empty card */}
          </Card>
        </div>
      </main>
    </div>
  );
}