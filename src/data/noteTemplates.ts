// Note Templates - Reusable templates for quick note creation

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'productivity' | 'planning' | 'documentation' | 'learning';
  icon: string; // Lucide icon name
  color: string;
  content: string;
}

export const noteTemplates: NoteTemplate[] = [
  // Basic Templates
  {
    id: 'blank',
    name: 'Blank Note',
    description: 'Start with a clean slate',
    category: 'basic',
    icon: 'FileText',
    color: '#B5AFA6',
    content: '',
  },

  // Productivity Templates
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Capture meeting discussions and action items',
    category: 'productivity',
    icon: 'Users',
    color: '#5B8DEF',
    content: `## Meeting Details

**Date:** ${new Date().toLocaleDateString()}
**Time:**
**Attendees:**

---

## Agenda

1.
2.
3.

---

## Discussion Notes



---

## Action Items

| Task | Owner | Due Date | Status |
|------|-------|----------|--------|
|      |       |          | Pending |
|      |       |          | Pending |

---

## Next Steps

- [ ]
- [ ]

---

## Next Meeting

**Date:**
**Topics to cover:**
`,
  },

  {
    id: 'daily-journal',
    name: 'Daily Journal',
    description: 'Reflect on your day with gratitude and goals',
    category: 'productivity',
    icon: 'Sun',
    color: '#D4A72C',
    content: `## ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

### Morning Intentions

**Today I'm grateful for:**
1.
2.
3.

**Today's top priorities:**
1.
2.
3.

**How I'll make today great:**


---

### Evening Reflection

**What went well today:**


**What I learned:**


**What could be improved:**


**Tomorrow I will:**

`,
  },

  {
    id: 'weekly-review',
    name: 'Weekly Review',
    description: 'Review your week and plan ahead',
    category: 'productivity',
    icon: 'Calendar',
    color: '#6B9F78',
    content: `## Weekly Review

**Week of:** ${new Date().toLocaleDateString()} - ${new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString()}

---

### Accomplishments

- [ ]
- [ ]
- [ ]

### Challenges Faced



### Lessons Learned



---

### Next Week Planning

#### Goals
1.
2.
3.

#### Key Tasks

| Priority | Task | Deadline |
|----------|------|----------|
| High     |      |          |
| Medium   |      |          |
| Low      |      |          |

#### Habits to Focus On

- [ ]
- [ ]

---

### Notes & Ideas


`,
  },

  // Planning Templates
  {
    id: 'project-plan',
    name: 'Project Plan',
    description: 'Plan and track project milestones',
    category: 'planning',
    icon: 'Target',
    color: '#DA7756',
    content: `## Project Overview

**Project Name:**
**Start Date:**
**Target Completion:**
**Status:** Planning

---

### Objectives

1.
2.
3.

### Success Criteria

- [ ]
- [ ]

---

### Timeline

\`\`\`mermaid
gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1
    Planning           :a1, 2024-01-01, 7d
    Research           :a2, after a1, 5d
    section Phase 2
    Development        :a3, after a2, 14d
    Testing            :a4, after a3, 7d
    section Phase 3
    Launch             :a5, after a4, 3d
\`\`\`

---

### Resources Needed

| Resource | Purpose | Status |
|----------|---------|--------|
|          |         |        |

### Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
|      |        |            |

---

### Notes


`,
  },

  {
    id: 'decision-document',
    name: 'Decision Document',
    description: 'Analyze options and document decisions',
    category: 'planning',
    icon: 'GitBranch',
    color: '#9B7ED9',
    content: `## Decision Document

**Decision:**
**Date:** ${new Date().toLocaleDateString()}
**Decision Maker:**
**Status:** Under Review

---

### Context

*What is the background? Why is this decision needed?*



---

### Options Considered

#### Option 1:

**Pros:**
-

**Cons:**
-

**Estimated Effort:**

---

#### Option 2:

**Pros:**
-

**Cons:**
-

**Estimated Effort:**

---

### Decision Matrix

| Criteria | Weight | Option 1 | Option 2 |
|----------|--------|----------|----------|
| Cost     | 30%    |          |          |
| Time     | 25%    |          |          |
| Quality  | 25%    |          |          |
| Risk     | 20%    |          |          |
| **Total**|        |          |          |

---

### Recommendation



### Final Decision



### Next Steps

1.
2.
3.

`,
  },

  {
    id: 'sprint-retro',
    name: 'Sprint Retrospective',
    description: 'Agile team retrospective template',
    category: 'planning',
    icon: 'RefreshCw',
    color: '#4BA3A3',
    content: `## Sprint Retrospective

**Sprint:**
**Date:** ${new Date().toLocaleDateString()}
**Team:**

---

### What Went Well

-
-
-

### What Could Be Improved

-
-
-

### Action Items

| Action | Owner | Priority | Due |
|--------|-------|----------|-----|
|        |       |          |     |

---

### Team Health Check

\`\`\`mermaid
pie title Team Satisfaction
    "Happy" : 0
    "Neutral" : 0
    "Needs Improvement" : 0
\`\`\`

### Key Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Velocity |      |        |
| Bugs Fixed |    |        |
| Stories Completed | |    |

---

### Kudos & Recognition



### Notes for Next Sprint


`,
  },

  // Documentation Templates
  {
    id: 'feature-spec',
    name: 'Feature Specification',
    description: 'Document feature requirements and design',
    category: 'documentation',
    icon: 'Layers',
    color: '#D47B9E',
    content: `## Feature Specification

**Feature Name:**
**Author:**
**Created:** ${new Date().toLocaleDateString()}
**Status:** Draft

---

### Overview

*Brief description of the feature and its purpose*



### User Story

> As a **[user type]**, I want **[goal]** so that **[benefit]**.

---

### Requirements

#### Functional Requirements

- [ ]
- [ ]
- [ ]

#### Non-Functional Requirements

- [ ] Performance:
- [ ] Security:
- [ ] Accessibility:

---

### User Flow

\`\`\`mermaid
flowchart TD
    A[User Action] --> B{Decision}
    B -->|Yes| C[Success State]
    B -->|No| D[Error State]
    C --> E[End]
    D --> E
\`\`\`

---

### API Design

| Endpoint | Method | Description |
|----------|--------|-------------|
|          |        |             |

### Data Model

| Field | Type | Required | Description |
|-------|------|----------|-------------|
|       |      |          |             |

---

### Acceptance Criteria

1. Given... When... Then...
2.
3.

### Out of Scope

-

### Dependencies

-

### Open Questions

- [ ]

`,
  },

  {
    id: 'bug-report',
    name: 'Bug Report',
    description: 'Document and track bugs systematically',
    category: 'documentation',
    icon: 'Bug',
    color: '#D66565',
    content: `## Bug Report

**Title:**
**Reported By:**
**Date:** ${new Date().toLocaleDateString()}
**Severity:** High / Medium / Low
**Status:** Open

---

### Environment

- **OS:**
- **Browser/App Version:**
- **Device:**

---

### Description

*Clear description of the bug*



### Steps to Reproduce

1.
2.
3.
4.

### Expected Behavior



### Actual Behavior



---

### Screenshots / Logs

*Attach relevant screenshots or error logs*



---

### Additional Context

*Any other relevant information*



### Possible Solution

*If you have ideas on how to fix it*



---

### Resolution

**Fixed By:**
**Fix Date:**
**Root Cause:**
**Solution:**

`,
  },

  {
    id: 'process-doc',
    name: 'Process Documentation',
    description: 'Document workflows and procedures',
    category: 'documentation',
    icon: 'Workflow',
    color: '#6B6B6B',
    content: `## Process Documentation

**Process Name:**
**Owner:**
**Last Updated:** ${new Date().toLocaleDateString()}
**Version:** 1.0

---

### Purpose

*Why does this process exist?*



### Scope

*What does this process cover and not cover?*

**Includes:**
-

**Excludes:**
-

---

### Process Flow

\`\`\`mermaid
flowchart LR
    A[Start] --> B[Step 1]
    B --> C[Step 2]
    C --> D{Decision}
    D -->|Path A| E[Step 3a]
    D -->|Path B| F[Step 3b]
    E --> G[End]
    F --> G
\`\`\`

---

### Detailed Steps

#### Step 1:

**Responsible:**
**Input:**
**Output:**
**Instructions:**



#### Step 2:

**Responsible:**
**Input:**
**Output:**
**Instructions:**



---

### Roles & Responsibilities

| Role | Responsibility |
|------|----------------|
|      |                |

### Related Documents

-

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0     |      |        | Initial |

`,
  },

  // Learning Templates
  {
    id: 'book-notes',
    name: 'Book Notes',
    description: 'Capture insights from books you read',
    category: 'learning',
    icon: 'BookOpen',
    color: '#DA7756',
    content: `## Book Notes

**Title:**
**Author:**
**Started:**
**Finished:**
**Rating:** /5

---

### Why I Read This



### Key Takeaways

1.
2.
3.

---

### Chapter Summaries

#### Chapter 1:



#### Chapter 2:



---

### Favorite Quotes

>

>

---

### How This Applies to My Life



### Action Items

- [ ]
- [ ]

### Related Books/Resources

-

`,
  },

  {
    id: 'learning-notes',
    name: 'Learning Notes',
    description: 'Structure your learning on any topic',
    category: 'learning',
    icon: 'GraduationCap',
    color: '#5B8DEF',
    content: `## Learning Notes

**Topic:**
**Date:** ${new Date().toLocaleDateString()}
**Source:**

---

### Overview

*What am I learning and why?*



### Prerequisites

-

---

### Core Concepts

#### Concept 1:

**Definition:**

**Key Points:**
-

**Example:**



#### Concept 2:

**Definition:**

**Key Points:**
-

**Example:**



---

### Concept Map

\`\`\`mermaid
mindmap
  root((Topic))
    Concept 1
      Detail A
      Detail B
    Concept 2
      Detail C
      Detail D
    Concept 3
      Detail E
\`\`\`

---

### Practice / Exercises

- [ ]
- [ ]

### Questions to Explore

- [ ]
- [ ]

### Resources

-

### Review Schedule

- [ ] Review in 1 day
- [ ] Review in 1 week
- [ ] Review in 1 month

`,
  },

  {
    id: 'interview-notes',
    name: 'Interview Notes',
    description: 'Conduct and document interviews',
    category: 'productivity',
    icon: 'MessageSquare',
    color: '#4BA3A3',
    content: `## Interview Notes

**Candidate/Interviewee:**
**Position/Purpose:**
**Date:** ${new Date().toLocaleDateString()}
**Interviewer:**

---

### Pre-Interview

**Objectives:**
1.
2.

**Key Questions to Ask:**
1.
2.
3.
4.
5.

---

### Interview Notes

#### Background & Experience



#### Technical/Skill Assessment

| Area | Rating (1-5) | Notes |
|------|--------------|-------|
|      |              |       |

#### Behavioral Questions

**Q:**
**A:**

**Q:**
**A:**

---

### Candidate Questions

*Questions they asked:*



---

### Overall Assessment

**Strengths:**
-

**Areas for Development:**
-

**Culture Fit:**

**Recommendation:** Strong Yes / Yes / Maybe / No

### Next Steps

- [ ]
- [ ]

### Additional Notes


`,
  },
];

export const templateCategories = [
  { id: 'basic', name: 'Basic', icon: 'FileText' },
  { id: 'productivity', name: 'Productivity', icon: 'Zap' },
  { id: 'planning', name: 'Planning', icon: 'Target' },
  { id: 'documentation', name: 'Documentation', icon: 'FileCode' },
  { id: 'learning', name: 'Learning', icon: 'GraduationCap' },
] as const;

export function getTemplatesByCategory(category: string): NoteTemplate[] {
  if (category === 'all') return noteTemplates;
  return noteTemplates.filter(t => t.category === category);
}

export function getTemplateById(id: string): NoteTemplate | undefined {
  return noteTemplates.find(t => t.id === id);
}
