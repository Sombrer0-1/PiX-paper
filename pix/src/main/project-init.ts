/**
 * Project Initialization
 *
 * Creates the standard project directory structure for a research project.
 * Manages .pp/ persistent project configuration.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface ProjectInitOptions {
  projectDir: string;
  topic: string;
  templateId?: string;
}

export interface ProjectConfig {
  name: string;
  topic: string;
  templateId: string;
  createdAt: number;
  updatedAt: number;
  description?: string;
  tags?: string[];
}

/**
 * Initialize a research project directory structure.
 */
export function initResearchProject(options: ProjectInitOptions): void {
  const { projectDir, topic, templateId = 'default' } = options;

  // Create .pp config directory
  const ppDir = join(projectDir, '.pp');
  if (!existsSync(ppDir)) {
    mkdirSync(ppDir, { recursive: true });
  }

  // Create project config
  const config: ProjectConfig = {
    name: topic,
    topic,
    templateId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  writeFileSync(join(ppDir, 'config.json'), JSON.stringify(config, null, 2));

  // Create standard directories
  const dirs = [
    'literature/papers',
    'literature/notes',
    'code/baseline',
    'code/our_method',
    'experiments/configs',
    'experiments/results',
    'experiments/figures',
    'paper/output',
  ];

  for (const dir of dirs) {
    const fullPath = join(projectDir, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  }

  // Create initial files
  const initialFiles: Record<string, string> = {
    'literature/library.json': JSON.stringify({ papers: [], tags: [] }, null, 2),
    'paper/references.json': JSON.stringify([], null, 2),
    'paper/manuscript.json': JSON.stringify({
      title: topic,
      abstract: { id: 'abstract', title: 'Abstract', paragraphs: [], status: 'draft' },
      introduction: { id: 'introduction', title: 'Introduction', paragraphs: [], status: 'draft' },
      relatedWork: { id: 'related-work', title: 'Related Work', paragraphs: [], status: 'draft' },
      method: { id: 'method', title: 'Method', paragraphs: [], status: 'draft' },
      experiments: { id: 'experiments', title: 'Experiments', paragraphs: [], status: 'draft' },
      conclusion: { id: 'conclusion', title: 'Conclusion', paragraphs: [], status: 'draft' },
      references: [],
      figures: [],
      tables: [],
    }, null, 2),
  };

  for (const [file, content] of Object.entries(initialFiles)) {
    const filePath = join(projectDir, file);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, content);
    }
  }
}

/**
 * Check if a directory is a valid research project.
 */
export function isResearchProject(projectDir: string): boolean {
  const ppDir = join(projectDir, '.pp');
  const configPath = join(ppDir, 'config.json');
  return existsSync(ppDir) && existsSync(configPath);
}

/**
 * Get project config.
 */
export function getProjectConfig(projectDir: string): ProjectConfig | null {
  const configPath = join(projectDir, '.pp', 'config.json');
  if (!existsSync(configPath)) return null;

  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as ProjectConfig;
  } catch {
    return null;
  }
}

/**
 * Update project config. Creates .pp/config.json if it doesn't exist.
 */
export function updateProjectConfig(projectDir: string, updates: Partial<ProjectConfig>): ProjectConfig {
  const existing = getProjectConfig(projectDir);
  const dirName = projectDir.split(/[/\\]/).pop() || projectDir;
  const config: ProjectConfig = {
    name: updates.name ?? existing?.name ?? dirName,
    topic: updates.topic ?? existing?.topic ?? '',
    templateId: updates.templateId ?? existing?.templateId ?? 'default',
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    description: updates.description ?? existing?.description,
    tags: updates.tags ?? existing?.tags,
  };

  const ppDir = join(projectDir, '.pp');
  if (!existsSync(ppDir)) {
    mkdirSync(ppDir, { recursive: true });
  }

  writeFileSync(join(ppDir, 'config.json'), JSON.stringify(config, null, 2));
  return config;
}

/**
 * Ensure .pp config exists for a project directory.
 * If .pp/config.json exists, returns the config.
 * If not, creates a minimal config with the directory name as project name.
 */
export function ensureProjectConfig(projectDir: string): ProjectConfig {
  const existing = getProjectConfig(projectDir);
  if (existing) return existing;

  const dirName = projectDir.split(/[/\\]/).pop() || projectDir;
  return updateProjectConfig(projectDir, {
    name: dirName,
    topic: dirName,
  });
}
