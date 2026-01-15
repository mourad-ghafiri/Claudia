import { useState, useEffect, useRef } from 'react';
import { format, addDays, startOfToday, isToday, isTomorrow } from 'date-fns';
import { Calendar, Clock, X } from 'lucide-react';

interface DateTimePickerProps {
  value: number | null;
  onChange: (timestamp: number | null) => void;
  placeholder?: string;
}

// Quick select options
const quickOptions = [
  { label: 'Today', getValue: () => startOfToday() },
  { label: 'Tomorrow', getValue: () => addDays(startOfToday(), 1) },
  { label: 'In 3 days', getValue: () => addDays(startOfToday(), 3) },
  { label: 'In a week', getValue: () => addDays(startOfToday(), 7) },
];

// Time presets
const timePresets = [
  { label: 'Morning', value: '09:00' },
  { label: 'Noon', value: '12:00' },
  { label: 'Afternoon', value: '15:00' },
  { label: 'Evening', value: '18:00' },
];

export function DateTimePicker({
  value,
  onChange,
}: DateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('12:00');
  const [showTimePicker, setShowTimePicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setDate(format(d, 'yyyy-MM-dd'));
      setTime(format(d, 'HH:mm'));
    } else {
      setDate('');
      setTime('12:00');
    }
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowTimePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDateSelect = (newDate: Date) => {
    const dateStr = format(newDate, 'yyyy-MM-dd');
    setDate(dateStr);
    const timestamp = new Date(`${dateStr}T${time}`).getTime();
    onChange(timestamp);
  };

  const handleTimeSelect = (newTime: string) => {
    setTime(newTime);
    if (date) {
      const timestamp = new Date(`${date}T${newTime}`).getTime();
      onChange(timestamp);
    }
    setShowTimePicker(false);
  };

  const handleCustomTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTime(newTime);
    if (date && newTime) {
      const timestamp = new Date(`${date}T${newTime}`).getTime();
      onChange(timestamp);
    }
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDate('');
    setTime('12:00');
    onChange(null);
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (!value) return 'Set due date';
    const d = new Date(value);
    if (isToday(d)) {
      return `Today at ${format(d, 'h:mm a')}`;
    }
    if (isTomorrow(d)) {
      return `Tomorrow at ${format(d, 'h:mm a')}`;
    }
    return format(d, 'MMM d, yyyy \'at\' h:mm a');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left
          ${value
            ? 'bg-[#DA7756]/5 border-[#DA7756]/30 text-[#DA7756]'
            : 'bg-[#FAF9F7] dark:bg-[#1A1A1A] border-[#EBE8E4] dark:border-[#393939] text-[#6B6B6B] dark:text-[#B5AFA6]'
          }
          hover:border-[#DA7756] focus:outline-none focus:border-[#DA7756]
        `}
      >
        <Calendar className={`w-4 h-4 flex-shrink-0 ${value ? 'text-[#DA7756]' : ''}`} />
        <span className="flex-1 text-sm font-medium truncate">
          {getDisplayText()}
        </span>
        {value && (
          <button
            type="button"
            onClick={clear}
            className="p-1 hover:bg-[#DA7756]/10 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#242424] border border-[#EBE8E4] dark:border-[#393939] rounded-xl shadow-xl z-50 overflow-hidden">
          {!showTimePicker ? (
            <>
              {/* Quick Options */}
              <div className="p-2 border-b border-[#EBE8E4] dark:border-[#393939]">
                <div className="grid grid-cols-2 gap-1.5">
                  {quickOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => handleDateSelect(option.getValue())}
                      className={`
                        px-3 py-2 text-xs font-medium rounded-lg transition-colors
                        ${date === format(option.getValue(), 'yyyy-MM-dd')
                          ? 'bg-[#DA7756] text-white'
                          : 'bg-[#F5F3F0] dark:bg-[#2E2E2E] text-[#2D2D2D] dark:text-[#E8E6E3] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]'
                        }
                      `}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calendar Input */}
              <div className="p-3 border-b border-[#EBE8E4] dark:border-[#393939]">
                <label className="block text-[10px] font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1.5">
                  Or pick a date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      if (e.target.value) {
                        handleDateSelect(new Date(e.target.value + 'T12:00:00'));
                      }
                    }}
                    className="w-full px-3 py-2 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] focus:outline-none focus:border-[#DA7756]"
                  />
                </div>
              </div>

              {/* Time Selection */}
              {date && (
                <div className="p-3">
                  <label className="block text-[10px] font-medium text-[#6B6B6B] dark:text-[#B5AFA6] uppercase tracking-wider mb-1.5">
                    Time
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-4 gap-1">
                      {timePresets.map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => handleTimeSelect(preset.value)}
                          className={`
                            px-2 py-1.5 text-[10px] font-medium rounded-lg transition-colors
                            ${time === preset.value
                              ? 'bg-[#DA7756] text-white'
                              : 'bg-[#F5F3F0] dark:bg-[#2E2E2E] text-[#2D2D2D] dark:text-[#E8E6E3] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]'
                            }
                          `}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom time input */}
                  <div className="mt-2 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#B5AFA6]" />
                    <input
                      type="time"
                      value={time}
                      onChange={handleCustomTimeChange}
                      className="flex-1 px-3 py-2 bg-[#FAF9F7] dark:bg-[#1A1A1A] border border-[#EBE8E4] dark:border-[#393939] rounded-lg text-sm text-[#2D2D2D] dark:text-[#E8E6E3] focus:outline-none focus:border-[#DA7756]"
                    />
                  </div>
                </div>
              )}

              {/* Done button */}
              {date && (
                <div className="p-2 border-t border-[#EBE8E4] dark:border-[#393939]">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="w-full px-3 py-2 bg-[#DA7756] hover:bg-[#C96847] text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
