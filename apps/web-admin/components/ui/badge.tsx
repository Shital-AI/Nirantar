import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    const variants = {
        default: "bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25",
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80",
        destructive: "bg-destructive/15 text-destructive border border-destructive/25 hover:bg-destructive/20",
        outline: "text-foreground border border-input bg-background hover:bg-muted",
        success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20",
        warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 hover:bg-amber-500/20",
    };

    return (
        <div
            className={cn(
                "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                variants[variant],
                className
            )}
            {...props}
        />
    );
}

export { Badge };
