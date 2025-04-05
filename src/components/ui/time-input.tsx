import * as React from "react"
import { Clock } from "@phosphor-icons/react"
import { Input } from "./input"
import { cn } from "../../lib/utils"

interface TimeInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (time: string) => void
  className?: string
}

export function TimeInput({ value, onChange, className, ...props }: TimeInputProps) {
  // Allow the underlying input to be styled like a normal input
  // but wrap it in a container with an icon
  return (
    <div className="relative">
      <Input
        type="time" // Keep the time type for the nice formatting/input experience
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-datetime-edit]:ml-4 [&::-webkit-datetime-edit]:text-foreground dark:[&::selection]:text-white dark:[&::selection]:bg-primary", 
          className
        )}
        {...props}
      />
      <Clock 
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" 
        size={13} 
      />
    </div>
  )
}