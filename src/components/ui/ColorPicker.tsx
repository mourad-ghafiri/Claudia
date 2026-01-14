import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { TASK_COLORS } from '../../types';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  size?: 'sm' | 'md';
}

export function ColorPicker({ value, onChange, size = 'md' }: ColorPickerProps) {
  const sizeClasses = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';

  return (
    <div className="flex flex-wrap gap-2">
      {TASK_COLORS.map((color) => (
        <motion.button
          key={color.value}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onChange(color.value)}
          className={`
            ${sizeClasses} rounded-full
            flex items-center justify-center
            ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#242424]
            transition-all duration-150
            ${value === color.value ? 'ring-[#DA7756]' : 'ring-transparent hover:ring-[#D8D3CC]'}
          `}
          style={{ backgroundColor: color.value }}
          title={color.name}
        >
          {value === color.value && (
            <Check className="w-4 h-4 text-white drop-shadow" />
          )}
        </motion.button>
      ))}
    </div>
  );
}
