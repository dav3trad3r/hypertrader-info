import { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type DailyPnL, type WeeklyPnL, type Fill } from '@/lib/hyperliquid';
import { DayTradeBreakdown } from '@/components/DayTradeBreakdown';
import { cn, formatCurrency } from '@/lib/utils';

interface PnLCalendarProps {
  dailyPnL: DailyPnL[];
  weeklyPnL: WeeklyPnL[];
  fills: Fill[];
  isLoadingMonth?: boolean;
  loadedMonths?: Set<string>;
  onLoadMonth?: (year: number, month: number) => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function PnLCalendar({ 
  dailyPnL, 
  weeklyPnL, 
  fills, 
  isLoadingMonth = false,
  loadedMonths = new Set(),
  onLoadMonth 
}: PnLCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [hoveredDay, setHoveredDay] = useState<DailyPnL | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Check if current month is loaded
  const currentMonthKey = getMonthKey(currentDate.getFullYear(), currentDate.getMonth());
  const isCurrentMonthLoaded = loadedMonths.has(currentMonthKey);

  // Load month when navigating to an unloaded month
  useEffect(() => {
    if (onLoadMonth && !isCurrentMonthLoaded && !isLoadingMonth) {
      onLoadMonth(currentDate.getFullYear(), currentDate.getMonth());
    }
  }, [currentDate, isCurrentMonthLoaded, isLoadingMonth, onLoadMonth]);

  // Create a map for quick lookup
  const pnlMap = useMemo(() => {
    const map = new Map<string, DailyPnL>();
    dailyPnL.forEach(d => map.set(d.date, d));
    return map;
  }, [dailyPnL]);

  // Calculate calendar grid
  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    const weeks: (DailyPnL | null)[][] = [];
    let currentWeek: (DailyPnL | null)[] = [];
    
    // Add padding for days before month starts
    for (let i = 0; i < startPadding; i++) {
      currentWeek.push(null);
    }
    
    // Add each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayData = pnlMap.get(dateStr) || {
        date: dateStr,
        pnl: 0,
        trades: 0,
        volume: 0,
        fees: 0,
        wins: 0,
        losses: 0,
      };
      
      currentWeek.push(dayData);
      
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    
    // Pad last week if needed
    while (currentWeek.length > 0 && currentWeek.length < 7) {
      currentWeek.push(null);
    }
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
    }
    
    return weeks;
  }, [currentDate, pnlMap]);

  // Calculate monthly total
  const monthlyTotal = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    let total = 0;
    let trades = 0;
    let volume = 0;
    
    dailyPnL.forEach(d => {
      const date = new Date(d.date);
      if (date.getFullYear() === year && date.getMonth() === month) {
        total += d.pnl;
        trades += d.trades;
        volume += d.volume;
      }
    });
    
    return { total, trades, volume };
  }, [currentDate, dailyPnL]);

  const navigateMonth = (direction: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
    setSelectedDate(null); // Close breakdown when changing months
  };

  // Calculate week's PnL
  const getWeekTotal = (weekIndex: number): number => {
    const week = calendarData[weekIndex];
    if (!week) return 0;
    return week.reduce((sum, day) => sum + (day?.pnl || 0), 0);
  };

  const handleDayClick = (day: DailyPnL) => {
    if (day.trades > 0) {
      setSelectedDate(selectedDate === day.date ? null : day.date);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1">
            <span className={cn(
              "text-base sm:text-lg font-mono font-semibold",
              monthlyTotal.total >= 0 ? "text-profit" : "text-loss"
            )}>
              {monthlyTotal.total >= 0 ? '+' : ''}{formatCurrency(monthlyTotal.total)}
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground">
              {monthlyTotal.trades} trades
            </span>
            {isLoadingMonth && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading...
              </span>
            )}
            {!isCurrentMonthLoaded && !isLoadingMonth && (
              <span className="text-xs text-muted-foreground/50">
                (data not loaded)
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(-1)}
            className="h-8 w-8"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
            className="h-8 px-3 text-xs"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(1)}
            className="h-8 w-8"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-8 gap-0.5 sm:gap-1">
        {/* Day headers */}
        {DAYS.map(day => (
          <div key={day} className="text-center text-[10px] sm:text-xs text-muted-foreground py-1 sm:py-2 font-medium">
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day.charAt(0)}</span>
          </div>
        ))}
        <div className="text-center text-[10px] sm:text-xs text-muted-foreground py-1 sm:py-2 font-medium">
          <span className="hidden sm:inline">Week</span>
          <span className="sm:hidden">W</span>
        </div>

        {/* Calendar cells */}
        {calendarData.map((week, weekIndex) => (
          <>
            {week.map((day, dayIndex) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${weekIndex}-${dayIndex}`}
                    className="aspect-square bg-secondary/30 rounded-md"
                  />
                );
              }
              
              const isToday = day.date === new Date().toISOString().split('T')[0];
              const hasData = day.trades > 0;
              const isProfitable = day.pnl > 0;
              const isLoss = day.pnl < 0;
              const isSelected = selectedDate === day.date;
              
              return (
                <div
                  key={day.date}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "aspect-square rounded-sm sm:rounded-md p-0.5 sm:p-1.5 flex flex-col justify-between transition-all duration-200 relative overflow-hidden",
                    hasData && "cursor-pointer",
                    hasData && isProfitable && "bg-profit-muted hover:bg-profit/30",
                    hasData && isLoss && "bg-loss-muted hover:bg-loss/30",
                    !hasData && "bg-secondary/50",
                    isToday && "ring-1 sm:ring-2 ring-primary ring-offset-1 ring-offset-background",
                    isSelected && isProfitable && "ring-1 sm:ring-2 ring-profit glow-profit",
                    isSelected && isLoss && "ring-1 sm:ring-2 ring-loss glow-loss",
                    hoveredDay?.date === day.date && !isSelected && hasData && isProfitable && "glow-profit",
                    hoveredDay?.date === day.date && !isSelected && hasData && isLoss && "glow-loss"
                  )}
                  onMouseEnter={() => hasData && setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                >
                  <span className="text-[8px] sm:text-xs text-muted-foreground leading-none">
                    {parseInt(day.date.split('-')[2])}
                  </span>
                  
                  {hasData && (
                    <div className="text-right">
                      <span className={cn(
                        "text-[8px] sm:text-xs font-mono font-semibold block leading-none",
                        isProfitable ? "text-profit" : "text-loss"
                      )}>
                        {isProfitable ? '+' : ''}{formatCurrency(day.pnl)}
                      </span>
                      <span className="text-[7px] sm:text-[10px] text-muted-foreground hidden sm:inline">
                        {day.trades}t
                      </span>
                    </div>
                  )}
                  
                  {/* Tooltip (only show if not selected) */}
                  {hoveredDay?.date === day.date && hasData && !isSelected && (
                    <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover border border-border rounded-lg p-3 shadow-lg min-w-[160px] animate-fade-in pointer-events-none">
                      <div className="text-xs text-muted-foreground mb-2">
                        {new Date(day.date).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                      <div className={cn(
                        "text-lg font-mono font-bold",
                        isProfitable ? "text-profit" : "text-loss"
                      )}>
                        {isProfitable ? '+' : ''}{formatCurrency(day.pnl)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Trades:</span>
                          <span className="ml-1 font-mono">{day.trades}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">W/L:</span>
                          <span className="ml-1 font-mono text-profit">{day.wins}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="font-mono text-loss">{day.losses}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Volume:</span>
                          <span className="ml-1 font-mono">{formatCurrency(day.volume)}</span>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-border text-[10px] text-primary text-center">
                        Click to view trades
                      </div>
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-8 border-transparent border-t-popover" />
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Weekly total */}
            <div className={cn(
              "aspect-square rounded-sm sm:rounded-md p-0.5 sm:p-1.5 flex flex-col justify-center items-center",
              getWeekTotal(weekIndex) > 0 && "bg-profit/10",
              getWeekTotal(weekIndex) < 0 && "bg-loss/10",
              getWeekTotal(weekIndex) === 0 && "bg-secondary/30"
            )}>
              <span className={cn(
                "text-[8px] sm:text-xs font-mono font-semibold leading-none",
                getWeekTotal(weekIndex) > 0 ? "text-profit" : 
                getWeekTotal(weekIndex) < 0 ? "text-loss" : "text-muted-foreground"
              )}>
                {getWeekTotal(weekIndex) !== 0 && (getWeekTotal(weekIndex) > 0 ? '+' : '')}
                {getWeekTotal(weekIndex) !== 0 ? formatCurrency(getWeekTotal(weekIndex)) : '—'}
              </span>
            </div>
          </>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-border">
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-sm bg-profit-muted" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">Profitable</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-sm bg-loss-muted" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">Loss</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-sm bg-secondary/50" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">No Trades</span>
        </div>
        {selectedDate && (
          <span className="text-[10px] sm:text-xs text-primary">
            Tap to close
          </span>
        )}
      </div>

      {/* Trade Breakdown Drawer */}
      {selectedDate && (
        <DayTradeBreakdown
          date={selectedDate}
          fills={fills}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
