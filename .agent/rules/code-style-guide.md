---
trigger: always_on
---

# TwitCanva Code Style Guide

## Core Principles

1. **Modularity**: Break large files into smaller, focused modules
2. **Clarity**: Use clear naming and comprehensive comments
3. **Maintainability**: Organize code for easy iteration and debugging
4. **Consistency**: Follow established patterns throughout the codebase

---

## File Organization

### Maximum File Size

- **Components**: 300 lines max
- **Utilities/Services**: 200 lines max
- **Main App**: 500 lines max

**When to split**: File exceeds limits, handles multiple responsibilities, or becomes hard to navigate.

### Directory Structure

Organize by **feature** and **type**:

**By Type** (current - good for small projects):
- `components/` - UI components
- `hooks/` - Custom React hooks  
- `services/` - API integrations
- `utils/` - Pure utility functions
- `types/` - TypeScript definitions

**By Feature** (better as project grows):
- `features/canvas/` - All canvas code (components, hooks, utils)
- `features/nodes/` - All node code
- `shared/` - Shared utilities

**Guidelines**: Group related files, max 3 levels deep, use index files for clean imports.

---

## Code Annotation

### File Headers

```typescript
/**
 * CanvasNode.tsx
 * 
 * Renders canvas nodes with drag, resize, and generation capabilities.
 * Handles pointer events, context menus, and connector actions.
 */
```

### Section Comments

```typescript
// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const [nodes, setNodes] = useState<NodeData[]>([]);

// ============================================================================
// EVENT HANDLERS
// ============================================================================

const handleClick = () => { /* ... */ };
```

### Function Documentation

```typescript
/**
 * Extracts the last frame from a video as base64 image
 * 
 * @param videoUrl - Video URL to extract from
 * @returns Promise<string> - Base64 PNG image
 */
const extractVideoLastFrame = (videoUrl: string): Promise<string> => {
  // Implementation
};
```

### Inline Comments

Use for non-obvious logic, workarounds, and edge cases:

```typescript
// Convert screen coords to canvas space accounting for zoom/pan
const canvasX = (mouseX - viewport.x) / viewport.zoom;

// WORKAROUND: Some browsers don't seek until data loaded
if (video.duration) video.currentTime = video.duration;
```

---

## Component Structure

```typescript
/**
 * ComponentName.tsx
 * Brief description
 */

import React, { useState, useEffect } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface ComponentProps {
  data: SomeType;
  onAction: (id: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ComponentName: React.FC<ComponentProps> = ({ data, onAction }) => {
  
  // --- State ---
  const [isActive, setIsActive] = useState(false);
  
  // --- Effects ---
  useEffect(() => {
    // Effect logic
  }, []);
  
  // --- Event Handlers ---
  const handleClick = () => {
    // Handler logic
  };
  
  // --- Render ---
  return (
    <div className="wrapper">
      {/* Content */}
    </div>
  );
};
```

---

## Naming Conventions

### Files
- **Components**: PascalCase (`CanvasNode.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Hooks**: camelCase with `use` (`useViewport.ts`)
- **Types**: PascalCase (`NodeData.ts`)

### Variables & Functions

```typescript
// Booleans: is/has/should prefix
const isLoading = true;
const hasError = false;

// Event handlers: handle prefix
const handleClick = () => {};
const handleSubmit = () => {};

// Render functions: render prefix
const renderHeader = () => {};
```

---

## TypeScript

### Type Definitions

```typescript
// types/node.ts
export interface NodeData {
  id: string;
  type: NodeType;
  x: number;
  y: number;
}

export enum NodeType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video'
}

export type NodeStatus = 'idle' | 'loading' | 'success' | 'error';
```

### Avoid `any`

```typescript
// ❌ Bad
const handleData = (data: any) => { };

// ✅ Good
interface ApiResponse {
  data: NodeData[];
  status: number;
}
const handleData = (response: ApiResponse) => { };
```

---

## React Patterns

### Custom Hooks

Extract complex logic:

```typescript
/**
 * useCanvasNavigation.ts
 * Manages canvas panning, zooming, and viewport
 */
export const useCanvasNavigation = () => {
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  
  const handleWheel = (e: WheelEvent) => { /* zoom logic */ };
  const handlePan = (dx: number, dy: number) => { /* pan logic */ };
  
  return { viewport, handleWheel, handlePan };
};
```

### Component Composition

```typescript
// ❌ Bad: One large component
const Dashboard = () => {
  // 500+ lines
};

// ✅ Good: Composed
const Dashboard = () => (
  <>
    <DashboardHeader />
    <DashboardContent />
    <DashboardFooter />
  </>
);
```

---

## State Management

```typescript
// Group related state
const [nodes, setNodes] = useState<NodeData[]>([]);
const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

// Use objects for complex state
const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

// Use refs for non-render values
const dragNodeRef = useRef<{ id: string } | null>(null);

// Functional updates when depending on previous state
setNodes(prev => prev.map(n => 
  n.id === nodeId ? { ...n, status: 'loading' } : n
));
```

---

## Error Handling

```typescript
const handleGenerate = async (id: string) => {
  const node = nodes.find(n => n.id === id);
  if (!node?.prompt) return;
  
  handleUpdateNode(id, { status: 'loading' });
  
  try {
    const result = await generateImage({
      prompt: node.prompt,
      aspectRatio: node.aspectRatio
    });
    
    handleUpdateNode(id, { status: 'success', resultUrl: result });
    
  } catch (error: any) {
    const msg = error.toString().toLowerCase();
    
    if (msg.includes('permission_denied')) {
      handleUpdateNode(id, {
        status: 'error',
        errorMessage: 'Permission denied. Check API Key.'
      });
    } else {
      handleUpdateNode(id, {
        status: 'error',
        errorMessage: error.message || 'Generation failed'
      });
    }
    
    console.error('Generation failed:', error);
  }
};
```

---

## Performance

### Memoization

```typescript
// Memoize expensive calculations
const expensiveValue = useMemo(() => {
  return nodes.reduce((acc, node) => {
    // Complex calculation
    return acc;
  }, initialValue);
}, [nodes]);

// Memoize callbacks
const handleUpdate = useCallback((id: string, updates: Partial<NodeData>) => {
  setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
}, []);
```

### Avoid Inline Functions

```typescript
// ❌ Bad: New function every render
<button onClick={() => handleClick(id)}>Click</button>

// ✅ Good: Memoized
const handleButtonClick = useCallback(() => handleClick(id), [id]);
<button onClick={handleButtonClick}>Click</button>
```

---

## Styling

### Tailwind Class Order

Layout → Spacing → Sizing → Typography → Colors → Effects

```typescript
<div className="
  flex items-center justify-between
  p-4 gap-3
  w-full h-12
  text-sm font-medium
  bg-neutral-900 text-white border border-neutral-700
  rounded-lg shadow-lg
  hover:bg-neutral-800 transition-colors
">
```

### Extract Complex Styles

```typescript
// ❌ Bad: Inline complex styles
<div style={{
  transform: `translate(${x}px, ${y}px) scale(${zoom})`,
  transformOrigin: '0 0'
}}>

// ✅ Good: Extract
const canvasStyle = {
  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
  transformOrigin: '0 0'
};
<div style={canvasStyle}>
```

---

## Git Commits

### Format

```
<type>(<scope>): <subject>

<body>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation
- `style`: Formatting
- `chore`: Maintenance

### Examples

```
feat(canvas): Add drag-to-connect functionality

- Implement pointer handlers for connection dragging
- Add visual feedback with dashed line
- Support left and right connectors

Closes #123
```

---

## Code Review Checklist

Before submitting:

- [ ] Functions have appropriate comments
- [ ] Complex logic explained with inline comments
- [ ] No file exceeds line limits
- [ ] TypeScript types properly defined (no `any`)
- [ ] Error handling implemented
- [ ] Console logs removed
- [ ] Performance optimizations applied
- [ ] Naming conventions followed
- [ ] Git commit messages descriptive

---

## Key Takeaways

1. **Keep files small** - Split when exceeding line limits
2. **Comment generously** - Explain the "why", not just the "what"
3. **Type everything** - Avoid `any`, use proper TypeScript
4. **Extract logic** - Use custom hooks and utility functions
5. **Handle errors** - Always catch and provide meaningful messages
6. **Optimize wisely** - Use memoization for expensive operations
7. **Stay consistent** - Follow established patterns

**Remember**: This is a living document. Update as the project evolves.
