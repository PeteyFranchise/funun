export type MarkdownDiffRow = {
  left: { line: number; text: string } | null
  right: { line: number; text: string } | null
  kind: 'unchanged' | 'changed'
}

/**
 * Bounded, linear-time comparison for review UI. It preserves the exact
 * shared prefix/suffix and aligns the changed middle without quadratic LCS
 * memory on large doctrine documents.
 */
export function compareMarkdownLines(published: string, proposed: string): MarkdownDiffRow[] {
  const left = published.split('\n')
  const right = proposed.split('\n')
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const rows: MarkdownDiffRow[] = []
  for (let index = 0; index < prefix; index += 1) {
    rows.push({
      left: { line: index + 1, text: left[index] },
      right: { line: index + 1, text: right[index] },
      kind: 'unchanged',
    })
  }

  const leftMiddle = left.slice(prefix, left.length - suffix)
  const rightMiddle = right.slice(prefix, right.length - suffix)
  for (let index = 0; index < Math.max(leftMiddle.length, rightMiddle.length); index += 1) {
    rows.push({
      left: index < leftMiddle.length ? { line: prefix + index + 1, text: leftMiddle[index] } : null,
      right: index < rightMiddle.length ? { line: prefix + index + 1, text: rightMiddle[index] } : null,
      kind: 'changed',
    })
  }

  for (let index = suffix; index > 0; index -= 1) {
    const leftIndex = left.length - index
    const rightIndex = right.length - index
    rows.push({
      left: { line: leftIndex + 1, text: left[leftIndex] },
      right: { line: rightIndex + 1, text: right[rightIndex] },
      kind: 'unchanged',
    })
  }
  return rows
}
