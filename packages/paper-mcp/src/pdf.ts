/**
 * PDF text + figure extraction built on pdfjs-dist (legacy Node build).
 *
 * Text extraction needs no canvas. Figure extraction pulls embedded raster
 * images from each page's operator list and encodes them to PNG via pngjs;
 * vector figures cannot be extracted this way (reported in notes).
 */

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const standardFontDataUrl = `${pathToFileURL(join(pdfjsRoot, "standard_fonts")).href}/`;
const cMapUrl = `${pathToFileURL(join(pdfjsRoot, "cmaps")).href}/`;

type PdfjsDocument = {
	numPages: number;
	getPage(n: number): Promise<PdfjsPage>;
	getMetadata(): Promise<{ info?: Record<string, unknown> }>;
	getOutline(): Promise<Array<{ title: string; items: unknown[] }> | null>;
	destroy(): Promise<void>;
};

type PdfjsPage = {
	getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
	getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
	objs: { get(name: string): unknown; get(name: string, cb: (value: unknown) => void): void };
	commonObjs: { get(name: string): unknown };
	cleanup(): void;
};

// pdfjs ImageKind enum values (not exported from the legacy entry).
const IMAGE_KIND_GRAYSCALE_1BPP = 1;
const IMAGE_KIND_RGB_24BPP = 2;
const IMAGE_KIND_RGBA_32BPP = 3;

async function loadDocument(pdfPath: string): Promise<PdfjsDocument> {
	const data = new Uint8Array(await readFile(pdfPath));
	const loadingTask = getDocument({
		data,
		standardFontDataUrl,
		cMapUrl,
		cMapPacked: true,
		useSystemFonts: true,
		disableFontFace: true,
		isEvalSupported: false,
	});
	return (await loadingTask.promise) as unknown as PdfjsDocument;
}

export interface PdfParseResult {
	path: string;
	numPages: number;
	title?: string;
	author?: string;
	outline: string[];
	textPath: string;
	textLength: number;
	preview: string;
}

export async function parsePdfText(pdfPath: string, options: { maxPages?: number; saveTextTo?: string } = {}): Promise<PdfParseResult> {
	const doc = await loadDocument(pdfPath);
	try {
		const pageCount = options.maxPages ? Math.min(options.maxPages, doc.numPages) : doc.numPages;
		const parts: string[] = [];
		for (let n = 1; n <= pageCount; n++) {
			const page = await doc.getPage(n);
			const content = await page.getTextContent();
			const lines: string[] = [];
			let line = "";
			for (const item of content.items) {
				if (typeof item.str !== "string") continue;
				line += item.str;
				if (item.hasEOL) {
					lines.push(line);
					line = "";
				}
			}
			if (line.trim()) lines.push(line);
			parts.push(`\n\n===== Page ${n} =====\n${lines.join("\n")}`);
			page.cleanup();
		}

		let info: Record<string, unknown> = {};
		try {
			info = (await doc.getMetadata()).info ?? {};
		} catch {
			// metadata is optional
		}

		let outline: string[] = [];
		try {
			const raw = await doc.getOutline();
			if (raw) {
				const flatten = (items: Array<{ title: string; items: unknown[] }>, depth: number): string[] =>
					items.flatMap((item) => [
						`${"  ".repeat(depth)}${item.title}`,
						...flatten(item.items as Array<{ title: string; items: unknown[] }>, depth + 1),
					]);
				outline = flatten(raw, 0);
			}
		} catch {
			// outline is optional
		}

		const text = parts.join("\n");
		const textPath = options.saveTextTo ?? `${pdfPath}.txt`;
		await writeFile(textPath, text, "utf8");

		return {
			path: pdfPath,
			numPages: doc.numPages,
			title: typeof info.Title === "string" ? info.Title : undefined,
			author: typeof info.Author === "string" ? info.Author : undefined,
			outline,
			textPath,
			textLength: text.length,
			preview: text.slice(0, 3000),
		};
	} finally {
		await doc.destroy();
	}
}

export interface ExtractedFigure {
	file: string;
	page: number;
	width: number;
	height: number;
}

export interface ExtractFiguresResult {
	path: string;
	figures: ExtractedFigure[];
	notes: string[];
}

function encodePng(width: number, height: number, data: Uint8Array | Uint8ClampedArray, kind: number): Buffer | null {
	if (kind === IMAGE_KIND_RGB_24BPP) {
		if (data.length < width * height * 3) return null;
		const png = new PNG({ width, height, colorType: 2, inputColorType: 2, inputHasAlpha: false });
		Buffer.from(data.buffer, data.byteOffset, width * height * 3).copy(png.data);
		return PNG.sync.write(png);
	}
	if (kind === IMAGE_KIND_RGBA_32BPP) {
		if (data.length < width * height * 4) return null;
		const png = new PNG({ width, height, colorType: 6, inputColorType: 6, inputHasAlpha: true });
		Buffer.from(data.buffer, data.byteOffset, width * height * 4).copy(png.data);
		return PNG.sync.write(png);
	}
	if (kind === IMAGE_KIND_GRAYSCALE_1BPP) {
		// 1 bit per pixel, rows padded to whole bytes; expand to 8-bit grayscale.
		const stride = Math.ceil(width / 8);
		if (data.length < stride * height) return null;
		const expanded = Buffer.alloc(width * height);
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const byte = data[y * stride + (x >> 3)];
				expanded[y * width + x] = byte & (0x80 >> (x & 7)) ? 255 : 0;
			}
		}
		const png = new PNG({ width, height, colorType: 0, inputColorType: 0, inputHasAlpha: false, bitDepth: 8 });
		expanded.copy(png.data);
		return PNG.sync.write(png);
	}
	return null;
}

async function resolveImage(page: PdfjsPage, name: string): Promise<{ data: Uint8Array | Uint8ClampedArray; width: number; height: number; kind: number } | null> {
	const direct = page.objs.get(name) as { data?: Uint8Array; width?: number; height?: number; kind?: number } | null;
	if (direct?.data && direct.width && direct.height && direct.kind != null) {
		return { data: direct.data, width: direct.width, height: direct.height, kind: direct.kind };
	}
	// Fall back to async resolution (image still decoding).
	return new Promise((resolve) => {
		const timeout = setTimeout(() => resolve(null), 10_000);
		page.objs.get(name, (value: unknown) => {
			clearTimeout(timeout);
			const image = value as { data?: Uint8Array; width?: number; height?: number; kind?: number } | null;
			if (image?.data && image.width && image.height && image.kind != null) {
				resolve({ data: image.data, width: image.width, height: image.height, kind: image.kind });
			} else {
				resolve(null);
			}
		});
	});
}

export async function extractPdfFigures(
	pdfPath: string,
	options: { outDir: string; pages?: number[]; maxFigures?: number } = { outDir: "." },
): Promise<ExtractFiguresResult> {
	const doc = await loadDocument(pdfPath);
	const figures: ExtractedFigure[] = [];
	const notes: string[] = [];
	const maxFigures = options.maxFigures ?? 50;
	const requestedPages = options.pages?.length
		? options.pages.filter((p) => p >= 1 && p <= doc.numPages)
		: Array.from({ length: doc.numPages }, (_, i) => i + 1);

	try {
		for (const pageNum of requestedPages) {
			if (figures.length >= maxFigures) break;
			const page = await doc.getPage(pageNum);
			const opList = await page.getOperatorList();
			let figureIndex = 0;
			for (let i = 0; i < opList.fnArray.length; i++) {
				const fn = opList.fnArray[i];
				if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject) continue;
				const arg = (opList.argsArray[i] as unknown[])[0];
				// Inline images carry the image object directly; XObjects are referenced by name.
				const image =
					typeof arg === "string"
						? await resolveImage(page, arg)
						: (arg as { data?: Uint8Array; width?: number; height?: number; kind?: number } | null)?.data != null
							? (arg as { data: Uint8Array; width: number; height: number; kind: number })
							: null;
				if (!image) {
					notes.push(`page ${pageNum}: image "${typeof arg === "string" ? arg : "inline"}" could not be decoded (skipped)`);
					continue;
				}
				if (image.width < 32 || image.height < 32) continue; // skip icons / artifacts
				const png = encodePng(image.width, image.height, image.data, image.kind);
				if (!png) {
					notes.push(`page ${pageNum}: image "${typeof arg === "string" ? arg : "inline"}" has unsupported pixel format kind=${image.kind} (skipped)`);
					continue;
				}
				figureIndex += 1;
				const file = join(options.outDir, `${basename(pdfPath, ".pdf")}_p${pageNum}_fig${figureIndex}.png`);
				await writeFile(file, png);
				figures.push({ file, page: pageNum, width: image.width, height: image.height });
				if (figures.length >= maxFigures) break;
			}
			page.cleanup();
		}
	} finally {
		await doc.destroy();
	}

	if (figures.length === 0) {
		notes.push("No embedded raster figures found. Figures drawn as vector graphics cannot be extracted; re-run on rendered page images if needed.");
	}
	return { path: pdfPath, figures, notes };
}
