import { cn, getStatusColor, getSeverityColor } from '@/lib/utils'
import { HTMLAttributes, forwardRef } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'status' | 'severity' | 'default'
  value: string
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', value, ...props }, ref) => {
    const getColorClass = () => {
      if (variant === 'status') {
        return getStatusColor(value)
      }
      if (variant === 'severity') {
        return getSeverityColor(value)
      }
      return 'bg-gray-700 text-gray-300'
    }

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          getColorClass(),
          className
        )}
        {...props}
      >
        {value}
      </span>
    )
  }
)

Badge.displayName = 'Badge'

export default Badge
