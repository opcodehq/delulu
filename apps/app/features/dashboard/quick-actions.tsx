"use client";

import { Button } from "@delulu/design-system/components/ui/button";
import { Card, CardContent } from "@delulu/design-system/components/ui/card";
import { Icon } from "@delulu/design-system/providers/icon";
import { Add01Icon, Upload01Icon } from "@delulu/icons";
import { useAppRouter as useRouter } from "@/shell/navigation/route-transition";

export function QuickActions() {
  const router = useRouter();

  const primaryActions = [
    {
      title: "Create Post",
      description: "Write and schedule new content",
      icon: Add01Icon,
      action: () => router.push("/post"),
      variant: "default" as const,
      className: "bg-primary text-primary-foreground hover:bg-primary/90",
    },
    {
      title: "Upload Media",
      description: "Add images and videos to library",
      icon: Upload01Icon,
      action: () => router.push("/media"),
      variant: "outline" as const,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {primaryActions.map((action) => {
        return (
          <Card
            className="group cursor-pointer transition-shadow hover:shadow-md"
            key={action.title}
            onClick={action.action}
          >
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="rounded-lg bg-primary/10 p-3 transition-colors group-hover:bg-primary/20">
                  <Icon className="text-primary" icon={action.icon} size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{action.title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {action.description}
                  </p>
                </div>
                <Button size="sm" variant={action.variant}>
                  Get Started
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
