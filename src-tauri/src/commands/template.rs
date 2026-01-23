// Template commands - manage note and task templates
// Templates are stored in ~/.claudia/templates/notes/ and ~/.claudia/templates/tasks/

use std::fs;
use std::path::PathBuf;
use tauri::State;

use crate::storage::{StorageState, parseFrontmatter, toMarkdown};
use crate::models::{Template, TemplateFrontmatter, TemplateType};
use super::common::newId;

/// Get the templates base directory (~/.claudia/templates)
fn templatesBaseDir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claudia")
        .join("templates")
}

/// Get the templates directory for a specific type
fn templatesDir(templateType: TemplateType) -> PathBuf {
    templatesBaseDir().join(templateType.folderName())
}

#[derive(serde::Serialize)]
pub struct TemplateInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub icon: String,
    pub color: String,
    pub order: u32,
    pub slug: String,
    pub templateType: String,
}

impl From<&Template> for TemplateInfo {
    fn from(t: &Template) -> Self {
        Self {
            id: t.frontmatter.id.clone(),
            name: t.frontmatter.name.clone(),
            description: t.frontmatter.description.clone(),
            category: t.frontmatter.category.clone(),
            icon: t.frontmatter.icon.clone(),
            color: t.frontmatter.color.clone(),
            order: t.frontmatter.order,
            slug: t.slug.clone(),
            templateType: t.templateType.folderName().to_string(),
        }
    }
}

/// Scan templates from a directory
fn scanTemplates(baseDir: &PathBuf, templateType: TemplateType) -> Vec<Template> {
    let mut templates = Vec::new();

    if !baseDir.exists() {
        return templates;
    }

    let entries: Vec<_> = fs::read_dir(baseDir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().is_dir() &&
            !e.file_name().to_string_lossy().starts_with('.')
        })
        .collect();

    for entry in entries {
        let templateDir = entry.path();
        let templateFile = templateDir.join("template.md");
        let assetsDir = templateDir.join("assets");
        let slug = templateDir.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if templateFile.exists() {
            if let Ok(content) = fs::read_to_string(&templateFile) {
                if let Some((fm, body)) = parseFrontmatter::<TemplateFrontmatter>(&content) {
                    templates.push(Template {
                        slug,
                        path: templateDir,
                        templatePath: templateFile,
                        assetsPath: assetsDir,
                        templateType,
                        frontmatter: fm,
                        content: body,
                    });
                }
            }
        }
    }

    // Sort by order, then by name
    templates.sort_by(|a, b| {
        a.frontmatter.order.cmp(&b.frontmatter.order)
            .then_with(|| a.frontmatter.name.cmp(&b.frontmatter.name))
    });

    templates
}

#[tauri::command]
pub fn getTemplates(_storage: State<'_, StorageState>, templateType: String) -> Vec<TemplateInfo> {
    println!("[getTemplates] Called with type: {}", templateType);

    let tType = match TemplateType::fromStr(&templateType) {
        Some(t) => t,
        None => {
            println!("[getTemplates] Invalid template type");
            return Vec::new();
        }
    };

    let templatesDir = templatesDir(tType);
    println!("[getTemplates] Scanning: {:?}", templatesDir);

    let templates = scanTemplates(&templatesDir, tType);
    println!("[getTemplates] Found {} templates", templates.len());

    templates.iter().map(TemplateInfo::from).collect()
}

#[tauri::command]
pub fn getTemplateContent(_storage: State<'_, StorageState>, templateType: String, id: String) -> Result<String, String> {
    println!("[getTemplateContent] Called with type: {}, id: {}", templateType, id);

    let tType = TemplateType::fromStr(&templateType).ok_or("Invalid template type")?;
    let templatesDir = templatesDir(tType);
    let templates = scanTemplates(&templatesDir, tType);

    templates.iter()
        .find(|t| t.frontmatter.id == id)
        .map(|t| t.content.clone())
        .ok_or_else(|| "Template not found".to_string())
}

#[tauri::command]
pub fn initializeDefaultTemplates(_storage: State<'_, StorageState>) -> Result<(), String> {
    println!("[initializeDefaultTemplates] Creating default templates...");

    // Create note templates
    let noteTemplatesDir = templatesDir(TemplateType::Note);
    if !noteTemplatesDir.exists() || fs::read_dir(&noteTemplatesDir).map(|mut d| d.next().is_none()).unwrap_or(true) {
        createDefaultNoteTemplates(&noteTemplatesDir)?;
    }

    // Create task templates
    let taskTemplatesDir = templatesDir(TemplateType::Task);
    if !taskTemplatesDir.exists() || fs::read_dir(&taskTemplatesDir).map(|mut d| d.next().is_none()).unwrap_or(true) {
        createDefaultTaskTemplates(&taskTemplatesDir)?;
    }

    println!("[initializeDefaultTemplates] SUCCESS");
    Ok(())
}

fn createTemplate(baseDir: &PathBuf, slug: &str, fm: TemplateFrontmatter, content: &str) -> Result<(), String> {
    let templateDir = baseDir.join(slug);
    let templateFile = templateDir.join("template.md");
    let assetsDir = templateDir.join("assets");

    fs::create_dir_all(&templateDir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&assetsDir).map_err(|e| e.to_string())?;

    let mdContent = toMarkdown(&fm, content)?;
    fs::write(&templateFile, mdContent).map_err(|e| e.to_string())?;

    println!("[createTemplate] Created: {}", slug);
    Ok(())
}

fn createDefaultNoteTemplates(baseDir: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(baseDir).map_err(|e| e.to_string())?;

    // 1. Blank Note
    createTemplate(baseDir, "blank", TemplateFrontmatter {
        id: newId(),
        name: "Blank Note".to_string(),
        description: "Start with a clean slate".to_string(),
        category: "basic".to_string(),
        icon: "FileText".to_string(),
        color: "#B5AFA6".to_string(),
        order: 1,
    }, "")?;

    // 2. Meeting Notes
    createTemplate(baseDir, "meeting-notes", TemplateFrontmatter {
        id: newId(),
        name: "Meeting Notes".to_string(),
        description: "Capture meeting discussions and action items".to_string(),
        category: "productivity".to_string(),
        icon: "Users".to_string(),
        color: "#5B8DEF".to_string(),
        order: 10,
    }, r#"## Meeting Details

**Date:**
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

---

## Next Steps

- [ ]
- [ ]

---

## Next Meeting

**Date:**
**Topics to cover:**
"#)?;

    // 3. Daily Journal
    createTemplate(baseDir, "daily-journal", TemplateFrontmatter {
        id: newId(),
        name: "Daily Journal".to_string(),
        description: "Reflect on your day with gratitude and goals".to_string(),
        category: "productivity".to_string(),
        icon: "Sun".to_string(),
        color: "#D4A72C".to_string(),
        order: 11,
    }, r#"## Daily Journal

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

"#)?;

    // 4. Weekly Review
    createTemplate(baseDir, "weekly-review", TemplateFrontmatter {
        id: newId(),
        name: "Weekly Review".to_string(),
        description: "Review your week and plan ahead".to_string(),
        category: "productivity".to_string(),
        icon: "Calendar".to_string(),
        color: "#6B9F78".to_string(),
        order: 12,
    }, r#"## Weekly Review

**Week of:**

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

---

### Notes & Ideas


"#)?;

    // 5. Project Plan
    createTemplate(baseDir, "project-plan", TemplateFrontmatter {
        id: newId(),
        name: "Project Plan".to_string(),
        description: "Plan and track project milestones".to_string(),
        category: "planning".to_string(),
        icon: "Target".to_string(),
        color: "#DA7756".to_string(),
        order: 20,
    }, r#"## Project Overview

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

```mermaid
gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
    Planning           :a1, 2024-01-01, 7d
    Research           :a2, after a1, 5d
    section Phase 2
    Development        :a3, after a2, 14d
    Testing            :a4, after a3, 7d
```

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


"#)?;

    // 6. Decision Document
    createTemplate(baseDir, "decision-document", TemplateFrontmatter {
        id: newId(),
        name: "Decision Document".to_string(),
        description: "Analyze options and document decisions".to_string(),
        category: "planning".to_string(),
        icon: "GitBranch".to_string(),
        color: "#9B7ED9".to_string(),
        order: 21,
    }, r#"## Decision Document

**Decision:**
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

---

#### Option 2:

**Pros:**
-

**Cons:**
-

---

### Decision Matrix

| Criteria | Weight | Option 1 | Option 2 |
|----------|--------|----------|----------|
| Cost     | 30%    |          |          |
| Time     | 25%    |          |          |
| Quality  | 25%    |          |          |
| Risk     | 20%    |          |          |

---

### Recommendation



### Final Decision



### Next Steps

1.
2.
3.

"#)?;

    // 7. Feature Spec
    createTemplate(baseDir, "feature-spec", TemplateFrontmatter {
        id: newId(),
        name: "Feature Specification".to_string(),
        description: "Document feature requirements and design".to_string(),
        category: "documentation".to_string(),
        icon: "Layers".to_string(),
        color: "#D47B9E".to_string(),
        order: 30,
    }, r#"## Feature Specification

**Feature Name:**
**Author:**
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

#### Non-Functional Requirements

- [ ] Performance:
- [ ] Security:

---

### User Flow

```mermaid
flowchart TD
    A[User Action] --> B{Decision}
    B -->|Yes| C[Success State]
    B -->|No| D[Error State]
    C --> E[End]
    D --> E
```

---

### Acceptance Criteria

1. Given... When... Then...
2.

### Open Questions

- [ ]

"#)?;

    // 8. Bug Report
    createTemplate(baseDir, "bug-report", TemplateFrontmatter {
        id: newId(),
        name: "Bug Report".to_string(),
        description: "Document and track bugs systematically".to_string(),
        category: "documentation".to_string(),
        icon: "Bug".to_string(),
        color: "#D66565".to_string(),
        order: 31,
    }, r#"## Bug Report

**Title:**
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

### Expected Behavior



### Actual Behavior



---

### Screenshots / Logs

*Attach relevant screenshots or error logs*



---

### Possible Solution

*If you have ideas on how to fix it*



"#)?;

    // 9. Book Notes
    createTemplate(baseDir, "book-notes", TemplateFrontmatter {
        id: newId(),
        name: "Book Notes".to_string(),
        description: "Capture insights from books you read".to_string(),
        category: "learning".to_string(),
        icon: "BookOpen".to_string(),
        color: "#DA7756".to_string(),
        order: 40,
    }, r#"## Book Notes

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



---

### Favorite Quotes

>

---

### How This Applies to My Life



### Action Items

- [ ]
- [ ]

"#)?;

    // 10. Learning Notes
    createTemplate(baseDir, "learning-notes", TemplateFrontmatter {
        id: newId(),
        name: "Learning Notes".to_string(),
        description: "Structure your learning on any topic".to_string(),
        category: "learning".to_string(),
        icon: "GraduationCap".to_string(),
        color: "#5B8DEF".to_string(),
        order: 41,
    }, r#"## Learning Notes

**Topic:**
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



---

### Concept Map

```mermaid
mindmap
  root((Topic))
    Concept 1
      Detail A
      Detail B
    Concept 2
      Detail C
```

---

### Practice / Exercises

- [ ]

### Questions to Explore

- [ ]

### Review Schedule

- [ ] Review in 1 day
- [ ] Review in 1 week
- [ ] Review in 1 month

"#)?;

    // 11. Interview Notes
    createTemplate(baseDir, "interview-notes", TemplateFrontmatter {
        id: newId(),
        name: "Interview Notes".to_string(),
        description: "Conduct and document interviews".to_string(),
        category: "productivity".to_string(),
        icon: "MessageSquare".to_string(),
        color: "#4BA3A3".to_string(),
        order: 13,
    }, r#"## Interview Notes

**Candidate/Interviewee:**
**Position/Purpose:**
**Interviewer:**

---

### Key Questions to Ask

1.
2.
3.

---

### Interview Notes

#### Background & Experience



#### Assessment

| Area | Rating (1-5) | Notes |
|------|--------------|-------|
|      |              |       |

---

### Overall Assessment

**Strengths:**
-

**Areas for Development:**
-

**Recommendation:** Strong Yes / Yes / Maybe / No

### Next Steps

- [ ]

"#)?;

    // 12. Sprint Retrospective
    createTemplate(baseDir, "sprint-retro", TemplateFrontmatter {
        id: newId(),
        name: "Sprint Retrospective".to_string(),
        description: "Agile team retrospective template".to_string(),
        category: "planning".to_string(),
        icon: "RefreshCw".to_string(),
        color: "#4BA3A3".to_string(),
        order: 22,
    }, r#"## Sprint Retrospective

**Sprint:**
**Team:**

---

### What Went Well

-
-

### What Could Be Improved

-
-

### Action Items

| Action | Owner | Priority |
|--------|-------|----------|
|        |       |          |

---

### Team Health

```mermaid
pie title Team Satisfaction
    "Happy" : 3
    "Neutral" : 1
    "Needs Improvement" : 1
```

### Key Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Velocity |      |        |
| Stories Completed | |    |

---

### Kudos & Recognition



"#)?;

    Ok(())
}

fn createDefaultTaskTemplates(baseDir: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(baseDir).map_err(|e| e.to_string())?;

    // 1. Blank Task
    createTemplate(baseDir, "blank", TemplateFrontmatter {
        id: newId(),
        name: "Blank Task".to_string(),
        description: "Start with a clean task".to_string(),
        category: "basic".to_string(),
        icon: "CheckSquare".to_string(),
        color: "#B5AFA6".to_string(),
        order: 1,
    }, "")?;

    // 2. Feature Development
    createTemplate(baseDir, "feature-development", TemplateFrontmatter {
        id: newId(),
        name: "Feature Development".to_string(),
        description: "Structured task for building features".to_string(),
        category: "development".to_string(),
        icon: "Code".to_string(),
        color: "#5B8DEF".to_string(),
        order: 10,
    }, r#"## Overview



## Requirements

- [ ]
- [ ]

## Technical Approach



## Checklist

- [ ] Design review
- [ ] Implementation
- [ ] Unit tests
- [ ] Integration tests
- [ ] Documentation
- [ ] Code review
- [ ] QA testing

## Notes


"#)?;

    // 3. Bug Fix
    createTemplate(baseDir, "bug-fix", TemplateFrontmatter {
        id: newId(),
        name: "Bug Fix".to_string(),
        description: "Structured task for fixing bugs".to_string(),
        category: "development".to_string(),
        icon: "Bug".to_string(),
        color: "#D66565".to_string(),
        order: 11,
    }, r#"## Bug Description



## Steps to Reproduce

1.
2.

## Expected vs Actual

**Expected:**

**Actual:**

## Root Cause Analysis



## Fix Approach



## Checklist

- [ ] Reproduce the bug
- [ ] Identify root cause
- [ ] Implement fix
- [ ] Add regression test
- [ ] Verify fix
- [ ] Code review

"#)?;

    // 4. Research Task
    createTemplate(baseDir, "research", TemplateFrontmatter {
        id: newId(),
        name: "Research Task".to_string(),
        description: "Investigate and document findings".to_string(),
        category: "planning".to_string(),
        icon: "Search".to_string(),
        color: "#9B7ED9".to_string(),
        order: 20,
    }, r#"## Research Goal



## Questions to Answer

1.
2.
3.

## Sources to Check

- [ ]
- [ ]

## Findings



## Recommendations



## Next Steps

- [ ]

"#)?;

    // 5. Code Review
    createTemplate(baseDir, "code-review", TemplateFrontmatter {
        id: newId(),
        name: "Code Review".to_string(),
        description: "Checklist for reviewing code".to_string(),
        category: "development".to_string(),
        icon: "GitPullRequest".to_string(),
        color: "#6B9F78".to_string(),
        order: 12,
    }, r#"## Code Review

**PR/MR Link:**
**Author:**

## Review Checklist

### Functionality
- [ ] Code does what it's supposed to do
- [ ] Edge cases are handled
- [ ] Error handling is appropriate

### Code Quality
- [ ] Code is readable and well-organized
- [ ] No unnecessary complexity
- [ ] Follows project conventions

### Testing
- [ ] Adequate test coverage
- [ ] Tests are meaningful

### Security
- [ ] No security vulnerabilities
- [ ] Sensitive data handled properly

## Comments & Suggestions



## Verdict

- [ ] Approved
- [ ] Approved with suggestions
- [ ] Changes requested

"#)?;

    // 6. Deployment Task
    createTemplate(baseDir, "deployment", TemplateFrontmatter {
        id: newId(),
        name: "Deployment".to_string(),
        description: "Checklist for deployments".to_string(),
        category: "operations".to_string(),
        icon: "Rocket".to_string(),
        color: "#DA7756".to_string(),
        order: 30,
    }, r#"## Deployment

**Version:**
**Environment:**
**Date:**

## Pre-Deployment

- [ ] All tests passing
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Stakeholders notified
- [ ] Rollback plan ready

## Deployment Steps

1.
2.
3.

## Post-Deployment

- [ ] Smoke tests passed
- [ ] Monitoring checked
- [ ] Stakeholders notified

## Notes


"#)?;

    // 7. Meeting Prep
    createTemplate(baseDir, "meeting-prep", TemplateFrontmatter {
        id: newId(),
        name: "Meeting Preparation".to_string(),
        description: "Prepare for an upcoming meeting".to_string(),
        category: "productivity".to_string(),
        icon: "Users".to_string(),
        color: "#4BA3A3".to_string(),
        order: 40,
    }, r#"## Meeting Preparation

**Meeting:**
**Date/Time:**
**Attendees:**

## Objectives

1.
2.

## Topics to Discuss

- [ ]
- [ ]

## Questions to Ask

1.
2.

## Materials to Prepare

- [ ]
- [ ]

## Notes


"#)?;

    // 8. Documentation Task
    createTemplate(baseDir, "documentation", TemplateFrontmatter {
        id: newId(),
        name: "Documentation".to_string(),
        description: "Write or update documentation".to_string(),
        category: "documentation".to_string(),
        icon: "FileText".to_string(),
        color: "#D47B9E".to_string(),
        order: 50,
    }, r#"## Documentation Task

**Document:**
**Type:** New / Update

## Scope

*What needs to be documented?*



## Outline

1.
2.
3.

## Checklist

- [ ] Draft content
- [ ] Add examples
- [ ] Review for accuracy
- [ ] Review for clarity
- [ ] Update table of contents
- [ ] Publish

## Notes


"#)?;

    // 9. Refactoring
    createTemplate(baseDir, "refactoring", TemplateFrontmatter {
        id: newId(),
        name: "Refactoring".to_string(),
        description: "Improve code structure and quality".to_string(),
        category: "development".to_string(),
        icon: "Wrench".to_string(),
        color: "#D4A72C".to_string(),
        order: 13,
    }, r#"## Refactoring

**Area:**
**Reason:**

## Current State



## Desired State



## Approach

1.
2.
3.

## Checklist

- [ ] Create tests for current behavior
- [ ] Make incremental changes
- [ ] Verify tests still pass
- [ ] Code review
- [ ] Update documentation

## Risks

-

"#)?;

    // 10. Learning Task
    createTemplate(baseDir, "learning", TemplateFrontmatter {
        id: newId(),
        name: "Learning Task".to_string(),
        description: "Learn a new skill or technology".to_string(),
        category: "learning".to_string(),
        icon: "GraduationCap".to_string(),
        color: "#5B8DEF".to_string(),
        order: 60,
    }, r#"## Learning Task

**Topic:**
**Goal:**

## Resources

- [ ]
- [ ]

## Learning Plan

1.
2.
3.

## Key Concepts Learned



## Practice Project



## Questions

- [ ]

"#)?;

    // 11. Design Task
    createTemplate(baseDir, "design", TemplateFrontmatter {
        id: newId(),
        name: "Design Task".to_string(),
        description: "Design a feature or system".to_string(),
        category: "planning".to_string(),
        icon: "PenTool".to_string(),
        color: "#9B7ED9".to_string(),
        order: 21,
    }, r#"## Design Task

**Feature:**
**Designer:**

## Requirements



## User Flow

```mermaid
flowchart LR
    A[Start] --> B[Step 1]
    B --> C[Step 2]
    C --> D[End]
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
|          |           |

## Checklist

- [ ] Requirements gathered
- [ ] User flow defined
- [ ] Wireframes/mockups
- [ ] Design review
- [ ] Handoff to development

## Notes


"#)?;

    // 12. Quick Task
    createTemplate(baseDir, "quick-task", TemplateFrontmatter {
        id: newId(),
        name: "Quick Task".to_string(),
        description: "Simple task with checklist".to_string(),
        category: "basic".to_string(),
        icon: "Zap".to_string(),
        color: "#6B9F78".to_string(),
        order: 2,
    }, r#"## Task



## Checklist

- [ ]
- [ ]
- [ ]

## Notes


"#)?;

    Ok(())
}
