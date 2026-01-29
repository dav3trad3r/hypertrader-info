import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ 
  message = 'Loading trading data...'
}: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      <div className="relative">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        
        {/* Animated ring */}
        <div className="w-16 h-16 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        
        {/* Inner glow */}
        <div className="absolute inset-2 rounded-full bg-primary/10 animate-pulse" />
        
        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
      </div>
      
      <div className="text-center space-y-2">
        <p className="text-foreground font-medium">{message}</p>
        <p className="text-sm text-muted-foreground">Fetching recent trades...</p>
      </div>
      
      {/* Loading dots */}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-primary pulse-glow"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </div>
    </div>
  );
}
