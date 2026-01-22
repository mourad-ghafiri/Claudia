import { memo, useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { openUrl } from '@tauri-apps/plugin-opener';

// Global cache for mermaid renders to avoid re-rendering same diagrams
const mermaidCache = new Map<string, string>();
let mermaidIdCounter = 0;

// Initialize mermaid once
mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    suppressErrorRendering: true,
    themeVariables: {
        background: 'transparent',
        primaryColor: '#DA7756',
        primaryTextColor: '#2D2D2D',
        primaryBorderColor: '#D8D3CC',
        lineColor: '#B5AFA6',
        secondaryColor: '#F5F3F0',
        tertiaryColor: '#FDFCFB',
    },
});

// Add global styles for mermaid diagrams
if (typeof document !== 'undefined' && !document.getElementById('mermaid-theme-styles')) {
    const mermaidStyles = document.createElement('style');
    mermaidStyles.id = 'mermaid-theme-styles';
    mermaidStyles.textContent = `
      .mermaid-container svg {
        max-width: 100%;
        height: auto;
      }
      .mermaid-container .node rect,
      .mermaid-container .node circle,
      .mermaid-container .node ellipse,
      .mermaid-container .node polygon,
      .mermaid-container .node path {
        fill: #F5F3F0 !important;
        stroke: #D8D3CC !important;
      }
      .dark .mermaid-container .node rect,
      .dark .mermaid-container .node circle,
      .dark .mermaid-container .node ellipse,
      .dark .mermaid-container .node polygon,
      .dark .mermaid-container .node path {
        fill: #393939 !important;
        stroke: #4A4A4A !important;
      }
      .mermaid-container .node .label,
      .mermaid-container .nodeLabel,
      .mermaid-container .label {
        color: #2D2D2D !important;
        fill: #2D2D2D !important;
      }
      .dark .mermaid-container .node .label,
      .dark .mermaid-container .nodeLabel,
      .dark .mermaid-container .label {
        color: #E8E6E3 !important;
        fill: #E8E6E3 !important;
      }
      .mermaid-container .edgePath .path,
      .mermaid-container .flowchart-link {
        stroke: #B5AFA6 !important;
      }
      .dark .mermaid-container .edgePath .path,
      .dark .mermaid-container .flowchart-link {
        stroke: #6B6B6B !important;
      }
      .mermaid-container .marker {
        fill: #B5AFA6 !important;
        stroke: #B5AFA6 !important;
      }
      .dark .mermaid-container .marker {
        fill: #6B6B6B !important;
        stroke: #6B6B6B !important;
      }
      .mermaid-container .edgeLabel {
        background-color: transparent !important;
      }
      .mermaid-container text {
        fill: #2D2D2D !important;
      }
      .dark .mermaid-container text {
        fill: #E8E6E3 !important;
      }
    `;
    document.head.appendChild(mermaidStyles);
}

// Mermaid Component - lazy loads only when visible
const MermaidDiagram = memo(function MermaidDiagram({ code }: { code: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [svg, setSvg] = useState<string | null>(() => mermaidCache.get(code) || null);
    const [hasError, setHasError] = useState(false);
    const idRef = useRef(`mermaid-${++mermaidIdCounter}`);

    // Intersection Observer - only render when visible
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '50px' }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => observer.disconnect();
    }, []);

    // Render mermaid only when visible and not cached
    useEffect(() => {
        if (!isVisible || !code || svg) return;

        // Check cache first
        const cached = mermaidCache.get(code);
        if (cached) {
            setSvg(cached);
            return;
        }

        // Use requestIdleCallback to not block main thread
        const timeoutId = setTimeout(() => {
            mermaid.render(idRef.current, code)
                .then(({ svg }) => {
                    mermaidCache.set(code, svg);
                    setSvg(svg);
                })
                .catch(() => {
                    setHasError(true);
                });
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [isVisible, code, svg]);

    if (hasError) {
        return (
            <div ref={ref} className="my-4 p-4 rounded-xl bg-[#FEF2F2] dark:bg-[#3D2424] border border-[#FECACA] dark:border-[#7F1D1D] text-[#DC2626] dark:text-[#FCA5A5] text-sm">
                Failed to render diagram
            </div>
        );
    }

    if (!svg) {
        return (
            <div ref={ref} className="my-4 p-4 rounded-xl bg-[#F5F3F0] dark:bg-[#2E2E2E] border border-[#EBE8E4] dark:border-[#393939] animate-pulse h-32" />
        );
    }

    return (
        <div
            ref={ref}
            className="my-4 p-4 rounded-xl bg-[#FDFCFB] dark:bg-[#2E2E2E] border border-[#EBE8E4] dark:border-[#393939] overflow-x-auto mermaid-container"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
});

// Simple code block without mermaid - much faster
const SimpleCodeBlock = memo(function SimpleCodeBlock({ children, className, ...rest }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    return match ? (
        <div className="my-4 rounded-xl overflow-hidden bg-[#F5F3F0] dark:bg-[#2E2E2E] border border-[#EBE8E4] dark:border-[#393939]">
            {/* Language label */}
            {language && (
                <div className="px-4 py-1.5 border-b border-[#EBE8E4] dark:border-[#393939] bg-[#EBE8E4]/50 dark:bg-[#393939]/50">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[#6B6B6B] dark:text-[#B5AFA6]">
                        {language}
                    </span>
                </div>
            )}
            <pre className="p-4 overflow-x-auto text-sm">
                <code className={`${className} text-[#2D2D2D] dark:text-[#E8E6E3]`} {...rest}>
                    {children}
                </code>
            </pre>
        </div>
    ) : (
        <code className="px-1.5 py-0.5 rounded bg-[#F5F3F0] dark:bg-[#393939] text-[#DA7756] text-sm" {...rest}>
            {children}
        </code>
    );
});

// Code block that handles mermaid separately
const CodeBlock = memo(function CodeBlock({ children, className, ...rest }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const code = String(children).replace(/\n$/, '');

    if (language === 'mermaid') {
        return <MermaidDiagram code={code} />;
    }

    return <SimpleCodeBlock className={className} {...rest}>{children}</SimpleCodeBlock>;
});

// Link component that opens URLs in system browser (works on all platforms)
const ExternalLink = memo(function ExternalLink({ href, children, ...rest }: any) {
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        if (href) {
            // Use Tauri opener plugin to open in system browser
            openUrl(href).catch((err) => {
                console.error('Failed to open link:', err);
            });
        }
    }, [href]);

    return (
        <a
            href={href}
            onClick={handleClick}
            className="text-[#DA7756] hover:text-[#C56545] underline cursor-pointer"
            {...rest}
        >
            {children}
        </a>
    );
});

// Memoized markdown components object - defined once outside render
const markdownComponents = {
    code: CodeBlock,
    a: ExternalLink,
};

interface MarkdownRendererProps {
    content: string;
    className?: string;
    maxChars?: number; // -1 for full content, or number of chars to truncate
}

/**
 * Truncate markdown content intelligently (try to break at word boundaries)
 */
function truncateMarkdown(content: string, maxChars: number): string {
    if (maxChars < 0 || content.length <= maxChars) return content;

    // Find a good break point (space, newline) near maxChars
    let breakPoint = maxChars;
    for (let i = maxChars; i > maxChars - 50 && i > 0; i--) {
        if (content[i] === ' ' || content[i] === '\n') {
            breakPoint = i;
            break;
        }
    }

    return content.substring(0, breakPoint).trim() + '...';
}

/**
 * Full markdown renderer with mermaid support
 * @param content - Markdown content to render
 * @param maxChars - Maximum characters to render (-1 for full content)
 * @param className - Additional CSS classes
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({
    content,
    className = '',
    maxChars = -1
}: MarkdownRendererProps) {
    const [isReady, setIsReady] = useState(false);
    const [displayContent, setDisplayContent] = useState('');

    useEffect(() => {
        setIsReady(false);
        // Defer markdown parsing to next frame to not block UI
        const timeoutId = requestAnimationFrame(() => {
            const truncated = truncateMarkdown(content, maxChars);
            setDisplayContent(truncated);
            setIsReady(true);
        });
        return () => cancelAnimationFrame(timeoutId);
    }, [content, maxChars]);

    if (!isReady || !displayContent) {
        return null;
    }

    return (
        <div className={`prose prose-sm dark:prose-invert max-w-none prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0 prose-code:bg-transparent prose-code:p-0 prose-code:before:content-none prose-code:after:content-none ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
            >
                {displayContent}
            </ReactMarkdown>
        </div>
    );
});

/**
 * Strip markdown to plain text for previews in lists
 */
export function stripMarkdown(markdown: string): string {
    if (!markdown) return '';

    return markdown
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        // Remove inline code
        .replace(/`([^`]+)`/g, '$1')
        // Remove images
        .replace(/!\[.*?\]\(.*?\)/g, '')
        // Remove links but keep text
        .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
        // Remove headers
        .replace(/^#{1,6}\s+/gm, '')
        // Remove bold/italic
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove strikethrough
        .replace(/~~([^~]+)~~/g, '$1')
        // Remove blockquotes
        .replace(/^>\s+/gm, '')
        // Remove horizontal rules
        .replace(/^[-*_]{3,}$/gm, '')
        // Remove list markers
        .replace(/^[\s]*[-*+]\s+/gm, '')
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // Remove task list markers
        .replace(/\[[ x]\]\s*/gi, '')
        // Clean up extra whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
