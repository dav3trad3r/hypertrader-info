import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface LoadingProgress {
  tradesLoaded: number;
  monthsScanned: number;
  currentMonth: string;
  limitReached: boolean;
}

interface LoadingSpinnerProps {
  message?: string;
  progress?: LoadingProgress | null;
}

export function LoadingSpinner({ 
  message = 'Loading trading data...', 
  progress 
}: LoadingSpinnerProps) {
  // Estimate progress based on months (assuming ~36 months max history to Jan 2022)
  const estimatedProgress = progress 
    ? Math.min((progress.monthsScanned / 36) * 100, 95)
    : 0;

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
        {progress ? (
          <div className="space-y-3 min-w-[280px]">
            {/* Progress bar */}
            <Progress value={estimatedProgress} className="h-2" />
            
            {/* Stats */}
            <div className="flex justify-center gap-4 text-sm">
              <div className="text-center">
                <p className="text-xl font-bold text-primary">
                  {progress.tradesLoaded.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">trades loaded</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-foreground">
                  {progress.monthsScanned}
                </p>
                <p className="text-xs text-muted-foreground">months scanned</p>
              </div>
            </div>
            
            {/* Current month */}
            {progress.currentMonth && (
              <p className="text-xs text-muted-foreground">
                Scanning {progress.currentMonth}...
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Connecting to API...</p>
        )}
      </div>
      
      {/* Loading progress indicators */}
      {!progress && (
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary pulse-glow"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}