import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Modal } from '../ui/Modal';
import { useTemplateStore } from '../../stores/templateStore';
import type { TemplateInfo, TemplateType } from '../../types';
import * as LucideIcons from 'lucide-react';

interface TemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (content: string, templateInfo: TemplateInfo) => void;
  templateType: TemplateType;
}

const categoryLabels: Record<string, string> = {
  basic: 'Basic',
  productivity: 'Productivity',
  planning: 'Planning',
  documentation: 'Documentation',
  learning: 'Learning',
  development: 'Development',
  operations: 'Operations',
};

const categoryIcons: Record<string, string> = {
  basic: 'FileText',
  productivity: 'Zap',
  planning: 'Target',
  documentation: 'FileCode',
  learning: 'GraduationCap',
  development: 'Code',
  operations: 'Server',
};

function getIcon(iconName: string) {
  const Icon = (LucideIcons as any)[iconName];
  return Icon || LucideIcons.FileText;
}

export function TemplateSelector({
  isOpen,
  onClose,
  onSelect,
  templateType,
}: TemplateSelectorProps) {
  const {
    noteTemplates,
    taskTemplates,
    loading,
    fetchTemplates,
    getTemplateContent,
    initializeDefaultTemplates,
  } = useTemplateStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Initialize templates on mount
  useEffect(() => {
    initializeDefaultTemplates();
  }, [initializeDefaultTemplates]);

  // Fetch templates when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchTemplates(templateType);
    }
  }, [isOpen, templateType, fetchTemplates]);

  const templates = templateType === 'notes' ? noteTemplates : taskTemplates;

  // Get unique categories from templates
  const categories = useMemo(() => {
    const cats = new Set(templates.map(t => t.category));
    return Array.from(cats).sort((a, b) => {
      const order = ['basic', 'productivity', 'planning', 'documentation', 'learning', 'development', 'operations'];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [templates]);

  // Filter templates by category and search
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
      const matchesSearch = !searchQuery ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [templates, selectedCategory, searchQuery]);

  // Group templates by category for display
  const groupedTemplates = useMemo(() => {
    if (selectedCategory !== 'all') {
      return { [selectedCategory]: filteredTemplates };
    }

    const groups: Record<string, TemplateInfo[]> = {};
    filteredTemplates.forEach(t => {
      if (!groups[t.category]) {
        groups[t.category] = [];
      }
      groups[t.category].push(t);
    });
    return groups;
  }, [filteredTemplates, selectedCategory]);

  const handleSelectTemplate = async (template: TemplateInfo) => {
    const content = await getTemplateContent(templateType, template.id);
    onSelect(content, template);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose a Template" size="lg">
      <div className="flex flex-col h-[500px]">
        {/* Search and Category Filters */}
        <div className="px-6 py-4 border-b border-[#EBE8E4] dark:border-[#393939] space-y-3">
          {/* Search Input */}
          <div className="relative">
            <LucideIcons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B5AFA6]" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F5F3F0] dark:bg-[#2E2E2E] border-0 rounded-xl text-sm text-[#2D2D2D] dark:text-[#E8E6E3] placeholder-[#B5AFA6] focus:ring-2 focus:ring-[#DA7756]/30 focus:outline-none"
            />
          </div>

          {/* Category Pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-[#DA7756] text-white'
                  : 'bg-[#F5F3F0] dark:bg-[#2E2E2E] text-[#6B6B6B] dark:text-[#B5AFA6] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]'
              }`}
            >
              All
            </button>
            {categories.map(cat => {
              const Icon = getIcon(categoryIcons[cat] || 'FileText');
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                    selectedCategory === cat
                      ? 'bg-[#DA7756] text-white'
                      : 'bg-[#F5F3F0] dark:bg-[#2E2E2E] text-[#6B6B6B] dark:text-[#B5AFA6] hover:bg-[#EBE8E4] dark:hover:bg-[#393939]'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {categoryLabels[cat] || cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Templates Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-[#B5AFA6]">Loading templates...</div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-[#B5AFA6]">
                <LucideIcons.FileQuestion className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No templates found</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                <div key={category}>
                  {selectedCategory === 'all' && (
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#B5AFA6] dark:text-[#6B6B6B] mb-3">
                      {categoryLabels[category] || category}
                    </h3>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {categoryTemplates.map(template => {
                      const Icon = getIcon(template.icon);
                      return (
                        <motion.button
                          key={template.id}
                          onClick={() => handleSelectTemplate(template)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="p-4 bg-[#F5F3F0] dark:bg-[#2E2E2E] rounded-xl text-left hover:bg-[#EBE8E4] dark:hover:bg-[#393939] transition-colors group border-2 border-transparent hover:border-[#DA7756]/30"
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${template.color}20` }}
                            >
                              <Icon
                                className="w-5 h-5"
                                style={{ color: template.color }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm text-[#2D2D2D] dark:text-[#E8E6E3] group-hover:text-[#DA7756] transition-colors truncate">
                                {template.name}
                              </h4>
                              <p className="text-xs text-[#6B6B6B] dark:text-[#B5AFA6] mt-0.5 line-clamp-2">
                                {template.description}
                              </p>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
