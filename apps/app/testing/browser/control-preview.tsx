import { Button } from "@delulu/design-system/components/ui/button";
import {
  Dialog,
  DialogTrigger,
} from "@delulu/design-system/components/ui/dialog";

export function ControlPreview() {
  return (
    <main className="space-y-4 p-4">
      <h1>Control fixtures</h1>
      <div className="flex flex-wrap items-start gap-2">
        <Button>Standard</Button>
        <Button size="sm">Small</Button>
        <Button size="xs">Extra small</Button>
        <Button size="lg">Large</Button>
        <Button aria-label="Icon" size="icon">
          +
        </Button>
        <Button aria-label="Small icon" size="icon-sm">
          +
        </Button>
        <Button aria-label="Custom icon" className="size-6" size="icon">
          +
        </Button>
        <Button className="h-14">Custom height</Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Dialog trigger</Button>
          </DialogTrigger>
        </Dialog>
      </div>
      <Button className="w-48" size="content" variant="outline">
        A longer choice description that needs to wrap across several lines
        without overflowing its button
      </Button>
    </main>
  );
}
