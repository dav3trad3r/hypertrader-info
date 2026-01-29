import { AlertCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="p-4 rounded-full bg-loss/10">
        <XCircle className="w-10 h-10 text-loss" />
      </div>
      
      <div className="text-center max-w-md">
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Unable to Load Data
        </h3>
        <p className="text-sm text-muted-foreground">
          {message}
        </p>
      </div>
      
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-2">
          Try Again
        </Button>
      )}
      
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
        <AlertCircle className="w-4 h-4" />
        <span>Make sure the address is a valid Hyperliquid wallet</span>
      </div>
    </div>
  );
}
