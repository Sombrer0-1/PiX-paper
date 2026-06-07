# pp-research

Research tools for PiX-paper: literature search, PDF parsing, citation management.

## Features

- Multi-source paper search (Semantic Scholar, arXiv)
- Paper deduplication and ranking
- Citation extraction and verification
- Library management

## Usage

```typescript
import { MultiSourceSearch, SemanticScholarProvider, ArxivProvider } from 'pp-research';

// Create search instance
const search = new MultiSourceSearch([
  new SemanticScholarProvider(),
  new ArxivProvider(),
]);

// Search papers
const results = await search.searchAll({
  keywords: ['transformer', 'attention'],
  limit: 20,
});

// Deduplicate results
const { unique, duplicates } = search.deduplicate(results);

// Rank by relevance
const ranked = search.rank(unique, 'transformer attention mechanism');
```

## Types

See `src/types.ts` for full type definitions.
