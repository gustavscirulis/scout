import * as React from "react"
import { Clock } from "@phosphor-icons/react"
import { Input } from "./input"
import { cn } from "../../lib/utils"

interface TimePickerProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string
  onChange: (time: string) => void
  className?: string
}

export function TimePicker({ value, onChange, className, ...props }: TimePickerProps) {
  return (
    <div className="relative">
      <Input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("pl-8", className)}
        {...props}
      />
      <Clock 
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" 
        size={16} 
      />
    </div>
  )
}