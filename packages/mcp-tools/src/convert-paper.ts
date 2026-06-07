/**
 * convert_paper MCP Tool
 *
 * Convert paper from Markdown to LaTeX/Word/PDF.
 */

import { execFileSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// Tool Definition
// ============================================================================

export const CONVERT_PAPER_TOOL = {
  name: 'convert_paper',
  description: 'Convert paper from Markdown to LaTeX, Word, or PDF format',
  inputSchema: {
    type: 'object' as const,
    properties: {
      inputPath: {
        type: 'string',
        description: 'Path to input Markdown file',
      },
      outputPath: {
        type: 'string',
        description: 'Path to output file',
      },
      format: {
        type: 'string',
        enum: ['latex', 'docx', 'pdf'],
        description: 'Output format',
      },
      template: {
        type: 'string',
        description: 'Path to template file (optional)',
      },
      bibliography: {
        type: 'string',
        description: 'Path to bibliography file (optional)',
      },
    },
    required: ['inputPath', 'format'],
  },
};

// ============================================================================
// Types
// ============================================================================

interface ConversionResult {
  success: boolean;
  outputPath: string;
  format: string;
  message: string;
  error?: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class ConvertPaperTool {
  /**
   * Convert Markdown to LaTeX
   */
  async toLatex(params: {
    inputPath: string;
    outputPath?: string;
    template?: string;
    bibliography?: string;
  }): Promise<ConversionResult> {
    const inputPath = params.inputPath;
    const outputPath = params.outputPath || inputPath.replace(/\.md$/, '.tex');

    if (!existsSync(inputPath)) {
      return {
        success: false,
        outputPath,
        format: 'latex',
        message: 'Input file not found',
        error: `File not found: ${inputPath}`,
      };
    }

    try {
      // Read markdown content
      const markdown = readFileSync(inputPath, 'utf-8');

      // Convert to LaTeX
      const latex = this.markdownToLatex(markdown, {
        template: params.template,
        bibliography: params.bibliography,
      });

      // Write output
      const outputDir = dirname(outputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      writeFileSync(outputPath, latex);

      return {
        success: true,
        outputPath,
        format: 'latex',
        message: 'Successfully converted to LaTeX',
      };
    } catch (error) {
      return {
        success: false,
        outputPath,
        format: 'latex',
        message: 'Conversion failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert Markdown to Word (DOCX)
   */
  async toDocx(params: {
    inputPath: string;
    outputPath?: string;
    template?: string;
  }): Promise<ConversionResult> {
    const inputPath = params.inputPath;
    const outputPath = params.outputPath || inputPath.replace(/\.md$/, '.docx');

    if (!existsSync(inputPath)) {
      return {
        success: false,
        outputPath,
        format: 'docx',
        message: 'Input file not found',
        error: `File not found: ${inputPath}`,
      };
    }

    try {
      // Use pandoc for conversion (execFileSync avoids shell interpretation)
      const args = [inputPath, '-o', outputPath];
      if (params.template) {
        args.push(`--template=${params.template}`);
      }
      execFileSync('pandoc', args, { stdio: 'pipe' });

      return {
        success: true,
        outputPath,
        format: 'docx',
        message: 'Successfully converted to DOCX',
      };
    } catch (error) {
      return {
        success: false,
        outputPath,
        format: 'docx',
        message: 'Conversion failed (pandoc required)',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert Markdown to PDF
   */
  async toPdf(params: {
    inputPath: string;
    outputPath?: string;
    template?: string;
    bibliography?: string;
  }): Promise<ConversionResult> {
    const inputPath = params.inputPath;
    const outputPath = params.outputPath || inputPath.replace(/\.md$/, '.pdf');

    if (!existsSync(inputPath)) {
      return {
        success: false,
        outputPath,
        format: 'pdf',
        message: 'Input file not found',
        error: `File not found: ${inputPath}`,
      };
    }

    try {
      // Use pandoc with LaTeX for PDF generation (execFileSync avoids shell interpretation)
      const args = [
        inputPath,
        '-o', outputPath,
        '--pdf-engine=xelatex',
        '-V', 'geometry:margin=1in',
      ];

      if (params.template) {
        args.push(`--template=${params.template}`);
      }

      if (params.bibliography) {
        args.push(`--bibliography=${params.bibliography}`);
        args.push('--citeproc');
      }

      execFileSync('pandoc', args, { stdio: 'pipe' });

      return {
        success: true,
        outputPath,
        format: 'pdf',
        message: 'Successfully converted to PDF',
      };
    } catch (error) {
      return {
        success: false,
        outputPath,
        format: 'pdf',
        message: 'Conversion failed (pandoc and xelatex required)',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Simple Markdown to LaTeX converter
   */
  private markdownToLatex(markdown: string, options: {
    template?: string;
    bibliography?: string;
  }): string {
    const lines = markdown.split('\n');
    const latexLines: string[] = [];
    let inCodeBlock = false;
    let inItemize = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code blocks
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          latexLines.push('\\end{verbatim}');
          inCodeBlock = false;
        } else {
          latexLines.push('\\begin{verbatim}');
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        latexLines.push(line);
        continue;
      }

      // Headers
      if (line.startsWith('# ')) {
        latexLines.push(`\\section{${this.escapeLatex(line.substring(2))}}`);
        continue;
      }
      if (line.startsWith('## ')) {
        latexLines.push(`\\subsection{${this.escapeLatex(line.substring(3))}}`);
        continue;
      }
      if (line.startsWith('### ')) {
        latexLines.push(`\\subsubsection{${this.escapeLatex(line.substring(4))}}`);
        continue;
      }

      // Bold and italic
      line = line.replace(/\*\*(.*?)\*\*/g, '\\textbf{$1}');
      line = line.replace(/\*(.*?)\*/g, '\\textit{$1}');

      // Citations [1] -> \cite{1}
      line = line.replace(/\[(\d+(?:,\d+)*)\]/g, (_, ids) => {
        return ids.split(',').map((id: string) => `\\cite{${id.trim()}}`).join(', ');
      });

      // Lists
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!inItemize) {
          latexLines.push('\\begin{itemize}');
          inItemize = true;
        }
        latexLines.push(`  \\item ${this.escapeLatex(line.substring(2))}`);
        continue;
      } else if (inItemize) {
        latexLines.push('\\end{itemize}');
        inItemize = false;
      }

      // Empty line
      if (line.trim() === '') {
        latexLines.push('');
        continue;
      }

      // Regular paragraph
      latexLines.push(this.escapeLatex(line));
    }

    // Close any open environments
    if (inCodeBlock) {
      latexLines.push('\\end{verbatim}');
    }
    if (inItemize) {
      latexLines.push('\\end{itemize}');
    }

    // Build document
    const preamble = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{natbib}

\\title{Research Paper}
\\author{PiX-paper}
\\date{\\today}

\\begin{document}
\\maketitle

`;

    const ending = `
\\end{document}`;

    let bibliography = '';
    if (options.bibliography && existsSync(options.bibliography)) {
      bibliography = `\n\\bibliographystyle{plain}
\\bibliography{${options.bibliography.replace(/\.bib$/, '')}}\n`;
    }

    return preamble + latexLines.join('\n') + bibliography + ending;
  }

  /**
   * Escape special LaTeX characters
   */
  private escapeLatex(text: string): string {
    const specialChars: Record<string, string> = {
      '&': '\\&',
      '%': '\\%',
      '$': '\\$',
      '#': '\\#',
      '_': '\\_',
      '{': '\\{',
      '}': '\\}',
      '~': '\\textasciitilde{}',
      '^': '\\textasciicircum{}',
    };

    return text.replace(/[&%$#_{}~^]/g, char => specialChars[char] || char);
  }
}

// ============================================================================
// MCP Handler
// ============================================================================

export async function handleConvertPaper(params: Record<string, unknown>): Promise<unknown> {
  const tool = new ConvertPaperTool();

  const inputPath = params.inputPath as string;
  const outputPath = params.outputPath as string;
  const format = params.format as string;
  const template = params.template as string;
  const bibliography = params.bibliography as string;

  let result: ConversionResult;

  switch (format) {
    case 'latex':
      result = await tool.toLatex({ inputPath, outputPath, template, bibliography });
      break;
    case 'docx':
      result = await tool.toDocx({ inputPath, outputPath, template });
      break;
    case 'pdf':
      result = await tool.toPdf({ inputPath, outputPath, template, bibliography });
      break;
    default:
      result = {
        success: false,
        outputPath: outputPath || '',
        format,
        message: `Unsupported format: ${format}`,
      };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
