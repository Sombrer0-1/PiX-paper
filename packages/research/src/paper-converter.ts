/**
 * Paper Converter
 *
 * Converts structured paper data between formats:
 * - Markdown → LaTeX
 * - Markdown → HTML
 * - JSON manuscript → Markdown
 *
 * For PDF generation, delegates to pandoc if available.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Types
// ============================================================================

export interface ConverterSection {
  id: string;
  title: string;
  content: string;
  subsections?: ConverterSection[];
}

export interface ConverterManuscript {
  title: string;
  authors: string[];
  abstract: string;
  sections: ConverterSection[];
  references: ConverterReference[];
  figures: ConverterFigure[];
  tables: ConverterTable[];
}

export interface ConverterReference {
  id: string;
  key: string;
  type: 'article' | 'inproceedings' | 'book' | 'misc';
  title: string;
  authors: string[];
  year: number;
  venue?: string;
  doi?: string;
  url?: string;
  pages?: string;
}

export interface ConverterFigure {
  id: string;
  path: string;
  caption: string;
  label: string;
}

export interface ConverterTable {
  id: string;
  content: string;
  caption: string;
  label: string;
}

export type OutputFormat = 'markdown' | 'latex' | 'html' | 'pdf';

export interface ConversionResult {
  success: boolean;
  outputPath?: string;
  content?: string;
  error?: string;
}

// ============================================================================
// Paper Converter
// ============================================================================

export class PaperConverter {
  /**
   * Convert a manuscript to Markdown.
   */
  toMarkdown(manuscript: ConverterManuscript): string {
    const lines: string[] = [];

    // Title
    lines.push(`# ${manuscript.title}\n`);

    // Authors
    if (manuscript.authors.length > 0) {
      lines.push(`**${manuscript.authors.join(', ')}**\n`);
    }

    // Abstract
    lines.push('## Abstract\n');
    lines.push(`${manuscript.abstract}\n`);

    // Sections
    for (const section of manuscript.sections) {
      lines.push(this.sectionToMarkdown(section, 2));
    }

    // Figures
    if (manuscript.figures.length > 0) {
      lines.push('\n## Figures\n');
      for (const fig of manuscript.figures) {
        lines.push(`![${fig.caption}](${fig.path})\n`);
        lines.push(`*${fig.caption}*\n`);
      }
    }

    // Tables
    if (manuscript.tables.length > 0) {
      lines.push('\n## Tables\n');
      for (const table of manuscript.tables) {
        lines.push(`**${table.caption}**\n`);
        lines.push(table.content);
        lines.push('');
      }
    }

    // References
    if (manuscript.references.length > 0) {
      lines.push('\n## References\n');
      for (let i = 0; i < manuscript.references.length; i++) {
        const ref = manuscript.references[i];
        const authors = ref.authors.join(', ');
        const venue = ref.venue ? ` In *${ref.venue}*` : '';
        const doi = ref.doi ? ` DOI: ${ref.doi}` : '';
        lines.push(`[${i + 1}] ${authors}. ${ref.title}.${venue}, ${ref.year}.${doi}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Convert a manuscript to LaTeX.
   */
  toLatex(manuscript: ConverterManuscript): string {
    const lines: string[] = [];

    lines.push('\\documentclass[10pt,twocolumn]{article}');
    lines.push('\\usepackage[utf8]{inputenc}');
    lines.push('\\usepackage{amsmath,amssymb}');
    lines.push('\\usepackage{graphicx}');
    lines.push('\\usepackage{hyperref}');
    lines.push('\\usepackage{booktabs}');
    lines.push('');
    lines.push(`\\title{${this.escapeLatex(manuscript.title)}}`);
    lines.push(`\\author{${manuscript.authors.map(a => this.escapeLatex(a)).join(' \\and ')}}`);
    lines.push('');
    lines.push('\\begin{document}');
    lines.push('');
    lines.push('\\maketitle');
    lines.push('');

    // Abstract
    lines.push('\\begin{abstract}');
    lines.push(this.escapeLatex(manuscript.abstract));
    lines.push('\\end{abstract}');
    lines.push('');

    // Sections
    for (const section of manuscript.sections) {
      lines.push(this.sectionToLatex(section, 1));
    }

    // Figures
    for (const fig of manuscript.figures) {
      lines.push('\\begin{figure}[htbp]');
      lines.push('  \\centering');
      lines.push(`  \\includegraphics[width=\\linewidth]{${fig.path}}`);
      lines.push(`  \\caption{${this.escapeLatex(fig.caption)}}`);
      lines.push(`  \\label{${fig.label}}`);
      lines.push('\\end{figure}');
      lines.push('');
    }

    // Tables
    for (const table of manuscript.tables) {
      lines.push('\\begin{table}[htbp]');
      lines.push('  \\centering');
      lines.push(`  \\caption{${this.escapeLatex(table.caption)}}`);
      lines.push(`  \\label{${table.label}}`);
      lines.push(`  ${this.markdownTableToLatex(table.content)}`);
      lines.push('\\end{table}');
      lines.push('');
    }

    // Bibliography
    lines.push('\\begin{thebibliography}{99}');
    for (let i = 0; i < manuscript.references.length; i++) {
      const ref = manuscript.references[i];
      const authors = ref.authors.join(', ');
      lines.push(`\\bibitem{${ref.key}} ${this.escapeLatex(authors)}. \\textit{${this.escapeLatex(ref.title)}}. ${ref.year}.`);
    }
    lines.push('\\end{thebibliography}');
    lines.push('');
    lines.push('\\end{document}');

    return lines.join('\n');
  }

  /**
   * Convert a manuscript to HTML.
   */
  toHtml(manuscript: ConverterManuscript): string {
    const lines: string[] = [];

    lines.push('<!DOCTYPE html>');
    lines.push('<html lang="en">');
    lines.push('<head>');
    lines.push('  <meta charset="UTF-8">');
    lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
    lines.push(`  <title>${this.escapeHtml(manuscript.title)}</title>`);
    lines.push('  <style>');
    lines.push('    body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }');
    lines.push('    h1 { text-align: center; }');
    lines.push('    .authors { text-align: center; color: #555; margin-bottom: 2em; }');
    lines.push('    .abstract { background: #f5f5f5; padding: 15px; border-left: 4px solid #333; margin: 1em 0; }');
    lines.push('    figure { text-align: center; margin: 1em 0; }');
    lines.push('    figcaption { font-style: italic; color: #555; }');
    lines.push('    table { border-collapse: collapse; width: 100%; margin: 1em 0; }');
    lines.push('    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
    lines.push('    th { background: #f5f5f5; }');
    lines.push('    .references { font-size: 0.9em; }');
    lines.push('  </style>');
    lines.push('</head>');
    lines.push('<body>');
    lines.push('');
    lines.push(`<h1>${this.escapeHtml(manuscript.title)}</h1>`);
    lines.push(`<p class="authors">${manuscript.authors.map(a => this.escapeHtml(a)).join(', ')}</p>`);
    lines.push('');
    lines.push(`<div class="abstract"><strong>Abstract:</strong> ${this.escapeHtml(manuscript.abstract)}</div>`);
    lines.push('');

    for (const section of manuscript.sections) {
      lines.push(this.sectionToHtml(section, 2));
    }

    if (manuscript.figures.length > 0) {
      for (const fig of manuscript.figures) {
        lines.push(`<figure><img src="${fig.path}" alt="${this.escapeHtml(fig.caption)}" style="max-width:100%">`);
        lines.push(`<figcaption>${this.escapeHtml(fig.caption)}</figcaption></figure>`);
      }
    }

    if (manuscript.tables.length > 0) {
      for (const table of manuscript.tables) {
        lines.push(`<p><strong>${this.escapeHtml(table.caption)}</strong></p>`);
        lines.push(this.markdownTableToHtml(table.content));
      }
    }

    if (manuscript.references.length > 0) {
      lines.push('<h2>References</h2>');
      lines.push('<ol class="references">');
      for (const ref of manuscript.references) {
        const authors = ref.authors.join(', ');
        lines.push(`  <li>${this.escapeHtml(authors)}. <em>${this.escapeHtml(ref.title)}</em>. ${ref.year}.</li>`);
      }
      lines.push('</ol>');
    }

    lines.push('</body>');
    lines.push('</html>');

    return lines.join('\n');
  }

  /**
   * Save manuscript to a file in the specified format.
   */
  save(manuscript: ConverterManuscript, format: OutputFormat, outputPath: string): ConversionResult {
    try {
      const dir = dirname(outputPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      let content: string;
      switch (format) {
        case 'markdown':
          content = this.toMarkdown(manuscript);
          break;
        case 'latex':
          content = this.toLatex(manuscript);
          break;
        case 'html':
          content = this.toHtml(manuscript);
          break;
        case 'pdf':
          // Generate LaTeX first, then try pandoc
          const latexContent = this.toLatex(manuscript);
          const texPath = outputPath.replace(/\.pdf$/, '.tex');
          writeFileSync(texPath, latexContent);
          try {
            execSync(`pandoc "${texPath}" -o "${outputPath}" --pdf-engine=xelatex`, { timeout: 60000 });
            return { success: true, outputPath };
          } catch {
            // Pandoc not available, return LaTeX path
            return { success: true, outputPath: texPath, content: latexContent };
          }
        default:
          return { success: false, error: `Unsupported format: ${format}` };
      }

      writeFileSync(outputPath, content);
      return { success: true, outputPath, content };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Parse a Markdown file into a ConverterManuscript.
   */
  parseMarkdown(content: string): ConverterManuscript {
    const lines = content.split('\n');
    let title = '';
    let authors: string[] = [];
    let abstract = '';
    const sections: ConverterSection[] = [];
    const references: ConverterReference[] = [];

    let currentSection: ConverterSection | null = null;
    let inAbstract = false;
    let inReferences = false;
    let buffer: string[] = [];

    for (const line of lines) {
      // Title
      if (line.startsWith('# ') && !title) {
        title = line.substring(2).trim();
        continue;
      }

      // Authors (bold line after title)
      if (line.startsWith('**') && line.endsWith('**') && authors.length === 0) {
        authors = line.slice(2, -2).split(',').map(a => a.trim());
        continue;
      }

      // Abstract section
      if (line.match(/^##\s*Abstract/i)) {
        inAbstract = true;
        continue;
      }

      // Section headers
      const sectionMatch = line.match(/^(#{2,3})\s+(.+)/);
      if (sectionMatch && !inAbstract) {
        const level = sectionMatch[1].length;
        const sectionTitle = sectionMatch[2].trim();

        if (sectionTitle.toLowerCase() === 'references') {
          inReferences = true;
          if (currentSection) {
            currentSection.content = buffer.join('\n').trim();
            sections.push(currentSection);
            currentSection = null;
          }
          buffer = [];
          continue;
        }

        if (currentSection) {
          currentSection.content = buffer.join('\n').trim();
          sections.push(currentSection);
        }

        currentSection = {
          id: sectionTitle.toLowerCase().replace(/\s+/g, '-'),
          title: sectionTitle,
          content: '',
        };
        buffer = [];
        inAbstract = false;
        continue;
      }

      // Content accumulation
      if (inAbstract) {
        abstract += line + '\n';
      } else if (inReferences) {
        if (line.trim()) {
          const ref = this.parseReferenceLine(line);
          if (ref) references.push(ref);
        }
      } else {
        buffer.push(line);
      }
    }

    // Flush last section
    if (currentSection) {
      currentSection.content = buffer.join('\n').trim();
      sections.push(currentSection);
    }

    return {
      title,
      authors,
      abstract: abstract.trim(),
      sections,
      references,
      figures: [],
      tables: [],
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private sectionToMarkdown(section: ConverterSection, level: number): string {
    const prefix = '#'.repeat(level);
    let result = `\n${prefix} ${section.title}\n\n${section.content}\n`;
    if (section.subsections) {
      for (const sub of section.subsections) {
        result += this.sectionToMarkdown(sub, level + 1);
      }
    }
    return result;
  }

  private sectionToLatex(section: ConverterSection, level: number): string {
    const cmd = level === 1 ? 'section' : level === 2 ? 'subsection' : 'subsubsection';
    let result = `\\${cmd}{${this.escapeLatex(section.title)}}\n\n${this.escapeLatex(section.content)}\n\n`;
    if (section.subsections) {
      for (const sub of section.subsections) {
        result += this.sectionToLatex(sub, level + 1);
      }
    }
    return result;
  }

  private sectionToHtml(section: ConverterSection, level: number): string {
    const tag = `h${level}`;
    let result = `<${tag}>${this.escapeHtml(section.title)}</${tag}>\n<p>${this.escapeHtml(section.content)}</p>\n`;
    if (section.subsections) {
      for (const sub of section.subsections) {
        result += this.sectionToHtml(sub, level + 1);
      }
    }
    return result;
  }

  private escapeLatex(text: string): string {
    return text
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/[&%$#_{}]/g, m => `\\${m}`)
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private markdownTableToLatex(table: string): string {
    const rows = table.split('\n').filter(r => r.trim() && !r.match(/^\|[-\s|]+\|$/));
    if (rows.length === 0) return '';

    const parsed = rows.map(r =>
      r.split('|').filter(c => c.trim()).map(c => c.trim())
    );

    const cols = parsed[0]?.length || 0;
    const header = parsed[0];
    const body = parsed.slice(1);

    let result = `\\begin{tabular}{${'l'.repeat(cols)}}\n`;
    result += '\\toprule\n';
    result += header.map(c => this.escapeLatex(c)).join(' & ') + ' \\\\\n';
    result += '\\midrule\n';
    for (const row of body) {
      result += row.map(c => this.escapeLatex(c)).join(' & ') + ' \\\\\n';
    }
    result += '\\bottomrule\n';
    result += '\\end{tabular}';

    return result;
  }

  private markdownTableToHtml(table: string): string {
    const rows = table.split('\n').filter(r => r.trim() && !r.match(/^\|[-\s|]+\|$/));
    if (rows.length === 0) return '';

    const parsed = rows.map(r =>
      r.split('|').filter(c => c.trim()).map(c => c.trim())
    );

    let result = '<table>\n';
    result += '<tr>' + parsed[0].map(c => `<th>${this.escapeHtml(c)}</th>`).join('') + '</tr>\n';
    for (const row of parsed.slice(1)) {
      result += '<tr>' + row.map(c => `<td>${this.escapeHtml(c)}</td>`).join('') + '</tr>\n';
    }
    result += '</table>';

    return result;
  }

  private parseReferenceLine(line: string): ConverterReference | null {
    // Match: [N] Authors. Title. Venue, Year.
    const match = line.match(/\[(\d+)\]\s+(.+?)\.\s+(.+?)\.\s+(?:In\s+\*(.+?)\*,\s+)?(\d{4})/);
    if (!match) return null;

    return {
      id: match[1],
      key: `ref${match[1]}`,
      type: 'article',
      title: match[3],
      authors: match[2].split(',').map(a => a.trim()),
      year: parseInt(match[5]),
      venue: match[4],
    };
  }
}
