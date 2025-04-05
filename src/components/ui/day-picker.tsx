import * as React from "react"
import { cn } from "../../lib/utils"

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

interface DayPickerProps {
  value: DayOfWeek
  onChange: (day: DayOfWeek) => void
  className?: string
}

const days: { value: DayOfWeek; label: string }[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" }
]

export function DayPicker({ value, onChange, className }: DayPickerProps) {
  return (
    <div className={cn("flex rounded-md border border-input h-9 overflow-hidden", className)}>
      {days.map((day) => (
        <button
          key={day.value}
          type="button"
          onClick={() => onChange(day.value)}
          className={cn(
            "flex-1 text-xs font-medium",
            "transition-colors hover:bg-accent hover:text-accent-foreground",
            value === day.value 
              ? "bg-primary text-primary-foreground" 
              : "text-muted-foreground"
          )}
        >
          {day.label}
        </button>
      ))}
    </div>
  )
}

export type { DayOfWeek }